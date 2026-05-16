import type { CohortRow, LedgerEvent } from './types.ts';

const TERMINAL_STATUSES = new Set(['Hired', 'Withdrawn', 'Rejected']);
const OFFER_STATUS = 'Additional Details';
const HIRED_STATUS = 'Hired';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeCohortMetrics(events: LedgerEvent[]): CohortRow[] {
  // Group events by onboardingId so we can derive per-candidate facts.
  const byCandidate = new Map<string, LedgerEvent[]>();
  for (const event of events) {
    const list = byCandidate.get(event.onboardingId);
    if (list === undefined) {
      byCandidate.set(event.onboardingId, [event]);
    } else {
      list.push(event);
    }
  }

  // For each candidate compute: cohort month, latest status (=> in-flight/terminal),
  // first-offer ts, first-hired ts. Then bucket into cohorts.
  type CohortBucket = {
    apps: number;
    hired: number;
    offered: number;
    inFlight: number;
    daysToOfferSum: number;
    daysToOfferCount: number;
    daysToHiredSum: number;
    daysToHiredCount: number;
    allTerminal: boolean;
  };
  const buckets = new Map<string, CohortBucket>();

  for (const [, candidateEvents] of byCandidate) {
    // Sort ascending by ts so we can pull earliest/latest/first-offer/first-hired
    // in a single pass. Input may be out-of-order.
    const sorted = candidateEvents.slice().sort((a, b) => a.ts - b.ts);
    const entryTs = sorted[0].ts;
    const latestStatus = sorted[sorted.length - 1].status;

    let firstOfferTs: number | null = null;
    let firstHiredTs: number | null = null;
    for (const e of sorted) {
      if (firstOfferTs === null && e.status === OFFER_STATUS) firstOfferTs = e.ts;
      if (firstHiredTs === null && e.status === HIRED_STATUS) firstHiredTs = e.ts;
      if (firstOfferTs !== null && firstHiredTs !== null) break;
    }

    // YYYY-MM (UTC) of the earliest event.
    const entryDate = new Date(entryTs);
    const month = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, '0')}`;

    let bucket = buckets.get(month);
    if (bucket === undefined) {
      bucket = {
        apps: 0,
        hired: 0,
        offered: 0,
        inFlight: 0,
        daysToOfferSum: 0,
        daysToOfferCount: 0,
        daysToHiredSum: 0,
        daysToHiredCount: 0,
        allTerminal: true,
      };
      buckets.set(month, bucket);
    }

    bucket.apps += 1;
    const isTerminal = TERMINAL_STATUSES.has(latestStatus);
    if (!isTerminal) {
      bucket.inFlight += 1;
      bucket.allTerminal = false;
    }
    if (firstHiredTs !== null) {
      bucket.hired += 1;
      bucket.daysToHiredSum += (firstHiredTs - entryTs) / MS_PER_DAY;
      bucket.daysToHiredCount += 1;
    }
    if (firstOfferTs !== null) {
      bucket.offered += 1;
      bucket.daysToOfferSum += (firstOfferTs - entryTs) / MS_PER_DAY;
      bucket.daysToOfferCount += 1;
    }
  }

  // Emit rows, sorted by month ascending.
  const months = Array.from(buckets.keys()).sort();
  const rows: CohortRow[] = [];
  for (const month of months) {
    const b = buckets.get(month)!;
    rows.push({
      month,
      apps: b.apps,
      pctHired: Math.round((b.hired / b.apps) * 100),
      pctOffered: Math.round((b.offered / b.apps) * 100),
      avgDaysToOffer:
        b.daysToOfferCount === 0
          ? null
          : Math.round((b.daysToOfferSum / b.daysToOfferCount) * 10) / 10,
      avgDaysToHired:
        b.daysToHiredCount === 0
          ? null
          : Math.round((b.daysToHiredSum / b.daysToHiredCount) * 10) / 10,
      inFlight: b.inFlight,
      complete: b.allTerminal,
    });
  }
  return rows;
}
