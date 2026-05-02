import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrustIdGuestLinkPayload,
  buildTrustIdInitiateBasicDbsCheckPayload,
  buildTrustIdRequestBody,
  buildTrustIdUrl,
  createTrustIdGuestLink,
  initiateTrustIdBasicDbsCheck,
  loginToTrustId,
  retrieveTrustIdDbsForm,
  retrieveTrustIdDocumentContainer,
  TrustIdApiError,
  updateTrustIdDbsForm,
  type TrustIdSession,
} from './trustid.ts';

const session: TrustIdSession = {
  deviceId: 'device-123',
  sessionId: 'session-123',
};

test('buildTrustIdUrl builds VPE raw API endpoint URLs', () => {
  assert.equal(
    buildTrustIdUrl('https://sandbox.trustid.co.uk', '/session/login/'),
    'https://sandbox.trustid.co.uk/VPE/session/login/',
  );
});

test('buildTrustIdRequestBody attaches session identifiers', () => {
  assert.deepEqual(buildTrustIdRequestBody(session, { ContainerId: 'container-123' }), {
    DeviceId: 'device-123',
    SessionId: 'session-123',
    ContainerId: 'container-123',
  });
});

test('loginToTrustId posts credentials with Tid-Api-Key', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedInit = init;

    return new Response(JSON.stringify({ Success: true, Message: 'OK', SessionId: 'session-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await loginToTrustId(
      { username: 'api-user', password: 'secret' },
      {
        baseUrl: 'https://sandbox.trustid.co.uk',
        apiKey: 'api-key',
        deviceId: 'device-123',
      },
    );

    assert.equal(capturedUrl, 'https://sandbox.trustid.co.uk/VPE/session/login/');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('Tid-Api-Key'), 'api-key');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      DeviceId: 'device-123',
      Username: 'api-user',
      Password: 'secret',
    });
    assert.deepEqual(result, session);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildTrustIdGuestLinkPayload sends Basic DBS guest-link payload fields', () => {
  assert.deepEqual(
    buildTrustIdGuestLinkPayload(
      {
        email: 'driver@example.com',
        name: 'Driver Name',
        branchId: 'branch-123',
        clientApplicationReference: 'dbs-item-123',
        containerEventCallbackUrl: 'https://example.com/api/trustid-callback/dbs-item-123',
      },
      session,
    ),
    {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      Email: 'driver@example.com',
      Name: 'Driver Name',
      BranchId: 'branch-123',
      ApplicationFlexibleFieldValues: undefined,
      SendEmail: true,
      EmailSubjectOverride: undefined,
      EmailContentOverride: undefined,
      ContainerEventCallbackUrl: 'https://example.com/api/trustid-callback/dbs-item-123',
      ContainerEventCallbackHeaders: undefined,
      ClientApplicationReference: 'dbs-item-123',
      DigitalIdentificationScheme: undefined,
    },
  );
});

