"use client";

/**
 * Rendered on every chart/table per the spec's hard requirement: "Include a
 * 'last updated' timestamp on every data visualization." A shared component
 * so the wording/format is identical everywhere rather than drifting per
 * chart. Uses <time dateTime> for screen-reader and machine readability.
 */
export function LastUpdated({ isoTimestamp, label = "Last updated" }: { isoTimestamp: string | undefined; label?: string }) {
  if (!isoTimestamp) {
    return (
      <p className="text-xs text-ink-muted italic" role="status">
        {label}: loading…
      </p>
    );
  }

  const date = new Date(isoTimestamp);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(date);

  return (
    <p className="text-xs text-ink-muted" role="status">
      {label}:{" "}
      <time dateTime={isoTimestamp} title={date.toISOString()}>
        {formatted} GMT
      </time>
    </p>
  );
}
