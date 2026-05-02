import {
  fetchMondayTrustIdIdCheckItem,
  updateMondayTrustIdIdCheckItem,
  type MondayTrustIdIdCheckBoardConfig,
  type MondayTrustIdIdCheckItem,
} from '../adapters/monday.ts';
import {
  createTrustIdGuestLink,
  type TrustIdAuthenticatedConfig,
  type TrustIdCreateGuestLinkRequest,
  type TrustIdCreateGuestLinkResponse,
} from '../adapters/trustid.ts';

export const TRUST_ID_ID_INVITE_SENT_STATUS = 'TrustID ID Invite Sent';
export const TRUST_ID_ID_INVITE_ERROR_STATUS = 'TrustID ID Invite Error';
export const TRUST_ID_ID_INVITE_BLOCKED_STATUS = 'TrustID ID Invite Active';
export const TRUST_ID_ID_INVITE_ACTIVE_DAYS = 14;
export const TRUST_ID_ID_FINAL_FAILED_STATUSES = [
  'TrustID ID Check Failed',
  'TrustID Result Failed',
  TRUST_ID_ID_INVITE_ERROR_STATUS,
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

type TrustIdIdWorkflowDependencies = {
  fetchMondayTrustIdIdCheckItem: typeof fetchMondayTrustIdIdCheckItem;
  updateMondayTrustIdIdCheckItem: typeof updateMondayTrustIdIdCheckItem;
  createTrustIdGuestLink: typeof createTrustIdGuestLink;
};

const defaultDependencies: TrustIdIdWorkflowDependencies = {
  fetchMondayTrustIdIdCheckItem,
  updateMondayTrustIdIdCheckItem,
  createTrustIdGuestLink,
};

export class TrustIdIdInviteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustIdIdInviteValidationError';
  }
}

export function validateTrustIdIdInviteRequest(request: Partial<TrustIdIdInviteRequest>) {
  const mondayItemId = request.mondayItemId?.trim();

  if (!mondayItemId) {
    throw new TrustIdIdInviteValidationError('Missing mondayItemId');
  }

  return { mondayItemId };
}

function getInviteCreatedAt(config: TrustIdIdInviteConfig) {
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
