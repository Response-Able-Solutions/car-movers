import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidValidationError,
  TrustidApiClient,
  MondayTrustidApiClient,
  loadTrustidConfigFromEnv,
  loadMondayTrustidIdCheckConfigFromEnv,
  type CreateIdInviteRequest,
} from '@car-movers/shared/trustid';
import { hasValidInternalApiKey, readEnv } from './shared/endpoint.js';

function readOptionalNumberEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

const trustidClient = new TrustidApiClient(loadTrustidConfigFromEnv());
const mondayClient = new MondayTrustidApiClient({
  idCheck: loadMondayTrustidIdCheckConfigFromEnv(),
});
const trustid = new Trustid({
  trustidClient,
  mondayClient,
  idInvite: {
    branchId: process.env.TRUSTID_ID_BRANCH_ID?.trim() || readEnv('TRUSTID_BRANCH_ID'),
    digitalIdentificationScheme: readOptionalNumberEnv('TRUSTID_ID_DIGITAL_IDENTIFICATION_SCHEME'),
  },
});


function readRequestBody(request: VercelRequest): CreateIdInviteRequest {
  const body = request.body as Partial<CreateIdInviteRequest> | undefined;
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

    console.log('trustid.idInvite.received', { monday_item_id: body.mondayItemId });
    const result = await trustid.createIdInvite(body);
    console.log('trustid.idInvite.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      trust_id_container_id: result.outcome === 'created' ? result.trustIdContainerId : null,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create TrustID ID invite';
    const status = error instanceof TrustidValidationError ? 400 : 500;
    console.error('trustid.idInvite.error', { message, status });
    response.status(status).json({ error: message });
  }
}
