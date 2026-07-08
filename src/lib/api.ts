import type {
  ForecastHistory,
  ForecastSnapshot,
  DailySentimentPoint,
  RegionalSentiment,
  IssueSalience,
  PollRecord,
  HistoricalElectionResult,
  PipelineMeta,
  PartyCode,
} from "./types";

/**
 * Thin fetch client for the backend REST API (docs/api-contract.md). Kept as
 * plain functions rather than a class/SDK — TanStack Query hooks in
 * src/lib/hooks/index.ts wrap these for caching/retry/refetch behaviour, so
 * this layer stays dumb on purpose: one function per endpoint, no state.
 */

// Defaults to a same-origin relative path so the app works unmodified on
// any host/port (localhost:3000 in dev, any Vercel preview URL, etc.) with
// zero required env setup — it resolves to this app's own built-in mock API
// routes under src/app/api/*. Set NEXT_PUBLIC_API_BASE_URL to point at a
// separately-hosted backend once one exists (see .env.example).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${API_BASE_URL}${path}`, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed with status ${res.status}`, res.status, path);
  }
  return res.json() as Promise<T>;
}

/** Latest forecast for every party. GET /forecast/latest */
export function fetchLatestForecasts(): Promise<ForecastSnapshot[]> {
  return getJson<ForecastSnapshot[]>("/forecast/latest");
}

/** Full forecast history for the trend chart. GET /forecast/history */
export function fetchForecastHistory(params?: { party?: PartyCode; months?: number }): Promise<ForecastHistory> {
  return getJson<ForecastHistory>("/forecast/history", { party: params?.party, months: params?.months });
}

/** Rolling-window daily sentiment. GET /sentiment/daily */
export function fetchDailySentiment(params?: {
  entityCode?: string;
  days?: number;
}): Promise<DailySentimentPoint[]> {
  return getJson<DailySentimentPoint[]>("/sentiment/daily", {
    entity_code: params?.entityCode,
    days: params?.days ?? 90,
  });
}

/** Regional breakdown for the latest available day. GET /sentiment/regional */
export function fetchRegionalSentiment(params?: { entityCode?: string }): Promise<RegionalSentiment[]> {
  return getJson<RegionalSentiment[]>("/sentiment/regional", { entity_code: params?.entityCode });
}

/** Top issues by mention volume with net sentiment. GET /issues/salience */
export function fetchIssueSalience(params?: { days?: number }): Promise<IssueSalience[]> {
  return getJson<IssueSalience[]>("/issues/salience", { days: params?.days ?? 30 });
}

/** Published poll ingestion log — the ground-truth anchor. GET /polls */
export function fetchPolls(params?: { limit?: number }): Promise<PollRecord[]> {
  return getJson<PollRecord[]>("/polls", { limit: params?.limit ?? 20 });
}

/** Certified historical results, used as chart reference markers. GET /historical/elections */
export function fetchHistoricalElections(): Promise<HistoricalElectionResult[]> {
  return getJson<HistoricalElectionResult[]>("/historical/elections");
}

/** Pipeline run metadata backing every "Last updated" timestamp. GET /meta/pipeline */
export function fetchPipelineMeta(): Promise<PipelineMeta> {
  return getJson<PipelineMeta>("/meta/pipeline");
}