test('createTrustIdGuestLink posts guest-link payload with an existing session', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        Success: true,
        Message: 'Operation executed successfully.',
        GuestId: 'guest-123',
        ContainerId: 'container-123',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const result = await createTrustIdGuestLink(
      {
        email: 'driver@example.com',
        name: 'Driver Name',
        branchId: 'branch-123',
        clientApplicationReference: 'dbs-item-123',
        sendEmail: true,
      },
      {
        baseUrl: 'https://sandbox.trustid.co.uk',
        apiKey: 'api-key',
        deviceId: 'device-123',
        session,
      },
    );

    assert.equal(capturedUrl, 'https://sandbox.trustid.co.uk/VPE/guestLink/createGuestLink/');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('Tid-Api-Key'), 'api-key');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      Email: 'driver@example.com',
      Name: 'Driver Name',
      BranchId: 'branch-123',
      SendEmail: true,
      ClientApplicationReference: 'dbs-item-123',
    });
    assert.equal(result.ContainerId, 'container-123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retrieveTrustIdDocumentContainer builds authenticated container request', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ Success: true, Container: { Id: 'container-123' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await retrieveTrustIdDocumentContainer(
      { containerId: 'container-123' },
      { apiKey: 'api-key', deviceId: 'device-123', session },
    );

    assert.equal(capturedUrl, 'https://cloud.trustid.co.uk/VPE/dataAccess/retrieveDocumentContainer/');
    assert.deepEqual(capturedBody, {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      ContainerId: 'container-123',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retrieveTrustIdDbsForm builds authenticated DBS form request', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ Success: true, DBSForm: { ContainerId: 'container-123' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await retrieveTrustIdDbsForm(
      { containerId: 'container-123' },
      { apiKey: 'api-key', deviceId: 'device-123', session },
    );

    assert.equal(capturedUrl, 'https://cloud.trustid.co.uk/VPE/dataAccess/retrieveDBSForm/');
    assert.deepEqual(capturedBody, {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      ContainerId: 'container-123',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updateTrustIdDbsForm sends DBSForm payload', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({ Success: true, Message: 'Updated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await updateTrustIdDbsForm(
      { dbsForm: { ContainerId: 'container-123', Applicant: 'Driver Name' } },
      { apiKey: 'api-key', deviceId: 'device-123', session },
    );

    assert.equal(capturedUrl, 'https://cloud.trustid.co.uk/VPE/dataAccess/updateDBSForm/');
    assert.deepEqual(capturedBody, {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      DBSForm: {
        ContainerId: 'container-123',
        Applicant: 'Driver Name',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildTrustIdInitiateBasicDbsCheckPayload sends required Basic DBS confirmations', () => {
  assert.deepEqual(
    buildTrustIdInitiateBasicDbsCheckPayload(
      {
        containerId: 'container-123',
        employerName: 'Car Movers',
        candidateOriginalDocumentsChecked: true,
        candidateAddressChecked: true,
        candidateDateOfBirthChecked: true,
        evidenceCheckedBy: 'Ops User',
        evidenceCheckedDate: '/Date(752457600000)/',
        selfDeclarationCheck: true,
        applicationConsent: true,
        purposeOfCheck: 'Employment',
        employmentSector: 'DRIVERS',
      },
      session,
    ),
    {
      DeviceId: 'device-123',
      SessionId: 'session-123',
      ContainerId: 'container-123',
      EmployerName: 'Car Movers',
      CandidateOriginalDocumentsChecked: true,
      CandidateAddressChecked: true,
      CandidateDateOfBirthChecked: true,
      EvidenceCheckedBy: 'Ops User',
      EvidenceCheckedDate: '/Date(752457600000)/',
      SelfDeclarationCheck: true,
      ApplicationConsent: true,
      PurposeOfCheck: 'Employment',
      EmploymentSector: 'DRIVERS',
      Other: undefined,
    },
  );
});

test('initiateTrustIdBasicDbsCheck posts Basic DBS initiation payload', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input instanceof Request ? input.url : input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        Success: true,
        Message: 'Operation executed successfully.',
        DbsCheckResult: {
          DBSReference: 'dbs-ref-123',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const result = await initiateTrustIdBasicDbsCheck(
      {
        containerId: 'container-123',
        employerName: 'Car Movers',
        candidateOriginalDocumentsChecked: true,
        candidateAddressChecked: true,
        candidateDateOfBirthChecked: true,
        evidenceCheckedBy: 'Ops User',
        evidenceCheckedDate: '/Date(752457600000)/',
        selfDeclarationCheck: true,
        applicationConsent: true,
        purposeOfCheck: 'Employment',
        employmentSector: 'DRIVERS',
      },
      { apiKey: 'api-key', deviceId: 'device-123', session },
    );

    assert.equal(capturedUrl, 'https://cloud.trustid.co.uk/VPE/dataAccess/initiateBasicDbsCheck/');
    assert.equal(capturedBody?.ContainerId, 'container-123');
    assert.equal(capturedBody?.ApplicationConsent, true);
    assert.equal(result.DbsCheckResult?.DBSReference, 'dbs-ref-123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TrustID adapter surfaces http and API failures', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response('Bad gateway', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });

  try {
    await assert.rejects(
      () =>
        retrieveTrustIdDocumentContainer(
          { containerId: 'container-123' },
          { apiKey: 'api-key', deviceId: 'device-123', session },
        ),
      (error: unknown) =>
        error instanceof TrustIdApiError &&
        error.status === 502 &&
        error.message === 'TrustID request failed with 502: Bad gateway',
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ Success: false, Message: 'Container not found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      () =>
        retrieveTrustIdDocumentContainer(
          { containerId: 'container-123' },
          { apiKey: 'api-key', deviceId: 'device-123', session },
        ),
      (error: unknown) => error instanceof TrustIdApiError && error.message === 'Container not found',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
