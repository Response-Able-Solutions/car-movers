import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  buildIdenfyCreateSessionPayload,
  buildIdenfyVerificationUrl,
  createIdenfySession,
  mapIdenfyCallbackStatus,
  verifyIdenfySignature,
} from './idenfy.ts';

test('buildIdenfyCreateSessionPayload carries monday item ID through session metadata', () => {
  assert.deepEqual(buildIdenfyCreateSessionPayload('12345', 'https://example.com/callback'), {
    clientId: '12345',
    callbackUrl: 'https://example.com/callback',
    externalRef: '12345',
  });
});

test('buildIdenfyVerificationUrl builds the hosted redirect URL from the auth token', () => {
  assert.equal(
    buildIdenfyVerificationUrl('token-123'),
    'https://ivs.idenfy.com/api/v2/redirect?authToken=token-123',
  );
});

test('createIdenfySession posts the expected token request and returns useful session fields', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        message: 'Token created successfully',
        authToken: 'auth-token',
        scanRef: 'scan-ref',
        clientId: '12345',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const result = await createIdenfySession(
      { mondayItemId: '12345' },
      {
        apiKey: 'api-key',
        apiSecret: 'api-secret',
        callbackUrl: 'https://example.com/callback',
      },
    );

    assert.equal(capturedUrl, 'https://ivs.idenfy.com/api/v2/token');
    assert.equal(capturedInit?.method, 'POST');
    assert.match(String(new Headers(capturedInit?.headers).get('Authorization')), /^Basic /);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      clientId: '12345',
      callbackUrl: 'https://example.com/callback',
      externalRef: '12345',
    });
    assert.deepEqual(result, {
      message: 'Token created successfully',
      authToken: 'auth-token',
      scanRef: 'scan-ref',
      clientId: '12345',
      redirectUrl: null,
      verificationUrl: 'https://ivs.idenfy.com/api/v2/redirect?authToken=auth-token',
      expiryTime: null,
      sessionLength: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('verifyIdenfySignature accepts valid signatures and rejects invalid ones', () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));
  const validSignature = createHmac('sha256', 'signing-key').update(rawBody).digest('hex');

  assert.equal(verifyIdenfySignature(rawBody, validSignature, 'signing-key'), true);
  assert.equal(verifyIdenfySignature(rawBody, 'deadbeef', 'signing-key'), false);
});

test('mapIdenfyCallbackStatus only returns actionable monday statuses for final outcomes', () => {
  assert.equal(
    mapIdenfyCallbackStatus({
      final: true,
      scanRef: 'scan-ref',
      clientId: '12345',
      status: { overall: 'APPROVED' },
    }),
    'ID Verify Success',
  );

  assert.equal(
    mapIdenfyCallbackStatus({
      final: true,
      scanRef: 'scan-ref',
      clientId: '12345',
      status: { overall: 'SUSPECTED' },
    }),
    'ID Verify Review',
  );

  assert.equal(
    mapIdenfyCallbackStatus({
      final: false,
      scanRef: 'scan-ref',
      clientId: '12345',
      status: { overall: 'APPROVED' },
    }),
    null,
  );

  assert.equal(
    mapIdenfyCallbackStatus({
      final: true,
      scanRef: 'scan-ref',
      clientId: '12345',
      status: { overall: 'DENIED' },
    }),
    null,
  );
});
