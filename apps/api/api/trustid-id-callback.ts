import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidValidationError,
  TrustidApiClient,
  MondayTrustidApiClient,
  loadTrustidConfigFromEnv,
  loadMondayTrustidIdCheckConfigFromEnv,
  type ProcessIdCallbackRequest,
} from '@car-movers/shared/trustid';

const trustidClient = new TrustidApiClient(loadTrustidConfigFromEnv());
const mondayClient = new MondayTrustidApiClient({
  idCheck: loadMondayTrustidIdCheckConfigFromEnv(),
});
const trustid = new Trustid({ trustidClient, mondayClient });

function readCallbackRequest(request: VercelRequest): ProcessIdCallbackRequest {
  const queryItemId = Array.isArray(request.query.mondayItemId)
    ? request.query.mondayItemId[0]
    : request.query.mondayItemId;
  const body = (request.body ?? {}) as Record<string, unknown>;

  const bodyItemId =
    pickString(body.mondayItemId) ??
    pickString(body.ClientApplicationReference) ??
    pickString(body.clientApplicationReference);
  const bodyContainerId =
    pickString(body.ContainerId) ??
    pickString(body.containerId) ??
    pickString(body.GuestId) ??
    pickString(body.guestId);

  const mondayItemId = (queryItemId ?? bodyItemId)?.trim();
  if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

  return { mondayItemId, containerId: bodyContainerId?.trim() || null };
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

    console.log('trustid.idCallback.received', {
      monday_item_id: callbackRequest.mondayItemId,
      container_id: callbackRequest.containerId ?? null,
    });
    const result = await trustid.processIdCallback(callbackRequest);
    console.log('trustid.idCallback.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      id_status: result.idStatus,
      trust_id_container_id: result.trustIdContainerId,
    });

    response.status(200).json({ received: true, processed: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID ID callback handling failed';
    const status = error instanceof TrustidValidationError ? 400 : 500;
    console.error('trustid.idCallback.error', { message, status });
    response.status(status).json({ error: message });
  }
}
