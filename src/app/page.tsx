"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ForecastTrendChart } from "@/components/charts/ForecastTrendChart";
import { SentimentByPartyChart } from "@/components/charts/SentimentByPartyChart";
import { IssueSalienceTracker } from "@/components/charts/IssueSalienceTracker";
import { RegionalBreakdown } from "@/components/charts/RegionalBreakdown";
import { ForecastSummaryCard } from "@/components/dashboard/ForecastSummaryCard";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { useLatestForecasts, usePolls } from "@/lib/hooks";
import { MAJOR_PARTIES } from "@/lib/colors";
import type { PollRecord } from "@/lib/types";

const pollColumns: DataTableColumn<PollRecord>[] = [
  { key: "pollster", header: "Pollster" },
  { key: "publishedDate", header: "Published" },
  { key: "partyCode", header: "Party" },
  {
    key: "voteSharePct",
    header: "Vote share",
    align: "right",
    format: (v, row) => `${Number(v).toFixed(1)}%${row.marginOfErrorPct ? ` ±${row.marginOfErrorPct}` : ""}`,
  },
  { key: "sampleSize", header: "n", align: "right", format: (v) => (v ? Number(v).toLocaleString() : "—") },
  {
    key: "houseWeightApplied",
    header: "House weight",
    align: "right",
    format: (v) => Number(v).toFixed(2),
  },
  {
    key: "sourceUrl",
    header: "Source",
    format: (v) =>
      v ? (
        <a href={String(v)} target="_blank" rel="noreferrer" className="underline text-ink hover:text-ink-muted">
          link
        </a>
      ) : (
        "—"
      ),
  },
];

export default function DashboardPage() {
  const { data: forecasts, dataUpdatedAt: forecastUpdatedAt } = useLatestForecasts();
  const { data: polls, dataUpdatedAt: pollsUpdatedAt } = usePolls(15);

  const orderedForecasts = MAJOR_PARTIES.map((code) => forecasts?.find((f) => f.partyCode === code)).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );

  const pollsAsOfIso = pollsUpdatedAt
    ? new Date(pollsUpdatedAt).toISOString()
    : forecastUpdatedAt
      ? new Date(forecastUpdatedAt).toISOString()
      : "";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 space-y-6">
        <section aria-label="Current forecast summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {orderedForecasts.length === 0 && (
            <p className="text-sm text-ink-muted" role="status">
              Loading current forecast…
            </p>
          )}
          {orderedForecasts.map((forecast) => (
            <ForecastSummaryCard key={forecast.partyCode} forecast={forecast} />
          ))}
        </section>

        <ForecastTrendChart />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SentimentByPartyChart />
          <IssueSalienceTracker />
        </div>

        <RegionalBreakdown party="NDC" />

        <DataTable
          title="Published polls (ground-truth anchor)"
          caption="Polls feed the poll-blend baseline; sentiment only adjusts the trend around this anchor — see Methodology."
          columns={pollColumns}
          rows={polls ?? []}
          datasetName="published_polls"
          asOfIso={pollsAsOfIso}
        />
      </main>

      <Footer />
    </div>
  );
}
