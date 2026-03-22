import type { VerificationRequest, VerificationResponse } from '@car-movers/shared/verification';

const fallbackBaseUrl = 'http://localhost:3000';

function getApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || fallbackBaseUrl;
  return `${baseUrl}${path}`;
}

export async function requestDriverVerification(input: VerificationRequest) {
  const response = await fetch(getApiUrl('/api/verify-driver'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as VerificationResponse | { error?: string };

  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Verification failed');
  }

  return payload as VerificationResponse;
}
