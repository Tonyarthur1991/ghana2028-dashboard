import { DISCLAIMER_TEXT } from "../common/UncertaintyDisclaimer";

export function Footer() {
  const methodologyUrl = process.env.NEXT_PUBLIC_METHODOLOGY_URL ?? "#";
  return (
    <footer className="mt-12 border-t border-surface-subtle bg-surface-subtle/60">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 text-xs text-ink-muted space-y-2">
        <p>{DISCLAIMER_TEXT}</p>
        <p>
          Not a probability-sample poll on its own — blends published polls (Afrobarometer, CDD-Ghana,
          Global InfoAnalytics, IEA) with social/news sentiment trend.{" "}
          <a href={methodologyUrl} className="underline hover:text-ink" target="_blank" rel="noreferrer">
            Read the full methodology
          </a>
          .
        </p>
        <p>GH2028 Watch is operated independently and is not affiliated with any party, campaign, or the Electoral Commission of Ghana.</p>
      </div>
    </footer>
  );
}
