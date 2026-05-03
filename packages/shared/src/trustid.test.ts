import test from 'node:test';
import { strict as assert } from 'node:assert';
import {
  Trustid,
  TrustidValidationError,
  type TrustidDeps,
} from './lib/workflows/trustid.ts';
import type {
  CreateGuestLinkRequest,
  CreateGuestLinkResponse,
  ContainerResponse,
  DbsFormResponse,
  InitiateBasicDbsCheckRequest,
  BasicDbsResponse,
  TrustidClient,
} from './lib/adapters/trustid.ts';
import type {
  MondayTrustidClient,
  MondayTrustidDbsUpdates,
  MondayTrustidIdCheckUpdates,
} from './lib/adapters/monday.ts';
import { mondayTrustidDbsItem, mondayTrustidIdCheckItem } from './fixtures.ts';

const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z');
const FIXED_NOW_ISO = FIXED_NOW.toISOString();
const FIXED_NOW_MS = FIXED_NOW.getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type RecordedIdUpdate = { itemId: string; updates: MondayTrustidIdCheckUpdates };
type RecordedDbsUpdate = { itemId: string; updates: MondayTrustidDbsUpdates };

type IdHarness = {
  trustid: Trustid;
  fakeMonday: MondayTrustidClient;
  fakeTrustid: TrustidClient;
  idUpdates: RecordedIdUpdate[];
  guestLinkCalls: CreateGuestLinkRequest[];
  containerCalls: Array<{ containerId: string }>;
};

type DbsHarness = {
  trustid: Trustid;
  fakeMonday: MondayTrustidClient;
  fakeTrustid: TrustidClient;
  dbsUpdates: RecordedDbsUpdate[];
  guestLinkCalls: CreateGuestLinkRequest[];
  containerCalls: Array<{ containerId: string }>;
  dbsFormCalls: Array<{ containerId: string }>;
  basicDbsCalls: InitiateBasicDbsCheckRequest[];
};

function makeIdHarness(opts: {
  itemOverrides?: Parameters<typeof mondayTrustidIdCheckItem>[0];
  guestLinkResponse?: CreateGuestLinkResponse;
  guestLinkError?: Error;
  containerResponse?: ContainerResponse;
  containerError?: Error;
}): IdHarness {
  const item = mondayTrustidIdCheckItem(opts.itemOverrides);
  const idUpdates: RecordedIdUpdate[] = [];
  const guestLinkCalls: CreateGuestLinkRequest[] = [];
  const containerCalls: Array<{ containerId: string }> = [];

  const fakeMonday: MondayTrustidClient = {
    fetchIdCheckItem: async () => item,
    updateIdCheckItem: async (itemId, updates) => {
      idUpdates.push({ itemId, updates });
    },
    fetchDbsItem: async () => {
      throw new Error('not used in ID tests');
    },
    updateDbsItem: async () => {
      throw new Error('not used in ID tests');
    },
  };

  const fakeTrustid: TrustidClient = {
    createGuestLink: async (req) => {
      guestLinkCalls.push(req);
      if (opts.guestLinkError) throw opts.guestLinkError;
      return (
        opts.guestLinkResponse ?? {
          Success: true,
          ContainerId: 'container-1',
          GuestId: 'guest-1',
        }
      );
    },
    retrieveDocumentContainer: async (req) => {
      containerCalls.push(req);
      if (opts.containerError) throw opts.containerError;
      return (
        opts.containerResponse ?? {
          Success: true,
          Container: { IdentityCheck: { Result: 'Passed' } },
        }
      );
    },
    retrieveDbsForm: async () => ({ Success: true }),
    initiateBasicDbsCheck: async () => ({ Success: true }),
  };

  const trustid = new Trustid({
    trustidClient: fakeTrustid,
    mondayClient: fakeMonday,
    idInvite: { branchId: 'branch-1', digitalIdentificationScheme: 7 },
    now: () => FIXED_NOW,
  } satisfies TrustidDeps);

  return { trustid, fakeMonday, fakeTrustid, idUpdates, guestLinkCalls, containerCalls };
}

