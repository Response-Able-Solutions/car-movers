import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrustIdDbsCallbackUrl,
  buildTrustIdBasicDbsRequest,
  createTrustIdDbsInvite,
  extractTrustIdDbsCallbackRequest,
  processTrustIdDbsCallback,
  TRUST_ID_DBS_INVITE_BLOCKED_STATUS,
  TRUST_ID_DBS_INVITE_ERROR_STATUS,
  TRUST_ID_DBS_INVITE_SENT_STATUS,
  TRUST_ID_DBS_RESULT_RECEIVED_STATUS,
  TRUST_ID_DBS_SUBMITTED_STATUS,
  TRUST_ID_DBS_ERROR_STATUS,
  TrustIdDbsCallbackValidationError,
  TrustIdDbsKickoffValidationError,
  validateTrustIdDbsKickoffRequest,
  type TrustIdDbsCallbackConfig,
  type TrustIdDbsKickoffConfig,
} from './trustid-dbs.ts';
import type { MondayDbsItem, MondayDbsItemUpdates } from './monday.ts';
import type { TrustIdCreateGuestLinkRequest, TrustIdInitiateBasicDbsCheckRequest } from './trustid.ts';

const dbsItem: MondayDbsItem = {
  itemId: '12345',
  applicantName: 'Driver Name',
  applicantEmail: 'driver@example.com',
  linkedDriverItemId: '98765',
  status: null,
  trustIdContainerId: null,
  trustIdGuestId: null,
  inviteCreatedAt: null,
  dbsReference: null,
  errorDetails: null,
  processingTimestamp: null,
};

const config: TrustIdDbsKickoffConfig = {
  monday: {
    token: 'monday-token',
    boardId: 'board-1',
    columns: {
      applicantName: 'text_name',
      applicantEmail: 'email_email',
      linkedDriverItem: 'connect_driver',
      status: 'color_status',
      trustIdContainerId: 'text_container',
      trustIdGuestId: 'text_guest',
      inviteCreatedAt: 'date_invite',
      dbsReference: 'text_dbs_ref',
      errorDetails: 'long_text_error',
      processingTimestamp: 'date_processed',
    },
  },
  trustId: {
    apiKey: 'trustid-api-key',
    username: 'trustid-user',
    password: 'trustid-password',
    deviceId: 'device-123',
    branchId: 'branch-123',
  },
  callbackBaseUrl: 'https://api.example.com',
  now: () => new Date('2026-05-02T10:00:00.000Z'),
};

const callbackConfig: TrustIdDbsCallbackConfig = {
  monday: config.monday,
  trustId: {
    apiKey: 'trustid-api-key',
    username: 'trustid-user',
    password: 'trustid-password',
    deviceId: 'device-123',
  },
  basicCheck: {
    employerName: 'Car Movers',
    evidenceCheckedBy: 'Ops User',
    employmentSector: 'DRIVERS',
  },
  now: () => new Date('2026-05-02T10:00:00.000Z'),
};

test('buildTrustIdDbsCallbackUrl builds dynamic callback URL for one monday item', () => {
  assert.equal(
    buildTrustIdDbsCallbackUrl('https://api.example.com', '12345'),
    'https://api.example.com/api/trustid-dbs-callback?mondayItemId=12345',
  );
});

test('validateTrustIdDbsKickoffRequest rejects missing monday item ID', () => {
  assert.throws(
    () => validateTrustIdDbsKickoffRequest({ mondayItemId: ' ' }),
    (error: unknown) => error instanceof TrustIdDbsKickoffValidationError && error.message === 'Missing mondayItemId',
  );
});

test('extractTrustIdDbsCallbackRequest reads correlation and container fields', () => {
  assert.deepEqual(
    extractTrustIdDbsCallbackRequest(
      { mondayItemId: '12345' },
      {
        ContainerId: 'container-123',
      },
    ),
    {
      mondayItemId: '12345',
      containerId: 'container-123',
      payload: {
        ContainerId: 'container-123',
      },
    },
  );

  assert.deepEqual(
    extractTrustIdDbsCallbackRequest(
      {},
      {
        ClientApplicationReference: '12345',
        guestId: 'guest-123',
      },
    ),
    {
      mondayItemId: '12345',
      containerId: 'guest-123',
      payload: {
        ClientApplicationReference: '12345',
        guestId: 'guest-123',
      },
    },
  );
});

