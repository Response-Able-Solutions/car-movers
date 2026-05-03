const trustidDefaultBaseUrl = 'https://cloud.trustid.co.uk';

export type TrustidConfig = {
  baseUrl?: string;
  apiKey: string;
  username: string;
  password: string;
  deviceId: string;
};

export type CreateGuestLinkRequest = {
  email: string;
  name: string;
  branchId?: string;
  clientApplicationReference?: string;
  containerEventCallbackUrl?: string;
  sendEmail?: boolean;
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

export type ContainerResponse = {
  Success: boolean;
  Message?: string;
  Container?: unknown;
};

export type DbsFormResponse = {
  Success: boolean;
  Message?: string;
  DBSForm?: unknown;
};

export type InitiateBasicDbsCheckRequest = {
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

export type BasicDbsResponse = {
  Success: boolean;
  Message?: string;
  DbsCheckResult?: {
    DBSReference?: string;
    ErrorMessage?: string;
  };
};

export interface TrustidClient {
  createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse>;
  retrieveDocumentContainer(request: { containerId: string }): Promise<ContainerResponse>;
  retrieveDbsForm(request: { containerId: string }): Promise<DbsFormResponse>;
  initiateBasicDbsCheck(request: InitiateBasicDbsCheckRequest): Promise<BasicDbsResponse>;
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

type TrustidSession = { deviceId: string; sessionId: string };

type TrustidEnvelope = {
  Success: boolean;
  Message?: string;
};

export class TrustidApiClient implements TrustidClient {
  private config: TrustidConfig;
  private session: TrustidSession | null = null;

  constructor(config: TrustidConfig) {
    this.config = config;
  }

  async createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse> {
    const session = await this.getSession();
    return this.postJson<CreateGuestLinkResponse>('/guestLink/createGuestLink/', {
      DeviceId: session.deviceId,
      SessionId: session.sessionId,
      Email: request.email,
      Name: request.name,
      BranchId: request.branchId,
      ClientApplicationReference: request.clientApplicationReference,
      ContainerEventCallbackUrl: request.containerEventCallbackUrl,
      SendEmail: request.sendEmail ?? true,
      DigitalIdentificationScheme: request.digitalIdentificationScheme,
    });
  }

  async retrieveDocumentContainer(request: { containerId: string }): Promise<ContainerResponse> {
    const session = await this.getSession();
    return this.postJson<ContainerResponse>('/dataAccess/retrieveDocumentContainer/', {
      DeviceId: session.deviceId,
      SessionId: session.sessionId,
      ContainerId: request.containerId,
    });
  }

  async retrieveDbsForm(request: { containerId: string }): Promise<DbsFormResponse> {
    const session = await this.getSession();
    return this.postJson<DbsFormResponse>('/dataAccess/retrieveDBSForm/', {
      DeviceId: session.deviceId,
      SessionId: session.sessionId,
      ContainerId: request.containerId,
    });
  }

  async initiateBasicDbsCheck(request: InitiateBasicDbsCheckRequest): Promise<BasicDbsResponse> {
    const session = await this.getSession();
    return this.postJson<BasicDbsResponse>('/dataAccess/initiateBasicDbsCheck/', {
      DeviceId: session.deviceId,
      SessionId: session.sessionId,
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

  private async getSession(): Promise<TrustidSession> {
    if (this.session) return this.session;

    const response = await this.postJson<TrustidEnvelope & { SessionId?: string }>(
      '/session/login/',
      {
        DeviceId: this.config.deviceId,
        Username: this.config.username,
        Password: this.config.password,
      },
    );
    if (!response.SessionId) {
      throw new TrustidApiError(response.Message ?? 'TrustID login response missing SessionId');
    }
    this.session = { deviceId: this.config.deviceId, sessionId: response.SessionId };
    return this.session;
  }

  private async postJson<T extends TrustidEnvelope>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(
      `/VPE/${path.replace(/^\/+/, '')}`,
      this.config.baseUrl ?? trustidDefaultBaseUrl,
    ).toString();

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

export function loadTrustidConfigFromEnv(): TrustidConfig {
  return {
    baseUrl: process.env.TRUSTID_BASE_URL?.trim(),
    apiKey: readEnv('TRUSTID_API_KEY'),
    username: readEnv('TRUSTID_USERNAME'),
    password: readEnv('TRUSTID_PASSWORD'),
    deviceId: readEnv('TRUSTID_DEVICE_ID'),
  };
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
