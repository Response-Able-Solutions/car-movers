import type { IdCheckBoardConfig, DbsCheckBoardConfig } from '../monday-boards.ts';

const mondayEndpoint = 'https://api.monday.com/v2';

export type IdCheckItem = {
  itemId: string;
  applicantName: string;
  applicantEmail: string;
  status: string | null;
  guestLinkUrl: string | null;
  trustIdContainerId: string | null;
  lastUpdatedAt: string | null;
  summary: string | null;
  error: string | null;
};

export type IdCheckInviteSentUpdates = {
  status: string;
  trustIdContainerId: string | null;
  guestLinkUrl: string | null;
  lastUpdatedAt: string;
};

export type IdCheckErrorUpdates = {
  status: string;
  error: string;
  lastUpdatedAt: string;
};

export type IdCheckResultUpdates = {
  status: string;
  summary: string;
  lastUpdatedAt: string;
};

export type DbsCheckItem = {
  itemId: string;
  applicantName: string;
  applicantEmail: string;
  status: string | null;
  guestLinkUrl: string | null;
  trustIdContainerId: string | null;
  lastUpdatedAt: string | null;
  summary: string | null;
  error: string | null;
};

export type DbsCheckInviteSentUpdates = {
  status: string;
  trustIdContainerId: string | null;
  guestLinkUrl: string | null;
  lastUpdatedAt: string;
};

export type DbsCheckErrorUpdates = {
  status: string;
  error: string;
  lastUpdatedAt: string;
};

export type DbsCheckSubmittedUpdates = {
  status: string;
  lastUpdatedAt: string;
};

export type DbsCheckResultUpdates = {
  status: string;
  summary: string;
  lastUpdatedAt: string;
};

export type MondayTrustidV2Config = {
  token: string;
  idCheckBoard?: IdCheckBoardConfig;
  dbsCheckBoard?: DbsCheckBoardConfig;
};

export interface MondayTrustidClient {
  fetchIdCheckItem(itemId: string): Promise<IdCheckItem>;
  markIdInviteSent(itemId: string, updates: IdCheckInviteSentUpdates): Promise<void>;
  markIdError(itemId: string, updates: IdCheckErrorUpdates): Promise<void>;
  markIdResult(itemId: string, updates: IdCheckResultUpdates): Promise<void>;
  fetchDbsItem(itemId: string): Promise<DbsCheckItem>;
  markDbsInviteSent(itemId: string, updates: DbsCheckInviteSentUpdates): Promise<void>;
  markDbsError(itemId: string, updates: DbsCheckErrorUpdates): Promise<void>;
  markDbsSubmitted(itemId: string, updates: DbsCheckSubmittedUpdates): Promise<void>;
  markDbsResult(itemId: string, updates: DbsCheckResultUpdates): Promise<void>;
}

export class MondayTrustidItemNotFoundError extends Error {
  readonly itemId: string;
  readonly boardId: string;

  constructor(itemId: string, boardId: string) {
    super(`Monday item ${itemId} not found on board ${boardId}`);
    this.name = 'MondayTrustidItemNotFoundError';
    this.itemId = itemId;
    this.boardId = boardId;
  }
}

export class MondayTrustidItemMissingFieldError extends Error {
  readonly itemId: string;
  readonly fieldName: string;

  constructor(itemId: string, fieldName: string) {
    super(`Monday item ${itemId} is missing ${fieldName}`);
    this.name = 'MondayTrustidItemMissingFieldError';
    this.itemId = itemId;
    this.fieldName = fieldName;
  }
}

type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  board?: { id: string } | null;
  column_values: MondayColumnValue[];
};

type MondayItemQueryResponse = { items?: MondayItem[] };
type MondayChangeMultipleColumnValuesResponse = {
  change_multiple_column_values?: { id: string };
};

export class MondayTrustidApiClient implements MondayTrustidClient {
  private config: MondayTrustidV2Config;

  constructor(config: MondayTrustidV2Config) {
    this.config = config;
  }

  async fetchIdCheckItem(itemId: string): Promise<IdCheckItem> {
    const board = this.requireIdCheckBoard();
    const columnIds = [
      board.columns.applicantName,
      board.columns.applicantEmail,
      board.columns.status,
      board.columns.guestLinkUrl,
      board.columns.trustIdContainerId,
      board.columns.lastUpdatedAt,
      board.columns.summary,
      board.columns.error,
    ];
    const item = await this.fetchItem(itemId, board.boardId, columnIds);
    if (!item) throw new MondayTrustidItemNotFoundError(itemId, board.boardId);

    const applicantName = readColumnText(item, board.columns.applicantName);
    const applicantEmail = readColumnText(item, board.columns.applicantEmail);
    if (!applicantName) throw new MondayTrustidItemMissingFieldError(item.id, 'applicant name');
    if (!applicantEmail) throw new MondayTrustidItemMissingFieldError(item.id, 'applicant email');

    return {
      itemId: item.id,
      applicantName,
      applicantEmail,
      status: readColumnText(item, board.columns.status),
      guestLinkUrl: readColumnText(item, board.columns.guestLinkUrl),
      trustIdContainerId: readColumnText(item, board.columns.trustIdContainerId),
      lastUpdatedAt: readColumnText(item, board.columns.lastUpdatedAt),
      summary: readColumnText(item, board.columns.summary),
      error: readColumnText(item, board.columns.error),
    };
  }

