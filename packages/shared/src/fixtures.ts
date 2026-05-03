import type {
  MondayTrustidDbsItem,
  MondayTrustidIdCheckItem,
} from './lib/adapters/monday.ts';

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
