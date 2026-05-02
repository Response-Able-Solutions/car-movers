import {
  fetchMondayTrustIdIdCheckItem,
  updateMondayTrustIdIdCheckItem,
  type MondayTrustIdIdCheckBoardConfig,
  type MondayTrustIdIdCheckItem,
} from '../adapters/monday.ts';
import {
  createTrustIdGuestLink,
  retrieveTrustIdDocumentContainer,
  type TrustIdAuthenticatedConfig,
  type TrustIdCreateGuestLinkRequest,
  type TrustIdCreateGuestLinkResponse,
  type TrustIdDocumentContainerResponse,
} from '../adapters/trustid.ts';

export const TRUST_ID_ID_INVITE_SENT_STATUS = 'TrustID ID Invite Sent';
export const TRUST_ID_ID_INVITE_ERROR_STATUS = 'TrustID ID Invite Error';
export const TRUST_ID_ID_INVITE_BLOCKED_STATUS = 'TrustID ID Invite Active';
export const TRUST_ID_ID_CHECK_PASSED_STATUS = 'TrustID ID Check Passed';
export const TRUST_ID_ID_CHECK_FAILED_STATUS = 'TrustID ID Check Failed';
export const TRUST_ID_ID_CHECK_REVIEW_STATUS = 'TrustID ID Check Review';
export const TRUST_ID_ID_CHECK_ERROR_STATUS = 'TrustID ID Check Error';
export const TRUST_ID_ID_INVITE_ACTIVE_DAYS = 14;
export const TRUST_ID_ID_FINAL_FAILED_STATUSES = [
  TRUST_ID_ID_CHECK_FAILED_STATUS,
  'TrustID Result Failed',
  TRUST_ID_ID_INVITE_ERROR_STATUS,
  TRUST_ID_ID_CHECK_ERROR_STATUS,
];
export const TRUST_ID_ID_TERMINAL_RESULT_STATUSES = [
  TRUST_ID_ID_CHECK_PASSED_STATUS,
  TRUST_ID_ID_CHECK_FAILED_STATUS,
  TRUST_ID_ID_CHECK_REVIEW_STATUS,
  TRUST_ID_ID_CHECK_ERROR_STATUS,
];

export type TrustIdIdInviteRequest = {
  mondayItemId: string;
};

export type TrustIdIdInviteConfig = {
  monday: MondayTrustIdIdCheckBoardConfig;
  trustId: TrustIdAuthenticatedConfig & {
    branchId?: string;
    digitalIdentificationScheme?: number;
  };
  now?: () => Date;
};

export type TrustIdIdCallbackRequest = {
  mondayItemId: string;
  containerId?: string | null;
  payload?: Record<string, unknown>;
};

export type TrustIdIdCallbackConfig = {
  monday: MondayTrustIdIdCheckBoardConfig;
  trustId: TrustIdAuthenticatedConfig;
  now?: () => Date;
};

export type TrustIdIdInviteCreatedResult = {
  outcome: 'created';
  mondayItemId: string;
  applicantEmail: string;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string;
  status: typeof TRUST_ID_ID_INVITE_SENT_STATUS;
};

export type TrustIdIdInviteBlockedResult = {
  outcome: 'blocked';
  mondayItemId: string;
  applicantEmail: string;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string | null;
  status: typeof TRUST_ID_ID_INVITE_BLOCKED_STATUS;
  reason: string;
};

export type TrustIdIdInviteResult = TrustIdIdInviteCreatedResult | TrustIdIdInviteBlockedResult;

export type TrustIdIdCheckOutcome = 'passed' | 'failed' | 'review' | 'error';

export type TrustIdIdCallbackProcessedResult = {
  outcome: 'processed';
  mondayItemId: string;
  trustIdContainerId: string;
  idStatus: TrustIdIdCheckOutcome;
  status:
    | typeof TRUST_ID_ID_CHECK_PASSED_STATUS
    | typeof TRUST_ID_ID_CHECK_FAILED_STATUS
    | typeof TRUST_ID_ID_CHECK_REVIEW_STATUS
    | typeof TRUST_ID_ID_CHECK_ERROR_STATUS;
  resultSummary: string;
};

export type TrustIdIdCallbackAlreadyProcessedResult = {
  outcome: 'already-processed';
  mondayItemId: string;
  trustIdContainerId: string;
  idStatus: TrustIdIdCheckOutcome;
  status: string;
  resultSummary: string | null;
};

