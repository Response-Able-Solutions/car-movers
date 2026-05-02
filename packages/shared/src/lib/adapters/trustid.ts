const trustIdDefaultBaseUrl = 'https://cloud.trustid.co.uk';

export type TrustIdConfig = {
  baseUrl?: string;
  apiKey: string;
  username?: string;
  password?: string;
  deviceId: string;
};

export type TrustIdSession = {
  deviceId: string;
  sessionId: string;
};

export type TrustIdAuthenticatedConfig = TrustIdConfig & {
  session?: TrustIdSession;
};

export type TrustIdLoginRequest = {
  username: string;
  password: string;
  requireAdmin?: boolean;
};

export type TrustIdLoginResponse = TrustIdResponse & {
  SessionId: string;
};

export type TrustIdResponse = {
  Success: boolean;
  Message?: string;
};

export type TrustIdFlexibleFieldValue = {
  FlexibleFieldVersionId: string;
  FieldValueString?: string;
  FieldValueInt?: number;
  FieldValueDate?: string;
  FieldValueDecimal?: number;
};

export type TrustIdCallbackHeader = {
  Header: 'Authorization';
  Value: string;
};

export type TrustIdCreateGuestLinkRequest = {
  email: string;
  name: string;
  branchId?: string;
  clientApplicationReference?: string;
  containerEventCallbackUrl?: string;
  containerEventCallbackHeaders?: TrustIdCallbackHeader[];
  applicationFlexibleFieldValues?: TrustIdFlexibleFieldValue[];
  sendEmail?: boolean;
  emailSubjectOverride?: string | null;
  emailContentOverride?: string | null;
  digitalIdentificationScheme?: number;
};

export type TrustIdCreateGuestLinkResponse = TrustIdResponse & {
  LinkUrl?: string;
  ContainerId?: string;
  GuestId?: string;
  EmailSubject?: string;
  EmailContent?: string;
};

export type TrustIdContainerRequest = {
  containerId: string;
};

export type TrustIdDocumentContainerResponse = TrustIdResponse & {
  Container?: unknown;
};

export type TrustIdDbsFormResponse = TrustIdResponse & {
  DBSForm?: unknown;
};

export type TrustIdUpdateDbsFormRequest = {
  dbsForm: unknown;
};

export type TrustIdInitiateBasicDbsCheckRequest = {
  containerId: string;
  employerName?: string;
  candidateOriginalDocumentsChecked: boolean;
  candidateAddressChecked: boolean;
  candidateDateOfBirthChecked: boolean;
  evidenceCheckedBy: string;
  evidenceCheckedDate: string;
  selfDeclarationCheck: boolean;
  applicationConsent: boolean;
  purposeOfCheck: 'Personal Interest' | 'Employment' | 'Other';
  employmentSector?: string;
  other?: string;
};

export type TrustIdBasicDbsResponse = TrustIdResponse & {
  DbsCheckResult?: {
    DBSReference?: string;
    ErrorMessage?: string;
  };
};

type TrustIdRawLoginResponse = TrustIdResponse & {
  SessionId?: string;
};

export class TrustIdApiError extends Error {
  status?: number;
  responseBody?: string;

