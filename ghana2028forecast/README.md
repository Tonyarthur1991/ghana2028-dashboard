# Ghana 2028 Election Forecasting System

Phase 0 scaffold implementing the [system specification](../Ghana_2028_Election_Forecasting_System_Spec.md): automated sentiment-driven, poll-anchored election forecasting for the 7 December 2028 Ghana general election.

## Status: Phase 0 — Foundations

This scaffold gives you a working project skeleton, a real database schema, a populated political gazetteer, and — critically — a **runnable back-test of the forecasting model against the certified 2024 result**. Nothing here auto-publishes or auto-scrapes yet; that's Phase 1+.

## Directory structure

```
ghana2028forecast/
├── config/
│   ├── gazetteer.yaml      # parties, candidates, regions, issue keywords — SOURCE OF TRUTH
│   └── settings.yaml       # model weights, decay half-life, thresholds
├── db/
│   └── schema.sql          # TimescaleDB schema — run this first
├── ingestion/
│   ├── x_stream.py         # X API v2 filtered stream client
│   ├── news_scraper.py     # RSS + trafilatura scraper for GhanaWeb/Citi/MyJoyOnline/Graphic
│   └── poll_ingest.py      # manual/semi-automated published-poll ingestion
├── nlp/
│   ├── sentiment_model.py  # AfriBERTa/XLM-R sentiment scoring (loads fine-tuned checkpoint)
│   └── ner_pipeline.py     # spaCy gazetteer-seeded entity linking
├── forecasting/
│   ├── transfer_function.py # Bayesian poll-blend + sentiment adjustment
│   └── backtest_2024.py     # validation gate — RUN THIS FIRST
├── content/
│   └── report_generator.py # monthly report + chart generation (draft-only, human review gate)
├── dags/
│   └── daily_pipeline.py   # Airflow DAG skeleton wiring it all together
├── tests/
│   └── test_backtest.py
└── data/backtest/           # historical calibration data (2016/2020/2024)
```

## Quickstart

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in API keys as you get access

# 1. Stand up the database (requires Postgres + TimescaleDB extension)
psql -h localhost -U postgres -d ghana2028 -f db/schema.sql

# 2. Run the validation gate — does the model reconstruct 2024 from historical inputs?
python forecasting/backtest_2024.py

# 3. Run tests
pytest tests/
```

## Why start here (Phase 0 rationale)

Per the roadmap, nothing downstream is worth building until `backtest_2024.py` passes — it proves the sentiment-adjustment transfer function is at least directionally sound against a known result before you spend money on API access and GPU-hosted sentiment models. Everything else in this scaffold (schema, gazetteer, ingestion skeletons) exists to be filled in once that gate is green.

## Immediate next actions for Tony

1. Run `backtest_2024.py` — it currently ships with placeholder synthetic sentiment deltas (see `data/backtest/2024_sentiment_synthetic.csv`); replace with real archived data if/when you get academic X API archive access, otherwise treat the current run as a mechanism test, not a real calibration.
2. Apply for X API Pro/academic access and Meta Content Library research access now — these have the longest lead times (weeks) and gate `ingestion/x_stream.py` and the Facebook path entirely.
3. Decide hosting (spec recommends a modest Hetzner/DigitalOcean VM) — this scaffold assumes Postgres/TimescaleDB is reachable at a connection string in `.env`; nothing here needs GPU compute except sentiment model fine-tuning, which can be done once via Colab/cloud GPU and the checkpoint reused.
4. NDC has not yet selected its 2028 flagbearer (Mahama is term-limited out); `config/gazetteer.yaml` has a placeholder list of declared/likely contenders — update `candidates.ndc` once the NDC primary concludes. NPP's candidate is settled: Bawumia won the NPP primary on 31 January 2026 with 56.48% of delegate votes ([MyJoyOnline](https://www.myjoyonline.com/npp-to-elect-2028-flagbearer-on-january-31-2026/), [YEN.com.gh](https://yen.com.gh/politics/298842-npp-selects-flagbearer-2026-election-211849-delegates-expected-vote/)).
