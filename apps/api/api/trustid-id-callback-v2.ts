import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  TrustidApiClient,
  TrustidApiError,
  TrustidValidationError,
  MondayTrustidApiClient,
  loadTrustidV2ConfigFromEnv,
  loadMondayTrustidV2ConfigFromEnv,
  idCheckBoard,
  dbsCheckBoard,
  idCheckSignalStatusValues,
  forwardToMake,
  type TrustidClient,
  type MondayTrustidClient,
  type IdCheckBoardConfig,
  type IdCheckStatusValues,
  type SignalStatusValues,
  type RetrieveDocumentContainerResponse,
} from '@car-movers/shared/trustid-v2';

// Temporary: dump raw inbound webhook traffic to make.com for shape discovery.
// Decision on its fate is out of scope for the field-mapping cleanup.
const WEBHOOK_TRAFFIC_DUMP_URL = 'https://hook.eu1.make.com/maz7bx3xhmz815y0i4ao7kjvflbn78dj';

type CreateHandlerOptions = {
  trustidClient: TrustidClient;
  mondayClient: MondayTrustidClient;
  idCheckBoard: IdCheckBoardConfig;
  signalStatusValues: SignalStatusValues;
  webhookTrafficDumpUrl?: string;
  makeComIdWebhookUrl?: string;
  now?: () => Date;
};

export function createHandler(options: CreateHandlerOptions) {
  const trustidClient = options.trustidClient;
  const mondayClient = options.mondayClient;
  const board = options.idCheckBoard;
  const signalStatusValues = options.signalStatusValues;
  const webhookTrafficDumpUrl = options.webhookTrafficDumpUrl;
  const makeComIdWebhookUrl = options.makeComIdWebhookUrl;
  const now = options.now ?? (() => new Date());
  const statusValues = board.statusValues;

  return async function handler(request: VercelRequest, response: VercelResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') return void response.status(200).end();
    if (request.method !== 'POST') return void response.status(405).json({ error: 'Method not allowed' });

    if (webhookTrafficDumpUrl) {
      void fetch(webhookTrafficDumpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handler: 'trustid-id-callback-v2',
          receivedAt: new Date().toISOString(),
          method: request.method,
          query: request.query,
          headers: request.headers,
          body: request.body,
        }),
      }).catch(() => {});
    }

    let mondayItemId: string;
    let containerIdFromWebhook: string | null;
    try {
      const parsed = readCallbackRequest(request);
      mondayItemId = parsed.mondayItemId;
      containerIdFromWebhook = parsed.containerId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID ID callback handling failed';
      const status = error instanceof TrustidValidationError ? 400 : 500;
      console.error('trustid.idCallbackV2.error', { message, status });
      return void response.status(status).json({ error: message });
    }

    console.log('trustid.idCallbackV2.received', {
      monday_item_id: mondayItemId,
      container_id: containerIdFromWebhook,
    });

    const rawPayload = request.body;
    const lastUpdatedAt = now().toISOString();

    // Writes Error outcome to Monday + Make.com forward + responds 200.
    // Used for every "we couldn't determine a verdict" branch.
    const respondWithError = async (params: {
      errorText: string;
      eventName: string;
      eventFields: Record<string, unknown>;
    }) => {
      console.error(params.eventName, params.eventFields);
      await mondayClient.writeIdCheckOutcome(mondayItemId, {
        overallStatus: statusValues.error,
        liveness: null,
        faceMatch: null,
        address: null,
        errorText: params.errorText,
        lastUpdatedAt,
      });
      await forwardToMake(rawPayload, makeComIdWebhookUrl);
      return void response.status(200).json({
        received: true,
        processed: true,
        outcome: 'updated',
        mondayItemId,
        overallStatus: statusValues.error,
      });
    };

    try {
      const item = await mondayClient.fetchIdCheckItem(mondayItemId);

      if (isTerminalStatus(item.status, statusValues)) {
        console.log('trustid.idCallbackV2.alreadyTerminal', {
          monday_item_id: mondayItemId,
          current_status: item.status,
        });
        return void response.status(200).json({
          received: true,
          processed: false,
          outcome: 'already-terminal',
          mondayItemId,
          currentStatus: item.status,
        });
      }

      const containerId = (containerIdFromWebhook ?? item.trustIdContainerId)?.trim() || null;
      if (!containerId) {
        return await respondWithError({
          errorText: 'No container ID in webhook or Monday item',
          eventName: 'trustid.idCallbackV2.missingContainerId',
          eventFields: { monday_item_id: mondayItemId },
        });
      }

      let container: RetrieveDocumentContainerResponse;
      try {
        container = await trustidClient.retrieveDocumentContainer({ containerId });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : 'TrustID document container retrieval failed';
        return await respondWithError({
          errorText,
          eventName: 'trustid.idCallbackV2.retrieveFailed',
          eventFields: { monday_item_id: mondayItemId, container_id: containerId, message: errorText },
        });
      }

      if (!container.Success) {
        const errorText = container.Message?.trim() || 'TrustID document container retrieval failed';
        return await respondWithError({
          errorText,
          eventName: 'trustid.idCallbackV2.retrieveNotOk',
          eventFields: { monday_item_id: mondayItemId, container_id: containerId, message: errorText },
        });
      }

      const extraction = extractSignals(container.Container, signalStatusValues);
      if (extraction.missing.length > 0) {
        const errorText = `Container missing required fields: ${extraction.missing.join(', ')}`;
        return await respondWithError({
          errorText,
          eventName: 'trustid.idCallbackV2.containerMissingFields',
          eventFields: { monday_item_id: mondayItemId, missing: extraction.missing },
        });
      }

      // All three signals present after the guard above.
      const liveness = extraction.liveness as { status: string };
      const faceMatch = extraction.faceMatch as { status: string; errorText: string | null };
      const address = extraction.address as { status: string; errorText: string | null };

      const overallStatus = combineOverallStatus({
        liveness,
        faceMatch,
        address,
        statusValues,
        signalStatusValues,
      });

      await mondayClient.writeIdCheckOutcome(mondayItemId, {
        overallStatus,
        liveness: { status: liveness.status },
        faceMatch: { status: faceMatch.status, errorText: faceMatch.errorText },
        address: { status: address.status, errorText: address.errorText },
        errorText: null,
        lastUpdatedAt,
      });

      console.log('trustid.idCallbackV2.success', {
        monday_item_id: mondayItemId,
        overall_status: overallStatus,
        liveness_status: liveness.status,
        face_match_status: faceMatch.status,
        address_status: address.status,
      });

      await forwardToMake(rawPayload, makeComIdWebhookUrl);

      return void response.status(200).json({
        received: true,
        processed: true,
        outcome: 'updated',
        mondayItemId,
        overallStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TrustID ID callback handling failed';
      const status = error instanceof TrustidApiError ? 502 : 500;
      console.error('trustid.idCallbackV2.error', { message, status });
      return void response.status(status).json({ error: message });
    }
  };
}

