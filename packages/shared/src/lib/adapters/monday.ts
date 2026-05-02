const mondayEndpoint = 'https://api.monday.com/v2';

export type MondayStatusUpdateConfig = {
  token: string;
  boardId: string;
  statusColumnId: string;
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
