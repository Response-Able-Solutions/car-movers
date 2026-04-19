import type { VercelRequest, VercelResponse } from '@vercel/node';

function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

type MondayAssetResponse = {
  assets?: Array<{
    id: string;
    public_url: string | null;
  }>;
};

async function mondayRequest<T>(query: string, variables: Record<string, unknown>) {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: readEnv('MONDAY_API_TOKEN'),
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

function getAssetId(request: VercelRequest) {
  const rawAssetId = request.query.assetId;
  const assetId = Array.isArray(rawAssetId) ? rawAssetId[0] : rawAssetId;

  if (!assetId) {
    throw new Error('Missing assetId');
  }

  return assetId;
}

async function getAssetPublicUrl(assetId: string) {
  const data = await mondayRequest<MondayAssetResponse>(
    `
      query Asset($ids: [ID!]!) {
        assets(ids: $ids) {
          id
          public_url
        }
      }
    `,
    { ids: [assetId] },
  );

  return data.assets?.[0]?.public_url ?? null;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const assetId = getAssetId(request);
    const publicUrl = await getAssetPublicUrl(assetId);

    if (!publicUrl) {
      throw new Error('Image asset has no public URL');
    }

    const upstreamResponse = await fetch(publicUrl, {
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Image request failed with ${upstreamResponse.status}`);
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'application/octet-stream';
    const cacheControl = upstreamResponse.headers.get('cache-control') ?? 'public, max-age=300';
    const body = Buffer.from(await upstreamResponse.arrayBuffer());

    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', cacheControl);
    response.status(200).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image proxy failed';
    response.status(400).json({ error: message });
  }
}
