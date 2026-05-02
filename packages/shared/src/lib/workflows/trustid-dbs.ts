import {
  fetchMondayDbsItem,
  updateMondayDbsItem,
  type MondayDbsBoardConfig,
  type MondayDbsItem,
} from '../adapters/monday.ts';
import {
  createTrustIdGuestLink,
  initiateTrustIdBasicDbsCheck,
  retrieveTrustIdDbsForm,
  retrieveTrustIdDocumentContainer,
  type TrustIdAuthenticatedConfig,
  type TrustIdBasicDbsResponse,
  type TrustIdCreateGuestLinkRequest,
  type TrustIdCreateGuestLinkResponse,
  type TrustIdInitiateBasicDbsCheckRequest,
} from '../adapters/trustid.ts';

export const TRUST_ID_DBS_INVITE_SENT_STATUS = 'TrustID Invite Sent';
export const TRUST_ID_DBS_INVITE_ERROR_STATUS = 'TrustID Invite Error';
export const TRUST_ID_DBS_INVITE_BLOCKED_STATUS = 'TrustID Invite Active';
export const TRUST_ID_DBS_RESULT_RECEIVED_STATUS = 'TrustID Result Received';
export const TRUST_ID_DBS_SUBMITTED_STATUS = 'TrustID DBS Submitted';
export const TRUST_ID_DBS_ERROR_STATUS = 'TrustID DBS Error';
export const TRUST_ID_DBS_INVITE_ACTIVE_DAYS = 14;
export const TRUST_ID_DBS_FINAL_FAILED_STATUSES = [
  'TrustID Result Failed',
  'TrustID DBS Failed',
  TRUST_ID_DBS_INVITE_ERROR_STATUS,
];

export type TrustIdDbsKickoffRequest = {
  mondayItemId: string;
};

export type TrustIdDbsKickoffConfig = {
  monday: MondayDbsBoardConfig;
  trustId: TrustIdAuthenticatedConfig & {
    branchId: string;
  };
  callbackBaseUrl: string;
  now?: () => Date;
};

export type TrustIdDbsKickoffCreatedResult = {
  outcome: 'created';
  mondayItemId: string;
  applicantEmail: string;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string;
  status: typeof TRUST_ID_DBS_INVITE_SENT_STATUS;
};

export type TrustIdDbsKickoffBlockedResult = {
  outcome: 'blocked';
  mondayItemId: string;
  applicantEmail: string;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string | null;
  status: typeof TRUST_ID_DBS_INVITE_BLOCKED_STATUS;
  reason: string;
};

export type TrustIdDbsKickoffResult = TrustIdDbsKickoffCreatedResult | TrustIdDbsKickoffBlockedResult;

export type TrustIdDbsCallbackRequest = {
  mondayItemId: string;
  containerId?: string | null;
  payload?: Record<string, unknown>;
};

export type TrustIdDbsBasicCheckConfig = {
  employerName?: string;
  evidenceCheckedBy: string;
  employmentSector: string;
  purposeOfCheck?: 'Personal Interest' | 'Employment' | 'Other';
  other?: string;
};

export type TrustIdDbsCallbackConfig = {
  monday: MondayDbsBoardConfig;
  trustId: TrustIdAuthenticatedConfig;
  basicCheck: TrustIdDbsBasicCheckConfig;
  now?: () => Date;
};

export type TrustIdDbsCallbackResult = {
  outcome: 'submitted';
  mondayItemId: string;
  trustIdContainerId: string;
  dbsReference: string | null;
  status: typeof TRUST_ID_DBS_SUBMITTED_STATUS;
};

export type TrustIdDbsCallbackAlreadyProcessedResult = {
  outcome: 'already-submitted' | 'already-processing';
  mondayItemId: string;
  trustIdContainerId: string;
  dbsReference: string | null;
  status: typeof TRUST_ID_DBS_SUBMITTED_STATUS | typeof TRUST_ID_DBS_RESULT_RECEIVED_STATUS;
};

