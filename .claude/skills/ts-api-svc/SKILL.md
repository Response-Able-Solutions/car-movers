---
name: ts-api-svc
description: TypeScript API service architecture for car-movers. Use when working in apps/api (Vercel serverless handlers), packages/shared/src/lib/workflows (workflow service classes), or packages/shared/src/lib/adapters (external API clients). Make sure to use this skill whenever the user is adding or changing a Vercel function, an external-API client (Monday/TrustID/Idenfy/etc.), or a workflow class in this repo, even if they don't mention "service" or "API" explicitly.
metadata:
  type: skill
---

# TypeScript API Service Architecture (car-movers)

This is a Yarn-workspaces monorepo. `apps/api` runs on Vercel as serverless functions; `apps/verify-ui` is a Vite + React app; `packages/shared` is the shared TypeScript library both consume. ESM throughout (`"type": "module"`), tests via `node --test --experimental-strip-types`.

## General

- **Simplicity**: avoid premature abstraction, keep services small and obvious
- Don't create unnecessary layers — inline logic when it's simple
- Avoid writing interfaces with only one implementation (an interface earns its keep when both a real and a fake implement it, e.g., adapter clients for testing)
- Validate inputs at the boundary; throw typed errors and let them bubble to the handler
- Don't add error handling, fallbacks, or validation for things that can't happen — trust internal calls
- Parameter objects for any function with >1 logical argument
- Time is an injected dependency, never `new Date()` inline inside workflows

## Logging

Vercel ingests `stdout`/`stderr`. Use `console.log` / `console.error` with a structured object — no logger library:

```ts
console.log('trustid.idInvite.success', {
  monday_item_id: result.mondayItemId,
  trust_id_container_id: result.trustIdContainerId,
  outcome: result.outcome,
});
```

- **Event name**: dotted, lowercase, `<domain>.<action>.<phase>` (e.g., `trustid.idInvite.received`, `trustid.idInvite.success`, `trustid.idInvite.error`).
- **Keys**: snake_case. Easy to grep in Vercel's log viewer.
- Log on entry, on success, and on error — in the handler. Workflows and adapters don't log by default; the handler has all the context already. (Long-running workflows that produce intermediate progress are an exception.)
- Never log secrets, full request bodies, or PII you don't need.

## Service Anatomy

```text
apps/
  api/
    api/                              <- Vercel serverless entry points (one file = one route)
      create-trustid-id-invite.ts
      trustid-id-callback.ts
      verify-driver.ts
packages/
  shared/
    src/
      lib/
        workflows/                    <- one service class per logical domain
          trustid.ts
          monday.ts
          idenfy.ts
        adapters/                     <- one external-API client per file
          trustid.ts
          monday.ts
          idenfy.ts
      *.test.ts                       <- node --test, colocated
      fixtures.ts                     <- test data builders
    package.json                      <- exports map for cross-package imports
```

The handler talks to the world. The workflow holds business logic. The adapter knows one external API. The handler is the only file that imports `@vercel/node` or reads `process.env`. The workflow is the only file with branching/orchestration. The adapter never imports a workflow.

## Entry Point — `apps/api/api/<route>.ts`

Thin Vercel bootstrap. Zero business logic. Module-top construction so the workflow service is built once per cold-start and reused across warm invocations:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Trustid,
  TrustidValidationError,
  type CreateIdInviteRequest,
} from '@car-movers/shared/trustid';
import { TrustidApiClient, loadTrustidConfigFromEnv } from '@car-movers/shared/lib/adapters/trustid';
import { MondayApiClient, loadMondayTrustidConfigFromEnv } from '@car-movers/shared/lib/adapters/monday';

const trustidClient = new TrustidApiClient(loadTrustidConfigFromEnv());
const mondayClient = new MondayApiClient(loadMondayTrustidConfigFromEnv());
const trustid = new Trustid(trustidClient, mondayClient);