function makeDbsHarness(opts: {
  itemOverrides?: Parameters<typeof mondayTrustidDbsItem>[0];
  guestLinkResponse?: CreateGuestLinkResponse;
  guestLinkError?: Error;
  containerResponse?: ContainerResponse;
  dbsFormResponse?: DbsFormResponse;
  basicDbsResponse?: BasicDbsResponse;
}): DbsHarness {
  const item = mondayTrustidDbsItem(opts.itemOverrides);
  const dbsUpdates: RecordedDbsUpdate[] = [];
  const guestLinkCalls: CreateGuestLinkRequest[] = [];
  const containerCalls: Array<{ containerId: string }> = [];
  const dbsFormCalls: Array<{ containerId: string }> = [];
  const basicDbsCalls: InitiateBasicDbsCheckRequest[] = [];

  const fakeMonday: MondayTrustidClient = {
    fetchIdCheckItem: async () => {
      throw new Error('not used in DBS tests');
    },
    updateIdCheckItem: async () => {
      throw new Error('not used in DBS tests');
    },
    fetchDbsItem: async () => item,
    updateDbsItem: async (itemId, updates) => {
      dbsUpdates.push({ itemId, updates });
    },
  };

  const fakeTrustid: TrustidClient = {
    createGuestLink: async (req) => {
      guestLinkCalls.push(req);
      if (opts.guestLinkError) throw opts.guestLinkError;
      return (
        opts.guestLinkResponse ?? {
          Success: true,
          ContainerId: 'container-1',
          GuestId: 'guest-1',
        }
      );
    },
    retrieveDocumentContainer: async (req) => {
      containerCalls.push(req);
      return opts.containerResponse ?? { Success: true, Container: {} };
    },
    retrieveDbsForm: async (req) => {
      dbsFormCalls.push(req);
      return opts.dbsFormResponse ?? { Success: true };
    },
    initiateBasicDbsCheck: async (req) => {
      basicDbsCalls.push(req);
      return (
        opts.basicDbsResponse ?? {
          Success: true,
          DbsCheckResult: { DBSReference: 'DBS-123' },
        }
      );
    },
  };

  const trustid = new Trustid({
    trustidClient: fakeTrustid,
    mondayClient: fakeMonday,
    dbsInvite: { branchId: 'branch-dbs' },
    basicCheck: {
      employerName: 'Acme Movers',
      evidenceCheckedBy: 'Lui Holl',
      employmentSector: 'Transport',
      purposeOfCheck: 'Employment',
    },
    now: () => FIXED_NOW,
  } satisfies TrustidDeps);

  return {
    trustid,
    fakeMonday,
    fakeTrustid,
    dbsUpdates,
    guestLinkCalls,
    containerCalls,
    dbsFormCalls,
    basicDbsCalls,
  };
}

// ===========================================================================
// createIdInvite
// ===========================================================================

test('createIdInvite: happy path creates guest link, updates Monday, returns created', async () => {
  const h = makeIdHarness({});
  const result = await h.trustid.createIdInvite({ mondayItemId: 'item-1' });

  assert.equal(h.guestLinkCalls.length, 1);
  assert.deepEqual(h.guestLinkCalls[0], {
    email: 'jane@example.com',
    name: 'Jane Doe',
    branchId: 'branch-1',
    clientApplicationReference: 'item-1',
    sendEmail: true,
    digitalIdentificationScheme: 7,
  });
  assert.equal(h.idUpdates.length, 1);
  assert.deepEqual(h.idUpdates[0].updates, {
    status: 'TrustID ID Invite Sent',
    trustIdContainerId: 'container-1',
    trustIdGuestId: 'guest-1',
    inviteCreatedAt: FIXED_NOW_ISO,
    resultSummary: null,
    errorDetails: null,
    processingTimestamp: FIXED_NOW_ISO,
  });
  assert.equal(result.outcome, 'created');
  if (result.outcome === 'created') {
    assert.equal(result.mondayItemId, 'item-1');
    assert.equal(result.applicantEmail, 'jane@example.com');
    assert.equal(result.trustIdContainerId, 'container-1');
    assert.equal(result.trustIdGuestId, 'guest-1');
    assert.equal(result.inviteCreatedAt, FIXED_NOW_ISO);
  }
});