  constructor(
    message: string,
    status?: number,
    responseBody?: string,
  ) {
    super(message);
    this.name = 'TrustIdApiError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

export function buildTrustIdUrl(baseUrl: string | undefined, path: string) {
  return new URL(`/VPE/${path.replace(/^\/+/, '')}`, baseUrl ?? trustIdDefaultBaseUrl).toString();
}

export function buildTrustIdRequestBody<T extends Record<string, unknown>>(session: TrustIdSession, payload: T) {
  return {
    DeviceId: session.deviceId,
    SessionId: session.sessionId,
    ...payload,
  };
}

export function buildTrustIdGuestLinkPayload(
  request: TrustIdCreateGuestLinkRequest,
  session: TrustIdSession,
) {
  return buildTrustIdRequestBody(session, {
    Email: request.email,
    Name: request.name,
    BranchId: request.branchId,
    ApplicationFlexibleFieldValues: request.applicationFlexibleFieldValues,
    SendEmail: request.sendEmail ?? true,
    EmailSubjectOverride: request.emailSubjectOverride,
    EmailContentOverride: request.emailContentOverride,
    ContainerEventCallbackUrl: request.containerEventCallbackUrl,
    ContainerEventCallbackHeaders: request.containerEventCallbackHeaders,
    ClientApplicationReference: request.clientApplicationReference,
    DigitalIdentificationScheme: request.digitalIdentificationScheme,
  });
}

export function buildTrustIdInitiateBasicDbsCheckPayload(
  request: TrustIdInitiateBasicDbsCheckRequest,
  session: TrustIdSession,
) {
  return buildTrustIdRequestBody(session, {
    ContainerId: request.containerId,
    EmployerName: request.employerName,
    CandidateOriginalDocumentsChecked: request.candidateOriginalDocumentsChecked,
    CandidateAddressChecked: request.candidateAddressChecked,
    CandidateDateOfBirthChecked: request.candidateDateOfBirthChecked,
    EvidenceCheckedBy: request.evidenceCheckedBy,
    EvidenceCheckedDate: request.evidenceCheckedDate,
    SelfDeclarationCheck: request.selfDeclarationCheck,
    ApplicationConsent: request.applicationConsent,
    PurposeOfCheck: request.purposeOfCheck,
    EmploymentSector: request.employmentSector,
    Other: request.other,
  });
}

async function postTrustId<TResponse>(
  path: string,
  body: Record<string, unknown>,
  config: TrustIdConfig,
): Promise<TResponse> {
  const endpoint = buildTrustIdUrl(config.baseUrl, path);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Tid-Api-Key': config.apiKey,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new TrustIdApiError(`TrustID request failed with ${response.status}: ${responseText}`, response.status, responseText);
  }

  const payload = JSON.parse(responseText) as TrustIdResponse;

  if (payload.Success === false) {
    throw new TrustIdApiError(payload.Message ?? 'TrustID request failed', response.status, responseText);
  }

  return payload as TResponse;
}

export async function loginToTrustId(
  request: TrustIdLoginRequest,
  config: TrustIdConfig,
): Promise<TrustIdSession> {
  const response = await postTrustId<TrustIdRawLoginResponse>(
    '/session/login/',
    {
      DeviceId: config.deviceId,
      Username: request.username,
      Password: request.password,
      RequireAdmin: request.requireAdmin,
    },
    config,
  );

  if (!response.SessionId) {
    throw new TrustIdApiError(response.Message ?? 'TrustID login response missing SessionId');
  }

  return {
    deviceId: config.deviceId,
    sessionId: response.SessionId,
  };
}

async function getTrustIdSession(config: TrustIdAuthenticatedConfig): Promise<TrustIdSession> {
  if (config.session) {
    return config.session;
  }

  if (!config.username || !config.password) {
    throw new TrustIdApiError('TrustID credentials or session are required');
  }

  return loginToTrustId(
    {
      username: config.username,
      password: config.password,
    },
    config,
  );
}

export async function createTrustIdGuestLink(
  request: TrustIdCreateGuestLinkRequest,
  config: TrustIdAuthenticatedConfig,
) {
  const session = await getTrustIdSession(config);
  return postTrustId<TrustIdCreateGuestLinkResponse>(
    '/guestLink/createGuestLink/',
    buildTrustIdGuestLinkPayload(request, session),
    config,
  );
}

export async function retrieveTrustIdDocumentContainer(
  request: TrustIdContainerRequest,
  config: TrustIdAuthenticatedConfig,
) {
  const session = await getTrustIdSession(config);
  return postTrustId<TrustIdDocumentContainerResponse>(
    '/dataAccess/retrieveDocumentContainer/',
    buildTrustIdRequestBody(session, { ContainerId: request.containerId }),
    config,
  );
}

export async function retrieveTrustIdDbsForm(
  request: TrustIdContainerRequest,
  config: TrustIdAuthenticatedConfig,
) {
  const session = await getTrustIdSession(config);
  return postTrustId<TrustIdDbsFormResponse>(
    '/dataAccess/retrieveDBSForm/',
    buildTrustIdRequestBody(session, { ContainerId: request.containerId }),
    config,
  );
}

export async function updateTrustIdDbsForm(
  request: TrustIdUpdateDbsFormRequest,
  config: TrustIdAuthenticatedConfig,
) {
  const session = await getTrustIdSession(config);
  return postTrustId<TrustIdResponse>(
    '/dataAccess/updateDBSForm/',
    buildTrustIdRequestBody(session, { DBSForm: request.dbsForm }),
    config,
  );
}

export async function initiateTrustIdBasicDbsCheck(
  request: TrustIdInitiateBasicDbsCheckRequest,
  config: TrustIdAuthenticatedConfig,
) {
  const session = await getTrustIdSession(config);
  return postTrustId<TrustIdBasicDbsResponse>(
    '/dataAccess/initiateBasicDbsCheck/',
    buildTrustIdInitiateBasicDbsCheckPayload(request, session),
    config,
  );
}
