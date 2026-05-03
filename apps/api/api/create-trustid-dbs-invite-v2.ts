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
  type CreateDbsInviteRequest,
} from '@car-movers/shared/trustid-v2';
import { hasValidInternalApiKey, readEnv } from './shared/endpoint.js';

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
});

function readRequestBody(request: VercelRequest): CreateDbsInviteRequest {
  const body = request.body as Partial<CreateDbsInviteRequest> | undefined;
  const mondayItemId = body?.mondayItemId?.trim();
  if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');
  return { mondayItemId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (request.method === 'OPTIONS') return void response.status(200).end();
  if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

  try {
    if (!hasValidInternalApiKey(request)) return void response.status(401).json({ error: 'Unauthorized' });
    const body = readRequestBody(request);

    console.log('trustid.dbsInviteV2.received', { monday_item_id: body.mondayItemId });
    const result = await trustid.createDbsInvite(body);
    console.log('trustid.dbsInviteV2.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      trust_id_container_id: result.outcome === 'created' ? result.trustIdContainerId : null,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create TrustID DBS invite';
    let status = 500;
    if (error instanceof TrustidValidationError) status = 400;
    else if (error instanceof TrustidApiError) status = 502;
    console.error('trustid.dbsInviteV2.error', { message, status });
    response.status(status).json({ error: message });
  }
}
