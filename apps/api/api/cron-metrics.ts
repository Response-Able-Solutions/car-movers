import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { computeCohortMetrics, type LedgerEvent } from '@car-movers/shared/metrics';

const MONDAY_ENDPOINT = 'https://api.monday.com/v2';

const LEDGER_BOARD_ID = '5094853370';
const LEDGER_COL_STATUS = 'color_mkzh9qgh';
const LEDGER_COL_PREV_STATUS = 'color_mm2hdqcy';
const LEDGER_COL_ONBOARDING_ID = 'text_mm2hw3jp';

const COHORT_BOARD_ID = '5093849234';
const COHORT_COL_MONTH = 'text_mm3d7zk1';
const COHORT_COL_APPS = 'numeric_mm1xqd9g';
const COHORT_COL_PCT_HIRED = 'numeric_mm2526zz';
const COHORT_COL_PCT_OFFERED = 'numeric_mm2h455f';
const COHORT_COL_AVG_DAYS_OFFER = 'numeric_mm3d5f1p';
const COHORT_COL_AVG_DAYS_HIRED = 'numeric_mm3dycpg';
const COHORT_COL_IN_FLIGHT = 'numeric_mm3d587h';
const COHORT_COL_COMPLETE = 'boolean_mm3dxn20';

const PRE_PIPELINE_INDEX = 5;
const PRE_PIPELINE_LABEL = '(pre-pipeline)';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return void response.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('cron.metrics.missingSecret');
    return void response.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  const authHeader = request.headers.authorization ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return void response.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    console.error('cron.metrics.missingMondayToken');
    return void response.status(500).json({ error: 'MONDAY_API_TOKEN not configured' });
  }

  type GqlColumnValue = { id: string; text: string | null; value: string | null };
  type LedgerPullResp = {
    boards: Array<{
      items_page: {
        cursor: string | null;
        items: Array<{ id: string; created_at: string; column_values: GqlColumnValue[] }>;
      };
    }>;
  };
  type BoardItemsResp = {
    boards: Array<{
      items_page: {
        items: Array<{ id: string; column_values: GqlColumnValue[] }>;
      };
    }>;
  };
  type MutationResp = { create_item?: { id: string }; change_multiple_column_values?: { id: string } };

  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(MONDAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token! },
      body: JSON.stringify({ query, variables }),
    });
    const payload = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length) throw new Error(payload.errors[0].message);
    if (!payload.data) throw new Error('Monday response missing data');
    return payload.data;
  }

  try {
    // Pull every ledger row, paginated.
    const events: LedgerEvent[] = [];
    let cursor: string | null = null;
    do {
      const data: LedgerPullResp = await gql<LedgerPullResp>(
        `
          query LedgerPull($boardId: ID!, $cursor: String) {
            boards(ids: [$boardId]) {
              items_page(limit: 100, cursor: $cursor) {
                cursor
                items {
                  id
                  created_at
                  column_values(ids: ["${LEDGER_COL_STATUS}","${LEDGER_COL_PREV_STATUS}","${LEDGER_COL_ONBOARDING_ID}"]) {
                    id text value
                  }
                }
              }
            }
          }
        `,
        { boardId: LEDGER_BOARD_ID, cursor },
      );
      const page = data.boards[0].items_page;
      for (const item of page.items) {
        const cvs: Record<string, { text: string | null; value: string | null }> = {};
        for (const cv of item.column_values) cvs[cv.id] = { text: cv.text, value: cv.value };

        const onboardingId = cvs[LEDGER_COL_ONBOARDING_ID]?.text?.trim();
        if (!onboardingId) continue;

        // Status text from Ledger is authoritative. Empty text + index 5 = pre-pipeline.
        // Empty text with any other index = data anomaly; bucket as "Unset (index N)".
        const statusRaw = cvs[LEDGER_COL_STATUS];
        let status: string;
        if (statusRaw?.text && statusRaw.text.trim().length > 0) {
          status = statusRaw.text.trim().replace(/\s+/g, ' ');
        } else if (statusRaw?.value) {
          let index: number | null = null;
          try {
            const parsed = JSON.parse(statusRaw.value) as { index?: number };
            index = parsed.index ?? null;
          } catch {}
          if (index === PRE_PIPELINE_INDEX) status = PRE_PIPELINE_LABEL;
          else if (index !== null) status = `Unset (index ${index})`;
          else continue;
        } else {
          continue;
        }

        const prevRaw = cvs[LEDGER_COL_PREV_STATUS];
        let prevStatus: string | null = null;
        if (prevRaw?.text && prevRaw.text.trim().length > 0) {
          prevStatus = prevRaw.text.trim().replace(/\s+/g, ' ');
        } else if (prevRaw?.value) {
          try {
            const parsed = JSON.parse(prevRaw.value) as { index?: number };
            if (parsed.index === PRE_PIPELINE_INDEX) prevStatus = PRE_PIPELINE_LABEL;
            else if (parsed.index !== undefined) prevStatus = `Unset (index ${parsed.index})`;
          } catch {}
        }

        events.push({
          onboardingId,
          status,
          prevStatus,
          ts: new Date(item.created_at).getTime(),
        });
      }
      cursor = page.cursor;
    } while (cursor);

    // Load existing Cohort Metrics rows so we can (a) find item ids for upsert
    // and (b) skip recomputing cohorts already marked Complete = true.
    const existingCohort: BoardItemsResp = await gql<BoardItemsResp>(
      `
        query CohortBoard($boardId: ID!) {
          boards(ids: [$boardId]) {
            items_page(limit: 500) {
              items {
                id
                column_values(ids: ["${COHORT_COL_MONTH}","${COHORT_COL_COMPLETE}"]) {
                  id text value
                }
              }
            }
          }
        }
      `,
      { boardId: COHORT_BOARD_ID },
    );
    const cohortItemByMonth = new Map<string, string>();
    const completedMonths = new Set<string>();
    for (const item of existingCohort.boards[0].items_page.items) {
      const cvs: Record<string, { text: string | null; value: string | null }> = {};
      for (const cv of item.column_values) cvs[cv.id] = { text: cv.text, value: cv.value };
      const month = cvs[COHORT_COL_MONTH]?.text?.trim();
      if (!month) continue;
      cohortItemByMonth.set(month, item.id);
      const completeRaw = cvs[COHORT_COL_COMPLETE]?.value;
      if (completeRaw) {
        try {
          const parsed = JSON.parse(completeRaw) as { checked?: string | boolean };
          if (parsed.checked === 'true' || parsed.checked === true) completedMonths.add(month);
        } catch {}
      }
    }

    const cohortRows = computeCohortMetrics(events);

    let cohortUpdated = 0;
    let cohortCreated = 0;
    let cohortSkipped = 0;
    for (const row of cohortRows) {
      if (completedMonths.has(row.month)) {
        cohortSkipped++;
        continue;
      }
      const cv: Record<string, unknown> = {
        [COHORT_COL_MONTH]: row.month,
        [COHORT_COL_APPS]: row.apps,
        [COHORT_COL_PCT_HIRED]: row.pctHired,
        [COHORT_COL_PCT_OFFERED]: row.pctOffered,
        [COHORT_COL_AVG_DAYS_OFFER]: row.avgDaysToOffer ?? '',
        [COHORT_COL_AVG_DAYS_HIRED]: row.avgDaysToHired ?? '',
        [COHORT_COL_IN_FLIGHT]: row.inFlight,
        [COHORT_COL_COMPLETE]: { checked: row.complete ? 'true' : 'false' },
      };
      const existingId = cohortItemByMonth.get(row.month);
      if (existingId) {
        await gql<MutationResp>(
          `
            mutation Update($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
              change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
            }
          `,
          {
            boardId: COHORT_BOARD_ID,
            itemId: existingId,
            columnValues: JSON.stringify(cv),
          },
        );
        cohortUpdated++;
      } else {
        await gql<MutationResp>(
          `
            mutation Create($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
              create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }
            }
          `,
          {
            boardId: COHORT_BOARD_ID,
            itemName: row.month,
            columnValues: JSON.stringify(cv),
          },
        );
        cohortCreated++;
      }
    }

    console.log('cron.metrics.cohort.done', {
      events: events.length,
      cohorts: cohortRows.length,
      created: cohortCreated,
      updated: cohortUpdated,
      skipped_complete: cohortSkipped,
    });

    return void response.status(200).json({
      ok: true,
      events: events.length,
      cohort: {
        rows: cohortRows.length,
        created: cohortCreated,
        updated: cohortUpdated,
        skipped_complete: cohortSkipped,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron metrics run failed';
    console.error('cron.metrics.error', { message });
    return void response.status(500).json({ error: message });
  }
}