test('buildTrustIdBasicDbsRequest creates Basic DBS initiation request', () => {
  assert.deepEqual(buildTrustIdBasicDbsRequest('container-123', callbackConfig), {
    containerId: 'container-123',
    employerName: 'Car Movers',
    candidateOriginalDocumentsChecked: true,
    candidateAddressChecked: true,
    candidateDateOfBirthChecked: true,
    evidenceCheckedBy: 'Ops User',
    evidenceCheckedDate: '/Date(1777716000000)/',
    selfDeclarationCheck: true,
    applicationConsent: true,
    purposeOfCheck: 'Employment',
    employmentSector: 'DRIVERS',
    other: undefined,
  });
});

test('createTrustIdDbsInvite creates guest link and updates DBS board', async () => {
  let capturedGuestLinkRequest: TrustIdCreateGuestLinkRequest | undefined;
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  const result = await createTrustIdDbsInvite(
    { mondayItemId: '12345' },
    config,
    {
      fetchMondayDbsItem: async () => dbsItem,
      createTrustIdGuestLink: async (request) => {
        capturedGuestLinkRequest = request;
        return {
          Success: true,
          Message: 'Operation executed successfully.',
          ContainerId: 'container-123',
          GuestId: 'guest-123',
        };
      },
      updateMondayDbsItem: async (_itemId, updates) => {
        capturedUpdate = updates;
        return { change_multiple_column_values: { id: '12345' } };
      },
    },
  );

  assert.deepEqual(capturedGuestLinkRequest, {
    email: 'driver@example.com',
    name: 'Driver Name',
    branchId: 'branch-123',
    clientApplicationReference: '12345',
    containerEventCallbackUrl: 'https://api.example.com/api/trustid-dbs-callback?mondayItemId=12345',
    sendEmail: true,
  });
  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_DBS_INVITE_SENT_STATUS,
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-02T10:00:00.000Z',
    errorDetails: null,
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
  assert.deepEqual(result, {
    outcome: 'created',
    mondayItemId: '12345',
    applicantEmail: 'driver@example.com',
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-02T10:00:00.000Z',
    status: TRUST_ID_DBS_INVITE_SENT_STATUS,
  });
});

test('createTrustIdDbsInvite writes TrustID failure details to Monday when item is known', async () => {
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  await assert.rejects(
    () =>
      createTrustIdDbsInvite(
        { mondayItemId: '12345' },
        config,
        {
          fetchMondayDbsItem: async () => dbsItem,
          createTrustIdGuestLink: async () => {
            throw new Error('TrustID unavailable');
          },
          updateMondayDbsItem: async (_itemId, updates) => {
            capturedUpdate = updates;
            return { change_multiple_column_values: { id: '12345' } };
          },
        },
      ),
    /TrustID unavailable/,
  );

  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_DBS_INVITE_ERROR_STATUS,
    errorDetails: 'TrustID unavailable',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
});

test('createTrustIdDbsInvite blocks active duplicate invite', async () => {
  let trustIdCalled = false;
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  const result = await createTrustIdDbsInvite(
    { mondayItemId: '12345' },
    config,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
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
      updateMondayDbsItem: async (_itemId, updates) => {
        capturedUpdate = updates;
        return { change_multiple_column_values: { id: '12345' } };
      },
    },
  );

  assert.equal(trustIdCalled, false);
  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_DBS_INVITE_BLOCKED_STATUS,
    errorDetails: 'TrustID invite is still active until 2026-05-15T10:00:00.000Z',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
  assert.deepEqual(result, {
    outcome: 'blocked',
    mondayItemId: '12345',
    applicantEmail: 'driver@example.com',
    trustIdContainerId: 'container-123',
    trustIdGuestId: 'guest-123',
    inviteCreatedAt: '2026-05-01T10:00:00.000Z',
    status: TRUST_ID_DBS_INVITE_BLOCKED_STATUS,
    reason: 'TrustID invite is still active until 2026-05-15T10:00:00.000Z',
  });
});

