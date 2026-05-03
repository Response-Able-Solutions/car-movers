import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidValidationError,
  type BasicDbsCheckConfig,
  type ProcessDbsCallbackRequest,
} from '@car-movers/shared/lib/workflows/trustid';
import {
  TrustidApiClient,
  loadTrustidConfigFromEnv,
} from '@car-movers/shared/lib/adapters/trustid';
import {
  MondayTrustidApiClient,
  loadMondayTrustidDbsConfigFromEnv,
} from '@car-movers/shared/lib/adapters/monday';
import { readEnv } from './shared/endpoint.js';

function readPurposeOfCheck(): BasicDbsCheckConfig['purposeOfCheck'] {
  const value = process.env.TRUSTID_DBS_PURPOSE_OF_CHECK?.trim();
  if (value === 'Personal Interest' || value === 'Employment' || value === 'Other') return value;
  return undefined;
}

const trustidClient = new TrustidApiClient(loadTrustidConfigFromEnv());
const mondayClient = new MondayTrustidApiClient({
  dbs: loadMondayTrustidDbsConfigFromEnv(),
});
const trustid = new Trustid({
  trustidClient,
  mondayClient,
  basicCheck: {
    employerName: process.env.TRUSTID_DBS_EMPLOYER_NAME?.trim(),
    evidenceCheckedBy: readEnv('TRUSTID_DBS_EVIDENCE_CHECKED_BY'),
    employmentSector: readEnv('TRUSTID_DBS_EMPLOYMENT_SECTOR'),
    purposeOfCheck: readPurposeOfCheck(),
    other: process.env.TRUSTID_DBS_OTHER?.trim(),
  },
});

function readCallbackRequest(request: VercelRequest): ProcessDbsCallbackRequest {
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

    console.log('trustid.dbsCallback.received', {
      monday_item_id: callbackRequest.mondayItemId,
      container_id: callbackRequest.containerId ?? null,
    });
    const result = await trustid.processDbsCallback(callbackRequest);
    console.log('trustid.dbsCallback.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      trust_id_container_id: result.trustIdContainerId,
      dbs_reference: result.outcome === 'submitted' ? result.dbsReference : null,
    });

    response.status(200).json({ received: true, processed: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID DBS callback handling failed';
    const status = error instanceof TrustidValidationError ? 400 : 500;
    console.error('trustid.dbsCallback.error', { message, status });
    response.status(status).json({ error: message });
  }
}
