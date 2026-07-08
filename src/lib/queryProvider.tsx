"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * App-wide TanStack Query provider. staleTime/gcTime are set generously
 * (see hooks/index.ts MIN_REFRESH_INTERVAL_MS) because this dashboard
 * deliberately does NOT poll aggressively — see the spec constraint:
 * "No auto-refresh faster than 5 minutes." One QueryClient instance per
 * browser session, created in state so it survives re-renders but not
 * page reloads (no need for anything fancier at this scale).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false, // avoid surprise refetch bursts outside our floor
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
