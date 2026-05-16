export type LedgerEvent = {
  onboardingId: string;
  status: string;
  prevStatus: string | null;
  ts: number;
};

export type CohortRow = {
  month: string;
  apps: number;
  pctHired: number;
  pctOffered: number;
  avgDaysToOffer: number | null;
  avgDaysToHired: number | null;
  inFlight: number;
  complete: boolean;
};
