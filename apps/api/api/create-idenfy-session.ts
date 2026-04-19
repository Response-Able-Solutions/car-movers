import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createIdenfySession,
  type CreateIdenfySessionRequest,
  type CreateIdenfySessionResponse,
} from '@car-movers/shared/idenfy';

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

function getExpectedApiKey() {
  return readEnv('INTERNAL_API_KEY');
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

  const expectedApiKey = getExpectedApiKey();
  const providedBuffer = Buffer.from(providedApiKey);
  const expectedBuffer = Buffer.from(expectedApiKey);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function getCallbackUrl(request: VercelRequest) {
  return process.env.IDENFY_CALLBACK_URL?.trim() || new URL('/api/idenfy-callback', getRequestBaseUrl(request)).toString();
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

  if (!hasValidApiKey(request)) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = readRequestBody(request);
    const result: CreateIdenfySessionResponse = await createIdenfySession(body, {
      apiKey: readEnv('IDENFY_API_KEY'),
      apiSecret: readEnv('IDENFY_API_SECRET'),
      callbackUrl: getCallbackUrl(request),
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create iDenfy session';
    const statusCode = message === 'Missing mondayItemId' ? 400 : 500;
    response.status(statusCode).json({ error: message });
  }
}
