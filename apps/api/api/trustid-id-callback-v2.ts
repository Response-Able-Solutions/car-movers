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
  type ProcessIdCallbackRequest,
} from '@car-movers/shared/trustid-v2';
import { readEnv } from './shared/endpoint.js';

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
});

function readCallbackRequest(request: VercelRequest): ProcessIdCallbackRequest {
  const body = (request.body ?? {}) as Record<string, unknown>;

  const mondayItemId =
    pickString(body.ClientApplicationReference) ??
    pickString(body.clientApplicationReference);
  if (!mondayItemId?.trim()) {
    throw new TrustidValidationError('Missing ClientApplicationReference');
  }

  const containerId =
    pickString(body.ContainerId) ??
    pickString(body.containerId) ??
    pickString(body.GuestId) ??
    pickString(body.guestId) ??
    null;

  return {
    mondayItemId: mondayItemId.trim(),
    containerId: containerId?.trim() || null,
    rawPayload: body,
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return void response.status(200).end();
  if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

  try {
    const callbackRequest = readCallbackRequest(request);

    console.log('trustid.idCallbackV2.received', {
      monday_item_id: callbackRequest.mondayItemId,
      container_id: callbackRequest.containerId,
    });
    const result = await trustid.processIdCallback(callbackRequest);
    console.log('trustid.idCallbackV2.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      id_status: result.outcome === 'updated' ? result.idStatus : null,
    });

    response.status(200).json({ received: true, processed: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID ID callback handling failed';
    let status = 500;
    if (error instanceof TrustidValidationError) status = 400;
    else if (error instanceof TrustidApiError) status = 502;
    console.error('trustid.idCallbackV2.error', { message, status });
    response.status(status).json({ error: message });
  }
}