function readCallbackRequest(
  request: VercelRequest,
): { mondayItemId: string; containerId: string | null } {
  const body = (request.body ?? {}) as Record<string, unknown>;

  const callback = body.Callback as Record<string, unknown> | undefined;
  const workflowStorage = (callback?.WorkflowStorage ?? []) as Array<{ Key?: unknown; Value?: unknown }>;
  const storage: Record<string, string> = {};
  for (const entry of workflowStorage) {
    const key = typeof entry.Key === 'string' ? entry.Key : null;
    const value = typeof entry.Value === 'string' ? entry.Value : null;
    if (key && value) storage[key] = value;
  }

  const queryItemId = Array.isArray(request.query.mondayItemId)
    ? request.query.mondayItemId[0]
    : request.query.mondayItemId;
  const mondayItemId = (queryItemId ?? storage.ClientApplicationReference)?.trim();
  if (!mondayItemId) {
    throw new TrustidValidationError('Missing mondayItemId (no query string or ClientApplicationReference)');
  }

  const containerId = (storage.ContainerId ?? storage.GuestId)?.trim() || null;
  return { mondayItemId, containerId };
}

type SignalExtractionResult = {
  liveness: { status: string } | null;
  faceMatch: { status: string; errorText: string | null } | null;
  address: { status: string; errorText: string | null } | null;
  missing: string[];
};