test('createTrustIdDbsInvite blocks existing invite with missing timestamp', async () => {
  let trustIdCalled = false;
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  const result = await createTrustIdDbsInvite(
    { mondayItemId: '12345' },
    config,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
        trustIdContainerId: 'container-123',
        inviteCreatedAt: null,
      }),
      createTrustIdGuestLink: async () => {
        trustIdCalled = true;
        return {
          Success: true,
          ContainerId: 'new-container',
        };
      },
      updateMondayDbsItem: async (_itemId, updates) => {
        capturedUpdate = updates;
        return { change_multiple_column_values: { id: '12345' } };
      },
    },
  );

  assert.equal(trustIdCalled, false);
  assert.equal(capturedUpdate?.status, TRUST_ID_DBS_INVITE_BLOCKED_STATUS);
  assert.equal(capturedUpdate?.errorDetails, 'TrustID invite already exists but invite creation time is missing or invalid');
  assert.equal(result.outcome, 'blocked');
});

test('createTrustIdDbsInvite allows new invite after 14 day expiry', async () => {
  let trustIdCalled = false;

  const result = await createTrustIdDbsInvite(
    { mondayItemId: '12345' },
    config,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
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
      updateMondayDbsItem: async () => ({ change_multiple_column_values: { id: '12345' } }),
    },
  );

  assert.equal(trustIdCalled, true);
  assert.equal(result.outcome, 'created');
  assert.equal(result.trustIdContainerId, 'new-container');
});

test('createTrustIdDbsInvite allows new invite after final unsuccessful result', async () => {
  let trustIdCalled = false;

  const result = await createTrustIdDbsInvite(
    { mondayItemId: '12345' },
    config,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
        status: 'TrustID DBS Failed',
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
      updateMondayDbsItem: async () => ({ change_multiple_column_values: { id: '12345' } }),
    },
  );

  assert.equal(trustIdCalled, true);
  assert.equal(result.outcome, 'created');
  assert.equal(result.trustIdContainerId, 'new-container');
});

test('processTrustIdDbsCallback retrieves results and initiates Basic DBS', async () => {
  const capturedUpdates: MondayDbsItemUpdates[] = [];
  let capturedBasicDbsRequest: TrustIdInitiateBasicDbsCheckRequest | undefined;
  let retrievedContainerId: string | undefined;
  let retrievedDbsFormContainerId: string | undefined;

  const result = await processTrustIdDbsCallback(
    {
      mondayItemId: '12345',
      containerId: 'container-from-callback',
      payload: { EventType: 'ResultNotification' },
    },
    callbackConfig,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
        trustIdContainerId: 'container-from-monday',
      }),
      createTrustIdGuestLink: async () => ({ Success: true }),
      updateMondayDbsItem: async (_itemId, updates) => {
        capturedUpdates.push(updates);
        return { change_multiple_column_values: { id: '12345' } };
      },
      retrieveTrustIdDocumentContainer: async (request) => {
        retrievedContainerId = request.containerId;
        return { Success: true, Container: { Id: request.containerId } };
      },
      retrieveTrustIdDbsForm: async (request) => {
        retrievedDbsFormContainerId = request.containerId;
        return { Success: true, DBSForm: { ContainerId: request.containerId } };
      },
      initiateTrustIdBasicDbsCheck: async (request) => {
        capturedBasicDbsRequest = request;
        return {
          Success: true,
          DbsCheckResult: {
            DBSReference: 'dbs-ref-123',
          },
        };
      },
    },
  );

  assert.equal(retrievedContainerId, 'container-from-callback');
  assert.equal(retrievedDbsFormContainerId, 'container-from-callback');
  assert.deepEqual(capturedBasicDbsRequest, {
    containerId: 'container-from-callback',
    employerName: 'Car Movers',
    candidateOriginalDocumentsChecked: true,
    candidateAddressChecked: true,
    candidateDateOfBirthChecked: true,
    evidenceCheckedBy: 'Ops User',
    evidenceCheckedDate: '/Date(1777716000000)/',
    selfDeclarationCheck: true,
    applicationConsent: true,
    purposeOfCheck: 'Employment',
    employmentSector: 'DRIVERS',
    other: undefined,
  });
  assert.deepEqual(capturedUpdates, [
    {
      status: TRUST_ID_DBS_RESULT_RECEIVED_STATUS,
      trustIdContainerId: 'container-from-callback',
      errorDetails: null,
      processingTimestamp: '2026-05-02T10:00:00.000Z',
    },
    {
      status: TRUST_ID_DBS_SUBMITTED_STATUS,
      trustIdContainerId: 'container-from-callback',
      dbsReference: 'dbs-ref-123',
      errorDetails: null,
      processingTimestamp: '2026-05-02T10:00:00.000Z',
    },
  ]);
  assert.deepEqual(result, {
    mondayItemId: '12345',
    trustIdContainerId: 'container-from-callback',
    dbsReference: 'dbs-ref-123',
    status: TRUST_ID_DBS_SUBMITTED_STATUS,
  });
});

