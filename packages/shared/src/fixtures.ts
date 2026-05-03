import type {
  MondayTrustidDbsItem,
  MondayTrustidIdCheckItem,
} from './lib/adapters/monday.ts';
import type { IdCheckItem, DbsCheckItem } from './lib/adapters/monday-trustid-v2.ts';

export function mondayTrustidIdCheckItem(
  overrides: Partial<MondayTrustidIdCheckItem> = {},
): MondayTrustidIdCheckItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    status: null,
    trustIdContainerId: null,
    trustIdGuestId: null,
    inviteCreatedAt: null,
    resultSummary: null,
    errorDetails: null,
    processingTimestamp: null,
    ...overrides,
  };
}

export function idCheckItem(overrides: Partial<IdCheckItem> = {}): IdCheckItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    status: null,
    guestLinkUrl: null,
    trustIdContainerId: null,
    lastUpdatedAt: null,
    summary: null,
    error: null,
    ...overrides,
  };
}

export function dbsCheckItem(overrides: Partial<DbsCheckItem> = {}): DbsCheckItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    status: null,
    guestLinkUrl: null,
    trustIdContainerId: null,
    lastUpdatedAt: null,
    summary: null,
    error: null,
    ...overrides,
  };
}

export function mondayTrustidDbsItem(
  overrides: Partial<MondayTrustidDbsItem> = {},
): MondayTrustidDbsItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    linkedDriverItemId: null,
    status: null,
    trustIdContainerId: null,
    trustIdGuestId: null,
    inviteCreatedAt: null,
    dbsReference: null,
    errorDetails: null,
    processingTimestamp: null,
    ...overrides,
  };
}
