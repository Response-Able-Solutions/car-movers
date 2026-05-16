import type { LedgerEvent } from './types.ts';

export type StageRow = {
  status: string;
  entered: number;
  pctAdvanced: number;
  pctWithdrew: number;
  pctRejected: number;
  stillHere: number;
  medianDwellDays: number | null;
};

export type ComputeStageStatsOptions = {
  dwellThresholdMs: number;
  hiredStatus: string;
  terminalNegative: ReadonlySet<string>;
  preEntryStatus: string;
};

export function computeStageStats(
  events: LedgerEvent[],
  opts: ComputeStageStatsOptions,
): StageRow[] {
  // Normalize comparison constants (trim + collapse internal whitespace).
  const hired = opts.hiredStatus.trim().replace(/\s+/g, ' ');
  const preEntry = opts.preEntryStatus.trim().replace(/\s+/g, ' ');
  const terminal = new Set<string>();
  for (const s of opts.terminalNegative) terminal.add(s.trim().replace(/\s+/g, ' '));
  // The PRD distinguishes Withdrew vs Rejected by canonical string equality.
  const withdrewName = terminal.has('Withdrawn') ? 'Withdrawn' : null;
  const rejectedName = terminal.has('Rejected') ? 'Rejected' : null;

  // Normalize event statuses up front, then group by candidate, sorted by ts asc.
  const normalized = events.map((e) => ({
    onboardingId: e.onboardingId,
    status: e.status.trim().replace(/\s+/g, ' '),
    ts: e.ts,
  }));
  const byCandidate = new Map<string, Array<{ status: string; ts: number }>>();
  for (const e of normalized) {
    let arr = byCandidate.get(e.onboardingId);
    if (!arr) {
      arr = [];
      byCandidate.set(e.onboardingId, arr);
    }
    arr.push({ status: e.status, ts: e.ts });
  }
  for (const arr of byCandidate.values()) arr.sort((a, b) => a.ts - b.ts);

  // Per-stage accumulators.
  type Acc = {
    entered: number;
    advanced: number;
    withdrew: number;
    rejected: number;
    stillHere: number;
    dwells: number[];
  };
  const stages = new Map<string, Acc>();
  const getStage = (status: string): Acc => {
    let s = stages.get(status);
    if (!s) {
      s = { entered: 0, advanced: 0, withdrew: 0, rejected: 0, stillHere: 0, dwells: [] };
      stages.set(status, s);
    }
    return s;
  };

  for (const arr of byCandidate.values()) {
    if (arr.length === 0) continue;
    const latestStatus = arr[arr.length - 1].status;
    const seen = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      if (seen.has(cur.status)) continue;
      seen.add(cur.status);
      const stage = getStage(cur.status);
      stage.entered += 1;

      const next = i + 1 < arr.length ? arr[i + 1] : null;
      if (next) {
        if (withdrewName !== null && next.status === withdrewName) stage.withdrew += 1;
        else if (rejectedName !== null && next.status === rejectedName) stage.rejected += 1;
        else stage.advanced += 1;
        const dwell = next.ts - cur.ts;
        if (dwell >= opts.dwellThresholdMs) stage.dwells.push(dwell);
      } else {
        if (latestStatus === hired) stage.advanced += 1;
        else if (withdrewName !== null && latestStatus === withdrewName) stage.withdrew += 1;
        else if (rejectedName !== null && latestStatus === rejectedName) stage.rejected += 1;
        else stage.stillHere += 1;
      }
    }
  }

  const rows: StageRow[] = [];
  for (const [status, s] of stages) {
    if (status === hired) continue;
    if (terminal.has(status)) continue;
    if (status === preEntry) continue;

    // Median dwell in days (inline).
    let medianDwellDays: number | null = null;
    if (s.dwells.length > 0) {
      const sorted = [...s.dwells].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const medianMs = sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
      medianDwellDays = medianMs / (1000 * 60 * 60 * 24);
    }

    const denom = s.entered;
    rows.push({
      status,
      entered: s.entered,
      pctAdvanced: denom > 0 ? Math.round((s.advanced / denom) * 100) : 0,
      pctWithdrew: denom > 0 ? Math.round((s.withdrew / denom) * 100) : 0,
      pctRejected: denom > 0 ? Math.round((s.rejected / denom) * 100) : 0,
      stillHere: s.stillHere,
      medianDwellDays,
    });
  }

  rows.sort((a, b) => b.entered - a.entered);
  return rows;
}
