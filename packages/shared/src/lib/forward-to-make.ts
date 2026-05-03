// Fire-and-log Make.com forwarder. Used by the result-callback workflows
// to re-emit raw TrustID webhook payloads to a downstream Make.com scenario.
//
// Behaviour:
// - If `url` is empty/undefined, no-op (Make.com integration is optional).
// - On non-2xx or fetch error, logs and returns — never throws. The
//   primary write (Monday) is the source of truth; Make.com is best-effort.

export async function forwardToMake(payload: unknown, url: string | undefined): Promise<void> {
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error('forwardToMake.non_ok', { status: response.status, url });
    }
  } catch (error) {
    console.error('forwardToMake.error', {
      message: error instanceof Error ? error.message : 'unknown error',
      url,
    });
  }
}
