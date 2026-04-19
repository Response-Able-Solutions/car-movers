const idenfyBaseUrl = 'https://ivs.idenfy.com';

export type CreateIdenfySessionRequest = {
  mondayItemId: string;
};

export type CreateIdenfySessionResponse = {
  authToken: string;
  scanRef: string;
  clientId: string;
  redirectUrl: string | null;
  verificationUrl: string;
  expiryTime: number | null;
  sessionLength: number | null;
  message: string;
};

export type IdenfySessionConfig = {
  apiKey: string;
  apiSecret: string;
  callbackUrl: string;
  baseUrl?: string;
};

type IdenfyCreateTokenPayload = {
  clientId: string;
  callbackUrl: string;
  externalRef?: string;
};

type IdenfyCreateTokenResponse = {
  message: string;
  authToken: string;
  scanRef: string;
  clientId: string;
  redirectUrl?: string | null;
  expiryTime?: number | null;
  sessionLength?: number | null;
};

export function buildIdenfyVerificationUrl(authToken: string, baseUrl = idenfyBaseUrl) {
  const url = new URL('/api/v2/redirect', baseUrl);
  url.searchParams.set('authToken', authToken);
  return url.toString();
}

export function buildIdenfyCreateSessionPayload(mondayItemId: string, callbackUrl: string): IdenfyCreateTokenPayload {
  return {
    clientId: mondayItemId,
    callbackUrl,
    externalRef: mondayItemId,
  };
}

export async function createIdenfySession(
  request: CreateIdenfySessionRequest,
  config: IdenfySessionConfig,
): Promise<CreateIdenfySessionResponse> {
  const payload = buildIdenfyCreateSessionPayload(request.mondayItemId, config.callbackUrl);
  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  const response = await fetch(new URL('/api/v2/token', config.baseUrl ?? idenfyBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authorization}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`iDenfy request failed with ${response.status}`);
  }

  const result = (await response.json()) as IdenfyCreateTokenResponse;

  return {
    authToken: result.authToken,
    scanRef: result.scanRef,
    clientId: result.clientId,
    redirectUrl: result.redirectUrl ?? null,
    verificationUrl: result.redirectUrl ?? buildIdenfyVerificationUrl(result.authToken, config.baseUrl),
    expiryTime: result.expiryTime ?? null,
    sessionLength: result.sessionLength ?? null,
    message: result.message,
  };
}
