import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createIdenfySession,
  type CreateIdenfySessionRequest,
  type CreateIdenfySessionResponse,
} from './shared/idenfy.js';
import { getRequestBaseUrl, hasValidInternalApiKey, readApiKey, readEnv } from './shared/endpoint.js';

function getCallbackUrl(request: VercelRequest) {
  const configuredUrl = process.env.IDENFY_CALLBACK_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  console.log('idenfy.createSession.callbackUrl', {
    configured: false,
    derivedUrl: new URL('/api/idenfy-callback', getRequestBaseUrl(request)).toString(),
    note: 'Skipping callbackUrl because IDENFY_CALLBACK_URL is not explicitly set',
  });

  return undefined;
}

function readRequestBody(request: VercelRequest): CreateIdenfySessionRequest {
  const body = request.body as Partial<CreateIdenfySessionRequest> | undefined;
  const mondayItemId = body?.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new Error('Missing mondayItemId');
  }

  return { mondayItemId };
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

  if (!hasValidInternalApiKey(request)) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = readRequestBody(request);
    const callbackUrl = getCallbackUrl(request);

    console.log('idenfy.createSession.handler', {
      mondayItemId: body.mondayItemId,
      hasApiKey: Boolean(readApiKey(request)),
      callbackUrl: callbackUrl ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    const result: CreateIdenfySessionResponse = await createIdenfySession(body, {
      apiKey: readEnv('IDENFY_API_KEY'),
      apiSecret: readEnv('IDENFY_API_SECRET'),
      callbackUrl,
    });

    console.log('idenfy.createSession.success', {
      mondayItemId: body.mondayItemId,
      scanRef: result.scanRef,
      clientId: result.clientId,
      verificationUrl: result.verificationUrl,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create iDenfy session';
    const statusCode = message === 'Missing mondayItemId' ? 400 : 500;
    console.error('idenfy.createSession.error', { message });
    response.status(statusCode).json({ error: message });
  }
}
