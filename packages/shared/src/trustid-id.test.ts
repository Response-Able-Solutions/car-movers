import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTrustIdIdInvite,
  TRUST_ID_ID_INVITE_BLOCKED_STATUS,
  TRUST_ID_ID_INVITE_ERROR_STATUS,
  TRUST_ID_ID_INVITE_SENT_STATUS,
  TrustIdIdInviteValidationError,
  validateTrustIdIdInviteRequest,
  type TrustIdIdInviteConfig,
} from './trustid-id.ts';
import type { MondayTrustIdIdCheckItem, MondayTrustIdIdCheckItemUpdates } from './monday.ts';
import type { TrustIdCreateGuestLinkRequest } from './trustid.ts';

const idCheckItem: MondayTrustIdIdCheckItem = {
  itemId: 'id-check-123',
  applicantName: 'Driver Name',
  applicantEmail: 'driver@example.com',
  status: null,
  trustIdContainerId: null,
  trustIdGuestId: null,
  inviteCreatedAt: null,
  resultSummary: null,
  errorDetails: null,
  processingTimestamp: null,
};

const config: TrustIdIdInviteConfig = {
  monday: {
    token: 'monday-token',
    boardId: 'id-board-1',
    columns: {
      applicantName: 'text_name',
      applicantEmail: 'email_email',
      status: 'color_status',
      trustIdContainerId: 'text_container',
      trustIdGuestId: 'text_guest',
      inviteCreatedAt: 'date_invite',
      resultSummary: 'long_text_result',
      errorDetails: 'long_text_error',
      processingTimestamp: 'date_processed',
    },
  },
  trustId: {
    apiKey: 'trustid-api-key',
    username: 'trustid-user',
    password: 'trustid-password',
    deviceId: 'device-123',
    branchId: 'id-branch-123',
    digitalIdentificationScheme: 2,
  },
  now: () => new Date('2026-05-02T10:00:00.000Z'),
};

test('validateTrustIdIdInviteRequest rejects missing monday item ID', () => {
  assert.throws(
    () => validateTrustIdIdInviteRequest({ mondayItemId: ' ' }),
    (error: unknown) => error instanceof TrustIdIdInviteValidationError && error.message === 'Missing mondayItemId',
  );
});

test('createTrustIdIdInvite creates guest link and updates ID-check board', async () => {
  let capturedGuestLinkRequest: TrustIdCreateGuestLinkRequest | undefined;
  let capturedUpdate: MondayTrustIdIdCheckItemUpdates | undefined;

  const result = await createTrustIdIdInvite(
    { mondayItemId: 'id-check-123' },
    config,
    {
      fetchMondayTrustIdIdCheckItem: async () => idCheckItem,
      createTrustIdGuestLink: async (request) => {
        capturedGuestLinkRequest = request;
        return {
          Success: true,
          Message: 'Operation executed successfully.',
          ContainerId: 'container-123',
          GuestId: 'guest-123',
        };
      },
      updateMondayTrustIdIdCheckItem: async (_itemId, updates) => {
        capturedUpdate = updates;
        return { change_multiple_column_values: { id: 'id-check-123' } };
      },
    },
  );

  assert.deepEqual(capturedGuestLinkRequest, {
    email: 'driver@example.com',
    name: 'Driver Name',
    branchId: 'id-branch-123',
    clientApplicationReference: 'id-check-123',
    sendEmail: true,
    digitalIdentificationScheme: 2,
  });
  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_ID_INVITE_SENT_STATUS,
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-02T10:00:00.000Z',
    resultSummary: null,
    errorDetails: null,
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
  assert.deepEqual(result, {
    outcome: 'created',
    mondayItemId: 'id-check-123',
    applicantEmail: 'driver@example.com',
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-02T10:00:00.000Z',
    status: TRUST_ID_ID_INVITE_SENT_STATUS,
  });
});

