"use client";

import { useMemo, useState } from "react";
import { useRegionalSentiment } from "@/lib/hooks";
import { MAJOR_PARTIES, confidenceOpacity, partyName, sentimentColour } from "@/lib/colors";
import { LastUpdated } from "../common/LastUpdated";
import { ExportCsvButton } from "../common/ExportCsvButton";
import type { PartyCode, RegionConfidence } from "@/lib/types";

const CONFIDENCE_LABEL: Record<RegionConfidence, string> = {
  high: "High confidence",
  low: "Low confidence — small sample",
  insufficient_data: "Insufficient data",
};

/**
 * Regional breakdown, deliberately rendered as a GRID of region cells
 * rather than a geographic SVG map of Ghana. Two reasons: (1) an
 * inaccurately-drawn hand-built map risks misrepresenting regional
 * boundaries; (2) a grid is fully keyboard-navigable and screen-reader
 * friendly by default.
 */
export function RegionalBreakdown({ party: initialParty = "NDC" as PartyCode }: { party?: PartyCode }) {
  const [party, setParty] = useState<PartyCode>(initialParty);
  const { data, dataUpdatedAt, isLoading, isError } = useRegionalSentiment(party);
  const [sortBy, setSortBy] = useState<"volume" | "alphabetical">("volume");
  const asOfIso = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : "";

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    if (sortBy === "volume") {
      list.sort((a, b) => b.mentionVolume - a.mentionVolume);
    } else {
      list.sort((a, b) => a.region.localeCompare(b.region));
    }
    return list;
  }, [data, sortBy]);

  return (
    <section
      aria-labelledby="regional-breakdown-heading"
      className="rounded-lg border border-surface-subtle bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 id="regional-breakdown-heading" className="text-base font-semibold text-ink">
          Regional breakdown — {party} ({partyName(party)})
        </h2>
        <ExportCsvButton
          rows={rows.map((r) => ({
            region: r.region,
            party,
            net_sentiment: r.weightedMeanSentiment.toFixed(3),
            mention_volume: r.mentionVolume,
            confidence: r.confidence,
          }))}
          datasetName={`regional_breakdown_${party}`}
          asOfIso={asOfIso}
        />
      </div>
      <p className="text-xs text-ink-muted mb-3">
        Best-effort inference from declared location and language cues. Greater Accra and Ashanti
        typically dominate sample size — treat sparsely-populated regions&apos; figures with caution.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-ink-muted" id="party-label">Party:</span>
          <div role="group" aria-labelledby="party-label" className="flex gap-1">
            {MAJOR_PARTIES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setParty(code)}
                aria-pressed={party === code}
                className={`rounded px-2 py-1 border ${party === code ? "border-ink bg-surface-subtle font-medium" : "border-surface-subtle"}`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-muted" id="sort-label">Sort by:</span>
          <div role="group" aria-labelledby="sort-label" className="flex gap-1">
            <button
              type="button"
              onClick={() => setSortBy("volume")}
              aria-pressed={sortBy === "volume"}
              className={`rounded px-2 py-1 border ${sortBy === "volume" ? "border-ink bg-surface-subtle font-medium" : "border-surface-subtle"}`}
            >
              Mention volume
            </button>
            <button
              type="button"
              onClick={() => setSortBy("alphabetical")}
              aria-pressed={sortBy === "alphabetical"}
              className={`rounded px-2 py-1 border ${sortBy === "alphabetical" ? "border-ink bg-surface-subtle font-medium" : "border-surface-subtle"}`}
            >
              Alphabetical
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p className="py-12 text-center text-sm text-ink-muted" role="status">Loading…</p>}
      {isError && (
        <p className="py-12 text-center text-sm text-signal-negative" role="alert">
          Could not load regional data.
        </p>
      )}

      {!isLoading && !isError && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="list">
          {rows.map((r) => (
            <li key={r.region}>
              <div
                className="rounded-md border border-surface-subtle p-3 h-full"
                style={{
                  backgroundColor: sentimentColour(r.weightedMeanSentiment),
                  opacity: confidenceOpacity(r.confidence),
                }}
              >
                <p className="text-xs font-semibold text-white drop-shadow-sm">{r.region}</p>
                <p className="text-lg font-bold text-white drop-shadow-sm">
                  {r.weightedMeanSentiment >= 0 ? "+" : ""}
                  {r.weightedMeanSentiment.toFixed(2)}
                </p>
                <p className="text-[11px] text-white/90">{r.mentionVolume.toLocaleString()} mentions</p>
                <p className="text-[11px] font-medium text-white/95 mt-1">{CONFIDENCE_LABEL[r.confidence]}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <LastUpdated isoTimestamp={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined} />
      </div>
    </section>
  );
}
