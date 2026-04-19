import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
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

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'x-api-key');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!hasValidApiKey(request)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    response.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth check failed';
    response.status(500).json({ error: message });
  }
}
