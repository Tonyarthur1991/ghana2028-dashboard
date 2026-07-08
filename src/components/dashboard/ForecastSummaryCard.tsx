import { partyColour, partyName } from "@/lib/colors";
import type { ForecastSnapshot } from "@/lib/types";

/**
 * Headline forecast card. The CI range is rendered in the SAME font size and
 * weight as the point estimate (not smaller/greyed-out) — a deliberate
 * choice, since visually de-emphasising the interval would recreate the
 * "false precision" problem the spec explicitly warns against even while
 * technically including the numbers.
 */
export function ForecastSummaryCard({ forecast }: { forecast: ForecastSnapshot }) {
  const colour = partyColour(forecast.partyCode);

  return (
    <div
      className="rounded-lg border border-surface-subtle bg-surface p-4 flex flex-col gap-2"
      role="group"
      aria-label={`${partyName(forecast.partyCode)} forecast`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: colour }}
          aria-hidden="true"
        />
        <h3 className="font-semibold text-ink">{forecast.partyCode}</h3>
        <span className="text-xs text-ink-muted truncate">{partyName(forecast.partyCode)}</span>
      </div>

      <div>
        <p className="text-2xl font-bold text-ink tabular-nums" aria-hidden="true">
          {forecast.ciLowerPct.toFixed(0)}–{forecast.ciUpperPct.toFixed(0)}%
        </p>
        {/* Screen readers get the fuller sentence, not just the compact range glyph */}
        <p className="sr-only">
          Projected vote share between {forecast.ciLowerPct.toFixed(1)}% and {forecast.ciUpperPct.toFixed(1)}%,
          {" "}
          {Math.round(forecast.ciLevel * 100)}% credible interval. Central estimate{" "}
          {forecast.pointEstimatePct.toFixed(1)}%.
        </p>
        <p className="text-xs text-ink-muted">
          central estimate {forecast.pointEstimatePct.toFixed(1)}% · {Math.round(forecast.ciLevel * 100)}% CI
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-ink-muted mt-1">
        <dt>Polls blended</dt>
        <dd className="text-right tabular-nums">{forecast.nPollsUsed}</dd>
        <dt>Mentions used</dt>
        <dd className="text-right tabular-nums">{forecast.nMentionsUsed.toLocaleString()}</dd>
        <dt>Sentiment adj.</dt>
        <dd className="text-right tabular-nums">
          {forecast.sentimentDeltaInput >= 0 ? "+" : ""}
          {forecast.sentimentDeltaInput.toFixed(2)}σ
        </dd>
      </dl>

      {forecast.anomalyFlagged && (
        <p
          role="alert"
          className="mt-1 rounded-md bg-signal-warning/15 px-2 py-1 text-[11px] font-medium text-signal-warning"
        >
          ⚠ Large swing vs. prior period — flagged for human review, may not reflect a published forecast yet.
        </p>
      )}
    </div>
  );
}