export type TrustIdDbsCallbackProcessingResult = TrustIdDbsCallbackResult | TrustIdDbsCallbackAlreadyProcessedResult;

type TrustIdDbsWorkflowDependencies = {
  fetchMondayDbsItem: typeof fetchMondayDbsItem;
  updateMondayDbsItem: typeof updateMondayDbsItem;
  createTrustIdGuestLink: typeof createTrustIdGuestLink;
  retrieveTrustIdDocumentContainer: typeof retrieveTrustIdDocumentContainer;
  retrieveTrustIdDbsForm: typeof retrieveTrustIdDbsForm;
  initiateTrustIdBasicDbsCheck: typeof initiateTrustIdBasicDbsCheck;
};

const defaultDependencies: TrustIdDbsWorkflowDependencies = {
  fetchMondayDbsItem,
  updateMondayDbsItem,
  createTrustIdGuestLink,
  retrieveTrustIdDocumentContainer,
  retrieveTrustIdDbsForm,
  initiateTrustIdBasicDbsCheck,
};

export class TrustIdDbsKickoffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdDbsKickoffValidationError';
  }
}

export class TrustIdDbsCallbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdDbsCallbackValidationError';
  }
}

export function buildTrustIdDbsCallbackUrl(baseUrl: string, mondayItemId: string) {
  const url = new URL('/api/trustid-dbs-callback', baseUrl);
  url.searchParams.set('mondayItemId', mondayItemId);
  return url.toString();
}

export function validateTrustIdDbsKickoffRequest(request: Partial<TrustIdDbsKickoffRequest>) {
  const mondayItemId = request.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdDbsKickoffValidationError('Missing mondayItemId');
  }

  return { mondayItemId };
}

export function validateTrustIdDbsCallbackRequest(request: Partial<TrustIdDbsCallbackRequest>) {
  const mondayItemId = request.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdDbsCallbackValidationError('Missing mondayItemId');
  }

  return {
    mondayItemId,
    containerId: request.containerId?.trim() || null,
    payload: request.payload,
  };
}

function getInviteCreatedAt(config: TrustIdDbsKickoffConfig) {
  return (config.now?.() ?? new Date()).toISOString();
}

function getProcessingTimestamp(config: { now?: () => Date }) {
  return (config.now?.() ?? new Date()).toISOString();
}

function getTrustIdIdentifier(response: TrustIdCreateGuestLinkResponse, key: 'ContainerId' | 'GuestId') {
  const value = response[key];
  return value?.trim() || null;
}

function buildGuestLinkRequest(
  item: MondayDbsItem,
  config: TrustIdDbsKickoffConfig,
): TrustIdCreateGuestLinkRequest {
  return {
    email: item.applicantEmail,
    name: item.applicantName,
    branchId: config.trustId.branchId,
    clientApplicationReference: item.itemId,
    containerEventCallbackUrl: buildTrustIdDbsCallbackUrl(config.callbackBaseUrl, item.itemId),
    sendEmail: true,
  };
}

function hasTrustIdInviteIdentifier(item: MondayDbsItem) {
  return Boolean(item.trustIdContainerId || item.trustIdGuestId);
}

