"use client";

import { useState } from "react";
import { MethodologyModal } from "./MethodologyModal";
import { usePipelineMeta } from "@/lib/hooks";
import { LastUpdated } from "../common/LastUpdated";

/**
 * App header. Carries the persistent methodology entry point (spec: "on
 * every view" — placing it in the header, which is present on every route/
 * scroll position via sticky positioning, satisfies that literally) and an
 * environment banner so Phase 0-3 internal builds are never mistaken for
 * the live public dashboard.
 */
export function Header() {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const { data: meta } = usePipelineMeta();
  const env = meta?.environment ?? process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "development";

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-surface-subtle bg-surface/95 backdrop-blur">
        {env !== "production" && (
          <div
            role="status"
            className="bg-signal-warning/90 text-center text-xs font-medium text-ink py-1 px-4"
          >
            {env.toUpperCase()} BUILD — internal monitoring view, not the public dashboard
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
              GH2028 Watch
            </h1>
            <p className="text-xs text-ink-muted">
              Ghana 2028 election forecast — independent, poll-anchored, sentiment-adjusted
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LastUpdated isoTimestamp={meta?.dataAsOf} />
            </div>
            <button
              type="button"
              onClick={() => setMethodologyOpen(true)}
              className="rounded-md border border-surface-subtle px-3 py-2 text-sm font-medium text-ink
                         hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2"
              aria-haspopup="dialog"
            >
              Methodology
            </button>
          </div>
        </div>
      </header>

      <MethodologyModal open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
    </>
  );
}
