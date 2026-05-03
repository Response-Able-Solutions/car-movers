import type {
  ContainerResponse,
  TrustidClient,
} from '../adapters/trustid.ts';
import type {
  MondayTrustidClient,
  MondayTrustidDbsItem,
  MondayTrustidIdCheckItem,
} from '../adapters/monday.ts';

// Monday status labels — file-private string constants. Workflow methods set
// these on Monday items; tests and callers don't need to import them because
// the result-type discriminants (`outcome`) carry the meaning.
const statusIdInviteSent = 'TrustID ID Invite Sent';
const statusIdInviteError = 'TrustID ID Invite Error';
const statusIdInviteBlocked = 'TrustID ID Invite Active';
const statusIdCheckPassed = 'TrustID ID Check Passed';
const statusIdCheckFailed = 'TrustID ID Check Failed';
const statusIdCheckReview = 'TrustID ID Check Review';
const statusIdCheckError = 'TrustID ID Check Error';

const idInviteActiveDays = 14;
const idFinalFailedStatuses: readonly string[] = [
  statusIdCheckFailed,
  'TrustID Result Failed',
  statusIdInviteError,
  statusIdCheckError,
];
const idTerminalResultStatuses: readonly string[] = [
  statusIdCheckPassed,
  statusIdCheckFailed,
  statusIdCheckReview,
  statusIdCheckError,
];

const statusDbsInviteSent = 'TrustID Invite Sent';
const statusDbsInviteError = 'TrustID Invite Error';
const statusDbsInviteBlocked = 'TrustID Invite Active';
const statusDbsResultReceived = 'TrustID Result Received';
const statusDbsSubmitted = 'TrustID DBS Submitted';
const statusDbsError = 'TrustID DBS Error';

const dbsInviteActiveDays = 14;
const dbsFinalFailedStatuses: readonly string[] = [
  'TrustID Result Failed',
  'TrustID DBS Failed',
  statusDbsInviteError,
];

const msPerDay = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export class TrustidValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustidValidationError';
  }
}

export type IdCheckOutcome = 'passed' | 'failed' | 'review' | 'error';

export type CreateIdInviteRequest = {
  mondayItemId: string;
};

export type CreateIdInviteResult =
  | {
      outcome: 'created';
      mondayItemId: string;
      applicantEmail: string;
      trustIdContainerId: string | null;
      trustIdGuestId: string | null;
      inviteCreatedAt: string;
    }
  | {
      outcome: 'blocked';
      mondayItemId: string;
      reason: string;
    };

export type ProcessIdCallbackRequest = {
  mondayItemId: string;
  containerId?: string | null;
};

export type ProcessIdCallbackResult =
  | {
      outcome: 'processed';
      mondayItemId: string;
      trustIdContainerId: string;
      idStatus: IdCheckOutcome;
      resultSummary: string;
    }
  | {
      outcome: 'already-processed';
      mondayItemId: string;
      trustIdContainerId: string;
      idStatus: IdCheckOutcome;
      resultSummary: string | null;
    };

export type CreateDbsInviteRequest = {
  mondayItemId: string;
  callbackBaseUrl: string;
};

export type CreateDbsInviteResult =
  | {
      outcome: 'created';
      mondayItemId: string;
      applicantEmail: string;
      trustIdContainerId: string | null;
      trustIdGuestId: string | null;
      inviteCreatedAt: string;
    }
  | {
      outcome: 'blocked';
      mondayItemId: string;
      reason: string;
    };

export type ProcessDbsCallbackRequest = {
  mondayItemId: string;
  containerId?: string | null;
};

export type ProcessDbsCallbackResult =
  | {
      outcome: 'submitted';
      mondayItemId: string;
      trustIdContainerId: string;
      dbsReference: string | null;
    }
  | {
      outcome: 'already-submitted';
      mondayItemId: string;
      trustIdContainerId: string;
      dbsReference: string;
    }
  | {
      outcome: 'already-processing';
      mondayItemId: string;
      trustIdContainerId: string;
    };

export type IdInviteConfig = {
  branchId?: string;
  digitalIdentificationScheme?: number;
};

export type DbsInviteConfig = {
  branchId: string;
  digitalIdentificationScheme?: number;
};

export type BasicDbsCheckConfig = {
  employerName?: string;
  evidenceCheckedBy: string;
  employmentSector: string;
  purposeOfCheck?: 'Personal Interest' | 'Employment' | 'Other';
  other?: string;
};

export type TrustidDeps = {
  trustidClient: TrustidClient;
  mondayClient: MondayTrustidClient;
  idInvite?: IdInviteConfig;
  dbsInvite?: DbsInviteConfig;
  basicCheck?: BasicDbsCheckConfig;
  now?: () => Date;
};

