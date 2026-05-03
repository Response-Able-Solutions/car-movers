import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidValidationError,
} from '@car-movers/shared/lib/workflows/trustid';
import {
  TrustidApiClient,
  loadTrustidConfigFromEnv,
} from '@car-movers/shared/lib/adapters/trustid';
import {
  MondayTrustidApiClient,
  loadMondayTrustidDbsConfigFromEnv,
} from '@car-movers/shared/lib/adapters/monday';
import { getRequestBaseUrl, hasValidInternalApiKey, readEnv } from './shared/endpoint.js';

function readOptionalNumberEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

const trustidClient = new TrustidApiClient(loadTrustidConfigFromEnv());
const mondayClient = new MondayTrustidApiClient({
  dbs: loadMondayTrustidDbsConfigFromEnv(),
});
const trustid = new Trustid({
  trustidClient,
  mondayClient,
  dbsInvite: {
    branchId: readEnv('TRUSTID_BRANCH_ID'),
    digitalIdentificationScheme: readOptionalNumberEnv('TRUSTID_DBS_DIGITAL_IDENTIFICATION_SCHEME'),
  },
});

function readMondayItemId(request: VercelRequest): string {
  const body = request.body as { mondayItemId?: string } | undefined;
  const mondayItemId = body?.mondayItemId?.trim();
  if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');
  return mondayItemId;
}

function callbackBaseUrl(request: VercelRequest): string {
  const fromEnv = process.env.TRUSTID_CALLBACK_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  return getRequestBaseUrl(request);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (request.method === 'OPTIONS') return void response.status(200).end();
  if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

  try {
    if (!hasValidInternalApiKey(request)) return void response.status(401).json({ error: 'Unauthorized' });
    const mondayItemId = readMondayItemId(request);
    const baseUrl = callbackBaseUrl(request);

    console.log('trustid.dbsInvite.received', {
      monday_item_id: mondayItemId,
      callback_base_url: baseUrl,
    });
    const result = await trustid.createDbsInvite({ mondayItemId, callbackBaseUrl: baseUrl });
    console.log('trustid.dbsInvite.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      trust_id_container_id: result.outcome === 'created' ? result.trustIdContainerId : null,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create TrustID DBS invite';
    const status = error instanceof TrustidValidationError ? 400 : 500;
    console.error('trustid.dbsInvite.error', { message, status });
    response.status(status).json({ error: message });
  }
}
