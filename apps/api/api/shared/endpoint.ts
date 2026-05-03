import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest } from '@vercel/node';

export function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export function readApiKey(request: VercelRequest) {
  const rawValue = request.headers['x-api-key'];
  return Array.isArray(rawValue) ? rawValue[0] ?? null : rawValue ?? null;
}

export function hasValidInternalApiKey(request: VercelRequest) {
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

export function getRequestBaseUrl(request: VercelRequest) {
  const host = request.headers['x-forwarded-host'] ?? request.headers.host;
  const protocolHeader = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader ?? 'http';

  return `${protocol}://${host}`;
}