test('createIdInvite: blocks when invite is still active within 14 days', async () => {
  const sevenDaysAgo = new Date(FIXED_NOW_MS - 7 * ONE_DAY_MS).toISOString();
  const h = makeIdHarness({
    itemOverrides: {
      trustIdContainerId: 'existing-container',
      inviteCreatedAt: sevenDaysAgo,
      status: 'TrustID ID Invite Sent',
    },
  });

  const result = await h.trustid.createIdInvite({ mondayItemId: 'item-1' });

  assert.equal(h.guestLinkCalls.length, 0);
  assert.equal(h.idUpdates.length, 1);
  assert.equal(h.idUpdates[0].updates.status, 'TrustID ID Invite Active');
  assert.equal(result.outcome, 'blocked');
  if (result.outcome === 'blocked') {
    assert.match(result.reason, /still active/);
  }
});

test('createIdInvite: allows retry after 14-day expiry', async () => {
  const fifteenDaysAgo = new Date(FIXED_NOW_MS - 15 * ONE_DAY_MS).toISOString();
  const h = makeIdHarness({
    itemOverrides: {
      trustIdContainerId: 'old-container',
      inviteCreatedAt: fifteenDaysAgo,
      status: 'TrustID ID Invite Sent',
    },
  });

  const result = await h.trustid.createIdInvite({ mondayItemId: 'item-1' });

  assert.equal(h.guestLinkCalls.length, 1);
  assert.equal(result.outcome, 'created');
});

test('createIdInvite: allows retry after final-failed status', async () => {
  const twoDaysAgo = new Date(FIXED_NOW_MS - 2 * ONE_DAY_MS).toISOString();
  const h = makeIdHarness({
    itemOverrides: {
      trustIdContainerId: 'old-container',
      inviteCreatedAt: twoDaysAgo,
      status: 'TrustID ID Check Failed',
    },
  });

  const result = await h.trustid.createIdInvite({ mondayItemId: 'item-1' });
  assert.equal(result.outcome, 'created');
});

test('createIdInvite: blocks when identifier present but inviteCreatedAt is missing', async () => {
  const h = makeIdHarness({
    itemOverrides: {
      trustIdContainerId: 'orphan-container',
      inviteCreatedAt: null,
      status: 'TrustID ID Invite Sent',
    },
  });

  const result = await h.trustid.createIdInvite({ mondayItemId: 'item-1' });
  assert.equal(result.outcome, 'blocked');
  if (result.outcome === 'blocked') {
    assert.match(result.reason, /invite creation time is missing/);
  }
});

test('createIdInvite: TrustID failure writes error to Monday and rethrows', async () => {
  const h = makeIdHarness({ guestLinkError: new Error('TrustID 503') });

  await assert.rejects(
    () => h.trustid.createIdInvite({ mondayItemId: 'item-1' }),
    /TrustID 503/,
  );
  assert.equal(h.idUpdates.length, 1);
  assert.equal(h.idUpdates[0].updates.status, 'TrustID ID Invite Error');
  assert.equal(h.idUpdates[0].updates.errorDetails, 'TrustID 503');
});

test('createIdInvite: empty mondayItemId throws TrustidValidationError', async () => {
  const h = makeIdHarness({});
  await assert.rejects(
    () => h.trustid.createIdInvite({ mondayItemId: '   ' }),
    TrustidValidationError,
  );
});

// ===========================================================================
// processIdCallback
// ===========================================================================