function hasValidApiKey(request: VercelRequest): boolean {
  const raw = request.headers['x-api-key'];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!provided) return false;
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) throw new Error('Missing INTERNAL_API_KEY');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readRequestBody(request: VercelRequest): CreateIdInviteRequest {
  const body = request.body as Partial<CreateIdInviteRequest> | undefined;
  const mondayItemId = body?.mondayItemId?.trim();
  if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');
  return { mondayItemId };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (request.method === 'OPTIONS') return void response.status(200).end();
  if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

  try {
    if (!hasValidApiKey(request)) return void response.status(401).json({ error: 'Unauthorized' });
    const body = readRequestBody(request);

    console.log('trustid.idInvite.received', { monday_item_id: body.mondayItemId });
    const result = await trustid.createIdInvite(body);
    console.log('trustid.idInvite.success', {
      monday_item_id: result.mondayItemId,
      outcome: result.outcome,
      trust_id_container_id: result.trustIdContainerId ?? null,
    });

    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const status = error instanceof TrustidValidationError ? 400 : 500;
    console.error('trustid.idInvite.error', { message, status });
    response.status(status).json({ error: message });
  }
}
```

Why module-top construction works on Vercel: each route is its own lambda, the Node process is reused across warm requests, and the workflow class doesn't hold request-scoped state. Cold-start cost of `new Trustid(...)` is negligible. If the lambda is mis-configured (missing env var), the cold-start throws and the first request returns 500 — that's the fail-fast we want.

## Service Class — `packages/shared/src/lib/workflows/<service>.ts`

One class per logical domain (`Trustid`, `Monday`, `Idenfy`). Dependencies injected via constructor. Public methods are the workflow operations; the handler calls one of them per request.

```ts
import type { TrustidClient } from '../adapters/trustid.ts';
import type { MondayTrustidClient, MondayTrustidItem } from '../adapters/monday.ts';

export class TrustidValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustidValidationError';
  }
}

export type CreateIdInviteRequest = {
  mondayItemId: string;
};

export type CreateIdInviteResult =
  | {
      outcome: 'created';
      mondayItemId: string;
      applicantEmail: string;
      trustIdContainerId: string | null;
      inviteCreatedAt: string;
    }
  | {
      outcome: 'blocked';
      mondayItemId: string;
      reason: string;
    };

export class Trustid {
  constructor(
    private trustidClient: TrustidClient,
    private mondayClient: MondayTrustidClient,
    private now: () => Date = () => new Date(),
  ) {}

  public async createIdInvite(request: CreateIdInviteRequest): Promise<CreateIdInviteResult> {
    const mondayItemId = request.mondayItemId?.trim();
    if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');

    const item = await this.mondayClient.fetchTrustidItem(mondayItemId);
    const blockReason = this.duplicateBlockReason(item);
    if (blockReason) {
      await this.mondayClient.updateTrustidItem(item.itemId, {
        status: 'TrustID ID Invite Active',
        errorDetails: blockReason,
      });
      return { outcome: 'blocked', mondayItemId: item.itemId, reason: blockReason };
    }

    const guestLink = await this.trustidClient.createGuestLink({
      email: item.applicantEmail,
      name: item.applicantName,
      clientApplicationReference: item.itemId,
    });
    const inviteCreatedAt = this.now().toISOString();

    await this.mondayClient.updateTrustidItem(item.itemId, {
      status: 'TrustID ID Invite Sent',
      trustIdContainerId: guestLink.ContainerId ?? null,
      inviteCreatedAt,
    });

    return {
      outcome: 'created',
      mondayItemId: item.itemId,
      applicantEmail: item.applicantEmail,
      trustIdContainerId: guestLink.ContainerId ?? null,
      inviteCreatedAt,
    };
  }

