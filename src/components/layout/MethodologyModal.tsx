"use client";

import { useEffect, useRef } from "react";
import { usePipelineMeta } from "@/lib/hooks";

/**
 * Persistent methodology modal — spec constraint: "Include a persistent
 * methodology link/modal on every view." Built on the native <dialog>
 * element rather than a custom overlay: modern browsers give focus
 * trapping, Escape-to-close, and inert background handling for free via
 * showModal(), which is the most reliable way to satisfy WCAG 2.1 AA
 * keyboard-navigation requirements without a third-party dialog library.
 */
export function MethodologyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: meta } = usePipelineMeta();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Native "close" fires on Escape too — keep React state in sync either way.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="methodology-title"
      className="rounded-lg p-0 backdrop:bg-black/50 max-w-2xl w-[92vw] m-auto
                 bg-surface text-ink shadow-xl open:animate-none"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="methodology-title" className="text-lg font-semibold">
            Methodology &amp; limitations
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close methodology dialog"
            className="rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-ink-muted">
          <p>
            <strong className="text-ink">This is a poll-anchored, sentiment-adjusted nowcast</strong> —
            not a prediction from social media sentiment alone. Ghana&apos;s social media user base is
            roughly a quarter of the population and skews urban, young, and Facebook-dominant, while X
            (the easiest platform to collect data from) reaches only a small fraction of that. Sentiment
            trend adjusts a poll-blend baseline; it never sets the baseline on its own.
          </p>
          <p>
            Every forecast is shown as a <strong className="text-ink">95% credible interval</strong>,
            never a single number. The interval combines poll sampling uncertainty with model uncertainty
            from the sentiment-adjustment step, which is not yet fully validated for Ghana.
          </p>
          <p>
            Regional breakdowns are best-effort, inferred from declared location and language cues, and
            are shown with an explicit confidence tier because the underlying sample is small and skews
            toward Greater Accra and Ashanti.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 rounded-md bg-surface-subtle p-3">
            <dt className="font-medium text-ink">Model version</dt>
            <dd>{meta?.modelVersion ?? "—"}</dd>
            <dt className="font-medium text-ink">Data as of</dt>
            <dd>{meta ? new Date(meta.dataAsOf).toLocaleString("en-GB") : "—"}</dd>
            <dt className="font-medium text-ink">Environment</dt>
            <dd className="capitalize">{meta?.environment ?? "—"}</dd>
          </dl>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={meta?.methodologyUrl ?? process.env.NEXT_PUBLIC_METHODOLOGY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium
                       text-ink-inverted hover:opacity-90 focus-visible:outline focus-visible:outline-2"
          >
            Read full public methodology page
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-surface-subtle px-4 py-2 text-sm
                       font-medium text-ink hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2"
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
