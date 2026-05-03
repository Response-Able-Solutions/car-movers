const mondayEndpoint = 'https://api.monday.com/v2';

export type MondayStatusUpdateConfig = {
  token: string;
  boardId: string;
  statusColumnId: string;
};

export type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  board?: {
    id: string;
  } | null;
  column_values: MondayColumnValue[];
};

export async function mondayRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await fetch(mondayEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`monday.com request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  if (!payload.data) {
    throw new Error('monday.com response missing data');
  }

  return payload.data;
}

type MondayChangeColumnValueResponse = {
  change_simple_column_value?: { id: string };
};

export async function updateMondayStatus(
  itemId: string,
  statusLabel: string,
  config: MondayStatusUpdateConfig,
) {
  return mondayRequest<MondayChangeColumnValueResponse>(
    `
      mutation UpdateStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
        change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
          id
        }
      }
    `,
    {
      boardId: config.boardId,
      itemId,
      columnId: config.statusColumnId,
      value: statusLabel,
    },
    config.token,
  );
}

// ---------------------------------------------------------------------------
// TrustID-specific Monday boards (DBS + ID-Check)
// ---------------------------------------------------------------------------

export type MondayTrustidDbsColumnConfig = {
  applicantName: string;
  applicantEmail: string;
  linkedDriverItem: string;
  status: string;
  trustIdContainerId: string;
  trustIdGuestId: string;
  inviteCreatedAt: string;
  dbsReference: string;
  errorDetails: string;
  processingTimestamp: string;
};

export type MondayTrustidDbsBoardConfig = {
  token: string;
  boardId: string;
  columns: MondayTrustidDbsColumnConfig;
};

export type MondayTrustidDbsItem = {
  itemId: string;
  applicantName: string;
  applicantEmail: string;
  linkedDriverItemId: string | null;
  status: string | null;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string | null;
  dbsReference: string | null;
  errorDetails: string | null;
  processingTimestamp: string | null;
};

export type MondayTrustidDbsUpdates = {
  status?: string | null;
  trustIdContainerId?: string | null;
  trustIdGuestId?: string | null;
  inviteCreatedAt?: string | null;
  dbsReference?: string | null;
  errorDetails?: string | null;
  processingTimestamp?: string | null;
};

export type MondayTrustidIdCheckColumnConfig = {
  applicantName: string;
  applicantEmail: string;
  status: string;
  trustIdContainerId: string;
  trustIdGuestId: string;
  inviteCreatedAt: string;
  resultSummary: string;
  errorDetails: string;
  processingTimestamp: string;
};

export type MondayTrustidIdCheckBoardConfig = {
  token: string;
  boardId: string;
  columns: MondayTrustidIdCheckColumnConfig;
};

export type MondayTrustidIdCheckItem = {
  itemId: string;
  applicantName: string;
  applicantEmail: string;
  status: string | null;
  trustIdContainerId: string | null;
  trustIdGuestId: string | null;
  inviteCreatedAt: string | null;
  resultSummary: string | null;
  errorDetails: string | null;
  processingTimestamp: string | null;
};

export type MondayTrustidIdCheckUpdates = {
  status?: string | null;
  trustIdContainerId?: string | null;
  trustIdGuestId?: string | null;
  inviteCreatedAt?: string | null;
  resultSummary?: string | null;
  errorDetails?: string | null;
  processingTimestamp?: string | null;
};

export type MondayTrustidConfig = {
  idCheck?: MondayTrustidIdCheckBoardConfig;
  dbs?: MondayTrustidDbsBoardConfig;
};

export class MondayTrustidItemMissingFieldError extends Error {
  readonly kind: 'id-check' | 'dbs';
  readonly itemId: string;
  readonly fieldName: string;

  constructor(kind: 'id-check' | 'dbs', itemId: string, fieldName: string) {
    super(`TrustID ${kind} item ${itemId} is missing ${fieldName}`);
    this.name = 'MondayTrustidItemMissingFieldError';
    this.kind = kind;
    this.itemId = itemId;
    this.fieldName = fieldName;
  }
}

export interface MondayTrustidClient {
  fetchIdCheckItem(itemId: string): Promise<MondayTrustidIdCheckItem>;
  updateIdCheckItem(itemId: string, updates: MondayTrustidIdCheckUpdates): Promise<void>;
  fetchDbsItem(itemId: string): Promise<MondayTrustidDbsItem>;
  updateDbsItem(itemId: string, updates: MondayTrustidDbsUpdates): Promise<void>;
}

type MondayItemQueryResponse = { items?: MondayItem[] };
type MondayChangeMultipleColumnValuesResponse = {
  change_multiple_column_values?: { id: string };
};

export class MondayTrustidApiClient implements MondayTrustidClient {
  private config: MondayTrustidConfig;

  constructor(config: MondayTrustidConfig) {
    this.config = config;
  }

  async fetchIdCheckItem(itemId: string): Promise<MondayTrustidIdCheckItem> {
    const board = this.requireIdCheckConfig();
    const item = await this.fetchItem(itemId, board.boardId, board.token, idCheckColumnSelection(board.columns));
    if (!item) {
      throw new Error(`TrustID ID-check item ${itemId} not found on configured board ${board.boardId}`);
    }
    return mapIdCheckItem(item, board.columns);
  }

  async updateIdCheckItem(itemId: string, updates: MondayTrustidIdCheckUpdates): Promise<void> {
    const board = this.requireIdCheckConfig();
    const columnValues: Record<string, string | null> = {};
    setIfDefined(columnValues, board.columns.status, updates.status);
    setIfDefined(columnValues, board.columns.trustIdContainerId, updates.trustIdContainerId);
    setIfDefined(columnValues, board.columns.trustIdGuestId, updates.trustIdGuestId);
    setIfDefined(columnValues, board.columns.inviteCreatedAt, updates.inviteCreatedAt);
    setIfDefined(columnValues, board.columns.resultSummary, updates.resultSummary);
    setIfDefined(columnValues, board.columns.errorDetails, updates.errorDetails);
    setIfDefined(columnValues, board.columns.processingTimestamp, updates.processingTimestamp);
    await this.changeMultipleColumnValues(itemId, board.boardId, board.token, columnValues);
  }

  async fetchDbsItem(itemId: string): Promise<MondayTrustidDbsItem> {
    const board = this.requireDbsConfig();
    const item = await this.fetchItem(itemId, board.boardId, board.token, dbsColumnSelection(board.columns));
    if (!item) {
      throw new Error(`TrustID DBS item ${itemId} not found on configured board ${board.boardId}`);
    }
    return mapDbsItem(item, board.columns);
  }

  async updateDbsItem(itemId: string, updates: MondayTrustidDbsUpdates): Promise<void> {
    const board = this.requireDbsConfig();
    const columnValues: Record<string, string | null> = {};
    setIfDefined(columnValues, board.columns.status, updates.status);
    setIfDefined(columnValues, board.columns.trustIdContainerId, updates.trustIdContainerId);
    setIfDefined(columnValues, board.columns.trustIdGuestId, updates.trustIdGuestId);
    setIfDefined(columnValues, board.columns.inviteCreatedAt, updates.inviteCreatedAt);
    setIfDefined(columnValues, board.columns.dbsReference, updates.dbsReference);
    setIfDefined(columnValues, board.columns.errorDetails, updates.errorDetails);
    setIfDefined(columnValues, board.columns.processingTimestamp, updates.processingTimestamp);
    await this.changeMultipleColumnValues(itemId, board.boardId, board.token, columnValues);
  }

  private requireIdCheckConfig(): MondayTrustidIdCheckBoardConfig {
    if (!this.config.idCheck) {
      throw new Error('MondayTrustidApiClient: idCheck board config not provided');
    }
    return this.config.idCheck;
  }

  private requireDbsConfig(): MondayTrustidDbsBoardConfig {
    if (!this.config.dbs) {
      throw new Error('MondayTrustidApiClient: dbs board config not provided');
    }
    return this.config.dbs;
  }

  private async fetchItem(
    itemId: string,
    boardId: string,
    token: string,
    columnSelection: string,
  ): Promise<MondayItem | null> {
    const data = await mondayRequest<MondayItemQueryResponse>(
      `
        query TrustidItem($itemIds: [ID!]!) {
          items(ids: $itemIds) {
            id
            name
            board { id }
            column_values(ids: [${columnSelection}]) {
              id
              text
              value
            }
          }
        }
      `,
      { itemIds: [itemId] },
      token,
    );

    const item = data.items?.[0];
    if (!item || item.board?.id !== boardId) return null;
    return item;
  }

  private async changeMultipleColumnValues(
    itemId: string,
    boardId: string,
    token: string,
    columnValues: Record<string, string | null>,
  ): Promise<void> {
    await mondayRequest<MondayChangeMultipleColumnValuesResponse>(
      `
        mutation UpdateTrustidItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `,
      {
        boardId,
        itemId,
        columnValues: JSON.stringify(columnValues),
      },
      token,
    );
  }
}

export function loadMondayTrustidIdCheckConfigFromEnv(): MondayTrustidIdCheckBoardConfig {
  return {
    token: readEnv('MONDAY_API_TOKEN'),
    boardId: readEnv('TRUSTID_ID_BOARD_ID'),
    columns: {
      applicantName: readEnv('TRUSTID_ID_APPLICANT_NAME_COLUMN_ID'),
      applicantEmail: readEnv('TRUSTID_ID_APPLICANT_EMAIL_COLUMN_ID'),
      status: readEnv('TRUSTID_ID_STATUS_COLUMN_ID'),
      trustIdContainerId: readEnv('TRUSTID_ID_CONTAINER_ID_COLUMN_ID'),
      trustIdGuestId: readEnv('TRUSTID_ID_GUEST_ID_COLUMN_ID'),
      inviteCreatedAt: readEnv('TRUSTID_ID_INVITE_CREATED_AT_COLUMN_ID'),
      resultSummary: readEnv('TRUSTID_ID_RESULT_SUMMARY_COLUMN_ID'),
      errorDetails: readEnv('TRUSTID_ID_ERROR_DETAILS_COLUMN_ID'),
      processingTimestamp: readEnv('TRUSTID_ID_PROCESSING_TIMESTAMP_COLUMN_ID'),
    },
  };
}

export function loadMondayTrustidDbsConfigFromEnv(): MondayTrustidDbsBoardConfig {
  return {
    token: readEnv('MONDAY_API_TOKEN'),
    boardId: readEnv('DBS_BOARD_ID'),
    columns: {
      applicantName: readEnv('DBS_APPLICANT_NAME_COLUMN_ID'),
      applicantEmail: readEnv('DBS_APPLICANT_EMAIL_COLUMN_ID'),
      linkedDriverItem: readEnv('DBS_LINKED_DRIVER_ITEM_COLUMN_ID'),
      status: readEnv('DBS_STATUS_COLUMN_ID'),
      trustIdContainerId: readEnv('DBS_TRUSTID_CONTAINER_ID_COLUMN_ID'),
      trustIdGuestId: readEnv('DBS_TRUSTID_GUEST_ID_COLUMN_ID'),
      inviteCreatedAt: readEnv('DBS_INVITE_CREATED_AT_COLUMN_ID'),
      dbsReference: readEnv('DBS_REFERENCE_COLUMN_ID'),
      errorDetails: readEnv('DBS_ERROR_DETAILS_COLUMN_ID'),
      processingTimestamp: readEnv('DBS_PROCESSING_TIMESTAMP_COLUMN_ID'),
    },
  };
}

// ---------------------------------------------------------------------------
// File-private helpers
// ---------------------------------------------------------------------------

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function escapeGraphQlString(value: string): string {
  return JSON.stringify(value);
}

function buildColumnSelection(columnIds: string[]): string {
  return [...new Set(columnIds)].map(escapeGraphQlString).join(', ');
}

function idCheckColumnSelection(columns: MondayTrustidIdCheckColumnConfig): string {
  return buildColumnSelection([
    columns.applicantName,
    columns.applicantEmail,
    columns.status,
    columns.trustIdContainerId,
    columns.trustIdGuestId,
    columns.inviteCreatedAt,
    columns.resultSummary,
    columns.errorDetails,
    columns.processingTimestamp,
  ]);
}

function dbsColumnSelection(columns: MondayTrustidDbsColumnConfig): string {
  return buildColumnSelection([
    columns.applicantName,
    columns.applicantEmail,
    columns.linkedDriverItem,
    columns.status,
    columns.trustIdContainerId,
    columns.trustIdGuestId,
    columns.inviteCreatedAt,
    columns.dbsReference,
    columns.errorDetails,
    columns.processingTimestamp,
  ]);
}

function readColumn(item: MondayItem, columnId: string): MondayColumnValue | null {
  return item.column_values.find((c) => c.id === columnId) ?? null;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseLinkedItemId(column: MondayColumnValue | null): string | null {
  const textValue = normalizeText(column?.text);
  if (textValue) return textValue;
  if (!column?.value) return null;

  try {
    const parsed = JSON.parse(column.value) as {
      linkedPulseIds?: Array<{ linkedPulseId?: number | string }>;
      linkedPulseId?: number | string;
      item_ids?: Array<number | string>;
    };
    const linkedPulseId =
      parsed.linkedPulseIds?.[0]?.linkedPulseId ??
      parsed.linkedPulseId ??
      parsed.item_ids?.[0] ??
      null;

    return linkedPulseId === null ? null : String(linkedPulseId);
  } catch {
    return null;
  }
}

function setIfDefined(
  values: Record<string, string | null>,
  columnId: string,
  value: string | null | undefined,
): void {
  if (value !== undefined) values[columnId] = value;
}

function mapIdCheckItem(
  item: MondayItem,
  columns: MondayTrustidIdCheckColumnConfig,
): MondayTrustidIdCheckItem {
  const applicantName = normalizeText(readColumn(item, columns.applicantName)?.text);
  const applicantEmail = normalizeText(readColumn(item, columns.applicantEmail)?.text);
  if (!applicantName) {
    throw new MondayTrustidItemMissingFieldError('id-check', item.id, 'applicant name');
  }
  if (!applicantEmail) {
    throw new MondayTrustidItemMissingFieldError('id-check', item.id, 'applicant email');
  }
  return {
    itemId: item.id,
    applicantName,
    applicantEmail,
    status: normalizeText(readColumn(item, columns.status)?.text),
    trustIdContainerId: normalizeText(readColumn(item, columns.trustIdContainerId)?.text),
    trustIdGuestId: normalizeText(readColumn(item, columns.trustIdGuestId)?.text),
    inviteCreatedAt: normalizeText(readColumn(item, columns.inviteCreatedAt)?.text),
    resultSummary: normalizeText(readColumn(item, columns.resultSummary)?.text),
    errorDetails: normalizeText(readColumn(item, columns.errorDetails)?.text),
    processingTimestamp: normalizeText(readColumn(item, columns.processingTimestamp)?.text),
  };
}

function mapDbsItem(
  item: MondayItem,
  columns: MondayTrustidDbsColumnConfig,
): MondayTrustidDbsItem {
  const applicantName = normalizeText(readColumn(item, columns.applicantName)?.text);
  const applicantEmail = normalizeText(readColumn(item, columns.applicantEmail)?.text);
  if (!applicantName) {
    throw new MondayTrustidItemMissingFieldError('dbs', item.id, 'applicant name');
  }
  if (!applicantEmail) {
    throw new MondayTrustidItemMissingFieldError('dbs', item.id, 'applicant email');
  }
  return {
    itemId: item.id,
    applicantName,
    applicantEmail,
    linkedDriverItemId: parseLinkedItemId(readColumn(item, columns.linkedDriverItem)),
    status: normalizeText(readColumn(item, columns.status)?.text),
    trustIdContainerId: normalizeText(readColumn(item, columns.trustIdContainerId)?.text),
    trustIdGuestId: normalizeText(readColumn(item, columns.trustIdGuestId)?.text),
    inviteCreatedAt: normalizeText(readColumn(item, columns.inviteCreatedAt)?.text),
    dbsReference: normalizeText(readColumn(item, columns.dbsReference)?.text),
    errorDetails: normalizeText(readColumn(item, columns.errorDetails)?.text),
    processingTimestamp: normalizeText(readColumn(item, columns.processingTimestamp)?.text),
  };
}
