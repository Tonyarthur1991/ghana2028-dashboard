"use client";

import { csvFilename, downloadCsv } from "@/lib/csvExport";

type CsvRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Shared "Download CSV" control used by every chart/table. Spec transparency
 * requirement: "Provide CSV export for all displayed data tables." This
 * button doubles as an accessibility affordance — it's the reliable,
 * assistive-tech-friendly alternative to reading data out of an SVG chart.
 */
export function ExportCsvButton({
  rows,
  datasetName,
  asOfIso,
}: {
  rows: CsvRow[];
  datasetName: string;
  asOfIso: string;
}) {
  const disabled = rows.length === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => downloadCsv(rows, csvFilename(datasetName, asOfIso))}
      className="inline-flex items-center gap-1 rounded-md border border-surface-subtle px-2.5 py-1.5
                 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink
                 disabled:cursor-not-allowed disabled:opacity-40
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={`Download ${datasetName.replace(/_/g, " ")} data as CSV`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Export CSV
    </button>
  );
}
