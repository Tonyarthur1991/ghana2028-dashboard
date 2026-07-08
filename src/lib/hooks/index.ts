"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchDailySentiment,
  fetchForecastHistory,
  fetchHistoricalElections,
  fetchIssueSalience,
  fetchLatestForecasts,
  fetchPipelineMeta,
  fetchPolls,
  fetchRegionalSentiment,
} from "../api";
import type { PartyCode } from "../types";

/**
 * Hard floor on refresh frequency, enforced in code — not just documented.
 * Spec constraint: "No auto-refresh faster than 5 minutes (respect API rate
 * limits and avoid appearing to manipulate via rapid updates)." Even if
 * NEXT_PUBLIC_REFRESH_INTERVAL_MS is misconfigured to something lower, this
 * Math.max floor prevents the dashboard from ever polling faster than 5 min.
 */
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const configuredInterval = Number(process.env.NEXT_PUBLIC_REFRESH_INTERVAL_MS ?? FIVE_MINUTES_MS);
export const REFRESH_INTERVAL_MS = Math.max(configuredInterval, FIVE_MINUTES_MS);

export function useLatestForecasts() {
  return useQuery({
    queryKey: ["forecast", "latest"],
    queryFn: fetchLatestForecasts,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

export function useForecastHistory(party?: PartyCode, months = 24) {
  return useQuery({
    queryKey: ["forecast", "history", party ?? "ALL", months],
    queryFn: () => fetchForecastHistory({ party, months }),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

export function useDailySentiment(entityCode?: string, days = 90) {
  return useQuery({
    queryKey: ["sentiment", "daily", entityCode ?? "ALL", days],
    queryFn: () => fetchDailySentiment({ entityCode, days }),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
    // 90-day high-frequency series can be a few thousand points across
    // parties/regions — keep it in cache across component remounts (e.g.
    // switching dashboard tabs) rather than refetching every mount.
    gcTime: 30 * 60 * 1000,
  });
}

export function useRegionalSentiment(entityCode?: string) {
  return useQuery({
    queryKey: ["sentiment", "regional", entityCode ?? "ALL"],
    queryFn: () => fetchRegionalSentiment({ entityCode }),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

export function useIssueSalience(days = 30) {
  return useQuery({
    queryKey: ["issues", "salience", days],
    queryFn: () => fetchIssueSalience({ days }),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

export function usePolls(limit = 20) {
  return useQuery({
    queryKey: ["polls", limit],
    queryFn: () => fetchPolls({ limit }),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

/** Historical certified results change essentially never — long staleTime,
 * no polling interval needed. */
export function useHistoricalElections() {
  return useQuery({
    queryKey: ["historical", "elections"],
    queryFn: fetchHistoricalElections,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/** Backs every "Last updated" timestamp in the UI. Polls on the same floor
 * as the data itself so the timestamp never implies fresher data than what's
 * actually rendered. */
export function usePipelineMeta() {
  return useQuery({
    queryKey: ["meta", "pipeline"],
    queryFn: fetchPipelineMeta,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS,
  });
}
