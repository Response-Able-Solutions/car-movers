import type { IncomingMessage } from 'node:http';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  mapIdenfyCallbackStatus,
  type IdenfyCallbackPayload,
  verifyIdenfySignature,
} from '@car-movers/shared/idenfy';
import { updateMondayStatus } from '@car-movers/shared/monday';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function readSignature(request: VercelRequest) {
  const value = request.headers['idenfy-signature'];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function parsePayload(rawBody: Buffer) {
  return JSON.parse(rawBody.toString('utf8')) as IdenfyCallbackPayload;
}

function getMondayItemId(payload: IdenfyCallbackPayload) {
  return payload.clientId?.trim() || payload.externalRef?.trim() || null;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idenfy-Signature');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const signature = readSignature(request);

    if (!signature) {
      response.status(400).json({ error: 'Missing Idenfy-Signature header' });
      return;
    }

    const rawBody = await readRawBody(request);

    if (!rawBody.length) {
      response.status(400).json({ error: 'Missing request body' });
      return;
    }

    if (!verifyIdenfySignature(rawBody, signature, readEnv('IDENFY_CALLBACK_SIGNING_KEY'))) {
      response.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = parsePayload(rawBody);
    const mondayItemId = getMondayItemId(payload);

    if (!mondayItemId) {
      response.status(200).json({ received: true, updated: false, reason: 'Missing monday item ID' });
      return;
    }

    const statusLabel = mapIdenfyCallbackStatus(payload);

    if (!statusLabel) {
      response.status(200).json({ received: true, updated: false, reason: 'No status change required' });
      return;
    }

    await updateMondayStatus(mondayItemId, statusLabel, {
      token: readEnv('MONDAY_API_TOKEN'),
      boardId: readEnv('MONDAY_BOARD_ID'),
      statusColumnId: readEnv('MONDAY_STATUS_COLUMN_ID'),
    });

    response.status(200).json({ received: true, updated: true, statusLabel });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Callback handling failed';
    response.status(500).json({ error: message });
  }
}
