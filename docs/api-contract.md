# Backend API contract

The dashboard is a pure read-only consumer of a REST API the backend (`ghana2028forecast`, the Python/TimescaleDB repo) must expose. This doc is the source of truth the dashboard's `src/lib/api.ts` and `src/lib/types.ts` are built against — if the backend implementation diverges, update both together.

None of these endpoints currently exist in `ghana2028forecast` — Phase 0 of that repo shipped the DB schema and the forecasting engine, not an API layer. Wrapping `db/schema.sql` in a FastAPI (recommended — it's already a Python stack) or Flask service exposing the routes below is Phase 1/2 backend work, not something this dashboard repo does.

All endpoints are `GET`-only. No write endpoints are exposed to the dashboard — publishing/ingestion write paths stay server-side in the backend's own DAGs, per the spec's human-approval review gate.

## `GET /api/forecast/latest`

Latest forecast per party, from the `forecast_runs` table (most recent `run_date` per `party_code` where `was_published = true`).

```json
[
  {
    "runDate": "2027-03-01",
    "modelVersion": "v0.3.1",
    "partyCode": "NDC",
    "pointEstimatePct": 52.7,
    "ciLowerPct": 46.5,
    "ciUpperPct": 58.9,
    "ciLevel": 0.95,
    "pollBlendInput": 52.2,
    "sentimentDeltaInput": 1.43,
    "betaUsed": 0.35,
    "issueAdjustmentInput": 0.0,
    "issueGammaUsed": 0.0,
    "nPollsUsed": 3,
    "nMentionsUsed": 340000,
    "wasPublished": true,
    "anomalyFlagged": false
  }
]
```

## `GET /api/forecast/history?party={code}&months={n}`

Full forecast run history (query params optional — omit `party` for all parties). Backs `ForecastTrendChart`. `party` filters to one `PartyCode`; `months` defaults to 24 server-side.

Same row shape as `/forecast/latest`, returned as an array covering every run in the window, not just the latest.

**`issueAdjustmentInput` / `issueGammaUsed`**: the incumbency-weighted issue-accountability term from `ghana2028forecast/forecasting/transfer_function.py` (`issue_accountability_adjustment()`). Both fields are always present, even when the term is inert (`issueGammaUsed: 0.0`, the default until backtested) — never omit them, so the UI can render "not yet active" explicitly rather than silently dropping the term. See that module's docstring before setting `issueGammaUsed` non-zero in production: it's a modelling assumption, not a measured quantity, and needs its own backtest (`data/backtest/2024_issue_sentiment_synthetic.csv` is a mechanism-test fixture only, not calibration evidence).

## `GET /api/sentiment/daily?entity_code={code}&days={n}`

Rolling-window daily aggregates, straight from the `daily_sentiment` table. `entity_code` optional (omit for all parties/issues); `days` defaults to 90, matching `ingestion.rolling_window_days` in the backend's `settings.yaml`.

```json
[
  {
    "day": "2027-03-14",
    "entityType": "party",
    "entityCode": "NDC",
    "weightedMeanSentiment": 0.18,
    "mentionVolume": 4210,
    "shareOfVoice": 0.54,
    "region": null,
    "sourcePlatformMix": { "x": 0.6, "facebook": 0.3, "news": 0.1 }
  }
]
```

## `GET /api/sentiment/regional?entity_code={code}`

Latest-day regional breakdown for one entity (party/candidate/issue). **Must include a `confidence` field** — the dashboard's `RegionalBreakdown` component renders this as visible text, not decoration, per the spec's false-precision warning. Backend should derive `confidence` from `mention_volume` per region against a documented threshold (e.g. `high` ≥ 200 mentions, `low` 20–199, `insufficient_data` < 20 — pick real thresholds during Phase 1 and put them in the backend's `settings.yaml`, not hardcoded in this API layer).

```json
[
  { "region": "Greater Accra", "entityCode": "NDC", "weightedMeanSentiment": 0.22, "mentionVolume": 1840, "confidence": "high" },
  { "region": "Upper West", "entityCode": "NDC", "weightedMeanSentiment": -0.05, "mentionVolume": 14, "confidence": "insufficient_data" }
]
```

## `GET /api/issues/salience?days={n}`

Top issues by mention volume with net sentiment and trend direction vs. the prior equal-length period. `label` is a human-readable version of the `issues` keys in the backend's `gazetteer.yaml` (e.g. `mining_environment` → `"Galamsey / mining"`) — resolve this server-side so the dashboard never hardcodes issue labels.

```json
[
  { "issueCode": "economy", "label": "Economy / cedi", "mentionVolume": 12400, "netSentiment": -0.31, "trendVsPriorPeriod": "down" }
]
```

## `GET /api/polls?limit={n}`

Raw rows from `poll_results`, most recent `published_date` first.

```json
[
  {
    "id": 42,
    "pollster": "Global InfoAnalytics",
    "fieldworkStart": "2027-03-01",
    "fieldworkEnd": "2027-03-10",
    "publishedDate": "2027-03-15",
    "sampleSize": 2400,
    "partyCode": "NDC",
    "voteSharePct": 52.2,
    "marginOfErrorPct": 2.0,
    "sourceUrl": "https://example.com/poll-release",
    "houseWeightApplied": 1.1
  }
]
```

## `GET /api/historical/elections`

Static reference data from `historical_elections` — changes essentially never, cached hard on the frontend (`staleTime: 24h`).

```json
[
  { "electionDate": "2024-12-07", "partyCode": "NDC", "voteSharePct": 56.65, "seatsWon": 184, "turnoutPct": 60.9 },
  { "electionDate": "2024-12-07", "partyCode": "NPP", "voteSharePct": 41.61, "seatsWon": 88, "turnoutPct": 60.9 }
]
```

## `GET /api/meta/pipeline`

Backs every "Last updated" timestamp and the methodology modal's data-freshness block. Not a DB table in the current schema — implement as a small endpoint that reads `MAX(ingested_at)` across `raw_posts`/`entity_mentions` plus a static `model_version`/`methodology_url` from backend config.

```json
{
  "dataAsOf": "2027-03-14T06:05:00Z",
  "modelVersion": "v0.3.1",
  "nextScheduledRun": "2027-04-01T08:00:00Z",
  "methodologyUrl": "https://example.com/gh2028watch/methodology",
  "environment": "staging"
}
```

## Rate limiting / caching expectations

The dashboard never polls faster than 5 minutes (`REFRESH_INTERVAL_MS` floor in `src/lib/hooks/index.ts`, enforced in code). The backend API can safely cache responses for at least that long (e.g. a 4-minute CDN/edge cache on the daily/regional/issues endpoints) without the dashboard ever seeing stale-beyond-expectation data. `forecast/latest` and `meta/pipeline` should not be cached longer than the backend's own monthly/bi-weekly publish cadence dictates.

## Auth

None of these are behind auth in the current design — they're read-only aggregates intended to eventually be public (Phase 4+). If Phase 0–3 internal-only access needs restricting before public launch, put a shared bearer token check in front of the whole API and pass it via a server-side proxy route in Next.js rather than embedding a secret in `NEXT_PUBLIC_*` env vars (which are bundled into client JS and are not secret).