export type TrustIdIdCallbackProcessingResult =
  | TrustIdIdCallbackProcessedResult
  | TrustIdIdCallbackAlreadyProcessedResult;

type TrustIdIdWorkflowDependencies = {
  fetchMondayTrustIdIdCheckItem: typeof fetchMondayTrustIdIdCheckItem;
  updateMondayTrustIdIdCheckItem: typeof updateMondayTrustIdIdCheckItem;
  createTrustIdGuestLink: typeof createTrustIdGuestLink;
  retrieveTrustIdDocumentContainer: typeof retrieveTrustIdDocumentContainer;
};

const defaultDependencies: TrustIdIdWorkflowDependencies = {
  fetchMondayTrustIdIdCheckItem,
  updateMondayTrustIdIdCheckItem,
  createTrustIdGuestLink,
  retrieveTrustIdDocumentContainer,
};

export class TrustIdIdInviteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdIdInviteValidationError';
  }
}

export class TrustIdIdCallbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdIdCallbackValidationError';
  }
}

export function validateTrustIdIdInviteRequest(request: Partial<TrustIdIdInviteRequest>) {
  const mondayItemId = request.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdIdInviteValidationError('Missing mondayItemId');
  }

  return { mondayItemId };
}

export function validateTrustIdIdCallbackRequest(request: Partial<TrustIdIdCallbackRequest>) {
  const mondayItemId = request.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdIdCallbackValidationError('Missing mondayItemId');
  }

  return {
    mondayItemId,
    containerId: request.containerId?.trim() || null,
    payload: request.payload,
  };
}

function getInviteCreatedAt(config: TrustIdIdInviteConfig) {
  return (config.now?.() ?? new Date()).toISOString();
}

function getProcessingTimestamp(config: { now?: () => Date }) {
  return (config.now?.() ?? new Date()).toISOString();
}

function getTrustIdIdentifier(response: TrustIdCreateGuestLinkResponse, key: 'ContainerId' | 'GuestId') {
  const value = response[key];
  return value?.trim() || null;
}

function hasTrustIdInviteIdentifier(item: MondayTrustIdIdCheckItem) {
  return Boolean(item.trustIdContainerId || item.trustIdGuestId);
}

function isFinalFailedStatus(status: string | null) {
  return status ? TRUST_ID_ID_FINAL_FAILED_STATUSES.includes(status) : false;
}

function getIdStatusFromMondayStatus(status: string): TrustIdIdCheckOutcome {
  if (status === TRUST_ID_ID_CHECK_PASSED_STATUS) {
    return 'passed';
  }

  if (status === TRUST_ID_ID_CHECK_FAILED_STATUS) {
    return 'failed';
  }

  if (status === TRUST_ID_ID_CHECK_ERROR_STATUS) {
    return 'error';
  }

  return 'review';
}

function getMondayStatusFromIdStatus(idStatus: TrustIdIdCheckOutcome) {
  if (idStatus === 'passed') {
    return TRUST_ID_ID_CHECK_PASSED_STATUS;
  }

  if (idStatus === 'failed') {
    return TRUST_ID_ID_CHECK_FAILED_STATUS;
  }

  if (idStatus === 'error') {
    return TRUST_ID_ID_CHECK_ERROR_STATUS;
  }

  return TRUST_ID_ID_CHECK_REVIEW_STATUS;
}

function parseInviteCreatedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function getInviteAgeDays(inviteCreatedAt: Date, now: Date) {
  return (now.getTime() - inviteCreatedAt.getTime()) / (24 * 60 * 60 * 1000);
}

export function getTrustIdIdDuplicateBlockReason(item: MondayTrustIdIdCheckItem, now: Date) {
  if (!hasTrustIdInviteIdentifier(item)) {
    return null;
  }

  if (isFinalFailedStatus(item.status)) {
    return null;
  }

  const inviteCreatedAt = parseInviteCreatedAt(item.inviteCreatedAt);

  if (!inviteCreatedAt) {
    return 'TrustID invite already exists but invite creation time is missing or invalid';
  }

  if (getInviteAgeDays(inviteCreatedAt, now) < TRUST_ID_ID_INVITE_ACTIVE_DAYS) {
    return `TrustID invite is still active until ${new Date(
      inviteCreatedAt.getTime() + TRUST_ID_ID_INVITE_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()}`;
  }

  return null;
}

