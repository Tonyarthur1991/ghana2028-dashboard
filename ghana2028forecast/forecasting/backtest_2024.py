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
    IssueSentimentObservation,
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

# NPP was the incumbent through the Dec 2024 election — NDC only took office
# after winning it. This is the historically correct incumbent for THIS
# backtest and deliberately does not come from settings.yaml, whose
# incumbent_party_code reflects the current (2026, post-handover) config.
INCUMBENT_2024 = "NPP"
ACCOUNTABLE_ISSUES_2024 = ["economy", "corruption"]

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


def load_issue_sentiment() -> list[IssueSentimentObservation]:
    series = []
    path = os.path.join(DATA_DIR, "2024_issue_sentiment_synthetic.csv")
    with open(path, newline="", encoding="utf-8") as f:
        for row in f:
            if row.startswith("#") or not row.strip():
                continue
            if row.startswith("day,"):
                continue
            day_str, issue_code, sentiment, volume = row.strip().split(",")
            series.append(
                IssueSentimentObservation(
                    day=date.fromisoformat(day_str),
                    issue_code=issue_code,
                    net_sentiment=float(sentiment),
                    mention_volume=int(volume),
                )
            )
    return series


def run_issue_gamma_sweep() -> None:
    """Exploratory, NOT a pass/fail gate: shows how different issue_gamma
    values move the 2024 reconstruction, so a human can eyeball whether the
    incumbency-accountability direction is even plausible before ever fitting
    gamma properly. All synthetic data — see module docstring caveats."""
    polls = load_polls()
    sentiment = load_sentiment()
    issues = load_issue_sentiment()
    as_of = date(2024, 12, 5)
    beta = 0.35

    print("\nIssue-accountability gamma sweep (exploratory, synthetic issue data):")
    print(f"{'gamma':>6}{'NDC fcst':>10}{'NDC err':>10}{'NPP fcst':>10}{'NPP err':>10}")
    print("-" * 46)
    for gamma in (0.0, 0.5, 1.0, 1.5, 2.0):
        row = {}
        for party_code in ("NDC", "NPP"):
            result = forecast(
                party_code=party_code,
                as_of=as_of,
                polls=polls,
                sentiment_series=sentiment,
                beta=beta,
                issue_series=issues,
                incumbent_party_code=INCUMBENT_2024,
                accountable_issue_codes=ACCOUNTABLE_ISSUES_2024,
                issue_gamma=gamma,
            )
            row[party_code] = (result.point_estimate_pct, abs(result.point_estimate_pct - ACTUAL_RESULT[party_code]))
        print(
            f"{gamma:>6.1f}{row['NDC'][0]:>10.2f}{row['NDC'][1]:>10.2f}"
            f"{row['NPP'][0]:>10.2f}{row['NPP'][1]:>10.2f}"
        )
    print(
        "\nIf error shrinks as gamma rises from 0, the incumbency-accountability "
        "direction is at least plausible on this (synthetic) fixture — that is "
        "NOT the same as a fitted, validated gamma. Do not copy a 'best' value "
        "from this sweep straight into settings.yaml; this exists to sanity-"
        "check the mechanism, not to calibrate it."
    )


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
        "\nThis backtest's PASS/FAIL gate above still runs with issue_gamma=0.0 "
        "(inert) — see run_issue_gamma_sweep() below for exploratory, non-gating "
        "output on the issue-accountability term against the synthetic "
        "2024_issue_sentiment_synthetic.csv fixture."
    )
    return all_within_tolerance


if __name__ == "__main__":
    import sys

    passed = run_backtest()
    run_issue_gamma_sweep()
    sys.exit(0 if passed else 1)
