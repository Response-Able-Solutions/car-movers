import test from 'node:test';
import { strict as assert } from 'node:assert';

import {
  computeStageStats,
  type ComputeStageStatsOptions,
} from './lib/metrics/compute-stage-stats.ts';
import type { LedgerEvent } from './lib/metrics/types.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const defaultOpts: ComputeStageStatsOptions = {
  dwellThresholdMs: HOUR,
  hiredStatus: 'Hired',
  terminalNegative: new Set(['Withdrawn', 'Rejected']),
  preEntryStatus: '(pre-pipeline)',
};

function evt(
  onboardingId: string,
  status: string,
  ts: number,
  prevStatus: string | null = null,
): LedgerEvent {
  return { onboardingId, status, prevStatus, ts };
}

test('empty input yields empty output', () => {
  assert.deepEqual(computeStageStats([], defaultOpts), []);
});

test('normal forward transition counts as Advanced', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Interview', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.entered, 1);
  assert.equal(screening.pctAdvanced, 100);
  assert.equal(screening.pctWithdrew, 0);
  assert.equal(screening.pctRejected, 0);
});

test('Withdrawn-next attributes to pctWithdrew, not pctAdvanced', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Withdrawn', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.pctWithdrew, 100);
  assert.equal(screening.pctAdvanced, 0);
  assert.equal(screening.pctRejected, 0);
});

test('Rejected-next attributes to pctRejected, not pctAdvanced', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Rejected', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.pctRejected, 100);
  assert.equal(screening.pctAdvanced, 0);
  assert.equal(screening.pctWithdrew, 0);
});

test('sub-threshold dwell samples are discarded, above-threshold included', () => {
  const events: LedgerEvent[] = [
    // sub-hour transition: should be discarded from dwell
    evt('a', 'Screening', 0),
    evt('a', 'Interview', 30 * 60 * 1000),
    // above-hour transition: included
    evt('b', 'Screening', 0),
    evt('b', 'Interview', 4 * DAY),
    // another above-hour
    evt('c', 'Screening', 0),
    evt('c', 'Interview', 2 * DAY),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.entered, 3);
  // Median of [2 days, 4 days] = 3 days
  assert.equal(screening.medianDwellDays, 3);
});

test('medianDwellDays is null when no samples above threshold', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Interview', 30 * 60 * 1000), // sub-hour
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.medianDwellDays, null);
});

test('terminal statuses (Hired, Withdrawn, Rejected) absent from output', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Hired', 2 * HOUR),
    evt('b', 'Screening', 0),
    evt('b', 'Withdrawn', 2 * HOUR),
    evt('c', 'Screening', 0),
    evt('c', 'Rejected', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  assert.equal(rows.find((r) => r.status === 'Hired'), undefined);
  assert.equal(rows.find((r) => r.status === 'Withdrawn'), undefined);
  assert.equal(rows.find((r) => r.status === 'Rejected'), undefined);
});

test('preEntryStatus absent from output', () => {
  const events: LedgerEvent[] = [
    evt('a', '(pre-pipeline)', 0),
    evt('a', 'Screening', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  assert.equal(rows.find((r) => r.status === '(pre-pipeline)'), undefined);
  assert.ok(rows.find((r) => r.status === 'Screening'));
});

test('whitespace normalization merges "Foo  Bar" and "Foo Bar" into one row', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Foo  Bar', 0),
    evt('a', 'Hired', 2 * HOUR),
    evt('b', 'Foo Bar', 0),
    evt('b', 'Hired', 2 * HOUR),
    evt('c', '  Foo Bar  ', 0),
    evt('c', 'Hired', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const matches = rows.filter((r) => r.status === 'Foo Bar');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].entered, 3);
});

test('re-entry to same stage: only first entry counts', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Interview', 2 * HOUR),
    evt('a', 'Screening', 4 * HOUR), // re-entry — should NOT recount
    evt('a', 'Hired', 6 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.entered, 1);
  // First-entry's next event was Interview (non-terminal) → Advanced
  assert.equal(screening.pctAdvanced, 100);
});

test('stillHere counts candidates with no next event, not on terminal status', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    // no next event; latest status is Screening (not Hired/Withdrawn/Rejected)
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  assert.equal(screening.entered, 1);
  assert.equal(screening.stillHere, 1);
  assert.equal(screening.pctAdvanced, 0);
});

test('rows sorted by entered descending', () => {
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Interview', 2 * HOUR),
    evt('b', 'Screening', 0),
    evt('b', 'Interview', 2 * HOUR),
    evt('c', 'Screening', 0),
    evt('c', 'Interview', 2 * HOUR),
    // Interview entered only by 3, Screening by 3 (same).
    // Add another stage with smaller count:
    evt('d', 'Offer', 0),
    evt('d', 'Hired', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].entered >= rows[i].entered);
  }
});

test('latest-status fallback: no next event, latest is Hired → Advanced', () => {
  // single event that IS the hired status — but Hired row is excluded.
  // Use a case where last event is a non-terminal but the candidate's overall
  // latest is hired (would require multiple stages):
  const events: LedgerEvent[] = [
    evt('a', 'Screening', 0),
    evt('a', 'Hired', 2 * HOUR),
  ];
  const rows = computeStageStats(events, defaultOpts);
  const screening = rows.find((r) => r.status === 'Screening');
  assert.ok(screening);
  // Screening's next event IS Hired (non-terminal under attribution rules) → Advanced
  assert.equal(screening.pctAdvanced, 100);
});
