import test from 'node:test';
import { strict as assert } from 'node:assert';

import { dbsCheckItem, idCheckItem } from './fixtures.ts';
import { dbsCheckBoard, idCheckBoard } from './lib/monday-boards.ts';
import {
  Trustid,
  TrustidApiError,
  TrustidValidationError,
} from './trustid-v2.ts';
import type {
  CreateGuestLinkRequest,
  CreateGuestLinkResponse,
  TrustidClient,
  RetrieveDocumentContainerResponse,
  RetrieveDbsFormResponse,
  InitiateBasicDbsCheckRequest,
  InitiateBasicDbsCheckResponse,
  DeleteGuestLinkResponse,
} from './lib/adapters/trustid-v2.ts';
import type {
  DbsCheckErrorUpdates,
  DbsCheckInviteSentUpdates,
  DbsCheckItem,
  IdCheckErrorUpdates,
  IdCheckInviteSentUpdates,
  IdCheckItem,
  IdCheckResultUpdates,
  MondayTrustidClient,
} from './lib/adapters/monday-trustid-v2.ts';

const fixedNow = () => new Date('2026-05-03T10:00:00Z');
const idCallbackUrl = 'https://api.example.test/api/trustid-id-callback-v2';
const dbsCallbackUrl = 'https://api.example.test/api/trustid-dbs-callback-v2';

