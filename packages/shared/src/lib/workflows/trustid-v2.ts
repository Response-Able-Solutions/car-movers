import type { TrustidClient } from '../adapters/trustid-v2.ts';
import { TrustidApiError } from '../adapters/trustid-v2.ts';
import type { MondayTrustidClient, IdCheckItem } from '../adapters/monday-trustid-v2.ts';
import type { StatusValues } from '../monday-boards.ts';

export class TrustidValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustidValidationError';
  }
}

export type CreateIdInviteRequest = {
  mondayItemId: string;
};

export type CreateIdInviteResult =
  | {
      outcome: 'created';
      mondayItemId: string;
      trustIdContainerId: string | null;
      guestLinkUrl: string | null;
      inviteSentAt: string;
    }
  | {
      outcome: 'already-processed';
      mondayItemId: string;
      currentStatus: string;
    };

export type TrustidWorkflowConfig = {
  trustidClient: TrustidClient;
  mondayClient: MondayTrustidClient;
  idCallbackUrl: string;
  idCheckStatusValues: StatusValues;
  now?: () => Date;
};

export class Trustid {
  private trustidClient: TrustidClient;
  private mondayClient: MondayTrustidClient;
  private idCallbackUrl: string;
  private idCheckStatusValues: StatusValues;
  private now: () => Date;

  constructor(config: TrustidWorkflowConfig) {
    this.trustidClient = config.trustidClient;
    this.mondayClient = config.mondayClient;
    this.idCallbackUrl = config.idCallbackUrl;
    this.idCheckStatusValues = config.idCheckStatusValues;
    this.now = config.now ?? (() => new Date());
  }

  async createIdInvite(request: CreateIdInviteRequest): Promise<CreateIdInviteResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.mondayClient.fetchIdCheckItem(mondayItemId);
    const skipReason = this.idInviteSkipReason(item);
    if (skipReason) {
      return {
        outcome: 'already-processed',
        mondayItemId: item.itemId,
        currentStatus: skipReason,
      };
    }

    const inviteSentAt = this.now().toISOString();
    let guestLink;
    try {
      guestLink = await this.trustidClient.createGuestLink({
        email: item.applicantEmail,
        name: item.applicantName,
        clientApplicationReference: item.itemId,
        containerEventCallbackUrl: this.idCallbackUrl,
      });
    } catch (error) {
      const message = errorMessage(error);
      await this.mondayClient.markIdError(item.itemId, {
        status: this.idCheckStatusValues.error,
        error: message,
        lastUpdatedAt: inviteSentAt,
      });
      throw error;
    }

    const trustIdContainerId = guestLink.ContainerId ?? null;
    const guestLinkUrl = guestLink.LinkUrl ?? null;

    await this.mondayClient.markIdInviteSent(item.itemId, {
      status: this.idCheckStatusValues.inviteSent,
      trustIdContainerId,
      guestLinkUrl,
      lastUpdatedAt: inviteSentAt,
    });

    return {
      outcome: 'created',
      mondayItemId: item.itemId,
      trustIdContainerId,
      guestLinkUrl,
      inviteSentAt,
    };
  }

  private idInviteSkipReason(item: IdCheckItem): string | null {
    const status = item.status;
    if (status === null) return null;
    if (status === this.idCheckStatusValues.sendInvite) return null;
    return status;
  }
}

export { TrustidApiError };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