test('createTrustIdIdInvite blocks active duplicate invite', async () => {
  let trustIdCalled = false;
  let capturedUpdate: MondayTrustIdIdCheckItemUpdates | undefined;

  const result = await createTrustIdIdInvite(
    { mondayItemId: 'id-check-123' },
    config,
    {
      fetchMondayTrustIdIdCheckItem: async () => ({
        ...idCheckItem,
        trustIdContainerId: 'container-123',
        trustIdGuestId: 'guest-123',
        inviteCreatedAt: '2026-05-01T10:00:00.000Z',
      }),
      createTrustIdGuestLink: async () => {
        trustIdCalled = true;
        return {
          Success: true,
          ContainerId: 'new-container',
          GuestId: 'new-guest',
        };
      },
      updateMondayTrustIdIdCheckItem: async (_itemId, updates) => {
        capturedUpdate = updates;
        return { change_multiple_column_values: { id: 'id-check-123' } };
      },
    },
  );

  assert.equal(trustIdCalled, false);
  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_ID_INVITE_BLOCKED_STATUS,
    errorDetails: 'TrustID invite is still active until 2026-05-15T10:00:00.000Z',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
  assert.deepEqual(result, {
    outcome: 'blocked',
    mondayItemId: 'id-check-123',
    applicantEmail: 'driver@example.com',
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-01T10:00:00.000Z',
    status: TRUST_ID_ID_INVITE_BLOCKED_STATUS,
    reason: 'TrustID invite is still active until 2026-05-15T10:00:00.000Z',
  });
});

test('createTrustIdIdInvite allows retry after 14 day expiry', async () => {
  let trustIdCalled = false;

  const result = await createTrustIdIdInvite(
    { mondayItemId: 'id-check-123' },
    config,
    {
      fetchMondayTrustIdIdCheckItem: async () => ({
        ...idCheckItem,
        trustIdContainerId: 'container-123',
        inviteCreatedAt: '2026-04-17T09:59:59.000Z',
      }),
      createTrustIdGuestLink: async () => {
        trustIdCalled = true;
        return {
          Success: true,
          ContainerId: 'new-container',
          GuestId: 'new-guest',
        };
      },
      updateMondayTrustIdIdCheckItem: async () => ({ change_multiple_column_values: { id: 'id-check-123' } }),
    },
  );

  assert.equal(trustIdCalled, true);
  assert.equal(result.outcome, 'created');
  assert.equal(result.trustIdContainerId, 'new-container');
});

test('createTrustIdIdInvite allows retry after final failed status', async () => {
  let trustIdCalled = false;

  const result = await createTrustIdIdInvite(
    { mondayItemId: 'id-check-123' },
    config,
    {
      fetchMondayTrustIdIdCheckItem: async () => ({
        ...idCheckItem,
        status: 'TrustID ID Check Failed',
        trustIdContainerId: 'container-123',
        inviteCreatedAt: '2026-05-01T10:00:00.000Z',
      }),
      createTrustIdGuestLink: async () => {
        trustIdCalled = true;
        return {
          Success: true,
          ContainerId: 'new-container',
          GuestId: 'new-guest',
        };
      },
      updateMondayTrustIdIdCheckItem: async () => ({ change_multiple_column_values: { id: 'id-check-123' } }),
    },
  );

  assert.equal(trustIdCalled, true);
  assert.equal(result.outcome, 'created');
  assert.equal(result.trustIdContainerId, 'new-container');
});

test('createTrustIdIdInvite writes TrustID failure details to Monday when item is known', async () => {
  let capturedUpdate: MondayTrustIdIdCheckItemUpdates | undefined;

  await assert.rejects(
    () =>
      createTrustIdIdInvite(
        { mondayItemId: 'id-check-123' },
        config,
        {
          fetchMondayTrustIdIdCheckItem: async () => idCheckItem,
          createTrustIdGuestLink: async () => {
            throw new Error('TrustID unavailable');
          },
          updateMondayTrustIdIdCheckItem: async (_itemId, updates) => {
            capturedUpdate = updates;
            return { change_multiple_column_values: { id: 'id-check-123' } };
          },
        },
      ),
    /TrustID unavailable/,
  );

  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_ID_INVITE_ERROR_STATUS,
    errorDetails: 'TrustID unavailable',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
});
