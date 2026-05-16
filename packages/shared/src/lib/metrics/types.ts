export type LedgerEvent = {
  onboardingId: string;
  status: string;
  prevStatus: string | null;
  ts: number;
};
