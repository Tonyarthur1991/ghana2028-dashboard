"""
Monthly report generation — forecast trend chart + platform-formatted copy.
Per settings.yaml review_gates.require_human_approval, this module produces
DRAFTS ONLY. Nothing in here calls a publishing API; wiring to Metricool/
Buffer happens in a separate publishing module once Phase 2/3 review gates
are actually built and tested.

Chart style: fixed neutral palette from config/gazetteer.yaml (deliberately
not literal party colours, per spec Component 4 tone guidelines), fixed
dimensions per platform from config/settings.yaml.
"""
import os
from dataclasses import dataclass
from datetime import date

import matplotlib.pyplot as plt
import yaml

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config")


def _load_yaml(name: str) -> dict:
    with open(os.path.join(CONFIG_PATH, name), "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@dataclass
class MonthlyForecastSnapshot:
    run_date: date
    party_forecasts: dict[str, dict]  # party_code -> {point, ci_lower, ci_upper, delta_vs_last_month}
    top_issues: list[tuple[str, float]]  # (issue_code, net_sentiment), sorted by volume
    n_polls_used: int
    n_mentions_used: int


def render_trend_chart(history: list[MonthlyForecastSnapshot], output_path: str, platform: str) -> str:
    """Renders the forecast-trend-with-CI-band chart. `history` should be the
    full run history to date, not just the latest month — per spec, followers
    need to see the model isn't jumping around arbitrarily."""
    settings = _load_yaml("settings.yaml")
    gazetteer = _load_yaml("gazetteer.yaml")
    dims = settings["content"]["chart_dimensions"][platform]
    party_colours = {p["code"]: p["colour_hex"] for p in gazetteer["parties"]}

    fig, ax = plt.subplots(figsize=(dims[0] / 100, dims[1] / 100), dpi=100)

    parties_present = {p for snap in history for p in snap.party_forecasts}
    for party_code in sorted(parties_present):
        dates_ = [s.run_date for s in history]
        points = [s.party_forecasts[party_code]["point"] for s in history]
        lowers = [s.party_forecasts[party_code]["ci_lower"] for s in history]
        uppers = [s.party_forecasts[party_code]["ci_upper"] for s in history]
        colour = party_colours.get(party_code, "#333333")
        ax.plot(dates_, points, label=party_code, color=colour, linewidth=2)
        ax.fill_between(dates_, lowers, uppers, color=colour, alpha=0.15)

    ax.axhline(y=0, color="#cccccc", linewidth=0.5)
    ax.set_ylabel("Projected vote share (%)")
    ax.set_title(f"GH2028 Watch — forecast trend as of {history[-1].run_date.isoformat()}")
    ax.legend(loc="upper left", frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(output_path)
    plt.close(fig)
    return output_path


def format_post_copy(snapshot: MonthlyForecastSnapshot, platform: str) -> str:
    """Platform-formatted caption text. Tone rules from spec Component 4:
    analytical not partisan, no 'will win' language, standing disclaimer,
    branded + issue hashtag only (never a party-branded hashtag)."""
    settings = _load_yaml("settings.yaml")
    brand = settings["content"]["brand"]

    party_lines = []
    for code, f in sorted(snapshot.party_forecasts.items()):
        party_lines.append(f"{code} {f['ci_lower']:.0f}–{f['ci_upper']:.0f}%")
    forecast_line = " | ".join(party_lines)

    top_issue = snapshot.top_issues[0][0] if snapshot.top_issues else None
    issue_hashtag = f"#{top_issue.replace('_', '').title()}" if top_issue else ""

    hashtags = " ".join([brand["hashtag_primary"], *brand["hashtags_standing"], issue_hashtag]).strip()

    body = (
        f"\U0001f1ec\U0001f1ed GH2028 WATCH — {snapshot.run_date.strftime('%B %Y')} Update\n\n"
        f"Current projection: {forecast_line} (95% CI, poll-blended + sentiment-adjusted)\n\n"
        f"Based on {snapshot.n_polls_used} published polls + "
        f"{snapshot.n_mentions_used:,} geolocated social mentions.\n\n"
        f"{settings['content']['disclaimer_line']}\n\n"
        f"{hashtags}"
    )

    if platform == "instagram":
        # Instagram captions are typically shorter/punchier with link-in-bio
        # rather than inline methodology link — condense.
        body = body.replace(settings["content"]["disclaimer_line"], "Independent, methodology-first. Link in bio.")

    return body


def check_anomaly_gate(current: MonthlyForecastSnapshot, previous: MonthlyForecastSnapshot | None) -> bool:
    """Returns True if the swing since last month exceeds the kill-switch
    threshold in settings.yaml — caller must halt auto-publish and route to
    human review if this returns True. Mirrors review_gates.anomaly_swing_threshold_points."""
    if previous is None:
        return False
    settings = _load_yaml("settings.yaml")
    threshold = settings["review_gates"]["anomaly_swing_threshold_points"]
    for party_code, f in current.party_forecasts.items():
        prev_f = previous.party_forecasts.get(party_code)
        if prev_f is None:
            continue
        if abs(f["point"] - prev_f["point"]) > threshold:
            return True
    return False