function buildGuestLinkRequest(
  item: MondayTrustIdIdCheckItem,
  config: TrustIdIdInviteConfig,
): TrustIdCreateGuestLinkRequest {
  return {
    email: item.applicantEmail,
    name: item.applicantName,
    branchId: config.trustId.branchId,
    clientApplicationReference: item.itemId,
    sendEmail: true,
    digitalIdentificationScheme: config.trustId.digitalIdentificationScheme,
  };
}

function resolveCallbackContainerId(request: TrustIdIdCallbackRequest, item: MondayTrustIdIdCheckItem) {
  return request.containerId?.trim() || item.trustIdContainerId?.trim() || item.trustIdGuestId?.trim() || null;
}

function buildAlreadyProcessedCallbackResult(
  item: MondayTrustIdIdCheckItem,
  containerId: string,
): TrustIdIdCallbackAlreadyProcessedResult | null {
  if (!item.status || !TRUST_ID_ID_TERMINAL_RESULT_STATUSES.includes(item.status)) {
    return null;
  }

  return {
    outcome: 'already-processed',
    mondayItemId: item.itemId,
    trustIdContainerId: containerId,
    idStatus: getIdStatusFromMondayStatus(item.status),
    status: item.status,
    resultSummary: item.resultSummary,
  };
}

