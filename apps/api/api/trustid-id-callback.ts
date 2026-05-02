import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractTrustIdIdCallbackRequest,
  processTrustIdIdCallback,
  TrustIdIdCallbackValidationError,
  type TrustIdIdCallbackConfig,
} from '@car-movers/shared/trustid-id';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getTrustIdIdCallbackConfig(): TrustIdIdCallbackConfig {
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
    },
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const callbackRequest = extractTrustIdIdCallbackRequest(
      request.query,
      request.body as Record<string, unknown> | undefined,
    );

    console.log('trustid.idCallback.received', {
      mondayItemId: callbackRequest.mondayItemId,
      containerId: callbackRequest.containerId ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      contentType: request.headers['content-type'] ?? null,
    });

    const result = await processTrustIdIdCallback(callbackRequest, getTrustIdIdCallbackConfig());

    console.log('trustid.idCallback.success', {
      mondayItemId: result.mondayItemId,
      trustIdContainerId: result.trustIdContainerId,
      outcome: result.outcome,
      idStatus: result.idStatus,
      status: result.status,
    });

    response.status(200).json({
      received: true,
      processed: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID ID callback handling failed';
    const statusCode = error instanceof TrustIdIdCallbackValidationError ? 400 : 500;
    console.error('trustid.idCallback.error', { message });
    response.status(statusCode).json({ error: message });
  }
}
