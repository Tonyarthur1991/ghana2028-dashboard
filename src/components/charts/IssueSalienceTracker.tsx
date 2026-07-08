"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIssueSalience } from "@/lib/hooks";
import { sentimentColour } from "@/lib/colors";
import { LastUpdated } from "../common/LastUpdated";
import { ExportCsvButton } from "../common/ExportCsvButton";

const TREND_ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

/**
 * Top issues by mention volume, bar colour encodes net sentiment (not
 * party) — issues are not party property, so party colours would be
 * misleading here.
 */
export function IssueSalienceTracker({ days = 30 }: { days?: number }) {
  const { data, dataUpdatedAt, isLoading, isError } = useIssueSalience(days);
  const rows = (data ?? []).slice(0, 8);
  const asOfIso = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : "";

  return (
    <section
      aria-labelledby="issue-salience-heading"
      className="rounded-lg border border-surface-subtle bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 id="issue-salience-heading" className="text-base font-semibold text-ink">
          Issue salience ({days}-day)
        </h2>
        <ExportCsvButton
          rows={rows.map((r) => ({
            issue: r.label,
            mention_volume: r.mentionVolume,
            net_sentiment: r.netSentiment.toFixed(3),
            trend_vs_prior_period: r.trendVsPriorPeriod,
          }))}
          datasetName="issue_salience"
          asOfIso={asOfIso}
        />
      </div>
      <p className="text-xs text-ink-muted mb-3">
        Bar length = mention volume. Colour = net sentiment about the issue (not any party).
      </p>

      {isLoading && <p className="py-12 text-center text-sm text-ink-muted" role="status">Loading…</p>}
      {isError && (
        <p className="py-12 text-center text-sm text-signal-negative" role="alert">
          Could not load issue data.
        </p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-muted">No issue data for this period yet.</p>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="h-72" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 48 }}>
              <XAxis type="number" tick={{ fontSize: 12, fill: "#4B5563" }} />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tick={{ fontSize: 12, fill: "#111827" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number, name, entry) => {
                  const trend = (entry.payload as { trendVsPriorPeriod: string }).trendVsPriorPeriod;
                  return [`${value.toLocaleString()} mentions (${TREND_ARROW[trend]} vs prior period)`, name];
                }}
              />
              <Bar dataKey="mentionVolume" name="Mentions" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.issueCode} fill={sentimentColour(row.netSentiment)} />
                ))}
                <LabelList
                  dataKey="trendVsPriorPeriod"
                  position="right"
                  formatter={(value: string) => TREND_ARROW[value] ?? ""}
                  className="fill-ink-muted text-xs"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <LastUpdated isoTimestamp={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined} />
    </section>
  );
}