test('processTrustIdDbsCallback uses stored Monday container ID when callback omits it', async () => {
  let capturedBasicDbsContainerId: string | undefined;

  const result = await processTrustIdDbsCallback(
    { mondayItemId: '12345' },
    callbackConfig,
    {
      fetchMondayDbsItem: async () => ({
        ...dbsItem,
        trustIdContainerId: 'container-from-monday',
      }),
      createTrustIdGuestLink: async () => ({ Success: true }),
      updateMondayDbsItem: async () => ({ change_multiple_column_values: { id: '12345' } }),
      retrieveTrustIdDocumentContainer: async (request) => ({ Success: true, Container: { Id: request.containerId } }),
      retrieveTrustIdDbsForm: async (request) => ({ Success: true, DBSForm: { ContainerId: request.containerId } }),
      initiateTrustIdBasicDbsCheck: async (request) => {
        capturedBasicDbsContainerId = request.containerId;
        return { Success: true, DbsCheckResult: { DBSReference: 'dbs-ref-123' } };
      },
    },
  );

  assert.equal(capturedBasicDbsContainerId, 'container-from-monday');
  assert.equal(result.trustIdContainerId, 'container-from-monday');
});

test('processTrustIdDbsCallback rejects missing monday item ID', async () => {
  await assert.rejects(
    () => processTrustIdDbsCallback({ mondayItemId: ' ' }, callbackConfig),
    (error: unknown) => error instanceof TrustIdDbsCallbackValidationError && error.message === 'Missing mondayItemId',
  );
});

test('processTrustIdDbsCallback rejects missing container ID and updates Monday', async () => {
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  await assert.rejects(
    () =>
      processTrustIdDbsCallback(
        { mondayItemId: '12345' },
        callbackConfig,
        {
          fetchMondayDbsItem: async () => dbsItem,
          createTrustIdGuestLink: async () => ({ Success: true }),
          updateMondayDbsItem: async (_itemId, updates) => {
            capturedUpdate = updates;
            return { change_multiple_column_values: { id: '12345' } };
          },
          retrieveTrustIdDocumentContainer: async () => ({ Success: true }),
          retrieveTrustIdDbsForm: async () => ({ Success: true }),
          initiateTrustIdBasicDbsCheck: async () => ({ Success: true }),
        },
      ),
    (error: unknown) => error instanceof TrustIdDbsCallbackValidationError && error.message === 'Missing TrustID container ID',
  );

  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_DBS_ERROR_STATUS,
    errorDetails: 'Missing TrustID container ID',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
});

test('processTrustIdDbsCallback writes error details when TrustID initiation fails', async () => {
  let capturedUpdate: MondayDbsItemUpdates | undefined;

  await assert.rejects(
    () =>
      processTrustIdDbsCallback(
        { mondayItemId: '12345', containerId: 'container-123' },
        callbackConfig,
        {
          fetchMondayDbsItem: async () => dbsItem,
          createTrustIdGuestLink: async () => ({ Success: true }),
          updateMondayDbsItem: async (_itemId, updates) => {
            capturedUpdate = updates;
            return { change_multiple_column_values: { id: '12345' } };
          },
          retrieveTrustIdDocumentContainer: async () => ({ Success: true }),
          retrieveTrustIdDbsForm: async () => ({ Success: true }),
          initiateTrustIdBasicDbsCheck: async () => ({
            Success: true,
            DbsCheckResult: {
              ErrorMessage: 'DBS validation failed',
            },
          }),
        },
      ),
    /DBS validation failed/,
  );

  assert.deepEqual(capturedUpdate, {
    status: TRUST_ID_DBS_ERROR_STATUS,
    errorDetails: 'DBS validation failed',
    processingTimestamp: '2026-05-02T10:00:00.000Z',
  });
});