test('processIdCallback: passed result updates Monday and returns processed', async () => {
  const h = makeIdHarness({
    itemOverrides: { trustIdContainerId: 'container-1' },
    containerResponse: {
      Success: true,
      Container: { IdentityCheck: { Result: 'Passed' }, DocumentStatus: 'Verified' },
    },
  });

  const result = await h.trustid.processIdCallback({ mondayItemId: 'item-1' });

  assert.equal(h.containerCalls.length, 1);
  assert.equal(h.containerCalls[0].containerId, 'container-1');
  assert.equal(h.idUpdates.length, 1);
  assert.equal(h.idUpdates[0].updates.status, 'TrustID ID Check Passed');
  assert.equal(result.outcome, 'processed');
  if (result.outcome === 'processed') {
    assert.equal(result.idStatus, 'passed');
    assert.equal(result.trustIdContainerId, 'container-1');
  }
});

test('processIdCallback: failed result', async () => {
  const h = makeIdHarness({
    itemOverrides: { trustIdContainerId: 'container-1' },
    containerResponse: {
      Success: true,
      Container: { IdentityCheck: { Result: 'Failed' }, DocumentStatus: 'Rejected' },
    },
  });

  const result = await h.trustid.processIdCallback({ mondayItemId: 'item-1' });
  assert.equal(result.outcome, 'processed');
  if (result.outcome === 'processed') {
    assert.equal(result.idStatus, 'failed');
  }
  assert.equal(h.idUpdates[0].updates.status, 'TrustID ID Check Failed');
});

test('processIdCallback: ambiguous result becomes review', async () => {
  const h = makeIdHarness({
    itemOverrides: { trustIdContainerId: 'container-1' },
    containerResponse: {
      Success: true,
      Container: { IdentityCheck: { Result: 'Passed', Warning: 'manual review needed' } },
    },
  });

  const result = await h.trustid.processIdCallback({ mondayItemId: 'item-1' });
  if (result.outcome === 'processed') {
    assert.equal(result.idStatus, 'review');
  }
});

test('processIdCallback: already-processed when Monday already in terminal state', async () => {
  const h = makeIdHarness({
    itemOverrides: {
      trustIdContainerId: 'container-1',
      status: 'TrustID ID Check Passed',
      resultSummary: 'previously passed',
    },
  });

  const result = await h.trustid.processIdCallback({ mondayItemId: 'item-1' });

  assert.equal(h.containerCalls.length, 0);
  assert.equal(h.idUpdates.length, 0);
  assert.equal(result.outcome, 'already-processed');
  if (result.outcome === 'already-processed') {
    assert.equal(result.idStatus, 'passed');
    assert.equal(result.resultSummary, 'previously passed');
  }
});

test('processIdCallback: missing container ID throws and writes error', async () => {
  const h = makeIdHarness({
    itemOverrides: { trustIdContainerId: null, trustIdGuestId: null },
  });

  await assert.rejects(
    () => h.trustid.processIdCallback({ mondayItemId: 'item-1' }),
    TrustidValidationError,
  );
  assert.equal(h.idUpdates.length, 1);
  assert.equal(h.idUpdates[0].updates.status, 'TrustID ID Check Error');
});

test('processIdCallback: callback containerId wins over Monday values', async () => {
  const h = makeIdHarness({
    itemOverrides: { trustIdContainerId: 'old', trustIdGuestId: 'guest-1' },
  });

  await h.trustid.processIdCallback({ mondayItemId: 'item-1', containerId: 'fresh' });
  assert.equal(h.containerCalls[0].containerId, 'fresh');
});

test('processIdCallback: falls back to Monday container then guest id', async () => {
  const h1 = makeIdHarness({
    itemOverrides: { trustIdContainerId: 'mc', trustIdGuestId: 'guest' },
  });
  await h1.trustid.processIdCallback({ mondayItemId: 'item-1' });
  assert.equal(h1.containerCalls[0].containerId, 'mc');

  const h2 = makeIdHarness({
    itemOverrides: { trustIdContainerId: null, trustIdGuestId: 'guest-only' },
  });
  await h2.trustid.processIdCallback({ mondayItemId: 'item-1' });
  assert.equal(h2.containerCalls[0].containerId, 'guest-only');
});

// ===========================================================================
// createDbsInvite
// ===========================================================================