  private duplicateBlockReason(item: MondayTrustidItem): string | null {
    // ... business rule
  }
}
```

### Service class guidelines

- One class per logical domain, not per feature. `Trustid` covers ID invites, DBS invites, callbacks — anything that talks to TrustID. Don't split `TrustidId` and `TrustidDbs` into separate classes.
- Constructor takes adapter clients and any cross-cutting deps (`now`, settings if needed).
- Public methods are the workflow operations. They take a request object and return a result. They don't take the adapter clients again — those are on `this`.
- Private methods own internal helpers (validation rules, type conversion, branching helpers). Keep them on the class so they have access to `this.now()` etc. without threading.
- Workflow never reads `process.env`, never throws HTTP status codes, never sets headers.

### Naming

Methods are verbs naming what the *caller* asked for: `createIdInvite`, `processIdCallback`, `getApplicantInterview`. Don't name them after their internal mechanism (`runMondaySync`).

## External API Layer — `packages/shared/src/lib/adapters/<service>.ts`

One client per external service. The class holds config (and session, if applicable). Each public method is **one HTTP call**. Throws a typed error class on non-2xx. Exports an interface alongside the class so workflow code and tests can both type against it.

```ts
const trustIdDefaultBaseUrl = 'https://cloud.trustid.co.uk';

export type TrustidConfig = {
  baseUrl?: string;
  apiKey: string;
  username?: string;
  password?: string;
  deviceId: string;
};

export type CreateGuestLinkRequest = {
  email: string;
  name: string;
  branchId?: string;
  clientApplicationReference?: string;
  sendEmail?: boolean;
};

export type CreateGuestLinkResponse = {
  Success: boolean;
  Message?: string;
  LinkUrl?: string;
  ContainerId?: string;
  GuestId?: string;
};

export type ContainerResponse = {
  Success: boolean;
  Message?: string;
  Container?: unknown;
};

export interface TrustidClient {
  createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse>;
  retrieveContainer(request: { containerId: string }): Promise<ContainerResponse>;
}

export class TrustidApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'TrustidApiError';
  }
}

export class TrustidApiClient implements TrustidClient {
  constructor(private config: TrustidConfig) {}

