# GH2028 Watch — Dashboard

Real-time visualisation layer for the [Ghana 2028 Election Forecasting System](../Ghana_2028_Election_Forecasting_System_Spec.md). Consumes the backend REST API (contract in `docs/api-contract.md`) built on top of the `ghana2028forecast` TimescaleDB schema. Serves both as an internal monitoring tool through Phase 0–3 and, unmodified, as the public dashboard from Phase 4 onward — the `NEXT_PUBLIC_DEPLOY_ENV` banner is the only thing that visually distinguishes the two.

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router) — single page app, client-rendered   │
│                                                                 │
│  app/layout.tsx ─ QueryProvider (TanStack Query v5)            │
│    └── app/page.tsx ─ DashboardPage                            │
│          ├── components/layout/Header (+ MethodologyModal)     │
│          ├── ForecastSummaryCard × N parties                   │
│          ├── ForecastTrendChart      (recharts ComposedChart)  │
│          ├── SentimentByPartyChart   (recharts BarChart)       │
│          ├── IssueSalienceTracker    (recharts BarChart)       │
│          ├── RegionalBreakdown       (grid, not a map — see    │
│          │     component comment for why)                      │
│          ├── DataTable (published polls)                       │
│          └── components/layout/Footer                          │
└───────────────────────────┬─────────────────────────────────┘
                             │ fetch (src/lib/api.ts)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend REST API (not part of this repo — see api-contract.md)│
