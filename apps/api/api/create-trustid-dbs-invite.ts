import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createTrustIdDbsInvite,
  TrustIdDbsKickoffValidationError,
  type TrustIdDbsKickoffConfig,
  type TrustIdDbsKickoffRequest,
} from '@car-movers/shared/trustid-dbs';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getRequestBaseUrl(request: VercelRequest) {
  const host = request.headers['x-forwarded-host'] ?? request.headers.host;
  const protocolHeader = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader ?? 'http';

  return `${protocol}://${host}`;
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

function readRequestBody(request: VercelRequest): TrustIdDbsKickoffRequest {
  const body = request.body as Partial<TrustIdDbsKickoffRequest> | undefined;
  const mondayItemId = body?.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdDbsKickoffValidationError('Missing mondayItemId');
  }

  return { mondayItemId };
}

function getCallbackBaseUrl(request: VercelRequest) {
  return process.env.TRUSTID_CALLBACK_BASE_URL?.trim() || getRequestBaseUrl(request);
}

function getTrustIdDbsKickoffConfig(request: VercelRequest): TrustIdDbsKickoffConfig {
  return {
    monday: {
      token: readEnv('MONDAY_API_TOKEN'),
      boardId: readEnv('DBS_BOARD_ID'),
      columns: {
        applicantName: readEnv('DBS_APPLICANT_NAME_COLUMN_ID'),
        applicantEmail: readEnv('DBS_APPLICANT_EMAIL_COLUMN_ID'),
        linkedDriverItem: readEnv('DBS_LINKED_DRIVER_ITEM_COLUMN_ID'),
        status: readEnv('DBS_STATUS_COLUMN_ID'),
        trustIdContainerId: readEnv('DBS_TRUSTID_CONTAINER_ID_COLUMN_ID'),
        trustIdGuestId: readEnv('DBS_TRUSTID_GUEST_ID_COLUMN_ID'),
        inviteCreatedAt: readEnv('DBS_INVITE_CREATED_AT_COLUMN_ID'),
        dbsReference: readEnv('DBS_REFERENCE_COLUMN_ID'),
        errorDetails: readEnv('DBS_ERROR_DETAILS_COLUMN_ID'),
        processingTimestamp: readEnv('DBS_PROCESSING_TIMESTAMP_COLUMN_ID'),
      },
    },
    trustId: {
      baseUrl: process.env.TRUSTID_BASE_URL?.trim(),
      apiKey: readEnv('TRUSTID_API_KEY'),
      username: readEnv('TRUSTID_USERNAME'),
      password: readEnv('TRUSTID_PASSWORD'),
      deviceId: readEnv('TRUSTID_DEVICE_ID'),
      branchId: readEnv('TRUSTID_BRANCH_ID'),
    },
    callbackBaseUrl: getCallbackBaseUrl(request),
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

    console.log('trustid.dbsInvite.handler', {
      mondayItemId: body.mondayItemId,
      hasApiKey: Boolean(readApiKey(request)),
      callbackBaseUrl: getCallbackBaseUrl(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    const result = await createTrustIdDbsInvite(body, getTrustIdDbsKickoffConfig(request));

    console.log('trustid.dbsInvite.success', {
      mondayItemId: result.mondayItemId,
      applicantEmail: result.applicantEmail,
      trustIdContainerId: result.trustIdContainerId,
      trustIdGuestId: result.trustIdGuestId,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create TrustID DBS invite';
    const statusCode = error instanceof TrustIdDbsKickoffValidationError ? 400 : 500;
    console.error('trustid.dbsInvite.error', { message });
    response.status(statusCode).json({ error: message });
  }
}
