/**
 * Generic CSV export — every data table/chart in the dashboard offers a
 * "Download CSV" action (spec transparency requirement: "Provide CSV export
 * for all displayed data tables"). One shared implementation so export
 * formatting (quoting, escaping, filename convention) is consistent across
 * the whole app rather than reimplemented per component.
 */

type CsvRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote any cell containing a comma, quote, or newline; double up internal quotes.
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: CsvRow[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]!);
  const header = cols.map(escapeCsvCell).join(",");
  const body = rows.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

/** Builds a filename with an explicit as-of date so exported files are
 * self-documenting about data freshness — mirrors the "last updated"
 * requirement applied to a downloaded artefact instead of a live view. */
export function csvFilename(datasetName: string, asOfIso: string): string {
  const datePart = asOfIso.slice(0, 10); // YYYY-MM-DD
  return `gh2028watch_${datasetName}_${datePart}.csv`;
}

export function downloadCsv(rows: CsvRow[], filename: string, columns?: string[]): void {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