function collectResultText(value: unknown, path = '', results: string[] = []) {
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

export function interpretTrustIdIdCheckResult(response: TrustIdDocumentContainerResponse): {
  idStatus: TrustIdIdCheckOutcome;
  resultSummary: string;
} {
  if (!response.Success) {
    return {
      idStatus: 'error',
      resultSummary: response.Message?.trim() || 'TrustID document container retrieval failed',
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

  if (hasError && !hasFail && !hasReview && !hasPass) {
    return { idStatus: 'error', resultSummary };
  }

  if (hasFail && !hasPass) {
    return { idStatus: 'failed', resultSummary };
  }

  if (hasPass && !hasFail && !hasReview && !hasError) {
    return { idStatus: 'passed', resultSummary };
  }

  return { idStatus: 'review', resultSummary };
}

export function extractTrustIdIdCallbackRequest(
  query: Record<string, string | string[] | undefined>,
  body: Record<string, unknown> | undefined,
): TrustIdIdCallbackRequest {
  const queryMondayItemId = Array.isArray(query.mondayItemId) ? query.mondayItemId[0] : query.mondayItemId;
  const bodyMondayItemId =
    typeof body?.mondayItemId === 'string'
      ? body.mondayItemId
      : typeof body?.ClientApplicationReference === 'string'
        ? body.ClientApplicationReference
        : typeof body?.clientApplicationReference === 'string'
          ? body.clientApplicationReference
          : undefined;
  const bodyContainerId =
    typeof body?.ContainerId === 'string'
      ? body.ContainerId
      : typeof body?.containerId === 'string'
        ? body.containerId
        : typeof body?.GuestId === 'string'
          ? body.GuestId
          : typeof body?.guestId === 'string'
            ? body.guestId
            : undefined;

  return validateTrustIdIdCallbackRequest({
    mondayItemId: queryMondayItemId ?? bodyMondayItemId,
    containerId: bodyContainerId,
    payload: body,
  });
}

async function blockDuplicateInvite(
  item: MondayTrustIdIdCheckItem,
  reason: string,
  config: TrustIdIdInviteConfig,
  dependencies: TrustIdIdWorkflowDependencies,
): Promise<TrustIdIdInviteBlockedResult> {
  await dependencies.updateMondayTrustIdIdCheckItem(
    item.itemId,
    {
      status: TRUST_ID_ID_INVITE_BLOCKED_STATUS,
      errorDetails: reason,
      processingTimestamp: getInviteCreatedAt(config),
    },
    config.monday,
  );

  return {
    outcome: 'blocked',
    mondayItemId: item.itemId,
    applicantEmail: item.applicantEmail,
    trustIdContainerId: item.trustIdContainerId,
    trustIdGuestId: item.trustIdGuestId,
    inviteCreatedAt: item.inviteCreatedAt,
    status: TRUST_ID_ID_INVITE_BLOCKED_STATUS,
    reason,
  };
}

async function writeInviteFailure(
  mondayItemId: string,
  error: unknown,
  config: TrustIdIdInviteConfig,
  dependencies: TrustIdIdWorkflowDependencies,
) {
  const message = error instanceof Error ? error.message : 'TrustID ID invite creation failed';

  await dependencies.updateMondayTrustIdIdCheckItem(
    mondayItemId,
    {
      status: TRUST_ID_ID_INVITE_ERROR_STATUS,
      errorDetails: message,
      processingTimestamp: getInviteCreatedAt(config),
    },
    config.monday,
  );
}

async function writeCallbackFailure(
  mondayItemId: string,
  error: unknown,
  config: TrustIdIdCallbackConfig,
  dependencies: TrustIdIdWorkflowDependencies,
) {
  const message = error instanceof Error ? error.message : 'TrustID ID callback processing failed';

  await dependencies.updateMondayTrustIdIdCheckItem(
    mondayItemId,
    {
      status: TRUST_ID_ID_CHECK_ERROR_STATUS,
      errorDetails: message,
      processingTimestamp: getProcessingTimestamp(config),
    },
    config.monday,
  );
}

export async function createTrustIdIdInvite(
  request: Partial<TrustIdIdInviteRequest>,
  config: TrustIdIdInviteConfig,
  dependencies = defaultDependencies,
): Promise<TrustIdIdInviteResult> {
  const { mondayItemId } = validateTrustIdIdInviteRequest(request);
  const item = await dependencies.fetchMondayTrustIdIdCheckItem(mondayItemId, config.monday);
  const inviteCreatedAt = getInviteCreatedAt(config);
  const duplicateBlockReason = getTrustIdIdDuplicateBlockReason(item, config.now?.() ?? new Date());

  if (duplicateBlockReason) {
    return blockDuplicateInvite(item, duplicateBlockReason, config, dependencies);
  }

  try {
    const trustIdResponse = await dependencies.createTrustIdGuestLink(
      buildGuestLinkRequest(item, config),
      config.trustId,
    );
    const trustIdContainerId = getTrustIdIdentifier(trustIdResponse, 'ContainerId');
    const trustIdGuestId = getTrustIdIdentifier(trustIdResponse, 'GuestId');

    await dependencies.updateMondayTrustIdIdCheckItem(
      item.itemId,
      {
        status: TRUST_ID_ID_INVITE_SENT_STATUS,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
        resultSummary: null,
        errorDetails: null,
        processingTimestamp: inviteCreatedAt,
      },
      config.monday,
    );

    return {
      outcome: 'created',
      mondayItemId: item.itemId,
      applicantEmail: item.applicantEmail,
      trustIdContainerId,
      trustIdGuestId,
      inviteCreatedAt,
      status: TRUST_ID_ID_INVITE_SENT_STATUS,
    };
  } catch (error) {
    await writeInviteFailure(item.itemId, error, config, dependencies);
    throw error;
  }
}

export async function processTrustIdIdCallback(
  request: Partial<TrustIdIdCallbackRequest>,
  config: TrustIdIdCallbackConfig,
  dependencies = defaultDependencies,
): Promise<TrustIdIdCallbackProcessingResult> {
  const callbackRequest = validateTrustIdIdCallbackRequest(request);
  const item = await dependencies.fetchMondayTrustIdIdCheckItem(callbackRequest.mondayItemId, config.monday);
  const containerId = resolveCallbackContainerId(callbackRequest, item);

  try {
    if (!containerId) {
      throw new TrustIdIdCallbackValidationError('Missing TrustID container ID');
    }

    const alreadyProcessedResult = buildAlreadyProcessedCallbackResult(item, containerId);

    if (alreadyProcessedResult) {
      return alreadyProcessedResult;
    }

    const containerResponse = await dependencies.retrieveTrustIdDocumentContainer({ containerId }, config.trustId);
    const result = interpretTrustIdIdCheckResult(containerResponse);
    const status = getMondayStatusFromIdStatus(result.idStatus);

    await dependencies.updateMondayTrustIdIdCheckItem(
      item.itemId,
      {
        status,
        trustIdContainerId: containerId,
        resultSummary: result.resultSummary,
        errorDetails: null,
        processingTimestamp: getProcessingTimestamp(config),
      },
      config.monday,
    );

    return {
      outcome: 'processed',
      mondayItemId: item.itemId,
      trustIdContainerId: containerId,
      idStatus: result.idStatus,
      status,
      resultSummary: result.resultSummary,
    };
  } catch (error) {
    await writeCallbackFailure(item.itemId, error, config, dependencies);
    throw error;
  }
}
