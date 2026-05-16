export type LedgerEvent = {
  onboardingId: string;
  status: string;
  prevStatus: string | null;
  ts: number; // epoch ms
};

export type CohortRow = {
  month: string; // YYYY-MM in UTC
  apps: number;
  pctHired: number; // 0-100, integer
  pctOffered: number; // 0-100, integer
  avgDaysToOffer: number | null; // null if no candidate reached offer
  avgDaysToHired: number | null; // null if no one hired
  inFlight: number;
  complete: boolean; // true iff every candidate in the cohort is at a terminal status
};
