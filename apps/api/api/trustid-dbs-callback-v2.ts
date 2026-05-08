import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidApiClient,
  TrustidApiError,
  TrustidValidationError,
  MondayTrustidApiClient,
  loadTrustidV2ConfigFromEnv,
  loadMondayTrustidV2ConfigFromEnv,
  idCheckBoard,
  dbsCheckBoard,
  type ProcessDbsCallbackRequest,
} from '@car-movers/shared/trustid-v2';
import { readEnv } from './shared/endpoint.js';

// Temporary: dump raw inbound webhook traffic to make.com for shape discovery.
// Set to '' to disable.
const WEBHOOK_TRAFFIC_DUMP_URL = 'https://hook.eu1.make.com/maz7bx3xhmz815y0i4ao7kjvflbn78dj';

const trustidClient = new TrustidApiClient(loadTrustidV2ConfigFromEnv());
const mondayClient = new MondayTrustidApiClient(
  loadMondayTrustidV2ConfigFromEnv({ idCheckBoard, dbsCheckBoard }),
);
const trustid = new Trustid({
  trustidClient,
  mondayClient,
  idCallbackUrl: readEnv('TRUSTID_ID_CALLBACK_URL'),
  idCheckStatusValues: idCheckBoard.statusValues,
  dbsCallbackUrl: readEnv('TRUSTID_DBS_CALLBACK_URL'),
  dbsCheckStatusValues: dbsCheckBoard.statusValues,
  makeComIdWebhookUrl: process.env.MAKE_COM_TRUSTID_ID_WEBHOOK_URL?.trim() || undefined,
  makeComDbsWebhookUrl: process.env.MAKE_COM_TRUSTID_DBS_WEBHOOK_URL?.trim() || undefined,
});

function readCallbackRequest(request: VercelRequest): ProcessDbsCallbackRequest {
  const body = (request.body ?? {}) as Record<string, unknown>;

  // TrustID's ResultNotification webhook nests routing fields inside
  // body.Callback.WorkflowStorage as { Key, Value } pairs. Build a flat
  // map of those pairs so we can read ContainerId / ClientApplicationReference.
  const callback = body.Callback as Record<string, unknown> | undefined;
  const workflowStorage = (callback?.WorkflowStorage ?? []) as Array<{ Key?: unknown; Value?: unknown }>;
  const storage: Record<string, string> = {};
  for (const entry of workflowStorage) {
    const key = typeof entry.Key === 'string' ? entry.Key : null;
    const value = typeof entry.Value === 'string' ? entry.Value : null;
    if (key && value) storage[key] = value;
  }

  // Routing: prefer the URL query string (we encode mondayItemId at invite
  // time as belt-and-braces), fall back to the WorkflowStorage payload.
  const queryItemId = Array.isArray(request.query.mondayItemId)
    ? request.query.mondayItemId[0]
    : request.query.mondayItemId;
  const mondayItemId = (queryItemId ?? storage.ClientApplicationReference)?.trim();
  if (!mondayItemId) {
    throw new TrustidValidationError('Missing mondayItemId (no query string or ClientApplicationReference)');
  }

  const containerId = (storage.ContainerId ?? storage.GuestId)?.trim() || null;

  return {
    mondayItemId,
    containerId,
    rawPayload: body,
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return void response.status(200).end();
  if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

  if (WEBHOOK_TRAFFIC_DUMP_URL) {
    void fetch(WEBHOOK_TRAFFIC_DUMP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handler: 'trustid-dbs-callback-v2',
        receivedAt: new Date().toISOString(),
        method: request.method,
        query: request.query,
        headers: request.headers,
        body: request.body,
      }),
    }).catch(() => {});
  }

  try {
    const callbackRequest = readCallbackRequest(request);

    console.log('trustid.dbsCallbackV2.received', {
      monday_item_id: callbackRequest.mondayItemId,
      container_id: callbackRequest.containerId,
    });
    const result = await trustid.processDbsCallback(callbackRequest);
    console.log('trustid.dbsCallbackV2.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      dbs_status: result.outcome === 'updated' ? result.dbsStatus : null,
    });

    response.status(200).json({ received: true, processed: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID DBS callback handling failed';
    let status = 500;
    if (error instanceof TrustidValidationError) status = 400;
    else if (error instanceof TrustidApiError) status = 502;
    console.error('trustid.dbsCallbackV2.error', { message, status });
    response.status(status).json({ error: message });
  }
}
