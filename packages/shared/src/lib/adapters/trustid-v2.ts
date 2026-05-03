export type TrustidV2Config = {
  baseUrl: string;
  apiKey: string;
  username: string;
  password: string;
  deviceId: string;
  branchId: string;
};

export type CreateGuestLinkRequest = {
  email: string;
  name: string;
  clientApplicationReference: string;
  containerEventCallbackUrl: string;
  digitalIdentificationScheme?: number;
};

export type CreateGuestLinkResponse = {
  Success: boolean;
  Message?: string;
  LinkUrl?: string;
  ContainerId?: string;
  GuestId?: string;
  EmailSubject?: string;
  EmailContent?: string;
};

export type RetrieveDocumentContainerResponse = {
  Success: boolean;
  Message?: string;
  Container?: unknown;
};

export type RetrieveDbsFormResponse = {
  Success: boolean;
  Message?: string;
  DBSForm?: unknown;
};

export type InitiateBasicDbsCheckRequest = {
  containerId: string;
  employerName: string;
  purposeOfCheck: string;
  employmentSector: string;
  applicationConsent: boolean;
  candidateOriginalDocumentsChecked?: boolean;
  candidateAddressChecked?: boolean;
  candidateDateOfBirthChecked?: boolean;
  evidenceCheckedBy?: string;
  evidenceCheckedDate?: string;
  selfDeclarationCheck?: boolean;
  other?: string;
};

export type InitiateBasicDbsCheckResponse = {
  Success: boolean;
  Message?: string;
  DbsCheckResult?: {
    DBSReference?: string;
    ErrorMessage?: string;
  };
};

export type DeleteGuestLinkResponse = {
  Success: boolean;
  Message?: string;
};

export interface TrustidClient {
  createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse>;
  retrieveDocumentContainer(request: { containerId: string }): Promise<RetrieveDocumentContainerResponse>;
  retrieveDbsForm(request: { containerId: string }): Promise<RetrieveDbsFormResponse>;
  initiateBasicDbsCheck(request: InitiateBasicDbsCheckRequest): Promise<InitiateBasicDbsCheckResponse>;
  deleteGuestLink(request: { guestId: string }): Promise<DeleteGuestLinkResponse>;
}

export class TrustidApiError extends Error {
  readonly status?: number;
  readonly responseBody?: string;

  constructor(message: string, status?: number, responseBody?: string) {
    super(message);
    this.name = 'TrustidApiError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

type TrustidEnvelope = {
  Success: boolean;
  Message?: string;
};

export class TrustidApiClient implements TrustidClient {
  private config: TrustidV2Config;
  private sessionId: string | null = null;

  constructor(config: TrustidV2Config) {
    this.config = config;
  }

  async createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse> {
    return this.callWithSessionRetry<CreateGuestLinkResponse>('/guestLink/createGuestLink/', (sessionId) => ({
      DeviceId: this.config.deviceId,
      SessionId: sessionId,
      BranchId: this.config.branchId,
      Email: request.email,
      Name: request.name,
      ClientApplicationReference: request.clientApplicationReference,
      ContainerEventCallbackURL: request.containerEventCallbackUrl,
      DigitalIdentificationScheme: request.digitalIdentificationScheme,
    }));
  }

  async retrieveDocumentContainer(request: { containerId: string }): Promise<RetrieveDocumentContainerResponse> {
    return this.callWithSessionRetry<RetrieveDocumentContainerResponse>('/dataAccess/retrieveDocumentContainer/', (sessionId) => ({
      DeviceId: this.config.deviceId,
      SessionId: sessionId,
      ContainerId: request.containerId,
    }));
  }

  async retrieveDbsForm(request: { containerId: string }): Promise<RetrieveDbsFormResponse> {
    return this.callWithSessionRetry<RetrieveDbsFormResponse>('/dataAccess/retrieveDBSForm/', (sessionId) => ({
      DeviceId: this.config.deviceId,
      SessionId: sessionId,
      ContainerId: request.containerId,
    }));
  }

  async initiateBasicDbsCheck(request: InitiateBasicDbsCheckRequest): Promise<InitiateBasicDbsCheckResponse> {
    return this.callWithSessionRetry<InitiateBasicDbsCheckResponse>('/dataAccess/initiateBasicDbsCheck/', (sessionId) => ({
      DeviceId: this.config.deviceId,
      SessionId: sessionId,
      ContainerId: request.containerId,
      EmployerName: request.employerName,
      PurposeOfCheck: request.purposeOfCheck,
      EmploymentSector: request.employmentSector,
      ApplicationConsent: request.applicationConsent,
      CandidateOriginalDocumentsChecked: request.candidateOriginalDocumentsChecked,
      CandidateAddressChecked: request.candidateAddressChecked,
      CandidateDateOfBirthChecked: request.candidateDateOfBirthChecked,
      EvidenceCheckedBy: request.evidenceCheckedBy,
      EvidenceCheckedDate: request.evidenceCheckedDate,
      SelfDeclarationCheck: request.selfDeclarationCheck,
      Other: request.other,
    }));
  }

  async deleteGuestLink(request: { guestId: string }): Promise<DeleteGuestLinkResponse> {
    return this.callWithSessionRetry<DeleteGuestLinkResponse>('/guestLink/deleteGuestLink/', (sessionId) => ({
      DeviceId: this.config.deviceId,
      SessionId: sessionId,
      GuestId: request.guestId,
    }));
  }

  private async callWithSessionRetry<T extends TrustidEnvelope>(
    path: string,
    buildBody: (sessionId: string) => Record<string, unknown>,
  ): Promise<T> {
    const sessionId = await this.getSession();
    try {
      return await this.postJson<T>(path, buildBody(sessionId));
    } catch (error) {
      if (error instanceof TrustidApiError && error.status === 401) {
        this.sessionId = null;
        const freshSessionId = await this.getSession();
        return this.postJson<T>(path, buildBody(freshSessionId));
      }
      throw error;
    }
  }

  private async getSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;

    const response = await this.postJson<TrustidEnvelope & { SessionId?: string }>('/session/login/', {
      DeviceId: this.config.deviceId,
      Username: this.config.username,
      Password: this.config.password,
    });
    if (!response.SessionId) {
      throw new TrustidApiError(response.Message ?? 'TrustID login response missing SessionId');
    }
    this.sessionId = response.SessionId;
    return this.sessionId;
  }

  private async postJson<T extends TrustidEnvelope>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`/VPE/${path.replace(/^\/+/, '')}`, this.config.baseUrl).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tid-Api-Key': this.config.apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new TrustidApiError(
        `TrustID request failed with ${response.status}: ${text}`,
        response.status,
        text,
      );
    }

    const payload = JSON.parse(text) as T;

    if (payload.Success === false) {
      throw new TrustidApiError(payload.Message ?? 'TrustID request failed', response.status, text);
    }

    return payload;
  }
}

export function loadTrustidV2ConfigFromEnv(): TrustidV2Config {
  return {
    baseUrl: readEnv('TRUSTID_BASE_URL'),
    apiKey: readEnv('TRUSTID_API_KEY'),
    username: readEnv('TRUSTID_USERNAME'),
    password: readEnv('TRUSTID_PASSWORD'),
    deviceId: readEnv('TRUSTID_DEVICE_ID'),
    branchId: readEnv('TRUSTID_BRANCH_ID'),
  };
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
