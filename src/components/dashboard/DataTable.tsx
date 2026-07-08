"use client";

import type { ReactNode } from "react";
import { ExportCsvButton } from "../common/ExportCsvButton";
import { LastUpdated } from "../common/LastUpdated";

export interface DataTableColumn<T> {
  key: keyof T;
  header: string;
  align?: "left" | "right";
  format?: (value: T[keyof T], row: T) => ReactNode;
}

/**
 * Generic, accessible data table with a caption, proper th scope, and a
 * CSV export action.
 */
export function DataTable<T extends object>(props: {
  title: string;
  caption?: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  datasetName: string;
  asOfIso: string;
}) {
  const { title, caption, columns, rows, datasetName, asOfIso } = props;
  const exportRows = rows as unknown as Record<string, string | number | boolean | null | undefined>[];

  return (
    <section
      aria-labelledby={`table-${datasetName}-heading`}
      className="rounded-lg border border-surface-subtle bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <h2 id={`table-${datasetName}-heading`} className="text-base font-semibold text-ink">
          {title}
        </h2>
        <ExportCsvButton rows={exportRows} datasetName={datasetName} asOfIso={asOfIso} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          {caption ? <caption className="text-left text-xs text-ink-muted pb-2">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-surface-subtle">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  className={
                    col.align === "right"
                      ? "py-2 px-2 font-medium text-ink-muted text-right"
                      : "py-2 px-2 font-medium text-ink-muted text-left"
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-ink-muted">
                  No data yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-surface-subtle/60">
                {columns.map((col) => {
                  const cellClass =
                    col.align === "right" ? "py-2 px-2 text-ink text-right tabular-nums" : "py-2 px-2 text-ink text-left";
                  const content = col.format ? col.format(row[col.key], row) : String(row[col.key] ?? "-");
                  return (
                    <td key={String(col.key)} className={cellClass}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2">
        <LastUpdated isoTimestamp={asOfIso} />
      </div>
    </section>
  );
}