function fakeTrustid(overrides: Partial<TrustidClient> = {}): TrustidClient {
  return {
    createGuestLink: async (_request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse> => ({
      Success: true,
      ContainerId: 'container-1',
      LinkUrl: 'https://trustid.example/guest/abc',
      GuestId: 'guest-1',
    }),
    retrieveDocumentContainer: async (): Promise<RetrieveDocumentContainerResponse> => ({
      Success: true,
    }),
    retrieveDbsForm: async (): Promise<RetrieveDbsFormResponse> => ({ Success: true }),
    initiateBasicDbsCheck: async (
      _request: InitiateBasicDbsCheckRequest,
    ): Promise<InitiateBasicDbsCheckResponse> => ({ Success: true }),
    deleteGuestLink: async (): Promise<DeleteGuestLinkResponse> => ({ Success: true }),
    ...overrides,
  };
}

type FakeMondayCalls = {
  fetchedId: string[];
  idInviteSent: Array<{ itemId: string; updates: IdCheckInviteSentUpdates }>;
  idErrored: Array<{ itemId: string; updates: IdCheckErrorUpdates }>;
  idResulted: Array<{ itemId: string; updates: IdCheckResultUpdates }>;
  fetchedDbs: string[];
  dbsInviteSent: Array<{ itemId: string; updates: DbsCheckInviteSentUpdates }>;
  dbsErrored: Array<{ itemId: string; updates: DbsCheckErrorUpdates }>;
};

function fakeMonday(items: {
  idCheck?: IdCheckItem | (() => IdCheckItem);
  dbsCheck?: DbsCheckItem | (() => DbsCheckItem);
}): { client: MondayTrustidClient; calls: FakeMondayCalls } {
  const calls: FakeMondayCalls = {
    fetchedId: [],
    idInviteSent: [],
    idErrored: [],
    idResulted: [],
    fetchedDbs: [],
    dbsInviteSent: [],
    dbsErrored: [],
  };
  const client: MondayTrustidClient = {
    fetchIdCheckItem: async (itemId: string): Promise<IdCheckItem> => {
      calls.fetchedId.push(itemId);
      const item = items.idCheck;
      if (item === undefined) throw new Error('idCheck item not provided to fake');
      return typeof item === 'function' ? item() : item;
    },
    markIdInviteSent: async (itemId, updates) => {
      calls.idInviteSent.push({ itemId, updates });
    },
    markIdError: async (itemId, updates) => {
      calls.idErrored.push({ itemId, updates });
    },
    markIdResult: async (itemId, updates) => {
      calls.idResulted.push({ itemId, updates });
    },
    fetchDbsItem: async (itemId: string): Promise<DbsCheckItem> => {
      calls.fetchedDbs.push(itemId);
      const item = items.dbsCheck;
      if (item === undefined) throw new Error('dbsCheck item not provided to fake');
      return typeof item === 'function' ? item() : item;
    },
    markDbsInviteSent: async (itemId, updates) => {
      calls.dbsInviteSent.push({ itemId, updates });
    },
    markDbsError: async (itemId, updates) => {
      calls.dbsErrored.push({ itemId, updates });
    },
  };
  return { client, calls };
}

function buildWorkflow(
  trustidClient: TrustidClient,
  mondayClient: MondayTrustidClient,
  options: { makeComIdWebhookUrl?: string } = {},
): Trustid {
  return new Trustid({
    trustidClient,
    mondayClient,
    idCallbackUrl,
    idCheckStatusValues: idCheckBoard.statusValues,
    dbsCallbackUrl,
    dbsCheckStatusValues: dbsCheckBoard.statusValues,
    makeComIdWebhookUrl: options.makeComIdWebhookUrl,
    now: fixedNow,
  });
}

// Records all fetch calls made via globalThis.fetch and replies with 200 {}.
// Used to assert Make.com forwarding inside processIdCallback tests.
type FetchCall = { url: string; init: RequestInit | undefined };
function withRecordedFetch(): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === 'string' ? input : input.toString(), init });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test('createIdInvite: status sendInvite mints, updates Monday, returns created', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  let capturedRequest: CreateGuestLinkRequest | null = null;
  const trustid = fakeTrustid({
    createGuestLink: async (request) => {
      capturedRequest = request;
      return { Success: true, ContainerId: 'c-1', LinkUrl: 'https://trustid.example/g/1' };
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  if (result.outcome !== 'created') return;
  assert.equal(result.mondayItemId, item.itemId);
  assert.equal(result.trustIdContainerId, 'c-1');
  assert.equal(result.guestLinkUrl, 'https://trustid.example/g/1');
  assert.equal(result.inviteSentAt, '2026-05-03T10:00:00.000Z');

  assert.deepEqual(capturedRequest, {
    email: item.applicantEmail,
    name: item.applicantName,
    clientApplicationReference: item.itemId,
    containerEventCallbackUrl: `${idCallbackUrl}?mondayItemId=${encodeURIComponent(item.itemId)}`,
  });

  assert.equal(calls.idInviteSent.length, 1);
  assert.deepEqual(calls.idInviteSent[0], {
    itemId: item.itemId,
    updates: {
      status: idCheckBoard.statusValues.inviteSent,
      trustIdContainerId: 'c-1',
      guestLinkUrl: 'https://trustid.example/g/1',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.idErrored.length, 0);
});

test('createIdInvite: status null is treated as initial and mints', async () => {
  const item = idCheckItem({ status: null });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  assert.equal(calls.idInviteSent.length, 1);
});

test('createIdInvite: status inviteSent skips with already-processed', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  let trustidCalled = false;
  const trustid = fakeTrustid({
    createGuestLink: async () => {
      trustidCalled = true;
      throw new Error('should not be called');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'already-processed');
  if (result.outcome !== 'already-processed') return;
  assert.equal(result.currentStatus, idCheckBoard.statusValues.inviteSent);
  assert.equal(trustidCalled, false);
  assert.equal(calls.idInviteSent.length, 0);
});

test('createIdInvite: terminal status (Pass) skips with already-processed', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.pass });
  const { client: monday } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    createGuestLink: async () => {
      throw new Error('should not be called');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'already-processed');
  if (result.outcome !== 'already-processed') return;
  assert.equal(result.currentStatus, idCheckBoard.statusValues.pass);
});

test('createIdInvite: empty mondayItemId throws TrustidValidationError', async () => {
  const { client: monday, calls } = fakeMonday({ idCheck: idCheckItem() });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  await assert.rejects(
    () => workflow.createIdInvite({ mondayItemId: '   ' }),
    (error: unknown) => error instanceof TrustidValidationError,
  );
  assert.equal(calls.fetchedId.length, 0);
  assert.equal(calls.idInviteSent.length, 0);
});

test('createIdInvite: TrustID failure writes error to Monday and rethrows', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    createGuestLink: async () => {
      throw new TrustidApiError('upstream boom', 502, 'body');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  await assert.rejects(
    () => workflow.createIdInvite({ mondayItemId: item.itemId }),
    (error: unknown) => error instanceof TrustidApiError,
  );

  assert.equal(calls.idErrored.length, 1);
  assert.deepEqual(calls.idErrored[0], {
    itemId: item.itemId,
    updates: {
      status: idCheckBoard.statusValues.error,
      error: 'upstream boom',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.idInviteSent.length, 0);
});

test('createIdInvite: persists when TrustID returns null LinkUrl (sandbox finding)', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    createGuestLink: async () => ({
      Success: true,
      ContainerId: 'c-1',
      // LinkUrl intentionally omitted — sandbox returned null in slice 1 smoke test
    }),
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  if (result.outcome !== 'created') return;
  assert.equal(result.guestLinkUrl, null);
  assert.equal(result.trustIdContainerId, 'c-1');

  assert.equal(calls.idInviteSent[0].updates.guestLinkUrl, null);
  assert.equal(calls.idInviteSent[0].updates.trustIdContainerId, 'c-1');
});

// -----------------------------------------------------------------------------
// createDbsInvite — mirrors the ID tests but for the DBS path
// -----------------------------------------------------------------------------

test('createDbsInvite: status sendInvite mints, updates Monday, returns created', async () => {
  const item = dbsCheckItem({ status: dbsCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday({ dbsCheck: item });
  let capturedRequest: CreateGuestLinkRequest | null = null;
  const trustid = fakeTrustid({
    createGuestLink: async (request) => {
      capturedRequest = request;
      return { Success: true, ContainerId: 'c-2', LinkUrl: 'https://trustid.example/g/2' };
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createDbsInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  if (result.outcome !== 'created') return;
  assert.equal(result.mondayItemId, item.itemId);
  assert.equal(result.trustIdContainerId, 'c-2');
  assert.equal(result.guestLinkUrl, 'https://trustid.example/g/2');
  assert.equal(result.inviteSentAt, '2026-05-03T10:00:00.000Z');

  assert.deepEqual(capturedRequest, {
    email: item.applicantEmail,
    name: item.applicantName,
    clientApplicationReference: item.itemId,
    containerEventCallbackUrl: dbsCallbackUrl,
  });

  assert.equal(calls.dbsInviteSent.length, 1);
  assert.deepEqual(calls.dbsInviteSent[0], {
    itemId: item.itemId,
    updates: {
      status: dbsCheckBoard.statusValues.inviteSent,
      trustIdContainerId: 'c-2',
      guestLinkUrl: 'https://trustid.example/g/2',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.dbsErrored.length, 0);
});

test('createDbsInvite: status null is treated as initial and mints', async () => {
  const item = dbsCheckItem({ status: null });
  const { client: monday, calls } = fakeMonday({ dbsCheck: item });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  const result = await workflow.createDbsInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  assert.equal(calls.dbsInviteSent.length, 1);
});

test('createDbsInvite: status inviteSent skips with already-processed', async () => {
  const item = dbsCheckItem({ status: dbsCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday({ dbsCheck: item });
  let trustidCalled = false;
  const trustid = fakeTrustid({
    createGuestLink: async () => {
      trustidCalled = true;
      throw new Error('should not be called');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.createDbsInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'already-processed');
  if (result.outcome !== 'already-processed') return;
  assert.equal(result.currentStatus, dbsCheckBoard.statusValues.inviteSent);
  assert.equal(trustidCalled, false);
  assert.equal(calls.dbsInviteSent.length, 0);
});

test('createDbsInvite: terminal status (Pass) skips with already-processed', async () => {
  const item = dbsCheckItem({ status: dbsCheckBoard.statusValues.pass });
  const { client: monday } = fakeMonday({ dbsCheck: item });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  const result = await workflow.createDbsInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'already-processed');
  if (result.outcome !== 'already-processed') return;
  assert.equal(result.currentStatus, dbsCheckBoard.statusValues.pass);
});

test('createDbsInvite: empty mondayItemId throws TrustidValidationError', async () => {
  const { client: monday, calls } = fakeMonday({ dbsCheck: dbsCheckItem() });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  await assert.rejects(
    () => workflow.createDbsInvite({ mondayItemId: '   ' }),
    (error: unknown) => error instanceof TrustidValidationError,
  );
  assert.equal(calls.fetchedDbs.length, 0);
  assert.equal(calls.dbsInviteSent.length, 0);
});

test('createDbsInvite: TrustID failure writes error to Monday and rethrows', async () => {
  const item = dbsCheckItem({ status: dbsCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday({ dbsCheck: item });
  const trustid = fakeTrustid({
    createGuestLink: async () => {
      throw new TrustidApiError('dbs upstream boom', 502, 'body');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  await assert.rejects(
    () => workflow.createDbsInvite({ mondayItemId: item.itemId }),
    (error: unknown) => error instanceof TrustidApiError,
  );

  assert.equal(calls.dbsErrored.length, 1);
  assert.deepEqual(calls.dbsErrored[0], {
    itemId: item.itemId,
    updates: {
      status: dbsCheckBoard.statusValues.error,
      error: 'dbs upstream boom',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.dbsInviteSent.length, 0);
});

test('createDbsInvite: routes to DBS callback URL, not ID callback URL', async () => {
  const item = dbsCheckItem({ status: dbsCheckBoard.statusValues.sendInvite });
  const { client: monday } = fakeMonday({ dbsCheck: item });
  const callbackUrls: string[] = [];
  const trustid = fakeTrustid({
    createGuestLink: async (request) => {
      callbackUrls.push(request.containerEventCallbackUrl);
      return { Success: true, ContainerId: 'c-3' };
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  await workflow.createDbsInvite({ mondayItemId: item.itemId });

  assert.deepEqual(callbackUrls, [dbsCallbackUrl]);
  assert.notEqual(callbackUrls[0], idCallbackUrl);
});

// -----------------------------------------------------------------------------
// processIdCallback — result-path tests
// -----------------------------------------------------------------------------

const makeWebhookUrl = 'https://hook.make.test/webhooks/trustid-id';
const sampleRawPayload = { ContainerId: 'c-9', ClientApplicationReference: 'item-1' };

test('processIdCallback: passed container marks Monday and forwards to Make.com', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => ({
      Success: true,
      Container: { Documents: [{ Status: 'Pass', Notes: 'Document verified clear' }] },
    }),
  });
  const workflow = buildWorkflow(trustid, monday, { makeComIdWebhookUrl: makeWebhookUrl });
  const fetchRecorder = withRecordedFetch();

  try {
    const result = await workflow.processIdCallback({
      mondayItemId: item.itemId,
      containerId: 'c-9',
      rawPayload: sampleRawPayload,
    });

    assert.equal(result.outcome, 'updated');
    if (result.outcome !== 'updated') return;
    assert.equal(result.idStatus, 'passed');
    assert.equal(result.trustIdContainerId, 'c-9');

    assert.equal(calls.idResulted.length, 1);
    assert.equal(calls.idResulted[0].updates.status, idCheckBoard.statusValues.pass);
    assert.equal(calls.idResulted[0].updates.lastUpdatedAt, '2026-05-03T10:00:00.000Z');

    assert.equal(fetchRecorder.calls.length, 1);
    assert.equal(fetchRecorder.calls[0].url, makeWebhookUrl);
    assert.equal(fetchRecorder.calls[0].init?.method, 'POST');
    assert.equal(fetchRecorder.calls[0].init?.body, JSON.stringify(sampleRawPayload));
  } finally {
    fetchRecorder.restore();
  }
});

test('processIdCallback: failed/review/error containers map correctly', async () => {
  const cases: Array<{
    container: unknown;
    expectedIdStatus: 'failed' | 'review' | 'error';
    expectedStatusValue: string;
  }> = [
    {
      container: { Documents: [{ Status: 'Failed', Notes: 'Document rejected as fraudulent' }] },
      expectedIdStatus: 'failed',
      expectedStatusValue: idCheckBoard.statusValues.fail,
    },
    {
      container: { Documents: [{ Status: 'Review', Notes: 'Manual review required' }] },
      expectedIdStatus: 'review',
      expectedStatusValue: idCheckBoard.statusValues.refer,
    },
    {
      container: { Documents: [{ Status: 'Error', Notes: 'Service unavailable' }] },
      expectedIdStatus: 'error',
      expectedStatusValue: idCheckBoard.statusValues.error,
    },
  ];

  for (const c of cases) {
    const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
    const { client: monday, calls } = fakeMonday({ idCheck: item });
    const trustid = fakeTrustid({
      retrieveDocumentContainer: async () => ({ Success: true, Container: c.container }),
    });
    const workflow = buildWorkflow(trustid, monday);

    const result = await workflow.processIdCallback({
      mondayItemId: item.itemId,
      containerId: 'c-1',
      rawPayload: {},
    });

    assert.equal(result.outcome, 'updated');
    if (result.outcome !== 'updated') return;
    assert.equal(result.idStatus, c.expectedIdStatus);
    assert.equal(calls.idResulted[0].updates.status, c.expectedStatusValue);
  }
});

test('processIdCallback: terminal status (Pass) skips with already-terminal', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.pass });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  let trustidCalled = false;
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      trustidCalled = true;
      throw new Error('should not be called');
    },
  });
  const workflow = buildWorkflow(trustid, monday, { makeComIdWebhookUrl: makeWebhookUrl });
  const fetchRecorder = withRecordedFetch();

  try {
    const result = await workflow.processIdCallback({
      mondayItemId: item.itemId,
      containerId: 'c-1',
      rawPayload: {},
    });

    assert.equal(result.outcome, 'already-terminal');
    if (result.outcome !== 'already-terminal') return;
    assert.equal(result.currentStatus, idCheckBoard.statusValues.pass);
    assert.equal(trustidCalled, false);
    assert.equal(calls.idResulted.length, 0);
    assert.equal(fetchRecorder.calls.length, 0);
  } finally {
    fetchRecorder.restore();
  }
});

test('processIdCallback: empty mondayItemId throws TrustidValidationError', async () => {
  const { client: monday, calls } = fakeMonday({ idCheck: idCheckItem() });
  const workflow = buildWorkflow(fakeTrustid(), monday);

  await assert.rejects(
    () => workflow.processIdCallback({ mondayItemId: '   ', containerId: 'c', rawPayload: {} }),
    (error: unknown) => error instanceof TrustidValidationError,
  );
  assert.equal(calls.idResulted.length, 0);
});

test('processIdCallback: TrustID retrieve throws -> error status, summary captures the message, Make still forwarded', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      throw new TrustidApiError('retrieve boom', 502, 'body');
    },
  });
  const workflow = buildWorkflow(trustid, monday, { makeComIdWebhookUrl: makeWebhookUrl });
  const fetchRecorder = withRecordedFetch();

  try {
    const result = await workflow.processIdCallback({
      mondayItemId: item.itemId,
      containerId: 'c-1',
      rawPayload: sampleRawPayload,
    });

    assert.equal(result.outcome, 'updated');
    if (result.outcome !== 'updated') return;
    assert.equal(result.idStatus, 'error');
    assert.equal(result.summary, 'retrieve boom');

    assert.equal(calls.idResulted[0].updates.status, idCheckBoard.statusValues.error);
    assert.equal(calls.idResulted[0].updates.summary, 'retrieve boom');
    assert.equal(fetchRecorder.calls.length, 1);
  } finally {
    fetchRecorder.restore();
  }
});

test('processIdCallback: makeComIdWebhookUrl unset -> Monday update happens but fetch never called', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => ({
      Success: true,
      Container: { Documents: [{ Status: 'Pass' }] },
    }),
  });
  const workflow = buildWorkflow(trustid, monday); // no makeComIdWebhookUrl
  const fetchRecorder = withRecordedFetch();

  try {
    await workflow.processIdCallback({
      mondayItemId: item.itemId,
      containerId: 'c-1',
      rawPayload: {},
    });

    assert.equal(calls.idResulted.length, 1);
    assert.equal(fetchRecorder.calls.length, 0);
  } finally {
    fetchRecorder.restore();
  }
});

test('processIdCallback: missing containerId in webhook AND on Monday item -> error, no TrustID retrieve', async () => {
  const item = idCheckItem({
    status: idCheckBoard.statusValues.inviteSent,
    trustIdContainerId: null,
  });
  const { client: monday, calls } = fakeMonday({ idCheck: item });
  let trustidCalled = false;
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      trustidCalled = true;
      throw new Error('should not be called');
    },
  });
  const workflow = buildWorkflow(trustid, monday);

  const result = await workflow.processIdCallback({
    mondayItemId: item.itemId,
    containerId: null,
    rawPayload: {},
  });

  assert.equal(result.outcome, 'updated');
  if (result.outcome !== 'updated') return;
  assert.equal(result.idStatus, 'error');
  assert.equal(result.trustIdContainerId, null);
  assert.match(result.summary, /No container ID/);
  assert.equal(trustidCalled, false);
  assert.equal(calls.idResulted[0].updates.status, idCheckBoard.statusValues.error);
});
