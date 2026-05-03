import type {
  TrustidClient,
  RetrieveDocumentContainerResponse,
} from '../adapters/trustid-v2.ts';
import { TrustidApiError } from '../adapters/trustid-v2.ts';
import type {
  MondayTrustidClient,
  IdCheckItem,
  DbsCheckItem,
} from '../adapters/monday-trustid-v2.ts';
import type { StatusValues } from '../monday-boards.ts';
import { forwardToMake } from '../forward-to-make.ts';

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

export type CreateDbsInviteRequest = {
  mondayItemId: string;
};

export type CreateDbsInviteResult =
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

export type IdCheckOutcome = 'passed' | 'failed' | 'review' | 'error';

export type ProcessIdCallbackRequest = {
  mondayItemId: string;
  containerId: string | null;
  rawPayload: unknown;
};

export type ProcessIdCallbackResult =
  | {
      outcome: 'updated';
      mondayItemId: string;
      idStatus: IdCheckOutcome;
      trustIdContainerId: string | null;
      summary: string;
    }
  | {
      outcome: 'already-terminal';
      mondayItemId: string;
      currentStatus: string;
    };

export type TrustidWorkflowConfig = {
  trustidClient: TrustidClient;
  mondayClient: MondayTrustidClient;
  idCallbackUrl: string;
  idCheckStatusValues: StatusValues;
  dbsCallbackUrl: string;
  dbsCheckStatusValues: StatusValues;
  makeComIdWebhookUrl?: string;
  now?: () => Date;
};

export class Trustid {
  private trustidClient: TrustidClient;
  private mondayClient: MondayTrustidClient;
  private idCallbackUrl: string;
  private idCheckStatusValues: StatusValues;
  private dbsCallbackUrl: string;
  private dbsCheckStatusValues: StatusValues;
  private makeComIdWebhookUrl: string | undefined;
  private now: () => Date;