function isFinalFailedStatus(status: string | null) {
  return status ? TRUST_ID_DBS_FINAL_FAILED_STATUSES.includes(status) : false;
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

export function getTrustIdDbsDuplicateBlockReason(item: MondayDbsItem, now: Date) {
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

  if (getInviteAgeDays(inviteCreatedAt, now) < TRUST_ID_DBS_INVITE_ACTIVE_DAYS) {
    return `TrustID invite is still active until ${new Date(
      inviteCreatedAt.getTime() + TRUST_ID_DBS_INVITE_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()}`;
  }

  return null;
}

async function blockDuplicateInvite(
  item: MondayDbsItem,
  reason: string,
  config: TrustIdDbsKickoffConfig,
  dependencies: TrustIdDbsWorkflowDependencies,
): Promise<TrustIdDbsKickoffBlockedResult> {
  await dependencies.updateMondayDbsItem(
    item.itemId,
    {
      status: TRUST_ID_DBS_INVITE_BLOCKED_STATUS,
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
    status: TRUST_ID_DBS_INVITE_BLOCKED_STATUS,
    reason,
  };
}

async function writeInviteFailure(
  mondayItemId: string,
  error: unknown,
  config: TrustIdDbsKickoffConfig,
  dependencies: TrustIdDbsWorkflowDependencies,
) {
  const message = error instanceof Error ? error.message : 'TrustID invite creation failed';

  await dependencies.updateMondayDbsItem(
    mondayItemId,
    {
      status: TRUST_ID_DBS_INVITE_ERROR_STATUS,
      errorDetails: message,
      processingTimestamp: getInviteCreatedAt(config),
    },
    config.monday,
  );
}

function getDbsReference(response: TrustIdBasicDbsResponse) {
  return response.DbsCheckResult?.DBSReference?.trim() || null;
}

function getTrustIdDbsError(response: TrustIdBasicDbsResponse) {
  return response.DbsCheckResult?.ErrorMessage?.trim() || null;
}

function resolveCallbackContainerId(request: TrustIdDbsCallbackRequest, item: MondayDbsItem) {
  return request.containerId?.trim() || item.trustIdContainerId?.trim() || item.trustIdGuestId?.trim() || null;
}

function hasSubmittedDbs(item: MondayDbsItem) {
  return item.status === TRUST_ID_DBS_SUBMITTED_STATUS && Boolean(item.dbsReference);
}

function isCallbackProcessing(item: MondayDbsItem) {
  return item.status === TRUST_ID_DBS_RESULT_RECEIVED_STATUS;
}

function buildAlreadyProcessedCallbackResult(
  item: MondayDbsItem,
  containerId: string,
): TrustIdDbsCallbackAlreadyProcessedResult | null {
  if (hasSubmittedDbs(item)) {
    return {
      outcome: 'already-submitted',
      mondayItemId: item.itemId,
      trustIdContainerId: containerId,
      dbsReference: item.dbsReference,
      status: TRUST_ID_DBS_SUBMITTED_STATUS,
    };
  }

  if (isCallbackProcessing(item)) {
    return {
      outcome: 'already-processing',
      mondayItemId: item.itemId,
      trustIdContainerId: containerId,
      dbsReference: item.dbsReference,
      status: TRUST_ID_DBS_RESULT_RECEIVED_STATUS,
    };
  }

  return null;
}

export function extractTrustIdDbsCallbackRequest(
  query: Record<string, string | string[] | undefined>,
  body: Record<string, unknown> | undefined,
): TrustIdDbsCallbackRequest {
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

  return validateTrustIdDbsCallbackRequest({
    mondayItemId: queryMondayItemId ?? bodyMondayItemId,
    containerId: bodyContainerId,
    payload: body,
  });
}

export function buildTrustIdBasicDbsRequest(
  containerId: string,
  config: TrustIdDbsCallbackConfig,
): TrustIdInitiateBasicDbsCheckRequest {
  const now = config.now?.() ?? new Date();

  return {
    containerId,
    employerName: config.basicCheck.employerName,
    candidateOriginalDocumentsChecked: true,
    candidateAddressChecked: true,
    candidateDateOfBirthChecked: true,
    evidenceCheckedBy: config.basicCheck.evidenceCheckedBy,
    evidenceCheckedDate: `/Date(${now.getTime()})/`,
    selfDeclarationCheck: true,
    applicationConsent: true,
    purposeOfCheck: config.basicCheck.purposeOfCheck ?? 'Employment',
    employmentSector: config.basicCheck.employmentSector,
    other: config.basicCheck.other,
  };
}

async function writeCallbackFailure(
  mondayItemId: string,
  error: unknown,
  config: TrustIdDbsCallbackConfig,
  dependencies: TrustIdDbsWorkflowDependencies,
) {
  const message = error instanceof Error ? error.message : 'TrustID DBS callback processing failed';

  await dependencies.updateMondayDbsItem(
    mondayItemId,
    {
      status: TRUST_ID_DBS_ERROR_STATUS,
      errorDetails: message,
      processingTimestamp: getProcessingTimestamp(config),
    },
    config.monday,
  );
}

export async function createTrustIdDbsInvite(
  request: Partial<TrustIdDbsKickoffRequest>,
  config: TrustIdDbsKickoffConfig,
  dependencies = defaultDependencies,
): Promise<TrustIdDbsKickoffResult> {
  const { mondayItemId } = validateTrustIdDbsKickoffRequest(request);
  const item = await dependencies.fetchMondayDbsItem(mondayItemId, config.monday);
  const inviteCreatedAt = getInviteCreatedAt(config);
  const duplicateBlockReason = getTrustIdDbsDuplicateBlockReason(item, config.now?.() ?? new Date());

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

    await dependencies.updateMondayDbsItem(
      item.itemId,
      {
        status: TRUST_ID_DBS_INVITE_SENT_STATUS,
        trustIdContainerId,
        trustIdGuestId,
        inviteCreatedAt,
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
      status: TRUST_ID_DBS_INVITE_SENT_STATUS,
    };
  } catch (error) {
    await writeInviteFailure(item.itemId, error, config, dependencies);
    throw error;
  }
}

export async function processTrustIdDbsCallback(
  request: Partial<TrustIdDbsCallbackRequest>,
  config: TrustIdDbsCallbackConfig,
  dependencies = defaultDependencies,
): Promise<TrustIdDbsCallbackProcessingResult> {
  const callbackRequest = validateTrustIdDbsCallbackRequest(request);
  const item = await dependencies.fetchMondayDbsItem(callbackRequest.mondayItemId, config.monday);
  const containerId = resolveCallbackContainerId(callbackRequest, item);

  try {
    if (!containerId) {
      throw new TrustIdDbsCallbackValidationError('Missing TrustID container ID');
    }

    const alreadyProcessedResult = buildAlreadyProcessedCallbackResult(item, containerId);

    if (alreadyProcessedResult) {
      return alreadyProcessedResult;
    }

    await dependencies.updateMondayDbsItem(
      item.itemId,
      {
        status: TRUST_ID_DBS_RESULT_RECEIVED_STATUS,
        trustIdContainerId: containerId,
        errorDetails: null,
        processingTimestamp: getProcessingTimestamp(config),
      },
      config.monday,
    );

    await dependencies.retrieveTrustIdDocumentContainer({ containerId }, config.trustId);
    await dependencies.retrieveTrustIdDbsForm({ containerId }, config.trustId);

    const dbsResponse = await dependencies.initiateTrustIdBasicDbsCheck(
      buildTrustIdBasicDbsRequest(containerId, config),
      config.trustId,
    );
    const dbsReference = getDbsReference(dbsResponse);
    const dbsError = getTrustIdDbsError(dbsResponse);

    if (dbsError) {
      throw new Error(dbsError);
    }

    await dependencies.updateMondayDbsItem(
      item.itemId,
      {
        status: TRUST_ID_DBS_SUBMITTED_STATUS,
        trustIdContainerId: containerId,
        dbsReference,
        errorDetails: null,
        processingTimestamp: getProcessingTimestamp(config),
      },
      config.monday,
    );

    return {
      outcome: 'submitted',
      mondayItemId: item.itemId,
      trustIdContainerId: containerId,
      dbsReference,
      status: TRUST_ID_DBS_SUBMITTED_STATUS,
    };
  } catch (error) {
    await writeCallbackFailure(item.itemId, error, config, dependencies);
    throw error;
  }
}
