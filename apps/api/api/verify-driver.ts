import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DriverRecord, VerificationRequest, VerificationResponse } from '@car-movers/shared/verification';

type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

type MondayResponse = {
  data?: {
    boards?: Array<{
      items_page?: {
        items: MondayItem[];
      };
    }>;
  };
  errors?: Array<{ message: string }>;
};

const mondayEndpoint = 'https://api.monday.com/v2';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getConfig() {
  return {
    token: readEnv('MONDAY_API_TOKEN'),
    boardId: readEnv('MONDAY_BOARD_ID'),
    itemLimit: Number(process.env.MONDAY_ITEM_LIMIT ?? '100'),
    columns: {
      id: readEnv('MONDAY_ID_COLUMN_ID'),
      firstName: readEnv('MONDAY_FIRST_NAME_COLUMN_ID'),
      surname: readEnv('MONDAY_SURNAME_COLUMN_ID'),
      status: readEnv('MONDAY_STATUS_COLUMN_ID'),
      photo: readEnv('MONDAY_PHOTO_COLUMN_ID'),
      driverSince: readEnv('MONDAY_DRIVER_SINCE_COLUMN_ID'),
    },
  };
}

function buildQuery(columns: ReturnType<typeof getConfig>['columns']) {
  return `
    query VerifyDrivers($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit) {
          items {
            id
            name
            column_values(ids: [
              "${columns.id}",
              "${columns.firstName}",
              "${columns.surname}",
              "${columns.status}",
              "${columns.photo}",
              "${columns.driverSince}"
            ]) {
              id
              text
              value
            }
          }
        }
      }
    }
  `;
}

function readColumn(item: MondayItem, columnId: string) {
  return item.column_values.find((column) => column.id === columnId);
}

async function getDriverItems() {
  const config = getConfig();
  const response = await fetch(mondayEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.token,
    },
    body: JSON.stringify({
      query: buildQuery(config.columns),
      variables: {
        boardId: config.boardId,
        limit: config.itemLimit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`monday.com request failed with ${response.status}`);
  }

  const payload = (await response.json()) as MondayResponse;

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  return {
    items: payload.data?.boards?.[0]?.items_page?.items ?? [],
    columns: config.columns,
  };
}

function parsePhotoUrl(rawValue: string | null, fallbackText: string | null) {
  if (fallbackText) {
    return fallbackText;
  }

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      files?: Array<{ assetUrl?: string; public_url?: string }>;
      url?: string;
    };

    return parsed.files?.[0]?.assetUrl ?? parsed.files?.[0]?.public_url ?? parsed.url ?? null;
  } catch {
    return null;
  }
}

function mapItemToDriver(item: MondayItem, columns: ReturnType<typeof getConfig>['columns']): DriverRecord {
  const surname = readColumn(item, columns.surname)?.text ?? '';
  const firstName = readColumn(item, columns.firstName)?.text ?? '';
  const photoColumn = readColumn(item, columns.photo);

  return {
    id: readColumn(item, columns.id)?.text ?? '',
    surname,
    fullName: `${firstName} ${surname}`.trim() || item.name,
    status: readColumn(item, columns.status)?.text ?? 'Verified',
    photoUrl: parsePhotoUrl(photoColumn?.value ?? null, photoColumn?.text ?? null),
    driverSince: readColumn(item, columns.driverSince)?.text ?? null,
  };
}

function findDriverByVerificationInput(
  items: MondayItem[],
  columns: ReturnType<typeof getConfig>['columns'],
  input: VerificationRequest,
) {
  const normalizedId = input.id.trim().toLowerCase();
  const normalizedSurname = input.surname.trim().toLowerCase();
  const requiredStatus = 'active';

  return items.find((item) => {
    const driver = mapItemToDriver(item, columns);

    return (
      driver.id.trim().toLowerCase() === normalizedId &&
      driver.surname.trim().toLowerCase() === normalizedSurname &&
      driver.status.trim().toLowerCase() === requiredStatus
    );
  });
}

async function verifyDriverIdentity(input: VerificationRequest): Promise<VerificationResponse> {
  const { items, columns } = await getDriverItems();
  const matchingDriverItem = findDriverByVerificationInput(items, columns, input);

  if (!matchingDriverItem) {
    return {
      verified: false,
      driver: null,
    };
  }

  return {
    verified: true,
    driver: mapItemToDriver(matchingDriverItem, columns),
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = request.body as Partial<VerificationRequest> | undefined;

  if (!body?.id?.trim()) {
    response.status(400).json({ error: 'Missing id' });
    return;
  }

  if (!body?.surname?.trim()) {
    response.status(400).json({ error: 'Missing surname' });
    return;
  }

  try {
    const result = await verifyDriverIdentity({
      id: body.id,
      surname: body.surname,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    response.status(500).json({ error: message });
  }
}
