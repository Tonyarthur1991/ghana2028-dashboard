"""
Gazetteer-seeded entity recognition — links each social/news mention to the
specific party, candidate, or issue it targets. Off-the-shelf NER (spaCy's
default en_core_web_* models) will not reliably recognise Ghanaian names,
constituencies, or party aliases, so this is a rule-augmented matcher built
directly from config/gazetteer.yaml rather than a from-scratch trained model.

This deliberately does entity-level linking, not whole-post classification:
a single post frequently praises one party while attacking another, and the
spec requires per-entity sentiment, not per-post sentiment.
"""
import os
import re
from dataclasses import dataclass, field

import spacy
import yaml
from spacy.matcher import PhraseMatcher

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "gazetteer.yaml")


@dataclass
class EntitySpan:
    entity_type: str   # 'party' | 'candidate' | 'issue'
    entity_code: str
    matched_text: str
    start_char: int
    end_char: int


@dataclass
class LinkedEntities:
    text: str
    spans: list[EntitySpan] = field(default_factory=list)

    def entity_codes(self) -> set[str]:
        return {s.entity_code for s in self.spans}


class GazetteerNER:
    def __init__(self, gazetteer_path: str = CONFIG_PATH):
        with open(gazetteer_path, "r", encoding="utf-8") as f:
            self.gazetteer = yaml.safe_load(f)

        # blank pipeline is deliberate — we only need the tokenizer + phrase
        # matcher, not a full statistical NER model, since generic models
        # don't know Ghanaian entities anyway.
        self.nlp = spacy.blank("en")
        self.matcher = PhraseMatcher(self.nlp.vocab, attr="LOWER")
        self._entity_lookup: dict[str, tuple[str, str]] = {}  # match_id -> (type, code)

        self._register_parties()
        self._register_candidates()
        self._register_issues()

    def _add_terms(self, entity_type: str, entity_code: str, terms: list[str]) -> None:
        match_key = f"{entity_type}:{entity_code}"
        patterns = [self.nlp.make_doc(t) for t in terms]
        self.matcher.add(match_key, patterns)
        self._entity_lookup[match_key] = (entity_type, entity_code)

    def _register_parties(self) -> None:
        for party in self.gazetteer["parties"]:
            self._add_terms("party", party["code"], party["aliases"])

    def _register_candidates(self) -> None:
        for bloc_name, bloc in self.gazetteer["candidates"].items():
            for c in bloc:
                # candidate code is the party prefix + surname, kept stable
                # even if `status` changes from speculative to confirmed
                code = f"{bloc_name.upper()}:{c['name'].split()[-1]}"
                self._add_terms("candidate", code, c["aliases"] + [c["name"]])

    def _register_issues(self) -> None:
        for issue_code, terms in self.gazetteer["issues"].items():
            self._add_terms("issue", issue_code, terms)

    def extract(self, text: str) -> LinkedEntities:
        doc = self.nlp(text)
        matches = self.matcher(doc)
        spans = []
        for match_id, start, end in matches:
            match_key = self.nlp.vocab.strings[match_id]
            entity_type, entity_code = self._entity_lookup[match_key]
            span = doc[start:end]
            spans.append(
                EntitySpan(
                    entity_type=entity_type,
                    entity_code=entity_code,
                    matched_text=span.text,
                    start_char=span.start_char,
                    end_char=span.end_char,
                )
            )
        return LinkedEntities(text=text, spans=spans)


def infer_region(text: str, declared_location: str | None, gazetteer_regions: list[str]) -> str | None:
    """Best-effort region inference. Per the spec: publish with a low-
    confidence caveat, do not present false precision — Greater Accra and
    Ashanti will dominate any sample."""
    haystack = f"{declared_location or ''} {text}".lower()
    for region in gazetteer_regions:
        if region.lower() in haystack:
            return region
    return None


if __name__ == "__main__":
    ner = GazetteerNER()
    sample = "Bawumia's economic plan sounds good but NDC's handling of galamsey was worse."
    linked = ner.extract(sample)
    for s in linked.spans:
        print(s)
