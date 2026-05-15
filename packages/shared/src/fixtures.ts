import type { IdCheckItem, DbsCheckItem } from './lib/adapters/monday-trustid-v2.ts';

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