function extractSignals(
  container: unknown,
  signalStatusValues: SignalStatusValues,
): SignalExtractionResult {
  const c = (container ?? null) as Record<string, unknown> | null;
  const missing: string[] = [];

  let liveness: { status: string } | null = null;
  let faceMatch: { status: string; errorText: string | null } | null = null;
  let address: { status: string; errorText: string | null } | null = null;

  const livenessRaw = c?.LivenessTestResult;
  if (livenessRaw === null || livenessRaw === undefined) {
    missing.push('LivenessTestResult');
  } else {
    liveness = {
      status:
        livenessRaw === 1 ? signalStatusValues.liveness.pass : signalStatusValues.liveness.fail,
    };
  }

  const documents = (c?.Documents ?? []) as Array<Record<string, unknown>>;
  const firstDoc = documents[0];
  const gdp = (firstDoc?.GeneralDocumentProperties ?? []) as Array<Record<string, unknown>>;
  const photoMatch = gdp.find((p) => p.Name === 'Photo Matches Applicant (TrustId)');
  if (!photoMatch) {
    missing.push('Photo Matches Applicant (TrustId)');
  } else if (photoMatch.ValueUndefined === true) {
    const errorText =
      typeof photoMatch.ErrorMessage === 'string' && photoMatch.ErrorMessage.trim()
        ? photoMatch.ErrorMessage.trim()
        : null;
    faceMatch = { status: signalStatusValues.faceMatch.unsure, errorText };
  } else if (photoMatch.Value === true) {
    faceMatch = { status: signalStatusValues.faceMatch.pass, errorText: null };
  } else {
    const notesRaw = firstDoc?.Notes;
    const errorText =
      typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim() : null;
    faceMatch = { status: signalStatusValues.faceMatch.fail, errorText };
  }

  const validations =
    (c?.DocumentContainerValidationList ?? []) as Array<Record<string, unknown>>;
  const addressEntry = validations.find((v) => v.Name === 'AddressVerification');
  if (!addressEntry) {
    missing.push('AddressVerification');
  } else {
    const detailedResult =
      typeof addressEntry.DetailedResult === 'string' ? addressEntry.DetailedResult.trim() : '';
    if (detailedResult === 'Match' || detailedResult === 'Not Performed') {
      address = { status: signalStatusValues.address.pass, errorText: null };
    } else {
      address = {
        status: signalStatusValues.address.fail,
        errorText: detailedResult || null,
      };
    }
  }

  return { liveness, faceMatch, address, missing };
}

function combineOverallStatus(params: {
  liveness: { status: string };
  faceMatch: { status: string };
  address: { status: string };
  statusValues: IdCheckStatusValues;
  signalStatusValues: SignalStatusValues;
}): string {
  const { liveness, faceMatch, address, statusValues, signalStatusValues } = params;
  if (liveness.status === signalStatusValues.liveness.fail) return statusValues.fail;
  if (faceMatch.status === signalStatusValues.faceMatch.unsure) return statusValues.refer;
  if (faceMatch.status === signalStatusValues.faceMatch.fail) return statusValues.fail;
  if (address.status === signalStatusValues.address.fail) return statusValues.passWithAddressFail;
  return statusValues.pass;
}

function isTerminalStatus(status: string | null, statusValues: IdCheckStatusValues): boolean {
  if (status === null) return false;
  return (
    status === statusValues.pass ||
    status === statusValues.passWithAddressFail ||
    status === statusValues.refer ||
    status === statusValues.fail ||
    status === statusValues.error
  );
}

// Built lazily on first invocation. Reading env at module-top would make
// the file unimportable from test code that doesn't set TRUSTID_* env vars.
let defaultHandler: ReturnType<typeof createHandler> | null = null;
function getDefaultHandler() {
  if (defaultHandler) return defaultHandler;
  defaultHandler = createHandler({
    trustidClient: new TrustidApiClient(loadTrustidV2ConfigFromEnv()),
    mondayClient: new MondayTrustidApiClient(
      loadMondayTrustidV2ConfigFromEnv({ idCheckBoard, dbsCheckBoard }),
    ),
    idCheckBoard,
    signalStatusValues: idCheckSignalStatusValues,
    webhookTrafficDumpUrl: WEBHOOK_TRAFFIC_DUMP_URL,
    makeComIdWebhookUrl: process.env.MAKE_COM_TRUSTID_ID_WEBHOOK_URL?.trim() || undefined,
  });
  return defaultHandler;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  await getDefaultHandler()(request, response);
}
