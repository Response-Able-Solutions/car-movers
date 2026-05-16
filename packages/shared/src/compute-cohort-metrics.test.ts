import test from 'node:test';
import { strict as assert } from 'node:assert';

import { computeCohortMetrics } from './lib/metrics/compute-cohort-metrics.ts';
import type { LedgerEvent } from './lib/metrics/types.ts';

// Helpers for building LedgerEvents at specific UTC dates without polluting the
// module with single-use abstractions. Inlined where useful below.
const ts = (iso: string): number => Date.parse(iso);

test('computeCohortMetrics: empty input returns empty array', () => {
  assert.deepEqual(computeCohortMetrics([]), []);
});

test('computeCohortMetrics: mixed-outcome cohort (hired, withdrawn, in-flight)', () => {
  // Three candidates all entering in 2026-03. One hired, one withdrawn, one
  // still in flight (latest status not terminal).
  const events: LedgerEvent[] = [
    // Candidate A: applied -> additional details -> hired
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-03-02T10:00:00Z') },
    { onboardingId: 'a', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-03-05T10:00:00Z') },
    { onboardingId: 'a', status: 'Hired', prevStatus: 'Additional Details', ts: ts('2026-03-12T10:00:00Z') },
    // Candidate B: applied -> withdrawn (never reached offer)
    { onboardingId: 'b', status: 'Applied', prevStatus: null, ts: ts('2026-03-03T10:00:00Z') },
    { onboardingId: 'b', status: 'Withdrawn', prevStatus: 'Applied', ts: ts('2026-03-08T10:00:00Z') },
    // Candidate C: applied (still in flight, not terminal)
    { onboardingId: 'c', status: 'Applied', prevStatus: null, ts: ts('2026-03-04T10:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.month, '2026-03');
  assert.equal(row.apps, 3);
  assert.equal(row.pctHired, 33); // 1/3 rounded
  assert.equal(row.pctOffered, 33); // 1/3 reached Additional Details
  assert.equal(row.avgDaysToOffer, 3); // A: 5 - 2 = 3 days
  assert.equal(row.avgDaysToHired, 10); // A: 12 - 2 = 10 days
  assert.equal(row.inFlight, 1);
  assert.equal(row.complete, false);
});

test('computeCohortMetrics: all-terminal cohort -> complete=true', () => {
  const events: LedgerEvent[] = [
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-01-01T00:00:00Z') },
    { onboardingId: 'a', status: 'Hired', prevStatus: 'Applied', ts: ts('2026-01-08T00:00:00Z') },
    { onboardingId: 'b', status: 'Applied', prevStatus: null, ts: ts('2026-01-02T00:00:00Z') },
    { onboardingId: 'b', status: 'Rejected', prevStatus: 'Applied', ts: ts('2026-01-05T00:00:00Z') },
    { onboardingId: 'c', status: 'Applied', prevStatus: null, ts: ts('2026-01-03T00:00:00Z') },
    { onboardingId: 'c', status: 'Withdrawn', prevStatus: 'Applied', ts: ts('2026-01-04T00:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].month, '2026-01');
  assert.equal(rows[0].apps, 3);
  assert.equal(rows[0].inFlight, 0);
  assert.equal(rows[0].complete, true);
});

test('computeCohortMetrics: multi-month input bucketed by first event ts, sorted asc', () => {
  const events: LedgerEvent[] = [
    // Candidate A: cohort 2026-02
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-02-15T10:00:00Z') },
    { onboardingId: 'a', status: 'Hired', prevStatus: 'Applied', ts: ts('2026-04-01T10:00:00Z') },
    // Candidate B: cohort 2026-04 (despite event order)
    { onboardingId: 'b', status: 'Applied', prevStatus: null, ts: ts('2026-04-20T10:00:00Z') },
    { onboardingId: 'b', status: 'Hired', prevStatus: 'Applied', ts: ts('2026-04-25T10:00:00Z') },
    // Candidate C: cohort 2026-01
    { onboardingId: 'c', status: 'Applied', prevStatus: null, ts: ts('2026-01-10T10:00:00Z') },
    { onboardingId: 'c', status: 'Withdrawn', prevStatus: 'Applied', ts: ts('2026-02-01T10:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.deepEqual(
    rows.map((r) => r.month),
    ['2026-01', '2026-02', '2026-04'],
  );
  assert.equal(rows[0].apps, 1);
  assert.equal(rows[1].apps, 1);
  assert.equal(rows[2].apps, 1);
});

test('computeCohortMetrics: reached Additional Details but not Hired', () => {
  const events: LedgerEvent[] = [
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-05-01T00:00:00Z') },
    { onboardingId: 'a', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-05-04T00:00:00Z') },
    { onboardingId: 'a', status: 'Withdrawn', prevStatus: 'Additional Details', ts: ts('2026-05-10T00:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pctOffered, 100);
  assert.equal(rows[0].pctHired, 0);
  assert.equal(rows[0].avgDaysToOffer, 3);
  assert.equal(rows[0].avgDaysToHired, null);
  assert.equal(rows[0].inFlight, 0);
  assert.equal(rows[0].complete, true);
});

test('computeCohortMetrics: single hired candidate -> division/rounding 100%', () => {
  const events: LedgerEvent[] = [
    { onboardingId: 'only', status: 'Applied', prevStatus: null, ts: ts('2026-06-01T00:00:00Z') },
    { onboardingId: 'only', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-06-04T12:00:00Z') },
    { onboardingId: 'only', status: 'Hired', prevStatus: 'Additional Details', ts: ts('2026-06-08T00:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].apps, 1);
  assert.equal(rows[0].pctHired, 100);
  assert.equal(rows[0].pctOffered, 100);
  assert.equal(rows[0].avgDaysToOffer, 3.5);
  assert.equal(rows[0].avgDaysToHired, 7);
  assert.equal(rows[0].inFlight, 0);
  assert.equal(rows[0].complete, true);
});

test('computeCohortMetrics: out-of-order events still produce correct cohort + timings', () => {
  // Same candidate, events shuffled. Cohort month = month of earliest ts.
  const events: LedgerEvent[] = [
    { onboardingId: 'a', status: 'Hired', prevStatus: 'Additional Details', ts: ts('2026-07-20T00:00:00Z') },
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-07-01T00:00:00Z') },
    { onboardingId: 'a', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-07-11T00:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].month, '2026-07');
  assert.equal(rows[0].apps, 1);
  assert.equal(rows[0].pctHired, 100);
  assert.equal(rows[0].pctOffered, 100);
  assert.equal(rows[0].avgDaysToOffer, 10);
  assert.equal(rows[0].avgDaysToHired, 19);
  assert.equal(rows[0].complete, true);
});

test('computeCohortMetrics: in-flight candidates excluded from time-based averages', () => {
  // Two candidates, one hired (10d), one still in flight after reaching offer.
  // The in-flight candidate should NOT contribute to avgDaysToHired.
  const events: LedgerEvent[] = [
    { onboardingId: 'a', status: 'Applied', prevStatus: null, ts: ts('2026-08-01T00:00:00Z') },
    { onboardingId: 'a', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-08-05T00:00:00Z') },
    { onboardingId: 'a', status: 'Hired', prevStatus: 'Additional Details', ts: ts('2026-08-11T00:00:00Z') },
    // Candidate B reached offer but no Hired event yet
    { onboardingId: 'b', status: 'Applied', prevStatus: null, ts: ts('2026-08-02T00:00:00Z') },
    { onboardingId: 'b', status: 'Additional Details', prevStatus: 'Applied', ts: ts('2026-08-10T00:00:00Z') },
  ];

  const rows = computeCohortMetrics(events);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].apps, 2);
  assert.equal(rows[0].inFlight, 1);
  assert.equal(rows[0].pctHired, 50);
  assert.equal(rows[0].pctOffered, 100);
  // avgDaysToHired only includes A (10 days), not B
  assert.equal(rows[0].avgDaysToHired, 10);
  // avgDaysToOffer includes both: A=4, B=8 -> avg 6
  assert.equal(rows[0].avgDaysToOffer, 6);
  assert.equal(rows[0].complete, false);
});
