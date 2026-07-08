/**
 * TypeScript mirror of the backend API contract (docs/api-contract.md),
 * which itself mirrors the TimescaleDB schema in the ghana2028forecast
 * backend repo (db/schema.sql: forecast_runs, daily_sentiment, poll_results,
 * historical_elections). Keep these two files in sync manually — there is
 * no shared schema codegen in Phase 0, that's a Phase 2+ nice-to-have.
 */

export type PartyCode = "NDC" | "NPP" | "CPP" | "GUM" | "PNC" | "LPG" | "APC" | "PPP";

export interface PartyMeta {
  code: PartyCode;
  fullName: string;
  /** Neutral palette hex — deliberately NOT the party's real brand colour.
   * See tailwind.config.ts comment for the rationale. */
  colourHex: string;
}

/** One party's current forecast. Never render point_estimate without the CI
 * — every consumer of this type must show ciLowerPct/ciUpperPct alongside
 * pointEstimatePct. This is enforced by convention (ForecastSummaryCard and
 * ForecastTrendChart both always render the band), not by the type system,
 * since TS can't force "always render together." */
export interface ForecastSnapshot {
  runDate: string; // ISO date, e.g. "2027-03-01"
  modelVersion: string;
  partyCode: PartyCode;
  pointEstimatePct: number;
  ciLowerPct: number;
  ciUpperPct: number;
  ciLevel: number; // e.g. 0.95
  pollBlendInput: number;
  sentimentDeltaInput: number;
  betaUsed: number;
  /** Incumbency-weighted issue-accountability adjustment — see
   * ghana2028forecast/forecasting/transfer_function.py module docstring.
   * Defaults to 0 (inert) until issueGammaUsed is backtested and set
   * non-zero in settings.yaml; both fields are always present so the UI can
   * show "not yet active" rather than silently omitting the term. */
  issueAdjustmentInput: number;
  issueGammaUsed: number;
  nPollsUsed: number;
  nMentionsUsed: number;
  wasPublished: boolean;
  anomalyFlagged: boolean;
}

/** Time series of ForecastSnapshot for the trend chart — the full history,
 * not just the latest month, per spec: "followers need to see the model
 * isn't jumping around arbitrarily." */
export type ForecastHistory = ForecastSnapshot[];

export interface DailySentimentPoint {
  day: string; // ISO date
  entityType: "party" | "candidate" | "issue";
  entityCode: string;
  weightedMeanSentiment: number; // [-1, 1]
  mentionVolume: number;
  shareOfVoice: number | null; // fraction of that day's total mentions
  region: string | null; // null = national aggregate
  sourcePlatformMix: Record<string, number> | null; // e.g. { x: 0.7, facebook: 0.2, news: 0.1 }
}

/** Regional sentiment carries an explicit confidence tier because the
 * underlying sample is small and urban-skewed (spec Component 2: "publish
 * regional breakdowns with an explicit low-confidence caveat... do not
 * present regional splits with false precision"). The dashboard must render
 * this tier visibly, not just in a tooltip. */
export type RegionConfidence = "high" | "low" | "insufficient_data";

export interface RegionalSentiment {
  region: string;
  entityCode: string;
  weightedMeanSentiment: number;
  mentionVolume: number;
  confidence: RegionConfidence;
}

export interface IssueSalience {
  issueCode: string;
  label: string;
  mentionVolume: number;
  netSentiment: number; // [-1, 1]
  trendVsPriorPeriod: "up" | "down" | "flat";
}

export interface PollRecord {
  id: number;
  pollster: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  publishedDate: string;
  sampleSize: number | null;
  partyCode: PartyCode;
  voteSharePct: number;
  marginOfErrorPct: number | null;
  sourceUrl: string;
  houseWeightApplied: number;
}

export interface HistoricalElectionResult {
  electionDate: string;
  partyCode: PartyCode;
  voteSharePct: number;
  seatsWon: number | null;
  turnoutPct: number | null;
}

/** Pipeline run metadata — backs every "Last updated" timestamp on the
 * dashboard (hard constraint from the spec: every visualisation must show
 * one). Distinct from modelVersion: dataAsOf can move daily even when
 * modelVersion (the transfer function itself) hasn't changed. */
export interface PipelineMeta {
  dataAsOf: string; // ISO datetime — when ingestion last completed
  modelVersion: string;
  nextScheduledRun: string | null;
  methodologyUrl: string;
  environment: "development" | "staging" | "production";
}

/** Generic wrapper so every hook can surface the same "when did this load"
 * signal without repeating it per-endpoint. */
export interface ApiEnvelope<T> {
  data: T;
  fetchedAt: string; // ISO datetime, set client-side on receipt
}
