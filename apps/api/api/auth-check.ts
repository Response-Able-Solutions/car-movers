import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasValidInternalApiKey } from './shared/endpoint.js';

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
    if (!hasValidInternalApiKey(request)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    response.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth check failed';
    response.status(500).json({ error: message });
  }
}
