// Sandbox smoke test for the new TrustID adapter (slice 1 of PRD #38).
// Hits the real sandbox once to prove createGuestLink works end-to-end,
// then optionally retrieves the container.
//
// Run from the repo root with:
//   node --env-file=.env.local --experimental-strip-types packages/shared/scripts/trustid-v2-sandbox-smoke.ts
//
// Required env (in .env.local):
//   TRUSTID_BASE_URL=https://sandbox.trustid.co.uk
//   TRUSTID_API_KEY=...
//   TRUSTID_USERNAME=...
//   TRUSTID_PASSWORD=...
//   TRUSTID_DEVICE_ID=car-movers-api-local
//   TRUSTID_BRANCH_ID=...
//
// Optional:
//   TRUSTID_SMOKE_EMAIL=test@example.com   (defaults below)
//   TRUSTID_SMOKE_NAME=Smoke Test
//   TRUSTID_SMOKE_CALLBACK_URL=https://example.invalid/callback

import { TrustidApiClient, loadTrustidV2ConfigFromEnv } from '../src/lib/adapters/trustid-v2.ts';

async function main() {
  const config = loadTrustidV2ConfigFromEnv();
  const client = new TrustidApiClient(config);

  const email = process.env.TRUSTID_SMOKE_EMAIL?.trim() ?? 'smoke-test@example.com';
  const name = process.env.TRUSTID_SMOKE_NAME?.trim() ?? 'Smoke Test';
  const callbackUrl = process.env.TRUSTID_SMOKE_CALLBACK_URL?.trim() ?? 'https://example.invalid/callback';
  const clientApplicationReference = `smoke-${Date.now()}`;

  console.log('trustid.smoke.createGuestLink.start', {
    base_url: config.baseUrl,
    branch_id: config.branchId,
    email,
    client_application_reference: clientApplicationReference,
  });

  const guestLink = await client.createGuestLink({
    email,
    name,
    clientApplicationReference,
    containerEventCallbackUrl: callbackUrl,
  });

  console.log('trustid.smoke.createGuestLink.success', {
    container_id: guestLink.ContainerId ?? null,
    guest_id: guestLink.GuestId ?? null,
    link_url: guestLink.LinkUrl ?? null,
  });

  if (guestLink.ContainerId) {
    console.log('trustid.smoke.retrieveContainer.start', { container_id: guestLink.ContainerId });
    const container = await client.retrieveDocumentContainer({ containerId: guestLink.ContainerId });
    console.log('trustid.smoke.retrieveContainer.success', {
      container_id: guestLink.ContainerId,
      success: container.Success,
      message: container.Message ?? null,
    });
  }
}

main().catch((error: unknown) => {
  console.error('trustid.smoke.error', {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : null,
  });
  process.exit(1);
});