  constructor(config: TrustidWorkflowConfig) {
    this.trustidClient = config.trustidClient;
    this.mondayClient = config.mondayClient;
    this.idCallbackUrl = config.idCallbackUrl;
    this.idCheckStatusValues = config.idCheckStatusValues;
    this.dbsCallbackUrl = config.dbsCallbackUrl;
    this.dbsCheckStatusValues = config.dbsCheckStatusValues;
    this.makeComIdWebhookUrl = config.makeComIdWebhookUrl;
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
    // Encode mondayItemId in the callback URL so the webhook handler can route
    // back even if TrustID's WorkflowStorage payload omits ClientApplicationReference.
    const callbackUrl = `${this.idCallbackUrl}${this.idCallbackUrl.includes('?') ? '&' : '?'}mondayItemId=${encodeURIComponent(item.itemId)}`;
    let guestLink;
    try {
      guestLink = await this.trustidClient.createGuestLink({
        email: item.applicantEmail,
        name: item.applicantName,
        clientApplicationReference: item.itemId,
        containerEventCallbackUrl: callbackUrl,
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

  async createDbsInvite(request: CreateDbsInviteRequest): Promise<CreateDbsInviteResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.mondayClient.fetchDbsItem(mondayItemId);
    const skipReason = this.dbsInviteSkipReason(item);
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
        containerEventCallbackUrl: this.dbsCallbackUrl,
      });
    } catch (error) {
      const message = errorMessage(error);
      await this.mondayClient.markDbsError(item.itemId, {
        status: this.dbsCheckStatusValues.error,
        error: message,
        lastUpdatedAt: inviteSentAt,
      });
      throw error;
    }

    const trustIdContainerId = guestLink.ContainerId ?? null;
    const guestLinkUrl = guestLink.LinkUrl ?? null;

    await this.mondayClient.markDbsInviteSent(item.itemId, {
      status: this.dbsCheckStatusValues.inviteSent,
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

  private dbsInviteSkipReason(item: DbsCheckItem): string | null {
    const status = item.status;
    if (status === null) return null;
    if (status === this.dbsCheckStatusValues.sendInvite) return null;
    return status;
  }

  async processIdCallback(request: ProcessIdCallbackRequest): Promise<ProcessIdCallbackResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.mondayClient.fetchIdCheckItem(mondayItemId);

    if (this.isIdTerminalStatus(item.status)) {
      return {
        outcome: 'already-terminal',
        mondayItemId: item.itemId,
        currentStatus: item.status as string,
      };
    }

    const lastUpdatedAt = this.now().toISOString();
    const containerId = request.containerId?.trim() || item.trustIdContainerId;

    if (!containerId) {
      const summary = 'No container ID in webhook or Monday item';
      await this.mondayClient.markIdResult(item.itemId, {
        status: this.idCheckStatusValues.error,
        summary,
        lastUpdatedAt,
      });
      await forwardToMake(request.rawPayload, this.makeComIdWebhookUrl);
      return {
        outcome: 'updated',
        mondayItemId: item.itemId,
        idStatus: 'error',
        trustIdContainerId: null,
        summary,
      };
    }

    let mapped: { idStatus: IdCheckOutcome; summary: string };
    try {
      const container = await this.trustidClient.retrieveDocumentContainer({ containerId });
      mapped = idStatusFromContainer(container);
    } catch (error) {
      mapped = {
        idStatus: 'error',
        summary: errorMessage(error),
      };
    }

    await this.mondayClient.markIdResult(item.itemId, {
      status: this.idCheckMondayStatusFor(mapped.idStatus),
      summary: mapped.summary,
      lastUpdatedAt,
    });
    await forwardToMake(request.rawPayload, this.makeComIdWebhookUrl);

    return {
      outcome: 'updated',
      mondayItemId: item.itemId,
      idStatus: mapped.idStatus,
      trustIdContainerId: containerId,
      summary: mapped.summary,
    };
  }

  private isIdTerminalStatus(status: string | null): boolean {
    if (status === null) return false;
    const v = this.idCheckStatusValues;
    return status === v.pass || status === v.refer || status === v.fail || status === v.error;
  }

  private idCheckMondayStatusFor(idStatus: IdCheckOutcome): string {
    const v = this.idCheckStatusValues;
    switch (idStatus) {
      case 'passed':
        return v.pass;
      case 'failed':
        return v.fail;
      case 'review':
        return v.refer;
      case 'error':
        return v.error;
    }
  }
}

// -----------------------------------------------------------------------------
// Container → outcome mapping
// -----------------------------------------------------------------------------

function idStatusFromContainer(
  response: RetrieveDocumentContainerResponse,
): { idStatus: IdCheckOutcome; summary: string } {
  if (!response.Success) {
    return {
      idStatus: 'error',
      summary: response.Message?.trim() || 'TrustID document container retrieval failed',
    };
  }
  if (!response.Container) {
    return {
      idStatus: 'error',
      summary: 'TrustID document container response missing Container',
    };
  }

  const resultText = collectResultText(response.Container);
  const combined = resultText.join(' | ').toLowerCase();

  if (!combined) {
    return {
      idStatus: 'review',
      summary: 'TrustID document container did not include a recognized ID result',
    };
  }

  const hasError = /\b(error|exception|unavailable|incomplete)\b/.test(combined);
  const hasFail = /\b(fail(?:ed)?|reject(?:ed)?|declin(?:e|ed)|unsuccessful|fraud|invalid|mismatch)\b/.test(combined);
  const hasReview = /\b(review|refer(?:red)?|manual|pending|warning|attention|inconclusive|unknown|unable)\b/.test(combined);
  const hasPass = /\b(pass(?:ed)?|accept(?:ed)?|valid|verified|clear|success(?:ful)?)\b/.test(combined);
  const summary = resultText.slice(0, 8).join('; ');

  if (hasError && !hasFail && !hasReview && !hasPass) return { idStatus: 'error', summary };
  if (hasFail && !hasPass) return { idStatus: 'failed', summary };
  if (hasPass && !hasFail && !hasReview && !hasError) return { idStatus: 'passed', summary };
  return { idStatus: 'review', summary };
}

function collectResultText(value: unknown): string[] {
  const collected: string[] = [];
  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed) collected.push(trimmed);
      return;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
      collected.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) visit(v);
    }
  };
  visit(value);
  return collected;
}

export { TrustidApiError };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
