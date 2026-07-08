"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useForecastHistory, useHistoricalElections } from "@/lib/hooks";
import { MAJOR_PARTIES, partyColour, partyName } from "@/lib/colors";
import { LastUpdated } from "../common/LastUpdated";
import { UncertaintyDisclaimer } from "../common/UncertaintyDisclaimer";
import { ExportCsvButton } from "../common/ExportCsvButton";
import type { ForecastHistory, PartyCode } from "@/lib/types";

/**
 * THE core visualisation of the whole dashboard. Renders point estimate +
 * shaded 95% credible-interval band per party, plus the full run history
 * (not just latest month) so viewers can see the model trend rather than a
 * single jumpy number.
 */

interface ChartRow {
  runDate: string;
  runDateLabel: string;
  [key: string]: string | number | [number, number];
}

function buildChartRows(history: ForecastHistory, parties: PartyCode[]): ChartRow[] {
  const byDate = new Map<string, ChartRow>();
  for (const snap of history) {
    if (!parties.includes(snap.partyCode)) continue;
    const existing = byDate.get(snap.runDate) ?? {
      runDate: snap.runDate,
      runDateLabel: new Date(snap.runDate).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    };
    existing[`${snap.partyCode}_point`] = snap.pointEstimatePct;
    existing[`${snap.partyCode}_range`] = [snap.ciLowerPct, snap.ciUpperPct];
    byDate.set(snap.runDate, existing);
  }
  return Array.from(byDate.values()).sort((a, b) => a.runDate.localeCompare(b.runDate));
}

export function ForecastTrendChart({
  parties = MAJOR_PARTIES,
  months = 24,
}: {
  parties?: PartyCode[];
  months?: number;
}) {
  const { data: history, dataUpdatedAt, isLoading, isError } = useForecastHistory(undefined, months);
  const { data: historicalElections } = useHistoricalElections();

  const rows = useMemo(() => buildChartRows(history ?? [], parties), [history, parties]);

  const reference2024 = historicalElections?.find((h) => h.electionDate === "2024-12-07");

  const exportRows = rows.map((r) => {
    const flat: Record<string, string | number> = { date: r.runDate };
    for (const p of parties) {
      const point = r[`${p}_point`];
      const range = r[`${p}_range`] as [number, number] | undefined;
      flat[`${p}_point_pct`] = typeof point === "number" ? point : "";
      flat[`${p}_ci_lower_pct`] = range ? range[0] : "";
      flat[`${p}_ci_upper_pct`] = range ? range[1] : "";
    }
    return flat;
  });

  const exportAsOfIso = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : "";

  return (
    <section
      aria-labelledby="forecast-trend-heading"
      className="rounded-lg border border-surface-subtle bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 id="forecast-trend-heading" className="text-base font-semibold text-ink">
          Forecast trend
        </h2>
        <ExportCsvButton rows={exportRows} datasetName="forecast_trend" asOfIso={exportAsOfIso} />
      </div>
      <p className="text-xs text-ink-muted mb-3">
        Shaded bands are 95% credible intervals. Never read the solid line without the band around it.
      </p>

      {isLoading && (
        <p className="py-16 text-center text-sm text-ink-muted" role="status">
          Loading forecast history…
        </p>
      )}
      {isError && (
        <p className="py-16 text-center text-sm text-signal-negative" role="alert">
          Could not load forecast history. Try again shortly.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <p className="sr-only">
            Line chart of projected vote share by party from {rows[0]?.runDate ?? "the start of tracking"}{" "}
            to {rows[rows.length - 1]?.runDate ?? "the most recent forecast"}, with shaded 95% credible
            interval bands. Use the Export CSV button for the full underlying data table.
          </p>

          <div className="h-72 sm:h-96" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="runDateLabel" tick={{ fontSize: 12, fill: "#4B5563" }} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12, fill: "#4B5563" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(value: number | [number, number], name: string) =>
                    Array.isArray(value)
                      ? [`${value[0].toFixed(1)}%–${value[1].toFixed(1)}%`, `${name} 95% CI`]
                      : [`${value.toFixed(1)}%`, name]
                  }
                  labelFormatter={(label) => `As of ${label}`}
                />
                <Legend />

                {parties.map((code) => (
                  <Area
                    key={`${code}-range`}
                    type="monotone"
                    dataKey={`${code}_range`}
                    name={`${partyName(code)} (95% CI)`}
                    stroke="none"
                    fill={partyColour(code)}
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    legendType="none"
                  />
                ))}
                {parties.map((code) => (
                  <Line
                    key={`${code}-point`}
                    type="monotone"
                    dataKey={`${code}_point`}
                    name={partyName(code)}
                    stroke={partyColour(code)}
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}

                {reference2024 && (
                  <ReferenceDot
                    x={rows[0]?.runDateLabel}
                    y={reference2024.voteSharePct}
                    r={0}
                    label={{
                      value: `2024 result: ${reference2024.partyCode} ${reference2024.voteSharePct}%`,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: "#6B7280",
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <LastUpdated isoTimestamp={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined} />
      <UncertaintyDisclaimer methodologyHref={process.env.NEXT_PUBLIC_METHODOLOGY_URL ?? "#"} />
    </section>
  );
}
