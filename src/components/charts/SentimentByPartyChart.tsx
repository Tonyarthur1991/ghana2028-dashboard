"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDailySentiment } from "@/lib/hooks";
import { partyColour, partyName } from "@/lib/colors";
import { LastUpdated } from "../common/LastUpdated";
import { ExportCsvButton } from "../common/ExportCsvButton";
import type { PartyCode } from "@/lib/types";

const ROLLING_WINDOW_DAYS = 7;

interface PartyAggregate {
  partyCode: PartyCode;
  netSentiment: number;
  mentionVolume: number;
}

function aggregateByParty(rows: { entityCode: string; weightedMeanSentiment: number; mentionVolume: number }[]): PartyAggregate[] {
  const totals = new Map<string, { weightedSum: number; volume: number }>();
  for (const row of rows) {
    const t = totals.get(row.entityCode) ?? { weightedSum: 0, volume: 0 };
    t.weightedSum += row.weightedMeanSentiment * row.mentionVolume;
    t.volume += row.mentionVolume;
    totals.set(row.entityCode, t);
  }
  return Array.from(totals.entries()).map(([code, t]) => ({
    partyCode: code as PartyCode,
    netSentiment: t.volume > 0 ? t.weightedSum / t.volume : 0,
    mentionVolume: t.volume,
  }));
}

export function SentimentByPartyChart() {
  const { data, dataUpdatedAt, isLoading, isError } = useDailySentiment(undefined, ROLLING_WINDOW_DAYS);
  const asOfIso = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : "";

  const partyRows = useMemo(() => {
    const partyOnly = (data ?? []).filter((d) => d.entityType === "party" && d.region === null);
    return aggregateByParty(partyOnly).sort((a, b) => b.mentionVolume - a.mentionVolume);
  }, [data]);

  const maxVolume = Math.max(1, ...partyRows.map((r) => r.mentionVolume));

  return (
    <section
      aria-labelledby="sentiment-party-heading"
      className="rounded-lg border border-surface-subtle bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 id="sentiment-party-heading" className="text-base font-semibold text-ink">
          Net sentiment by party
        </h2>
        <ExportCsvButton
          rows={partyRows.map((r) => ({
            party: r.partyCode,
            net_sentiment: r.netSentiment.toFixed(3),
            mention_volume: r.mentionVolume,
          }))}
          datasetName="sentiment_by_party"
          asOfIso={asOfIso}
        />
      </div>
      <p className="text-xs text-ink-muted mb-3">
        {ROLLING_WINDOW_DAYS}-day volume-weighted average. Bar opacity reflects mention volume (salience),
        not just direction.
      </p>

      {isLoading && <p className="py-12 text-center text-sm text-ink-muted" role="status">Loading…</p>}
      {isError && (
        <p className="py-12 text-center text-sm text-signal-negative" role="alert">
          Could not load sentiment data.
        </p>
      )}

      {!isLoading && !isError && (
        <div className="h-64" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={partyRows} layout="vertical" margin={{ left: 12, right: 24 }}>
              <XAxis
                type="number"
                domain={[-1, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{ fontSize: 12, fill: "#4B5563" }}
              />
              <YAxis
                type="category"
                dataKey="partyCode"
                width={48}
                tick={{ fontSize: 13, fill: "#111827" }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine x={0} stroke="#9CA3AF" />
              <Tooltip
                formatter={(value: number, _name, entry) => [
                  `${value.toFixed(2)} (${(entry.payload as PartyAggregate).mentionVolume.toLocaleString()} mentions)`,
                  "Net sentiment",
                ]}
                labelFormatter={(label) => partyName(label as string)}
              />
              <Bar dataKey="netSentiment" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {partyRows.map((row) => (
                  <Cell
                    key={row.partyCode}
                    fill={partyColour(row.partyCode)}
                    fillOpacity={Math.max(0.35, row.mentionVolume / maxVolume)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <LastUpdated isoTimestamp={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined} />
    </section>
  );
}