│  FastAPI/Flask in front of TimescaleDB (ghana2028forecast repo)│
└──────────────────────────────────────────────────────────────┘
```

**State management:** TanStack Query v5 only — no Redux/Zustand. This app has no meaningful client-only state beyond "which party is selected" and "is the methodology modal open," both handled with plain `useState`. Every other piece of state is server state (fetched data), which is exactly what React Query is for; adding a second state library on top would be unjustified complexity for a read-only dashboard.

**Data flow:** every chart component owns its own query hook call (`src/lib/hooks/index.ts`) rather than the page fetching everything and prop-drilling. This means each chart independently handles its own loading/error state and independently respects the 5-minute refresh floor, and a chart can be lifted into a different page/layout later without carrying prop-drilling baggage with it.

**Why Recharts over Plotly.js:** Recharts renders to plain SVG via React components, which made the accessibility work (visible focus states, `sr-only` text summaries, semantic table fallbacks via CSV export) far more direct than working through Plotly's canvas/WebGL rendering and its own trace-based API. Plotly is the stronger choice if 3D or extremely high-density (tens of thousands of points per chart) rendering were required; this dashboard's chart data volumes (a few hundred to low thousands of points per view, aggregated server-side from the 90-day rolling window — see `days` params in `docs/api-contract.md`) don't need that.

## 2. Local development

Requires Node.js ≥ 20.9 (pinned in `.nvmrc` / `package.json` engines — run `nvm use` if you use nvm). Works identically on Windows, macOS, and Linux; no OS-specific setup steps.

```bash
npm install
npm run dev   # http://localhost:3000 — no .env file needed
```

That's it — no backend, no env setup, no separate mock server to stand up. The app ships with its own mock API under `src/app/api/*`, backed by plain, hand-editable JSON files in `src/data/*.json` (forecasts, sentiment, polls, historical results, pipeline meta). Edit those files directly to try out your own numbers; the dashboard picks them up on next request (no rebuild needed in dev).

Once the real backend from `ghana2028forecast` exists, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL` to point at it — everything else in this app is unchanged, since `src/lib/api.ts` just calls whatever base URL is configured.

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint, jsx-a11y rules elevated to error — see eslint.config.mjs
npm run build         # production build
```

## 3. Deployment

**Recommended: Vercel.** This is a stock Next.js App Router app with zero server-side secrets (every env var is `NEXT_PUBLIC_*`, see `.env.example`) — Vercel's zero-config Next.js deploy is the least-friction option and matches the backend spec's "modest budget" hosting philosophy. Set the four `NEXT_PUBLIC_*` env vars in the Vercel project settings per environment (Preview = staging/internal, Production = public Phase 4+ launch).

**Alternative: same VM as the backend.** If you'd rather not split hosting providers, `npm run build && npm run start` runs a Node server directly on the Hetzner/DigitalOcean VM the backend spec recommends, behind whatever reverse proxy (Caddy/nginx) you're already running for the API. Slightly more ops overhead than Vercel, no cost difference at this traffic scale.

**Do not** put this behind the same auth as the backend's write endpoints — this app only ever makes `GET` requests and holds no secrets, so it can safely be fully public even during Phase 0–3 if you want early feedback, gated instead by simply not sharing the URL widely (or a basic HTTP auth prompt at the reverse-proxy layer, not in application code).

## 4. Usage guide — evolving the dashboard through phases

- **Phase 0–1 (now):** backend API doesn't exist yet — the dashboard runs against its own mock data in `src/data/*.json` (see §2). Keep this repo's types in sync with `docs/api-contract.md` as you design the FastAPI layer, and keep the mock JSON shapes matching `src/lib/types.ts` so the switch to a real backend in Phase 2 is a one-line env change.
- **Phase 2 (semi-automation):** once `/api/forecast/latest` and `/api/sentiment/daily` are live, point `.env.local` at the real backend and verify every chart's loading/error states resolve to real data. Check the `RegionalBreakdown` confidence tiers look sane against real mention volumes before trusting them publicly.
- **Phase 3 (full automation, still internal):** deploy to Vercel Preview / a staging subdomain with `NEXT_PUBLIC_DEPLOY_ENV=staging` so the environment banner stays visible. Use this build as the actual internal monitoring tool referenced in the task brief — watch `anomalyFlagged` on `ForecastSummaryCard` for real swings, since that's the same kill-switch signal gating the backend's auto-publish.
- **Phase 4 (public launch):** flip `NEXT_PUBLIC_DEPLOY_ENV=production` (removes the banner), point DNS at the Vercel Production deployment, and switch the cadence expectation in your head from monthly to bi-weekly per the backend's `intensification_start_date` (2028-10-01) — no dashboard code changes needed, it already just renders whatever `forecast_runs` rows exist.
- **Adding a new chart:** copy the pattern in any existing `src/components/charts/*.tsx` — a query hook from `src/lib/hooks`, a `LastUpdated`, an `ExportCsvButton`, and (if it shows a forecast number) a credible interval, never a bare point estimate. That four-part pattern is the house style; don't add a chart that skips any of the four.
- **Adding a new party** (e.g. a genuine third-force breakthrough): add it to `PARTY_META` in `src/lib/colors.ts` with a neutral (non-brand) colour, and to `MAJOR_PARTIES` in the same file if it should appear on the headline summary cards and trend chart by default.

## 6. Monthly email report

`scripts/generate-report.mjs` builds an HTML report (forecast trend, sentiment, top issues, regional breakdown, latest poll — each with a chart and a plain-language explanation) from the same `src/data/*.json` files the dashboard reads, and emails it via Gmail SMTP. `.github/workflows/monthly-report.yml` runs it automatically at 08:00 UTC on the 1st of every month.

**One-time setup** — add these repository secrets under GitHub → Settings → Secrets and variables → Actions:

- `GMAIL_USER` — the Gmail address to send from.
- `GMAIL_APP_PASSWORD` — an [app password](https://myaccount.google.com/apppasswords) for that account (not your normal password; requires 2-Step Verification to be enabled first).
- `REPORT_RECIPIENT` — optional, defaults to `GMAIL_USER` if unset.

Once those three secrets exist, the workflow sends itself every month with no further action needed. Trigger a run early via the Actions tab (**Monthly report → Run workflow**) to confirm it works before waiting for the 1st.

**Local testing:**
```bash
npm run report:dry-run   # writes report.html + chart PNGs to disk, no credentials needed, no email sent
npm run report            # sends for real — needs GMAIL_USER / GMAIL_APP_PASSWORD env vars set locally
```

The report narrative is computed from the data on each run (month-over-month deltas, CI overlap, top issues by volume, etc.) — editing `src/data/*.json` changes next month's report the same way it changes the live dashboard.

## 7. Accessibility notes

- Colour is never the only signal: regional confidence and issue trend direction both pair colour/opacity with visible text (`CONFIDENCE_LABEL`, trend arrows), satisfying WCAG 1.4.1.
- `MethodologyModal` uses the native `<dialog>` element specifically for its built-in focus trap and `Escape`-to-close — see the component's top comment.
- All interactive controls (`ExportCsvButton`, sort toggles, the methodology button) have visible `:focus-visible` rings defined globally in `globals.css`, not per-component, so nothing can silently regress this.
- Every chart ships an `sr-only` text summary plus a CSV export button specifically because SVG chart content is not reliably exposed to screen readers — treat the CSV export as the accessible data path, not just a transparency nicety.
- Palette contrast: party/sentiment/surface colours in `tailwind.config.ts` are commented with their contrast ratios against light and dark surfaces; re-verify with a contrast checker if you change any of them.