test('createDbsInvite: happy path passes callback URL and updates Monday', async () => {
  const h = makeDbsHarness({});
  const result = await h.trustid.createDbsInvite({
    mondayItemId: 'item-1',
    callbackBaseUrl: 'https://example.test',
  });

  assert.equal(h.guestLinkCalls.length, 1);
  assert.equal(h.guestLinkCalls[0].branchId, 'branch-dbs');
  assert.equal(
    h.guestLinkCalls[0].containerEventCallbackUrl,
    'https://example.test/api/trustid-dbs-callback?mondayItemId=item-1',
  );
  assert.equal(h.dbsUpdates[0].updates.status, 'TrustID Invite Sent');
  assert.equal(result.outcome, 'created');
});

test('createDbsInvite: blocks when active within 14 days', async () => {
  const fiveDaysAgo = new Date(FIXED_NOW_MS - 5 * ONE_DAY_MS).toISOString();
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'existing',
      inviteCreatedAt: fiveDaysAgo,
      status: 'TrustID Invite Sent',
    },
  });

  const result = await h.trustid.createDbsInvite({
    mondayItemId: 'item-1',
    callbackBaseUrl: 'https://example.test',
  });

  assert.equal(h.guestLinkCalls.length, 0);
  assert.equal(result.outcome, 'blocked');
  if (result.outcome === 'blocked') {
    assert.match(result.reason, /still active/);
  }
});

test('createDbsInvite: blocks when identifier present but inviteCreatedAt missing', async () => {
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'orphan',
      inviteCreatedAt: null,
      status: 'TrustID Invite Sent',
    },
  });

  const result = await h.trustid.createDbsInvite({
    mondayItemId: 'item-1',
    callbackBaseUrl: 'https://example.test',
  });
  if (result.outcome === 'blocked') {
    assert.match(result.reason, /invite creation time is missing/);
  } else {
    assert.fail('expected blocked');
  }
});

test('createDbsInvite: allows retry after 14-day expiry', async () => {
  const ancient = new Date(FIXED_NOW_MS - 30 * ONE_DAY_MS).toISOString();
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'old',
      inviteCreatedAt: ancient,
      status: 'TrustID Invite Sent',
    },
  });

  const result = await h.trustid.createDbsInvite({
    mondayItemId: 'item-1',
    callbackBaseUrl: 'https://example.test',
  });
  assert.equal(result.outcome, 'created');
});

test('createDbsInvite: allows retry after final-failed status', async () => {
  const recent = new Date(FIXED_NOW_MS - 2 * ONE_DAY_MS).toISOString();
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'old',
      inviteCreatedAt: recent,
      status: 'TrustID DBS Failed',
    },
  });

  const result = await h.trustid.createDbsInvite({
    mondayItemId: 'item-1',
    callbackBaseUrl: 'https://example.test',
  });
  assert.equal(result.outcome, 'created');
});

test('createDbsInvite: TrustID failure writes error and rethrows', async () => {
  const h = makeDbsHarness({ guestLinkError: new Error('TrustID DBS down') });

  await assert.rejects(
    () =>
      h.trustid.createDbsInvite({
        mondayItemId: 'item-1',
        callbackBaseUrl: 'https://example.test',
      }),
    /TrustID DBS down/,
  );
  assert.equal(h.dbsUpdates[0].updates.status, 'TrustID Invite Error');
  assert.equal(h.dbsUpdates[0].updates.errorDetails, 'TrustID DBS down');
});

// ===========================================================================
// processDbsCallback
// ===========================================================================

