import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createTrustIdIdInvite,
  TrustIdIdInviteValidationError,
  type TrustIdIdInviteConfig,
  type TrustIdIdInviteRequest,
} from '@car-movers/shared/trustid-id';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function readOptionalNumberEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${name} must be an integer`);
  }

  return numberValue;
}

function readTrustIdIdBranchId() {
  return process.env.TRUSTID_ID_BRANCH_ID?.trim() || readEnv('TRUSTID_BRANCH_ID');
}

function readApiKey(request: VercelRequest) {
  const rawValue = request.headers['x-api-key'];
  return Array.isArray(rawValue) ? rawValue[0] ?? null : rawValue ?? null;
}

function hasValidApiKey(request: VercelRequest) {
  const providedApiKey = readApiKey(request);

  if (!providedApiKey) {
    return false;
  }

  const expectedApiKey = readEnv('INTERNAL_API_KEY');
  const providedBuffer = Buffer.from(providedApiKey);
  const expectedBuffer = Buffer.from(expectedApiKey);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function readRequestBody(request: VercelRequest): TrustIdIdInviteRequest {
  const body = request.body as Partial<TrustIdIdInviteRequest> | undefined;
  const mondayItemId = body?.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdIdInviteValidationError('Missing mondayItemId');
  }

  return { mondayItemId };
}

function getTrustIdIdInviteConfig(): TrustIdIdInviteConfig {
  return {
    monday: {
      token: readEnv('MONDAY_API_TOKEN'),
      boardId: readEnv('TRUSTID_ID_BOARD_ID'),
      columns: {
        applicantName: readEnv('TRUSTID_ID_APPLICANT_NAME_COLUMN_ID'),
        applicantEmail: readEnv('TRUSTID_ID_APPLICANT_EMAIL_COLUMN_ID'),
        status: readEnv('TRUSTID_ID_STATUS_COLUMN_ID'),
        trustIdContainerId: readEnv('TRUSTID_ID_CONTAINER_ID_COLUMN_ID'),
        trustIdGuestId: readEnv('TRUSTID_ID_GUEST_ID_COLUMN_ID'),
        inviteCreatedAt: readEnv('TRUSTID_ID_INVITE_CREATED_AT_COLUMN_ID'),
        resultSummary: readEnv('TRUSTID_ID_RESULT_SUMMARY_COLUMN_ID'),
        errorDetails: readEnv('TRUSTID_ID_ERROR_DETAILS_COLUMN_ID'),
        processingTimestamp: readEnv('TRUSTID_ID_PROCESSING_TIMESTAMP_COLUMN_ID'),
      },
    },
    trustId: {
      baseUrl: process.env.TRUSTID_BASE_URL?.trim(),
      apiKey: readEnv('TRUSTID_API_KEY'),
      username: readEnv('TRUSTID_USERNAME'),
      password: readEnv('TRUSTID_PASSWORD'),
      deviceId: readEnv('TRUSTID_DEVICE_ID'),
      branchId: readTrustIdIdBranchId(),
      digitalIdentificationScheme: readOptionalNumberEnv('TRUSTID_ID_DIGITAL_IDENTIFICATION_SCHEME'),
    },
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!hasValidApiKey(request)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = readRequestBody(request);

    console.log('trustid.idInvite.handler', {
      mondayItemId: body.mondayItemId,
      hasApiKey: Boolean(readApiKey(request)),
      userAgent: request.headers['user-agent'] ?? null,
    });

    const result = await createTrustIdIdInvite(body, getTrustIdIdInviteConfig());

    console.log('trustid.idInvite.success', {
      mondayItemId: result.mondayItemId,
      applicantEmail: result.applicantEmail,
      trustIdContainerId: result.trustIdContainerId,
      trustIdGuestId: result.trustIdGuestId,
      outcome: result.outcome,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create TrustID ID invite';
    const statusCode = error instanceof TrustIdIdInviteValidationError ? 400 : 500;
    console.error('trustid.idInvite.error', { message });
    response.status(statusCode).json({ error: message });
  }
}
