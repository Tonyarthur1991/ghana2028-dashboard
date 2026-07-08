/**
 * The single sentence that must appear near every forecast number, per spec
 * Component 4 tone guidelines: "Every post carries a standing disclaimer
 * line." Reused verbatim across the summary card, trend chart caption, and
 * exported CSV headers so the message never varies in wording between
 * surfaces — consistency itself is part of the credibility argument.
 */
export const DISCLAIMER_TEXT =
  "Model-based estimate, not a guarantee. Not affiliated with any party or campaign.";

export function UncertaintyDisclaimer({ methodologyHref }: { methodologyHref: string }) {
  return (
    <p className="text-xs text-ink-muted border-t border-surface-subtle pt-2 mt-2">
      {DISCLAIMER_TEXT}{" "}
      <a
        href={methodologyHref}
        className="underline decoration-dotted underline-offset-2 hover:text-ink"
        target="_blank"
        rel="noreferrer"
      >
        Full methodology
      </a>
      .
    </p>
  );
}
