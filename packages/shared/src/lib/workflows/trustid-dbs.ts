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

export type TrustIdDbsKickoffResult = {
  mondayItemId: string;
  applicantEmail: string;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string;
  status: typeof TRUST_ID_DBS_INVITE_SENT_STATUS;
};

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
