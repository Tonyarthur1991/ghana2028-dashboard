"""
Airflow DAG skeleton wiring the pipeline together. Two DAGs:
  - `ghana2028_daily_ingestion`: runs continuously, feeds raw_posts/entity_mentions/daily_sentiment
  - `ghana2028_monthly_forecast`: runs on the monthly cadence, produces a forecast + draft report

Deploy this to an Airflow instance once Phase 1 infrastructure is up — this
file is not runnable standalone, it needs an Airflow scheduler/webserver.
Install with the `apache-airflow` pin in requirements.txt matched to your
target platform's supported Python/Airflow combination.
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

default_args = {
    "owner": "tony",
    "retries": 3,
    "retry_delay": timedelta(minutes=10),
}


def _run_news_scraper():
    from ingestion.news_scraper import run_once

    run_once()


def _run_sentiment_and_ner():
    """Pulls unprocessed raw_posts, runs language ID -> sentiment -> NER,
    writes to entity_mentions. Left as an implementation stub — the pieces
    (nlp/sentiment_model.py, nlp/ner_pipeline.py) exist; this operator wires
    them to the raw_posts table with proper batching, which needs a real
    Postgres connection to build against."""
    raise NotImplementedError(
        "Wire nlp/sentiment_model.py + nlp/ner_pipeline.py to raw_posts once "
        "the DB is live — Phase 1 task, not Phase 0."
    )


def _refresh_daily_sentiment_aggregate():
    """Materialises entity_mentions into daily_sentiment (see db/schema.sql).
    Implement as a scheduled SQL aggregation query once entity_mentions has
    real data flowing — Phase 1 task."""
    raise NotImplementedError("Phase 1 task — needs live entity_mentions data first.")


def _run_monthly_forecast():
    """Loads polls + daily_sentiment, calls forecasting.transfer_function.forecast()
    per party, writes to forecast_runs, and checks the anomaly_swing_threshold_points
    kill-switch from settings.yaml before allowing the content generator to run."""
    raise NotImplementedError(
        "Phase 2 task — needs forecasting/transfer_function.py wired to live DB data "
        "instead of the backtest CSVs."
    )


def _generate_draft_report():
    """Calls content/report_generator.py to produce charts + copy, writes a
    draft to the review queue. Per settings.yaml review_gates.require_human_approval,
    this must NOT auto-publish in Phase 1-3."""
    raise NotImplementedError("Phase 2 task.")


with DAG(
    dag_id="ghana2028_daily_ingestion",
    default_args=default_args,
    description="Continuous ingestion: news scraping, sentiment scoring, entity linking",
    schedule_interval="0 */4 * * *",  # every 4 hours, matches news_scrape_interval_hours
    start_date=datetime(2026, 8, 1),
    catchup=False,
    tags=["ghana2028", "ingestion"],
) as daily_dag:
    scrape_news = PythonOperator(task_id="scrape_news", python_callable=_run_news_scraper)
    score_sentiment = PythonOperator(task_id="score_sentiment_and_ner", python_callable=_run_sentiment_and_ner)
    refresh_aggregate = PythonOperator(
        task_id="refresh_daily_sentiment", python_callable=_refresh_daily_sentiment_aggregate
    )

    scrape_news >> score_sentiment >> refresh_aggregate


with DAG(
    dag_id="ghana2028_monthly_forecast",
    default_args=default_args,
    description="Monthly forecast + draft report generation (human-approval gated)",
    schedule_interval="0 8 1 * *",  # 08:00 on the 1st of each month, matches settings.yaml
    start_date=datetime(2026, 8, 1),
    catchup=False,
    tags=["ghana2028", "forecast"],
) as monthly_dag:
    run_forecast = PythonOperator(task_id="run_monthly_forecast", python_callable=_run_monthly_forecast)
    draft_report = PythonOperator(task_id="generate_draft_report", python_callable=_generate_draft_report)

    run_forecast >> draft_report

# NOTE: intensification to bi-weekly cadence from 2028-10-01 (settings.yaml
# publishing.intensification_start_date) needs either a second DAG with a
# 14-day schedule that activates via a date-gated branch operator, or a
# dynamic schedule_interval computed at DAG-parse time. Decide this in Phase 4.