test('processDbsCallback: happy path retrieves form, initiates check, marks submitted', async () => {
  const h = makeDbsHarness({
    itemOverrides: { trustIdContainerId: 'container-1' },
  });

  const result = await h.trustid.processDbsCallback({ mondayItemId: 'item-1' });

  assert.equal(h.containerCalls.length, 1);
  assert.equal(h.dbsFormCalls.length, 1);
  assert.equal(h.basicDbsCalls.length, 1);
  assert.equal(h.basicDbsCalls[0].containerId, 'container-1');
  assert.equal(h.basicDbsCalls[0].evidenceCheckedBy, 'Lui Holl');
  assert.equal(h.basicDbsCalls[0].employmentSector, 'Transport');
  assert.equal(h.basicDbsCalls[0].purposeOfCheck, 'Employment');
  assert.equal(h.dbsUpdates.length, 2);
  assert.equal(h.dbsUpdates[0].updates.status, 'TrustID Result Received');
  assert.equal(h.dbsUpdates[1].updates.status, 'TrustID DBS Submitted');
  assert.equal(h.dbsUpdates[1].updates.dbsReference, 'DBS-123');
  assert.equal(result.outcome, 'submitted');
  if (result.outcome === 'submitted') {
    assert.equal(result.dbsReference, 'DBS-123');
  }
});

test('processDbsCallback: falls back to Monday container ID when callback omits', async () => {
  const h = makeDbsHarness({
    itemOverrides: { trustIdContainerId: 'fallback-container' },
  });

  await h.trustid.processDbsCallback({ mondayItemId: 'item-1' });
  assert.equal(h.basicDbsCalls[0].containerId, 'fallback-container');
});

test('processDbsCallback: returns already-submitted when reference present', async () => {
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'c1',
      status: 'TrustID DBS Submitted',
      dbsReference: 'DBS-EXIST',
    },
  });

  const result = await h.trustid.processDbsCallback({ mondayItemId: 'item-1' });

  assert.equal(h.containerCalls.length, 0);
  assert.equal(h.basicDbsCalls.length, 0);
  assert.equal(h.dbsUpdates.length, 0);
  assert.equal(result.outcome, 'already-submitted');
  if (result.outcome === 'already-submitted') {
    assert.equal(result.dbsReference, 'DBS-EXIST');
  }
});

test('processDbsCallback: returns already-processing when status is Result Received', async () => {
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'c1',
      status: 'TrustID Result Received',
    },
  });

  const result = await h.trustid.processDbsCallback({ mondayItemId: 'item-1' });

  assert.equal(h.basicDbsCalls.length, 0);
  assert.equal(result.outcome, 'already-processing');
});

test('processDbsCallback: retries after TrustID DBS Error status', async () => {
  const h = makeDbsHarness({
    itemOverrides: {
      trustIdContainerId: 'c1',
      status: 'TrustID DBS Error',
    },
  });

  const result = await h.trustid.processDbsCallback({ mondayItemId: 'item-1' });
  assert.equal(h.basicDbsCalls.length, 1);
  assert.equal(result.outcome, 'submitted');
});

test('processDbsCallback: missing mondayItemId throws TrustidValidationError', async () => {
  const h = makeDbsHarness({});
  await assert.rejects(
    () => h.trustid.processDbsCallback({ mondayItemId: '' }),
    TrustidValidationError,
  );
});

test('processDbsCallback: missing container ID throws and writes error', async () => {
  const h = makeDbsHarness({
    itemOverrides: { trustIdContainerId: null, trustIdGuestId: null },
  });

  await assert.rejects(
    () => h.trustid.processDbsCallback({ mondayItemId: 'item-1' }),
    TrustidValidationError,
  );
  assert.equal(h.dbsUpdates.length, 1);
  assert.equal(h.dbsUpdates[0].updates.status, 'TrustID DBS Error');
});

test('processDbsCallback: DBS initiation error writes failure and rethrows', async () => {
  const h = makeDbsHarness({
    itemOverrides: { trustIdContainerId: 'c1' },
    basicDbsResponse: {
      Success: true,
      DbsCheckResult: { ErrorMessage: 'consent missing' },
    },
  });

  await assert.rejects(
    () => h.trustid.processDbsCallback({ mondayItemId: 'item-1' }),
    /consent missing/,
  );
  // first update is Result Received, last update is DBS Error
  assert.equal(h.dbsUpdates[h.dbsUpdates.length - 1].updates.status, 'TrustID DBS Error');
});
