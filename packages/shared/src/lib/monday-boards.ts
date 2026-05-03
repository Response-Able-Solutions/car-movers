// Monday board structural metadata for the TrustID v2 integration (PRD #38).
// Single source of truth for board IDs, column IDs, and status column values.
// Same boards are used in sandbox and production — not env-driven.
//
// Placeholder sentinels: every field set to TODO_REPLACE_WHEN_BOARD_EXISTS
// must be replaced once ops creates the actual Monday boards. Search the repo
// for the sentinel string to find every spot that needs filling in. Any code
// path using a placeholder will hit Monday with an obviously-wrong ID and
// fail loudly — fail-fast.

const TODO = 'TODO_REPLACE_WHEN_BOARD_EXISTS';

export type IdCheckColumns = {
  applicantName: string;
  applicantEmail: string;
  status: string;
  guestLinkUrl: string;
  trustIdContainerId: string;
  lastUpdatedAt: string;
  summary: string;
  error: string;
  // Connect-boards column linking back to the main applicant board item.
  // Auto-populated by Monday on status change; we never read or write it,
  // it's tracked here so the column isn't lost if the board is rebuilt.
  mainBoardLink: string;
};

export type DbsCheckColumns = {
  applicantName: string;
  applicantEmail: string;
  status: string;
  guestLinkUrl: string;
  trustIdContainerId: string;
  lastUpdatedAt: string;
  summary: string;
  error: string;
  mainBoardLink: string;
};

export type StatusValues = {
  sendInvite: string;
  inviteSent: string;
  pass: string;
  refer: string;
  fail: string;
  error: string;
};

export type DbsStatusValues = StatusValues & {
  // Intermediate state set after we call initiateBasicDbsCheck on the
  // first ResultNotification webhook. The cert outcome arrives on a
  // second webhook; status moves from dbsSubmitted to a terminal value.
  dbsSubmitted: string;
};

export type IdCheckBoardConfig = {
  boardId: string;
  columns: IdCheckColumns;
  statusValues: StatusValues;
};

export type DbsCheckBoardConfig = {
  boardId: string;
  columns: DbsCheckColumns;
  statusValues: DbsStatusValues;
};

// TODO(slice 2 follow-up): replace every TODO_REPLACE_WHEN_BOARD_EXISTS once
// the ID-check Monday board exists. Keep the same board across sandbox + prod.
export const idCheckBoard: IdCheckBoardConfig = {
  boardId: TODO,
  columns: {
    applicantName: TODO,
    applicantEmail: TODO,
    status: TODO,
    guestLinkUrl: TODO,
    trustIdContainerId: TODO,
    lastUpdatedAt: TODO,
    summary: TODO,
    error: TODO,
    mainBoardLink: TODO,
  },
  statusValues: {
    sendInvite: 'Send invite',
    inviteSent: 'Invite sent',
    pass: 'Pass',
    refer: 'Refer',
    fail: 'Fail',
    error: 'Error',
  } satisfies StatusValues,
};

// TODO(slice 2 follow-up): replace every TODO_REPLACE_WHEN_BOARD_EXISTS once
// the DBS-check Monday board exists. Keep the same board across sandbox + prod.
export const dbsCheckBoard: DbsCheckBoardConfig = {
  boardId: TODO,
  columns: {
    applicantName: TODO,
    applicantEmail: TODO,
    status: TODO,
    guestLinkUrl: TODO,
    trustIdContainerId: TODO,
    lastUpdatedAt: TODO,
    summary: TODO,
    error: TODO,
    mainBoardLink: TODO,
  },
  statusValues: {
    sendInvite: 'Send invite',
    inviteSent: 'Invite sent',
    dbsSubmitted: 'DBS submitted',
    pass: 'Pass',
    refer: 'Refer',
    fail: 'Fail',
    error: 'Error',
  } satisfies DbsStatusValues,
};