  async createGuestLink(request: CreateGuestLinkRequest): Promise<CreateGuestLinkResponse> {
    const response = await fetch(`${this.config.baseUrl ?? trustIdDefaultBaseUrl}/api/v1/guest-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
      },
      body: JSON.stringify(request),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new TrustidApiError('TrustID guest link failed', response.status, text);
    }
    return JSON.parse(text) as CreateGuestLinkResponse;
  }

  // ...
}
```

### External API client guidelines

- One method = one HTTP call. If a logical operation needs two HTTP calls (login + actual call), one of them is a private helper, not a second public method.
- First arg to a method is the request payload (typed). For >1 logical parameter, use a parameter object.
- **Mirror the external API's casing** in request/response types. If TrustID uses `ContainerId` and `Success`, keep those exact names. Translation to our domain casing happens in the workflow's type-conversion methods.
- Throw `<Service>ApiError` (or similar) on non-2xx. Don't return `{ ok: false }` shapes — the workflow catches and decides what to do.
- The class owns its config and session/auth state. The workflow doesn't pass `apiKey` per call.

### Naming

`<verb><Noun>` — `createGuestLink`, `fetchItem`, `updateItem`, `retrieveContainer`, `initiateBasicDbsCheck`. The verb describes what the external API does, not what the workflow uses it for.

### Settings

One env-loader function per config, exported alongside the client class:

```ts
function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function readOptionalNumberEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

export function loadTrustidConfigFromEnv(): TrustidConfig {
  return {
    baseUrl: process.env.TRUSTID_BASE_URL?.trim(),
    apiKey: readEnv('TRUSTID_API_KEY'),
    username: readEnv('TRUSTID_USERNAME'),
    password: readEnv('TRUSTID_PASSWORD'),
    deviceId: readEnv('TRUSTID_DEVICE_ID'),
  };
}
```

The handler imports the loader at module top. Missing env throws on cold-start; first request returns 500 — that's correct, fail-fast behavior.

## Type Conversion

Pure functions converting between external API shapes and domain types. Live as private methods on the workflow class (or as exported pure functions in the workflow file when shared across methods). Throw on unknown values:

```ts
private idStatusFromContainer(container: { Status?: string }): IdCheckOutcome {
  switch (container.Status) {
    case 'Pass': return 'passed';
    case 'Fail': return 'failed';
    case 'Review': return 'review';
    case 'Error': return 'error';
    default:
      throw new Error(`unknown TrustID status "${container.Status}"`);
  }
}
```

Failing loud on unknown values catches schema drift early. The handler will translate the throw into a 500; the log will identify the unknown value. That's the right outcome.

## Parameter Objects

Encapsulate >1 logical arg (excluding `this`) in an interface named `<Verb><Entity>Params` or with an inline type:

```ts
async function blockDuplicateInvite(params: {
  item: MondayTrustidItem;
  reason: string;
}): Promise<TrustidIdInviteBlockedResult> {
  // ...
}
```

Two reasons: kills positional-argument bugs at call sites, and adding a field is a non-breaking change.

## Time as an Injected Dependency

Pass `now: () => Date` into the workflow constructor:

```ts
constructor(
  private trustidClient: TrustidClient,
  private mondayClient: MondayTrustidClient,
  private now: () => Date = () => new Date(),
) {}
```

Tests inject a fixed clock: `new Trustid(fakeTrustid, fakeMonday, () => new Date('2026-01-01T00:00:00Z'))`.

## HTTP Error Handling

Map typed errors to status codes **in the handler**. The workflow throws typed errors and doesn't know about HTTP.

```ts
try {
  // workflow call
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  let status = 500;
  if (error instanceof TrustidValidationError) status = 400;
  if (error instanceof TrustidApiError) status = 502; // upstream failure
  console.error('trustid.idInvite.error', { message, status });
  response.status(status).json({ error: message });
}
```

Status code selection — **think from the client's perspective**:

- `400 Bad Request` — malformed input, missing required fields, unknown enum values.
- `401 Unauthorized` — missing or invalid `x-api-key`.
- `404 Not Found` — only when fetching the *primary* entity for the route fails. A `createInvite` route should not return `404` because Monday couldn't find the item — that's a business-rule violation (`409`/`422`).
- `405 Method Not Allowed` — wrong HTTP verb.
- `409 Conflict` / `422 Unprocessable Entity` — business rule violation. "Invite already active" is `409`. "Applicant has no email on file" is `422`.
- `500 Internal Server Error` — unexpected failure on our side.
- `502 Bad Gateway` — an upstream API call we wrap (TrustID, Monday) failed unexpectedly.

A `Create*` route returning `404` is a smell — the client reads "I asked you to create something, you replied not found" and is confused. Use `409`/`422` instead.

Don't sniff error messages in the handler (`if (msg.includes('not found'))`). If you need a different status for a case, add a typed error class.

## Result Types

Workflow methods return a discriminated union for *expected business outcomes* the caller branches on, and throw for *unexpected* errors:

```ts
type CreateIdInviteResult =
  | { outcome: 'created'; mondayItemId: string; trustIdContainerId: string | null; ... }
  | { outcome: 'blocked'; mondayItemId: string; reason: string };
```

The decision rule: if the caller will write `if (result.outcome === 'X') { ... } else { ... }` and meaningfully branch, it belongs in the union. If the caller would just bubble it to an error handler with no special logic, throw.

- Invite created vs invite blocked because one's already active → both are expected outcomes the caller cares about. Union.
- TrustID returned a 503 → unexpected. Throw, let the handler turn it into a 502.
- Validation error (missing field) → throw `TrustidValidationError`. The caller wouldn't have meaningful branching for "field N was missing"; it's a bug at the call site.

The discriminant is always called `outcome` (consistent across the codebase). Each branch's other fields are typed independently, not `<thing> | null` shared across branches — that loses the type system's help.

## Input Validation

Validate at the top of the workflow method. Trim strings, check required fields, check enums:

```ts
public async createIdInvite(request: CreateIdInviteRequest): Promise<CreateIdInviteResult> {
  const mondayItemId = request.mondayItemId?.trim();
  if (!mondayItemId) throw new TrustidValidationError('Missing mondayItemId');
  // ...
}
```

The handler also validates (because Vercel's `request.body` is `unknown`-ish), but the workflow is self-defending. Both layers throw the same typed error class.

Business-rule validation (e.g., "invite already active") is *not* a validation error — that's an expected outcome. Express it via the result union (`{ outcome: 'blocked', reason }`), not a thrown error.

## Testing

Run with `node --test --experimental-strip-types` (configured as `yarn test:shared`). Tests are colocated `*.test.ts` files using Node's built-in test runner; no Jest, no Vitest.

```ts
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { Trustid } from './trustid.ts';
import type { TrustidClient } from '../adapters/trustid.ts';
import type { MondayTrustidClient } from '../adapters/monday.ts';
import { mondayTrustidItem } from '../../fixtures.ts';

test('createIdInvite blocks when invite is still active', async () => {
  const fakeTrustid: TrustidClient = {
    createGuestLink: async () => ({ Success: true, ContainerId: 'c1' }),
    retrieveContainer: async () => ({ Success: true, Container: {} }),
  };
  const fakeMonday: MondayTrustidClient = {
    fetchTrustidItem: async () => mondayTrustidItem({
      inviteCreatedAt: '2025-12-25T00:00:00Z',
      trustIdContainerId: 'existing',
    }),
    updateTrustidItem: async () => undefined,
  };
  const trustid = new Trustid(fakeTrustid, fakeMonday, () => new Date('2026-01-01T00:00:00Z'));

  const result = await trustid.createIdInvite({ mondayItemId: 'x' });

  assert.equal(result.outcome, 'blocked');
  if (result.outcome === 'blocked') {
    assert.match(result.reason, /still active/);
  }
});
```

### Testing rules

- **Test against the workflow class's public methods.** That's the external interface for our code.
- **Fake clients are object literals satisfying the adapter `Client` interface.** No mocking framework, no fake-class files. Inline in the test, override individual methods per case: `{ ...fakeTrustid, createGuestLink: async () => { throw new TrustidApiError('boom', 500, '') } }`.
- **Do NOT test adapter classes in isolation.** Exercise them via workflow tests. (Same reasoning as Eucalyptus's "do not test DAO functions in isolation": if an adapter has no consumer in workflow tests, it's either dead or untested-via-integration.)
- **Do NOT unit-test handlers.** They're too thin to be worth testing in isolation. If a handler grows logic beyond auth/parse/format, push it down into the workflow.
- **100% of public workflow-class methods need happy-path + error-path coverage** (and a test per branch in the result union).
- **Use `fixtures.ts` builders** for entity construction. Builders take a `Partial<T>` and merge over defaults, so each test only declares what's load-bearing for its case.

```ts
// fixtures.ts
export function mondayTrustidItem(overrides: Partial<MondayTrustidItem> = {}): MondayTrustidItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.com',
    status: null,
    trustIdContainerId: null,
    inviteCreatedAt: null,
    ...overrides,
  };
}
```

## Observability

Beyond logs, attach context to whatever observability backend Vercel surfaces. For now: structured `console.log` with snake_case keys is the bar:

```ts
console.log('trustid.idInvite.success', {
  monday_item_id: result.mondayItemId,
  outcome: result.outcome,
  trust_id_container_id: result.trustIdContainerId ?? null,
});
```

Snake_case keys make the logs greppable and consistent across services.

## Imports & ESM

- `"type": "module"` repo-wide. Relative imports use explicit `.ts` extensions: `import { foo } from '../adapters/monday.ts'`.
- Cross-package imports use the `@car-movers/shared/<subpath>` alias declared in `packages/shared/package.json#exports`. Adding a new shared module? **Add the export entry**, otherwise `vercel dev` will fail to resolve at runtime even though TypeScript compiles fine.

## Class field declarations (node strip-types caveat)

Tests run via `node --test --experimental-strip-types`, which does not support TypeScript parameter properties. This will fail at import time with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`:

```ts
class Trustid {
  constructor(private deps: TrustidDeps) {}   // ❌ won't load
}
```

Declare class fields explicitly and assign them in the constructor body:

```ts
class Trustid {
  private deps: TrustidDeps;
  constructor(deps: TrustidDeps) {
    this.deps = deps;
  }
}
```

Same rule applies to `readonly` fields on error classes (`readonly status?: number` shorthand fails — declare the field above, assign below).
