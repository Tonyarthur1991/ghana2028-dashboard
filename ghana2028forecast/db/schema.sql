-- Ghana 2028 Election Forecasting System — TimescaleDB schema
-- Requires PostgreSQL 14+ with the TimescaleDB extension installed.
-- Run: psql -h <host> -U <user> -d ghana2028 -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Raw ingested posts (hashed text only — PII minimisation) ───────────────
CREATE TABLE IF NOT EXISTS raw_posts (
    post_id             TEXT NOT NULL,
    platform            TEXT NOT NULL CHECK (platform IN ('x', 'facebook', 'instagram', 'news', 'forum')),
    posted_at           TIMESTAMPTZ NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    author_hash         TEXT,                  -- SHA-256 of author id, not the id itself
    raw_text_hash       TEXT NOT NULL,          -- SHA-256 of text, for dedup/audit — not raw text
    language_detected   TEXT,
    region_inferred     TEXT,
    is_bot_flagged      BOOLEAN NOT NULL DEFAULT false,
    is_duplicate        BOOLEAN NOT NULL DEFAULT false,
    simhash             BIGINT,
    source_url          TEXT,                  -- for news/forum, safe to store
    PRIMARY KEY (post_id, platform, posted_at)
);
SELECT create_hypertable('raw_posts', 'posted_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_raw_posts_region ON raw_posts (region_inferred, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_posts_simhash ON raw_posts (simhash);

-- ── Entity mentions — one row per (post, entity) pair ───────────────────────
CREATE TABLE IF NOT EXISTS entity_mentions (
    id                  BIGSERIAL,
    post_id             TEXT NOT NULL,
    platform            TEXT NOT NULL,
    posted_at           TIMESTAMPTZ NOT NULL,
    entity_type         TEXT NOT NULL CHECK (entity_type IN ('party', 'candidate', 'issue')),
    entity_code         TEXT NOT NULL,          -- e.g. 'NDC', 'NPP', 'economy'
    sentiment_score     REAL NOT NULL CHECK (sentiment_score BETWEEN -1 AND 1),
    confidence          REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    sarcasm_flagged     BOOLEAN NOT NULL DEFAULT false,
    weight_applied       REAL NOT NULL DEFAULT 1.0,   -- bot/dup down-weighting factor
    PRIMARY KEY (id, posted_at)
);
SELECT create_hypertable('entity_mentions', 'posted_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions (entity_code, posted_at DESC);

-- ── Daily aggregated sentiment per entity (materialised, refreshed nightly) ─
CREATE TABLE IF NOT EXISTS daily_sentiment (
    day                 DATE NOT NULL,
    entity_type         TEXT NOT NULL,
    entity_code         TEXT NOT NULL,
    weighted_mean_sentiment REAL NOT NULL,
    mention_volume      INTEGER NOT NULL,
    share_of_voice      REAL,                  -- mention_volume / total mentions that day
    region              TEXT,                   -- NULL = national aggregate
    source_platform_mix JSONB,                  -- e.g. {"x": 0.7, "facebook": 0.2, "news": 0.1}
    PRIMARY KEY (day, entity_type, entity_code, COALESCE(region, ''))
);
SELECT create_hypertable('daily_sentiment', 'day', if_not_exists => TRUE);

-- ── Published poll ingestion (ground-truth anchor) ──────────────────────────
CREATE TABLE IF NOT EXISTS poll_results (
    id                  BIGSERIAL PRIMARY KEY,
    pollster            TEXT NOT NULL,
    fieldwork_start     DATE NOT NULL,
    fieldwork_end       DATE NOT NULL,
    published_date      DATE NOT NULL,
    sample_size         INTEGER,
    methodology_note    TEXT,
    party_code          TEXT NOT NULL,
    vote_share_pct      REAL NOT NULL,
    margin_of_error_pct REAL,
    source_url          TEXT,
    house_weight_applied REAL NOT NULL DEFAULT 1.0,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poll_results_date ON poll_results (published_date DESC);

-- ── Monthly forecast outputs (audit trail of every published forecast) ─────
CREATE TABLE IF NOT EXISTS forecast_runs (
    id                  BIGSERIAL PRIMARY KEY,
    run_date            DATE NOT NULL,
    model_version       TEXT NOT NULL,
    party_code          TEXT NOT NULL,
    point_estimate_pct  REAL NOT NULL,
    ci_lower_pct        REAL NOT NULL,
    ci_upper_pct        REAL NOT NULL,
    ci_level            REAL NOT NULL DEFAULT 0.95,
    poll_blend_input    REAL,
    sentiment_delta_input REAL,
    beta_used           REAL,
    n_polls_used        INTEGER,
    n_mentions_used     INTEGER,
    was_published       BOOLEAN NOT NULL DEFAULT false,
    anomaly_flagged     BOOLEAN NOT NULL DEFAULT false,
    notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_forecast_runs_date ON forecast_runs (run_date DESC);

-- ── Historical elections (calibration reference, static seed data) ─────────
CREATE TABLE IF NOT EXISTS historical_elections (
    election_date       DATE NOT NULL,
    party_code          TEXT NOT NULL,
    vote_share_pct      REAL NOT NULL,
    seats_won           INTEGER,
    turnout_pct         REAL,
    PRIMARY KEY (election_date, party_code)
);

INSERT INTO historical_elections (election_date, party_code, vote_share_pct, seats_won, turnout_pct) VALUES
    ('2024-12-07', 'NDC', 56.65, 184, 60.9),
    ('2024-12-07', 'NPP', 41.61, 88, 60.9)
ON CONFLICT DO NOTHING;
