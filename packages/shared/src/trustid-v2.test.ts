import test from 'node:test';
import { strict as assert } from 'node:assert';

import { idCheckItem } from './fixtures.ts';
import { idCheckBoard } from './lib/monday-boards.ts';
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
  IdCheckErrorUpdates,
  IdCheckInviteSentUpdates,
  IdCheckItem,
  MondayTrustidClient,
} from './lib/adapters/monday-trustid-v2.ts';

const fixedNow = () => new Date('2026-05-03T10:00:00Z');
const idCallbackUrl = 'https://api.example.test/api/trustid-id-callback-v2';

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
  fetched: string[];
  inviteSent: Array<{ itemId: string; updates: IdCheckInviteSentUpdates }>;
  errored: Array<{ itemId: string; updates: IdCheckErrorUpdates }>;
};

function fakeMonday(item: IdCheckItem | (() => IdCheckItem)): {
  client: MondayTrustidClient;
  calls: FakeMondayCalls;
} {
  const calls: FakeMondayCalls = { fetched: [], inviteSent: [], errored: [] };
  const client: MondayTrustidClient = {
    fetchIdCheckItem: async (itemId: string): Promise<IdCheckItem> => {
      calls.fetched.push(itemId);
      return typeof item === 'function' ? item() : item;
    },
    markIdInviteSent: async (itemId: string, updates: IdCheckInviteSentUpdates) => {
      calls.inviteSent.push({ itemId, updates });
    },
    markIdError: async (itemId: string, updates: IdCheckErrorUpdates) => {
      calls.errored.push({ itemId, updates });
    },
  };
  return { client, calls };
}

function buildWorkflow(
  trustidClient: TrustidClient,
  mondayClient: MondayTrustidClient,
): Trustid {
  return new Trustid({
    trustidClient,
    mondayClient,
    idCallbackUrl,
    idCheckStatusValues: idCheckBoard.statusValues,
    now: fixedNow,
  });
}

test('createIdInvite: status sendInvite mints, updates Monday, returns created', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday(item);
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
    containerEventCallbackUrl: idCallbackUrl,
  });

  assert.equal(calls.inviteSent.length, 1);
  assert.deepEqual(calls.inviteSent[0], {
    itemId: item.itemId,
    updates: {
      status: idCheckBoard.statusValues.inviteSent,
      trustIdContainerId: 'c-1',
      guestLinkUrl: 'https://trustid.example/g/1',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.errored.length, 0);
});

test('createIdInvite: status null is treated as initial and mints', async () => {
  const item = idCheckItem({ status: null });
  const { client: monday, calls } = fakeMonday(item);
  const workflow = buildWorkflow(fakeTrustid(), monday);

  const result = await workflow.createIdInvite({ mondayItemId: item.itemId });

  assert.equal(result.outcome, 'created');
  assert.equal(calls.inviteSent.length, 1);
});

test('createIdInvite: status inviteSent skips with already-processed', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.inviteSent });
  const { client: monday, calls } = fakeMonday(item);
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
  assert.equal(calls.inviteSent.length, 0);
});

test('createIdInvite: terminal status (Pass) skips with already-processed', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.pass });
  const { client: monday } = fakeMonday(item);
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
  const { client: monday, calls } = fakeMonday(idCheckItem());
  const workflow = buildWorkflow(fakeTrustid(), monday);

  await assert.rejects(
    () => workflow.createIdInvite({ mondayItemId: '   ' }),
    (error: unknown) => error instanceof TrustidValidationError,
  );
  assert.equal(calls.fetched.length, 0);
  assert.equal(calls.inviteSent.length, 0);
});

test('createIdInvite: TrustID failure writes error to Monday and rethrows', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday(item);
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

  assert.equal(calls.errored.length, 1);
  assert.deepEqual(calls.errored[0], {
    itemId: item.itemId,
    updates: {
      status: idCheckBoard.statusValues.error,
      error: 'upstream boom',
      lastUpdatedAt: '2026-05-03T10:00:00.000Z',
    },
  });
  assert.equal(calls.inviteSent.length, 0);
});

test('createIdInvite: persists when TrustID returns null LinkUrl (sandbox finding)', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.sendInvite });
  const { client: monday, calls } = fakeMonday(item);
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

  assert.equal(calls.inviteSent[0].updates.guestLinkUrl, null);
  assert.equal(calls.inviteSent[0].updates.trustIdContainerId, 'c-1');
});
