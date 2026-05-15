// Monday board structural metadata for the TrustID v2 integration (PRD #38).
// Single source of truth for board IDs, column IDs, and status column values.
// Same boards are used in sandbox and production — not env-driven.

export type IdCheckColumns = {
  applicantName: string;
  applicantEmail: string;
  status: string;
  guestLinkUrl: string;
  trustIdContainerId: string;
  lastUpdatedAt: string;
  summary: string;
  error: string;
  mainBoardLink: string;
  livenessStatus: string;
  addressStatus: string;
  addressError: string;
  faceMatchStatus: string;
  faceMatchError: string;
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

export type IdCheckStatusValues = StatusValues & {
  // Composite outcome: identity verified end-to-end but address
  // verification did not match. Treated as a terminal status.
  passWithAddressFail: string;
};

export type SignalStatusValues = {
  liveness: { pass: string; fail: string };
  address: { pass: string; fail: string };
  faceMatch: { pass: string; fail: string; unsure: string };
};

export type IdCheckBoardConfig = {
  boardId: string;
  columns: IdCheckColumns;
  statusValues: IdCheckStatusValues;
};

export type DbsCheckBoardConfig = {
  boardId: string;
  columns: DbsCheckColumns;
  statusValues: DbsStatusValues;
};

export const idCheckBoard: IdCheckBoardConfig = {
  boardId: "5095733359",
  columns: {
    applicantName: "text_mm30fgks",
    applicantEmail: "email_mm30an2q",
    status: "status",
    guestLinkUrl: "link_mm30bhp2",
    trustIdContainerId: "text_mm30jcnv",
    lastUpdatedAt: "text_mm30npkd",
    summary: "long_text_mm30vz7s",
    error: "long_text_mm30nw1f",
    mainBoardLink: "text_mm30t5tk",
    livenessStatus: "color_mm3bmr84",
    addressStatus: "color_mm3bs366",
    addressError: "text_mm3bb5dd",
    faceMatchStatus: "color_mm3b6mqe",
    faceMatchError: "text_mm3b9eab",
  },
  statusValues: {
    sendInvite: 'Send invite',
    inviteSent: 'Invite sent',
    pass: 'Pass',
    refer: 'Refer',
    fail: 'Fail',
    error: 'Error',
    passWithAddressFail: 'Pass With Address Fail',
  } satisfies IdCheckStatusValues,
};

export const idCheckSignalStatusValues: SignalStatusValues = {
  liveness: { pass: 'Pass', fail: 'Fail' },
  address: { pass: 'Pass', fail: 'Fail' },
  faceMatch: { pass: 'Pass', fail: 'Fail', unsure: 'Unsure' },
};

export const dbsCheckBoard: DbsCheckBoardConfig = {
  boardId: "5095744655",
  columns: {
    applicantName: "text_mm30fgks",
    applicantEmail: "email_mm30an2q",
    status: "status",
    guestLinkUrl: "link_mm30bhp2",
    trustIdContainerId: "text_mm30jcnv",
    lastUpdatedAt: "text_mm30npkd",
    summary: "long_text_mm30vz7s",
    error: "long_text_mm30nw1f",
    mainBoardLink: "text_mm30t5tk",
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
