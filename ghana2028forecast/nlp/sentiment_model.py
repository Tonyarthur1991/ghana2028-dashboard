"""
Sentiment scoring for Ghanaian political text — multilingual (English, Twi,
Ghanaian Pidgin). Do NOT swap in a generic English sentiment model (VADER,
base RoBERTa-sentiment): per the spec, these systematically misread
Ghanaian Pidgin sarcasm and Twi-English code-switching.

Two-stage design:
  1. Language ID (extended langid, not vanilla — vanilla misclassifies Twi/
     Pidgin as English) routes text to the right model path.
  2. Fine-tuned transformer scores sentiment in [-1, +1] with a confidence.

The fine-tuned checkpoint does not exist yet — `base_checkpoint` in
settings.yaml is a placeholder GhanaNLP Twi-BERT model that needs fine-tuning
on the AsanteTwiSenti corpus (https://www.sciencedirect.com/science/article/pii/S2352340925001921)
before this is production-accurate. Until then, `SentimentScorer.score()`
returns real model output but should be treated as an unvalidated baseline —
run backtest_2024.py and manual spot-checks before trusting it.
"""
import logging
import os
from dataclasses import dataclass

import langid
import yaml
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("sentiment_model")

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")

# Ghanaian Pidgin lexical markers that vanilla langid.py mis-tags as English.
# This is a cheap heuristic layer, not a real Pidgin language-ID model — swap
# for a proper classifier once GhanaNLP or similar ships one.
PIDGIN_MARKERS = {"dey", "wahala", "abeg", "chale", "waa", "no be", "sef", "wetin"}


@dataclass
class SentimentResult:
    text_language: str          # 'en' | 'tw' | 'pcm-gh' | other ISO code
    sentiment_score: float      # [-1, +1]
    confidence: float           # [0, 1]
    sarcasm_flagged: bool


def detect_language(text: str) -> str:
    lowered = text.lower()
    if any(marker in lowered for marker in PIDGIN_MARKERS):
        return "pcm-gh"
    lang, _ = langid.classify(text)
    return lang


class SentimentScorer:
    def __init__(self, checkpoint: str | None = None):
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            settings = yaml.safe_load(f)
        self.checkpoint = checkpoint or settings["sentiment_model"]["base_checkpoint"]
        self.confidence_floor = settings["sentiment_model"]["confidence_floor"]
        logger.info("Loading sentiment checkpoint: %s", self.checkpoint)
        self.tokenizer = AutoTokenizer.from_pretrained(self.checkpoint)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.checkpoint)
        self._pipe = pipeline(
            "sentiment-analysis", model=self.model, tokenizer=self.tokenizer, return_all_scores=True
        )

    def _sarcasm_heuristic(self, text: str) -> bool:
        """Cheap sarcasm flag: excessive punctuation/emoji combined with
        positive-lexicon words is a common Ghanaian Twitter sarcasm pattern
        ('well well 🙄', 'ei nice one 🙃'). Not a substitute for a trained
        sarcasm classifier — flag for human review, don't auto-invert."""
        lowered = text.lower()
        sarcasm_markers = ["🙄", "🙃", "well well", "ok oo", "nice one", "as if"]
        return any(m in lowered for m in sarcasm_markers)

    def score(self, text: str) -> SentimentResult:
        language = detect_language(text)
        raw = self._pipe(text)[0]  # list of {label, score} across classes
        best = max(raw, key=lambda r: r["score"])
        # Map model label space to [-1, +1]. Adjust mapping to match whatever
        # label set the fine-tuned checkpoint actually uses (POSITIVE/NEGATIVE/
        # NEUTRAL vs LABEL_0/1/2) — this is checkpoint-dependent, verify after
        # fine-tuning on AsanteTwiSenti.
        polarity_map = {"POSITIVE": 1.0, "NEUTRAL": 0.0, "NEGATIVE": -1.0}
        score = polarity_map.get(best["label"].upper(), 0.0) * best["score"]
        confidence = best["score"]
        sarcasm = self._sarcasm_heuristic(text)
        if confidence < self.confidence_floor:
            logger.debug("Below confidence floor (%.2f < %.2f), still returned but should be excluded downstream",
                         confidence, self.confidence_floor)
        return SentimentResult(
            text_language=language,
            sentiment_score=score,
            confidence=confidence,
            sarcasm_flagged=sarcasm,
        )


if __name__ == "__main__":
    # Smoke test — requires the checkpoint to be downloadable/available.
    scorer = SentimentScorer()
    samples = [
        "The cedi keeps falling and nobody in government seems to care.",
        "NDC dey try well well for this economy 🙄",
        "Bawumia's plan for jobs actually makes sense to me.",
    ]
    for s in samples:
        result = scorer.score(s)
        print(f"{s!r} -> {result}")