// ---------------------------------------------------------------------------
// Workflow service class
// ---------------------------------------------------------------------------

export class Trustid {
  private deps: TrustidDeps;
  private now: () => Date;

  constructor(deps: TrustidDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // ID workflow
  // -------------------------------------------------------------------------

  public async createIdInvite(request: CreateIdInviteRequest): Promise<CreateIdInviteResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const idInvite = this.requireIdInviteConfig();
    const item = await this.deps.mondayClient.fetchIdCheckItem(mondayItemId);
    const blockReason = this.idDuplicateBlockReason(item);

    if (blockReason) {
      await this.deps.mondayClient.updateIdCheckItem(item.itemId, {
        status: statusIdInviteBlocked,
        errorDetails: blockReason,
        processingTimestamp: this.now().toISOString(),
      });
      return { outcome: 'blocked', mondayItemId: item.itemId, reason: blockReason };
    }

    try {
      const inviteCreatedAt = this.now().toISOString();
      const linkResponse = await this.deps.trustidClient.createGuestLink({
        email: item.applicantEmail,
        name: item.applicantName,
        branchId: idInvite.branchId,
        clientApplicationReference: item.itemId,
        sendEmail: true,
        digitalIdentificationScheme: idInvite.digitalIdentificationScheme,
      });
      const trustIdContainerId = linkResponse.ContainerId?.trim() || null;
      const trustIdGuestId = linkResponse.GuestId?.trim() || null;

      await this.deps.mondayClient.updateIdCheckItem(item.itemId, {
        status: statusIdInviteSent,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
        resultSummary: null,
        errorDetails: null,
        processingTimestamp: inviteCreatedAt,
      });

      return {
        outcome: 'created',
        mondayItemId: item.itemId,
        applicantEmail: item.applicantEmail,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID ID invite creation failed';
      await this.deps.mondayClient.updateIdCheckItem(item.itemId, {
        status: statusIdInviteError,
        errorDetails: message,
        processingTimestamp: this.now().toISOString(),
      });
      throw error;
    }
  }

  public async processIdCallback(
    request: ProcessIdCallbackRequest,
  ): Promise<ProcessIdCallbackResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.deps.mondayClient.fetchIdCheckItem(mondayItemId);
    const containerId =
      request.containerId?.trim() ||
      item.trustIdContainerId?.trim() ||
      item.trustIdGuestId?.trim() ||
      null;

    try {
      if (!containerId) {
        throw new TrustidValidationError('Missing TrustID container ID');
      }

      if (item.status && idTerminalResultStatuses.includes(item.status)) {
        return {
          outcome: 'already-processed',
          mondayItemId: item.itemId,
          trustIdContainerId: containerId,
          idStatus: this.idCheckOutcomeFromMondayStatus(item.status),
          resultSummary: item.resultSummary,
        };
      }

      const containerResponse = await this.deps.trustidClient.retrieveDocumentContainer({
        containerId,
      });
      const { idStatus, resultSummary } = this.idStatusFromContainer(containerResponse);
      const status = this.idMondayStatusFor(idStatus);

      await this.deps.mondayClient.updateIdCheckItem(item.itemId, {
        status,
        trustIdContainerId: containerId,
        resultSummary,
        errorDetails: null,
        processingTimestamp: this.now().toISOString(),
      });

      return {
        outcome: 'processed',
        mondayItemId: item.itemId,
        trustIdContainerId: containerId,
        idStatus,
        resultSummary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID ID callback processing failed';
      await this.deps.mondayClient.updateIdCheckItem(item.itemId, {
        status: statusIdCheckError,
        errorDetails: message,
        processingTimestamp: this.now().toISOString(),
      });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // DBS workflow
  // -------------------------------------------------------------------------

  public async createDbsInvite(request: CreateDbsInviteRequest): Promise<CreateDbsInviteResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');
    const callbackBaseUrl = request.callbackBaseUrl?.trim();
    if (!callbackBaseUrl) throw new TrustidValidationError('Missing callbackBaseUrl');

    const dbsInvite = this.requireDbsInviteConfig();
    const item = await this.deps.mondayClient.fetchDbsItem(mondayItemId);
    const blockReason = this.dbsDuplicateBlockReason(item);

    if (blockReason) {
      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsInviteBlocked,
        errorDetails: blockReason,
        processingTimestamp: this.now().toISOString(),
      });
      return { outcome: 'blocked', mondayItemId: item.itemId, reason: blockReason };
    }

    try {
      const inviteCreatedAt = this.now().toISOString();
      const linkResponse = await this.deps.trustidClient.createGuestLink({
        email: item.applicantEmail,
        name: item.applicantName,
        branchId: dbsInvite.branchId,
        clientApplicationReference: item.itemId,
        containerEventCallbackUrl: this.buildDbsCallbackUrl(callbackBaseUrl, item.itemId),
        digitalIdentificationScheme: dbsInvite.digitalIdentificationScheme ?? 32,
        sendEmail: true,
      });
      const trustIdContainerId = linkResponse.ContainerId?.trim() || null;
      const trustIdGuestId = linkResponse.GuestId?.trim() || null;

      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsInviteSent,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
        errorDetails: null,
        processingTimestamp: inviteCreatedAt,
      });

