import {
  fetchMondayDbsItem,
  updateMondayDbsItem,
  type MondayDbsBoardConfig,
  type MondayDbsItem,
} from '../adapters/monday.ts';
import {
  createTrustIdGuestLink,
  type TrustIdAuthenticatedConfig,
  type TrustIdCreateGuestLinkRequest,
  type TrustIdCreateGuestLinkResponse,
} from '../adapters/trustid.ts';

export const TRUST_ID_DBS_INVITE_SENT_STATUS = 'TrustID Invite Sent';
export const TRUST_ID_DBS_INVITE_ERROR_STATUS = 'TrustID Invite Error';
export const TRUST_ID_DBS_INVITE_BLOCKED_STATUS = 'TrustID Invite Active';
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

type TrustIdDbsWorkflowDependencies = {
  fetchMondayDbsItem: typeof fetchMondayDbsItem;
  updateMondayDbsItem: typeof updateMondayDbsItem;
  createTrustIdGuestLink: typeof createTrustIdGuestLink;
};

const defaultDependencies: TrustIdDbsWorkflowDependencies = {
  fetchMondayDbsItem,
  updateMondayDbsItem,
  createTrustIdGuestLink,
};

export class TrustIdDbsKickoffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdDbsKickoffValidationError';
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

function getInviteCreatedAt(config: TrustIdDbsKickoffConfig) {
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
