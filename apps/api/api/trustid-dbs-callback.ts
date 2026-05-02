import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractTrustIdDbsCallbackRequest,
  processTrustIdDbsCallback,
  TrustIdDbsCallbackValidationError,
  type TrustIdDbsCallbackConfig,
} from '@car-movers/shared/trustid-dbs';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function readPurposeOfCheck() {
  const value = process.env.TRUSTID_DBS_PURPOSE_OF_CHECK?.trim();

  if (value === 'Personal Interest' || value === 'Employment' || value === 'Other') {
    return value;
  }

  return undefined;
}

function getTrustIdDbsCallbackConfig(): TrustIdDbsCallbackConfig {
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
    },
    basicCheck: {
      employerName: process.env.TRUSTID_DBS_EMPLOYER_NAME?.trim(),
      evidenceCheckedBy: readEnv('TRUSTID_DBS_EVIDENCE_CHECKED_BY'),
      employmentSector: readEnv('TRUSTID_DBS_EMPLOYMENT_SECTOR'),
      purposeOfCheck: readPurposeOfCheck(),
      other: process.env.TRUSTID_DBS_OTHER?.trim(),
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
    const callbackRequest = extractTrustIdDbsCallbackRequest(
      request.query,
      request.body as Record<string, unknown> | undefined,
    );

    console.log('trustid.dbsCallback.received', {
      mondayItemId: callbackRequest.mondayItemId,
      containerId: callbackRequest.containerId ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      contentType: request.headers['content-type'] ?? null,
    });

    const result = await processTrustIdDbsCallback(callbackRequest, getTrustIdDbsCallbackConfig());

    console.log('trustid.dbsCallback.success', {
      mondayItemId: result.mondayItemId,
      trustIdContainerId: result.trustIdContainerId,
      dbsReference: result.dbsReference,
    });

    response.status(200).json({
      received: true,
      processed: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TrustID DBS callback handling failed';
    const statusCode = error instanceof TrustIdDbsCallbackValidationError ? 400 : 500;
    console.error('trustid.dbsCallback.error', { message });
    response.status(statusCode).json({ error: message });
  }
}
