"""
Validation gate — per the roadmap, nothing downstream should be trusted until
this passes. Loads the (currently synthetic — see data/backtest/README notes
in 2024_sentiment_synthetic.csv) pre-election data and checks whether
transfer_function.forecast() reconstructs the certified EC 2024 result within
a reasonable tolerance.

This is a MECHANISM TEST today, not a real calibration, because the sentiment
input is synthetic. It proves the pipeline plumbing and the transfer function
math are correct end-to-end. Swap in genuine archived sentiment data (once
X academic archive / Meta Content Library access comes through) and re-run
before trusting this as evidence the model works.

Usage:
    python forecasting/backtest_2024.py
"""
import csv
import os
from datetime import date

from transfer_function import (
    PollObservation,
    SentimentObservation,
    forecast,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "backtest")

ACTUAL_RESULT = {
    # Certified EC 2024 result — https://ec.gov.gh/2024-election-results/
    "NDC": 56.65,
    "NPP": 41.61,
}

# Tolerance for the point estimate — deliberately wide, this is a mechanism
# test on synthetic sentiment input, not a precision claim.
TOLERANCE_PCT_POINTS = 8.0


def load_polls() -> list[PollObservation]:
    polls = []
    with open(os.path.join(DATA_DIR, "2024_polls.csv"), newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            polls.append(
                PollObservation(
                    pollster=row["pollster"],
                    published_date=date.fromisoformat(row["published_date"]),
                    party_code=row["party_code"],
                    vote_share_pct=float(row["vote_share_pct"]),
                    sample_size=int(row["sample_size"]),
                    house_weight=1.1,  # Global InfoAnalytics called the 2024 range correctly
                )
            )
    return polls


def load_sentiment() -> list[SentimentObservation]:
    series = []
    with open(os.path.join(DATA_DIR, "2024_sentiment_synthetic.csv"), newline="", encoding="utf-8") as f:
        for row in f:
            if row.startswith("#") or not row.strip():
                continue
            if row.startswith("day,"):
                continue
            day_str, party_code, sentiment = row.strip().split(",")
            series.append(
                SentimentObservation(
                    day=date.fromisoformat(day_str),
                    party_code=party_code,
                    weighted_mean_sentiment=float(sentiment),
                )
            )
    return series


def run_backtest() -> bool:
    polls = load_polls()
    sentiment = load_sentiment()
    as_of = date(2024, 12, 5)  # two days before the election
    beta = 0.35  # from settings.yaml sentiment_beta_prior — not yet re-estimated

    print(f"{'Party':<6}{'Forecast':>12}{'95% CI':>20}{'Actual':>10}{'Abs. error':>12}")
    print("-" * 60)

    all_within_tolerance = True
    for party_code in ("NDC", "NPP"):
        result = forecast(
            party_code=party_code,
            as_of=as_of,
            polls=polls,
            sentiment_series=sentiment,
            beta=beta,
        )
        actual = ACTUAL_RESULT[party_code]
        error = abs(result.point_estimate_pct - actual)
        within_tolerance = error <= TOLERANCE_PCT_POINTS
        all_within_tolerance &= within_tolerance
        ci = f"[{result.ci_lower_pct}, {result.ci_upper_pct}]"
        print(
            f"{party_code:<6}{result.point_estimate_pct:>12.2f}{ci:>20}{actual:>10.2f}{error:>12.2f}"
        )
        actual_in_ci = result.ci_lower_pct <= actual <= result.ci_upper_pct
        print(
            f"       poll_blend={result.poll_blend_input}  sentiment_delta={result.sentiment_delta_input}  "
            f"n_polls={result.n_polls_used}  actual_within_CI={actual_in_ci}"
        )

    print("-" * 60)
    status = "PASS (mechanism test)" if all_within_tolerance else "FAIL"
    print(f"Backtest result: {status} (tolerance = {TOLERANCE_PCT_POINTS} pts)")
    print(
        "\nREMINDER: sentiment input is synthetic. This confirms the pipeline "
        "runs and the transfer function is well-behaved — it does NOT confirm "
        "real-world forecasting accuracy. Do not cite this as calibration "
        "evidence in any public methodology page until real archived "
        "sentiment data replaces data/backtest/2024_sentiment_synthetic.csv.\n"
        "\nThis backtest also does NOT exercise the issue-accountability term "
        "(issue_gamma) — there's no 2024 per-issue sentiment dataset yet. "
        "That pathway stays at its inert default (gamma=0.0) here regardless "
        "of what's configured in settings.yaml. Build a 2024 issue-sentiment "
        "fixture before trusting any non-zero issue_incumbency_gamma_prior."
    )
    return all_within_tolerance


if __name__ == "__main__":
    import sys

    sys.exit(0 if run_backtest() else 1)