      return {
        outcome: 'created',
        mondayItemId: item.itemId,
        applicantEmail: item.applicantEmail,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID DBS invite creation failed';
      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsInviteError,
        errorDetails: message,
        processingTimestamp: this.now().toISOString(),
      });
      throw error;
    }
  }

  public async processDbsCallback(
    request: ProcessDbsCallbackRequest,
  ): Promise<ProcessDbsCallbackResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.deps.mondayClient.fetchDbsItem(mondayItemId);
    const containerId =
      request.containerId?.trim() ||
      item.trustIdContainerId?.trim() ||
      item.trustIdGuestId?.trim() ||
      null;

    try {
      if (!containerId) {
        throw new TrustidValidationError('Missing TrustID container ID');
      }

      if (item.status === statusDbsSubmitted && item.dbsReference) {
        return {
          outcome: 'already-submitted',
          mondayItemId: item.itemId,
          trustIdContainerId: containerId,
          dbsReference: item.dbsReference,
        };
      }

      if (item.status === statusDbsResultReceived) {
        return {
          outcome: 'already-processing',
          mondayItemId: item.itemId,
          trustIdContainerId: containerId,
        };
      }

      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsResultReceived,
        trustIdContainerId: containerId,
        errorDetails: null,
        processingTimestamp: this.now().toISOString(),
      });

      // TrustID server-side state machine expects these to be retrieved before
      // the basic DBS check is initiated. Responses aren't used here.
      await this.deps.trustidClient.retrieveDocumentContainer({ containerId });
      await this.deps.trustidClient.retrieveDbsForm({ containerId });

      const dbsResponse = await this.deps.trustidClient.initiateBasicDbsCheck(
        this.buildDbsCheckParams(containerId),
      );
      const dbsReference = dbsResponse.DbsCheckResult?.DBSReference?.trim() || null;
      const dbsError = dbsResponse.DbsCheckResult?.ErrorMessage?.trim() || null;

      if (dbsError) throw new Error(dbsError);

      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsSubmitted,
        trustIdContainerId: containerId,
        dbsReference,
        errorDetails: null,
        processingTimestamp: this.now().toISOString(),
      });

      return {
        outcome: 'submitted',
        mondayItemId: item.itemId,
        trustIdContainerId: containerId,
        dbsReference,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID DBS callback processing failed';
      await this.deps.mondayClient.updateDbsItem(item.itemId, {
        status: statusDbsError,
        errorDetails: message,
        processingTimestamp: this.now().toISOString(),
      });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers — kept on the class so they have access to `this.now()`
  // -------------------------------------------------------------------------

  private requireIdInviteConfig(): IdInviteConfig {
    if (!this.deps.idInvite) {
      throw new Error('Trustid: idInvite config not provided');
    }
    return this.deps.idInvite;
  }

  private requireDbsInviteConfig(): DbsInviteConfig {
    if (!this.deps.dbsInvite) {
      throw new Error('Trustid: dbsInvite config not provided');
    }
    return this.deps.dbsInvite;
  }

  private requireBasicCheckConfig(): BasicDbsCheckConfig {
    if (!this.deps.basicCheck) {
      throw new Error('Trustid: basicCheck config not provided');
    }
    return this.deps.basicCheck;
  }

  private idDuplicateBlockReason(item: MondayTrustidIdCheckItem): string | null {
    if (!item.trustIdContainerId && !item.trustIdGuestId) return null;
    if (item.status && idFinalFailedStatuses.includes(item.status)) return null;

    const inviteCreatedAt = this.parseDate(item.inviteCreatedAt);
    if (!inviteCreatedAt) {
      return 'TrustID invite already exists but invite creation time is missing or invalid';
    }

    const ageDays = (this.now().getTime() - inviteCreatedAt.getTime()) / msPerDay;
    if (ageDays < idInviteActiveDays) {
      const expires = new Date(inviteCreatedAt.getTime() + idInviteActiveDays * msPerDay);
      return `TrustID invite is still active until ${expires.toISOString()}`;
    }

    return null;
  }

  private dbsDuplicateBlockReason(item: MondayTrustidDbsItem): string | null {
    if (!item.trustIdContainerId && !item.trustIdGuestId) return null;
    if (item.status && dbsFinalFailedStatuses.includes(item.status)) return null;

    const inviteCreatedAt = this.parseDate(item.inviteCreatedAt);
    if (!inviteCreatedAt) {
      return 'TrustID invite already exists but invite creation time is missing or invalid';
    }

    const ageDays = (this.now().getTime() - inviteCreatedAt.getTime()) / msPerDay;
    if (ageDays < dbsInviteActiveDays) {
      const expires = new Date(inviteCreatedAt.getTime() + dbsInviteActiveDays * msPerDay);
      return `TrustID invite is still active until ${expires.toISOString()}`;
    }

    return null;
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : new Date(ts);
  }

  private idStatusFromContainer(
    response: ContainerResponse,
  ): { idStatus: IdCheckOutcome; resultSummary: string } {
    if (!response.Success) {
      return {
        idStatus: 'error',
        resultSummary:
          response.Message?.trim() || 'TrustID document container retrieval failed',
      };
    }
    if (!response.Container) {
      return {
        idStatus: 'error',
        resultSummary: 'TrustID document container response missing Container',
      };
    }

    const resultText = collectResultText(response.Container);
    const combined = resultText.join(' | ').toLowerCase();

    if (!combined) {
      return {
        idStatus: 'review',
        resultSummary: 'TrustID document container did not include a recognized ID result',
      };
    }

    const hasError = /\b(error|exception|unavailable|incomplete)\b/.test(combined);
    const hasFail = /\b(fail(?:ed)?|reject(?:ed)?|declin(?:e|ed)|unsuccessful|fraud|invalid|mismatch)\b/.test(combined);
    const hasReview = /\b(review|refer(?:red)?|manual|pending|warning|attention|inconclusive|unknown|unable)\b/.test(combined);
    const hasPass = /\b(pass(?:ed)?|accept(?:ed)?|valid|verified|clear|success(?:ful)?)\b/.test(combined);
    const resultSummary = resultText.slice(0, 8).join('; ');

    if (hasError && !hasFail && !hasReview && !hasPass) return { idStatus: 'error', resultSummary };
    if (hasFail && !hasPass) return { idStatus: 'failed', resultSummary };
    if (hasPass && !hasFail && !hasReview && !hasError) return { idStatus: 'passed', resultSummary };
    return { idStatus: 'review', resultSummary };
  }

  private idMondayStatusFor(idStatus: IdCheckOutcome): string {
    switch (idStatus) {
      case 'passed':
        return statusIdCheckPassed;
      case 'failed':
        return statusIdCheckFailed;
      case 'error':
        return statusIdCheckError;
      case 'review':
        return statusIdCheckReview;
      default:
        throw new Error(`unknown ID check outcome "${idStatus as string}"`);
    }
  }

  private idCheckOutcomeFromMondayStatus(status: string): IdCheckOutcome {
    switch (status) {
      case statusIdCheckPassed:
        return 'passed';
      case statusIdCheckFailed:
        return 'failed';
      case statusIdCheckError:
        return 'error';
      case statusIdCheckReview:
        return 'review';
      default:
        return 'review';
    }
  }

  private buildDbsCheckParams(containerId: string) {
    const basicCheck = this.requireBasicCheckConfig();
    return {
      containerId,
      employerName: basicCheck.employerName,
      candidateOriginalDocumentsChecked: true,
      candidateAddressChecked: true,
      candidateDateOfBirthChecked: true,
      evidenceCheckedBy: basicCheck.evidenceCheckedBy,
      evidenceCheckedDate: `/Date(${this.now().getTime()})/`,
      selfDeclarationCheck: true,
      applicationConsent: true,
      purposeOfCheck: basicCheck.purposeOfCheck ?? 'Employment',
      employmentSector: basicCheck.employmentSector,
      other: basicCheck.other,
    };
  }

  private buildDbsCallbackUrl(baseUrl: string, mondayItemId: string): string {
    const url = new URL('/api/trustid-dbs-callback', baseUrl);
    url.searchParams.set('mondayItemId', mondayItemId);
    return url.toString();
  }
}

// ---------------------------------------------------------------------------
// File-private helpers
// ---------------------------------------------------------------------------

function collectResultText(value: unknown, path = '', results: string[] = []): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = `${path}=${String(value)}`;
    if (
      /result|status|decision|outcome|pass|fail|refer|review|accept|reject|valid|verified|error|warning|match/i.test(
        text,
      )
    ) {
      results.push(text);
    }
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectResultText(entry, `${path}[${index}]`, results));
    return results;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectResultText(entry, path ? `${path}.${key}` : key, results);
    }
  }

  return results;
}
