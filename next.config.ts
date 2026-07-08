import type { NextConfig } from "next";

// Kept deliberately minimal. The dashboard is a pure API consumer (see
// docs/api-contract.md) — no server-side secrets live in this app, so it can
// be deployed as a static/edge-rendered site with no special runtime needs.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Environment variables the dashboard reads are all NEXT_PUBLIC_* by
  // design (see .env.example) — this app never holds write credentials or
  // API secrets, only a base URL for the read-only backend REST API.
};

export default nextConfig;