  async markIdInviteSent(itemId: string, updates: IdCheckInviteSentUpdates): Promise<void> {
    const board = this.requireIdCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.trustIdContainerId]: updates.trustIdContainerId,
      [board.columns.guestLinkUrl]: updates.guestLinkUrl,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
      // clear any previous error message on a successful re-mint
      [board.columns.error]: null,
    });
  }

  async markIdError(itemId: string, updates: IdCheckErrorUpdates): Promise<void> {
    const board = this.requireIdCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.error]: updates.error,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
    });
  }

  async markIdResult(itemId: string, updates: IdCheckResultUpdates): Promise<void> {
    const board = this.requireIdCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.summary]: updates.summary,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
    });
  }

  async fetchDbsItem(itemId: string): Promise<DbsCheckItem> {
    const board = this.requireDbsCheckBoard();
    const columnIds = [
      board.columns.applicantName,
      board.columns.applicantEmail,
      board.columns.status,
      board.columns.guestLinkUrl,
      board.columns.trustIdContainerId,
      board.columns.lastUpdatedAt,
      board.columns.summary,
      board.columns.error,
    ];
    const item = await this.fetchItem(itemId, board.boardId, columnIds);
    if (!item) throw new MondayTrustidItemNotFoundError(itemId, board.boardId);

    const applicantName = readColumnText(item, board.columns.applicantName);
    const applicantEmail = readColumnText(item, board.columns.applicantEmail);
    if (!applicantName) throw new MondayTrustidItemMissingFieldError(item.id, 'applicant name');
    if (!applicantEmail) throw new MondayTrustidItemMissingFieldError(item.id, 'applicant email');

    return {
      itemId: item.id,
      applicantName,
      applicantEmail,
      status: readColumnText(item, board.columns.status),
      guestLinkUrl: readColumnText(item, board.columns.guestLinkUrl),
      trustIdContainerId: readColumnText(item, board.columns.trustIdContainerId),
      lastUpdatedAt: readColumnText(item, board.columns.lastUpdatedAt),
      summary: readColumnText(item, board.columns.summary),
      error: readColumnText(item, board.columns.error),
    };
  }

  async markDbsInviteSent(itemId: string, updates: DbsCheckInviteSentUpdates): Promise<void> {
    const board = this.requireDbsCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.trustIdContainerId]: updates.trustIdContainerId,
      [board.columns.guestLinkUrl]: updates.guestLinkUrl,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
      [board.columns.error]: null,
    });
  }

  async markDbsError(itemId: string, updates: DbsCheckErrorUpdates): Promise<void> {
    const board = this.requireDbsCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.error]: updates.error,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
    });
  }

  async markDbsSubmitted(itemId: string, updates: DbsCheckSubmittedUpdates): Promise<void> {
    const board = this.requireDbsCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
    });
  }

  async markDbsResult(itemId: string, updates: DbsCheckResultUpdates): Promise<void> {
    const board = this.requireDbsCheckBoard();
    await this.changeMultipleColumnValues(itemId, board.boardId, {
      [board.columns.status]: updates.status,
      [board.columns.summary]: updates.summary,
      [board.columns.lastUpdatedAt]: updates.lastUpdatedAt,
    });
  }

  private requireIdCheckBoard(): IdCheckBoardConfig {
    if (!this.config.idCheckBoard) {
      throw new Error('MondayTrustidApiClient: idCheckBoard config not provided');
    }
    return this.config.idCheckBoard;
  }

  private requireDbsCheckBoard(): DbsCheckBoardConfig {
    if (!this.config.dbsCheckBoard) {
      throw new Error('MondayTrustidApiClient: dbsCheckBoard config not provided');
    }
    return this.config.dbsCheckBoard;
  }

  private async fetchItem(
    itemId: string,
    boardId: string,
    columnIds: string[],
  ): Promise<MondayItem | null> {
    const columnSelection = [...new Set(columnIds)].map((c) => JSON.stringify(c)).join(', ');
    const data = await this.mondayRequest<MondayItemQueryResponse>(
      `
        query TrustidV2Item($itemIds: [ID!]!) {
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
    );
    const item = data.items?.[0];
    if (!item || item.board?.id !== boardId) return null;
    return item;
  }

  private async changeMultipleColumnValues(
    itemId: string,
    boardId: string,
    columnValues: Record<string, string | null>,
  ): Promise<void> {
    await this.mondayRequest<MondayChangeMultipleColumnValuesResponse>(
      `
        mutation UpdateTrustidV2Item($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `,
      { boardId, itemId, columnValues: JSON.stringify(columnValues) },
    );
  }

  private async mondayRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(mondayEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.config.token,
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
}

export function loadMondayTrustidV2ConfigFromEnv(boards: {
  idCheckBoard?: IdCheckBoardConfig;
  dbsCheckBoard?: DbsCheckBoardConfig;
}): MondayTrustidV2Config {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new Error('Missing MONDAY_API_TOKEN');
  return {
    token,
    idCheckBoard: boards.idCheckBoard,
    dbsCheckBoard: boards.dbsCheckBoard,
  };
}

function readColumnText(item: MondayItem, columnId: string): string | null {
  const column = item.column_values.find((c) => c.id === columnId);
  const trimmed = column?.text?.trim();
  return trimmed ? trimmed : null;
}
