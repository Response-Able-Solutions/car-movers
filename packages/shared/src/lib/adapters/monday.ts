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

export type MondayDbsColumnConfig = {
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

export type MondayDbsBoardConfig = {
  token: string;
  boardId: string;
  columns: MondayDbsColumnConfig;
};

export type MondayDbsItem = {
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

export type MondayDbsItemUpdates = {
  status?: string | null;
  trustIdContainerId?: string | null;
  trustIdGuestId?: string | null;
  inviteCreatedAt?: string | null;
  dbsReference?: string | null;
  errorDetails?: string | null;
  processingTimestamp?: string | null;
};

type MondayDbsItemQueryResponse = {
  items?: MondayItem[];
};

type MondayChangeMultipleColumnValuesResponse = {
  change_multiple_column_values?: {
    id: string;
  };
};

export class MondayDbsItemMissingFieldError extends Error {
  itemId: string;
  fieldName: string;

  constructor(
    itemId: string,
    fieldName: string,
  ) {
    super(`DBS item ${itemId} is missing ${fieldName}`);
    this.name = 'MondayDbsItemMissingFieldError';
    this.itemId = itemId;
    this.fieldName = fieldName;
  }
}

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
    body: JSON.stringify({
      query,
      variables,
    }),
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
  change_simple_column_value?: {
    id: string;
  };
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

function escapeGraphQlString(value: string) {
  return JSON.stringify(value);
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function buildDbsColumnSelection(columns: MondayDbsColumnConfig) {
  return uniqueValues([
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
  ])
    .map((columnId) => escapeGraphQlString(columnId))
    .join(', ');
}

function readColumn(item: MondayItem, columnId: string) {
  return item.column_values.find((column) => column.id === columnId) ?? null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseLinkedItemId(column: MondayColumnValue | null) {
  const textValue = normalizeText(column?.text);

  if (textValue) {
    return textValue;
  }

  if (!column?.value) {
    return null;
  }

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

function requireDbsField(itemId: string, fieldName: string, value: string | null) {
  if (!value) {
    throw new MondayDbsItemMissingFieldError(itemId, fieldName);
  }

  return value;
}

function mapDbsItem(item: MondayItem, columns: MondayDbsColumnConfig): MondayDbsItem {
  const applicantName = normalizeText(readColumn(item, columns.applicantName)?.text);
  const applicantEmail = normalizeText(readColumn(item, columns.applicantEmail)?.text);

  return {
    itemId: item.id,
    applicantName: requireDbsField(item.id, 'applicant name', applicantName),
    applicantEmail: requireDbsField(item.id, 'applicant email', applicantEmail),
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

export async function fetchMondayDbsItem(itemId: string, config: MondayDbsBoardConfig) {
  const data = await mondayRequest<MondayDbsItemQueryResponse>(
    `
      query DbsItem($itemIds: [ID!]!) {
        items(ids: $itemIds) {
          id
          name
          board {
            id
          }
          column_values(ids: [${buildDbsColumnSelection(config.columns)}]) {
            id
            text
            value
          }
        }
      }
    `,
    {
      itemIds: [itemId],
    },
    config.token,
  );

  const item = data.items?.[0];

  if (!item || item.board?.id !== config.boardId) {
    throw new Error(`DBS item ${itemId} not found on configured board ${config.boardId}`);
  }

  return mapDbsItem(item, config.columns);
}

function setIfConfigured(
  values: Record<string, string | null>,
  columnId: string,
  value: string | null | undefined,
) {
  if (value !== undefined) {
    values[columnId] = value;
  }
}

export async function updateMondayDbsItem(
  itemId: string,
  updates: MondayDbsItemUpdates,
  config: MondayDbsBoardConfig,
) {
  const columnValues: Record<string, string | null> = {};

  setIfConfigured(columnValues, config.columns.status, updates.status);
  setIfConfigured(columnValues, config.columns.trustIdContainerId, updates.trustIdContainerId);
  setIfConfigured(columnValues, config.columns.trustIdGuestId, updates.trustIdGuestId);
  setIfConfigured(columnValues, config.columns.inviteCreatedAt, updates.inviteCreatedAt);
  setIfConfigured(columnValues, config.columns.dbsReference, updates.dbsReference);
  setIfConfigured(columnValues, config.columns.errorDetails, updates.errorDetails);
  setIfConfigured(columnValues, config.columns.processingTimestamp, updates.processingTimestamp);

  return mondayRequest<MondayChangeMultipleColumnValuesResponse>(
    `
      mutation UpdateDbsItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
          id
        }
      }
    `,
    {
      boardId: config.boardId,
      itemId,
      columnValues: JSON.stringify(columnValues),
    },
    config.token,
  );
}
