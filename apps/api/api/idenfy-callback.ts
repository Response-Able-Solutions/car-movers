import type { IncomingMessage } from 'node:http';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  mapIdenfyCallbackStatus,
  type IdenfyCallbackPayload,
  verifyIdenfySignature,
} from './shared/idenfy.js';
import { readEnv } from './shared/endpoint.js';
import { updateMondayStatus } from './shared/monday.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readSignature(request: VercelRequest) {
  const value = request.headers['idenfy-signature'];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  console.log('idenfy.callback.rawBody', {
    chunkCount: chunks.length,
    bodyLength: chunks.reduce((total, chunk) => total + chunk.length, 0),
  });

  return Buffer.concat(chunks);
}

function parsePayload(rawBody: Buffer) {
  return JSON.parse(rawBody.toString('utf8')) as IdenfyCallbackPayload;
}

function getMondayItemId(payload: IdenfyCallbackPayload) {
  return payload.clientId?.trim() || payload.externalRef?.trim() || null;
}

async function forwardCallbackToMake(payload: Record<string, unknown>) {
  const webhookUrl = process.env.MAKE_COM_CALLBACK_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    console.log('idenfy.callback.makeForward', { configured: false });
    return null;
  }

  console.log('idenfy.callback.makeForward', {
    configured: true,
    webhookUrl,
    payload,
  });

  const upstreamResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await upstreamResponse.text();

  console.log('idenfy.callback.makeForward.response', {
    status: upstreamResponse.status,
    ok: upstreamResponse.ok,
    body: responseText,
  });

  if (!upstreamResponse.ok) {
    throw new Error(`Make callback forward failed with ${upstreamResponse.status}: ${responseText}`);
  }

  return {
    status: upstreamResponse.status,
    body: responseText,
  };
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

    console.log('idenfy.callback.received', {
      hasSignature: Boolean(signature),
      userAgent: request.headers['user-agent'] ?? null,
      contentType: request.headers['content-type'] ?? null,
    });

    if (!signature) {
      response.status(400).json({ error: 'Missing Idenfy-Signature header' });
      return;
    }

    const rawBody = await readRawBody(request);

    if (!rawBody.length) {
      response.status(400).json({ error: 'Missing request body' });
      return;
    }

    const isSignatureValid = verifyIdenfySignature(rawBody, signature, readEnv('IDENFY_CALLBACK_SIGNING_KEY'));

    console.log('idenfy.callback.signature', {
      valid: isSignatureValid,
    });

    if (!isSignatureValid) {
      response.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = parsePayload(rawBody);
    const mondayItemId = getMondayItemId(payload);
    const statusLabel = mapIdenfyCallbackStatus(payload);

    console.log('idenfy.callback.payload', {
      scanRef: payload.scanRef,
      clientId: payload.clientId,
      externalRef: payload.externalRef ?? null,
      final: payload.final,
      overallStatus: payload.status.overall,
      mondayItemId,
      mappedStatusLabel: statusLabel,
      payload,
    });

    if (!mondayItemId) {
      const makeResponse = await forwardCallbackToMake({
        received: true,
        updated: false,
        reason: 'Missing monday item ID',
        payload,
      });

      response.status(200).json({
        received: true,
        updated: false,
        reason: 'Missing monday item ID',
        forwardedToMake: Boolean(makeResponse),
      });
      return;
    }

    if (!statusLabel) {
      const makeResponse = await forwardCallbackToMake({
        received: true,
        updated: false,
        mondayItemId,
        reason: 'No status change required',
        payload,
      });

      response.status(200).json({
        received: true,
        updated: false,
        reason: 'No status change required',
        forwardedToMake: Boolean(makeResponse),
      });
      return;
    }

    await updateMondayStatus(mondayItemId, statusLabel, {
      token: readEnv('MONDAY_API_TOKEN'),
      boardId: readEnv('MONDAY_BOARD_ID'),
      statusColumnId: readEnv('MONDAY_IDENFY_STATUS_COLUMN_ID'),
    });

    console.log('idenfy.callback.mondayUpdate', {
      mondayItemId,
      statusLabel,
      statusColumnId: process.env.MONDAY_IDENFY_STATUS_COLUMN_ID ?? null,
    });

    const makeResponse = await forwardCallbackToMake({
      received: true,
      updated: true,
      mondayItemId,
      statusLabel,
      payload,
    });

    response.status(200).json({
      received: true,
      updated: true,
      statusLabel,
      forwardedToMake: Boolean(makeResponse),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Callback handling failed';
    console.error('idenfy.callback.error', { message });
    response.status(500).json({ error: message });
  }
}
