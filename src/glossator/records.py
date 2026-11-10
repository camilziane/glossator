"""The record format every profile shares: the generic base of a record.json (its bibliographic fields, the paper,
its supplementary files, its figures, the overview, the open points, the curation), its skeleton (a TODO in every
field), the shapes profiles reuse (a quote, a result) and the base vocabularies. A profile (`glossator.profiles`)
adds its own sections between `overview` and `open_points`."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping

from .paths import PACKAGE
from .util import today


class Vocabulary(dict):
    """A controlled vocabulary: value -> {"label", "means"}, and its name (what `check` and `vocab` print)."""

    def __init__(self, name: str, values: Mapping):
        super().__init__(values)
        self.name = name


def vocabularies(raw: Mapping[str, Mapping]) -> dict[str, Vocabulary]:
    """Named vocabularies from {name: {value: {"label", "means"}}}, in their order."""
    return {name: Vocabulary(name, values) for name, values in raw.items()}


# The vocabularies of the base: the version of the paper's copy, the state of its supplementary files.
VOCAB = vocabularies(json.loads((PACKAGE / "vocabulary.json").read_text(encoding="utf-8")))


FOLDER = ("paper.pdf", "record.json", "figures", "supplementary")


SENTINELS = ("not reported", "not applicable", "none")


NO_FIGURE = "none in the paper"


THIS_PAPER = "this paper"


KEY_RE = re.compile(r"^[a-z]+\d{4}[a-z]*$")


DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")


DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")


TMP_RE = re.compile(r"^\..+\.\d+\.tmp$")


SUPP_EXT = (".pdf", ".docx", ".xlsx", ".csv", ".tsv", ".txt")


IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff")


S, I, B = "", 0, False  # noqa: E741 (the placeholders of a string, an integer and a boolean)


QUOTE = {"text": S, "where": S, "in": S}


# One number of the paper with what it holds for; `headline` marks the 1 to 3 the paper leads with.
RESULT = {"name": S, "value": S, "condition": S, "baseline": S, "headline": B, "source": S}


# The base of every record.json, before the profile's sections (HEAD) and after them (TAIL): `check` refuses a
# missing or an extra key anywhere.
HEAD = {
    "schema": I,
    "key": S,
    "status": S,
    "kind": S,
    "bib": {
        "title": S,
        "authors": [S],
        "year": I,
        "date": S,
        "venue": S,
        "venue_short": S,
        "volume": S,
        "issue": S,
        "pages": S,
        "doi": S,
        "pmid": S,
        "pmcid": S,
        "openalex": S,
        "type": S,
        "cite": S,
        "place": S,
        "lab": S,
    },
    "paper": {
        "file": S,
        "version": S,
        "source_url": S,
        "host": S,
        "license": S,
        "pages": I,
        "sha256": S,
        "retrieved": S,
        "note": S,
    },
    "supplementary": {
        "status": S,
        "note": S,
        "files": [{"file": S, "label": S, "source_url": S, "sha256": S, "bytes": I, "pages": I}],
    },
    "figures": [{"role": S, "file": S, "from": S, "caption": S}],
    "overview": {"one_line": S, "abstract": [S]},
}
TAIL = {
    "open_points": [S],
    "curation": {"date": S, "read": S, "checks": [{"claim": S, "verdict": S}]},
}


def record_model(sections: Mapping) -> dict:
    """The exact shape of a record.json whose profile has these sections."""
    return {**HEAD, **sections, **TAIL}


# What the base's TODOs say, unless the profile says it otherwise (Profile.hints).
HINTS = {
    "one_line": "the paper in one sentence: what it proposes or measures, and its main result",
    "abstract": (
        "3 to 6 sentences in your own words: question, approach, main result with its number, what it is used "
        "for; 1 to 3 paragraphs"
    ),
    "read": "what you read: main text, appendix, supplementary pages",
}


def todo(hint: str) -> str:
    return f"TODO: {hint}"


def quote_skeleton() -> dict:
    return {
        "text": todo("the paper's sentence, copied from .work/<key>/*.txt (run: text <key>)"),
        "where": todo("page and section, e.g. 'p. 8, Methods (Study design)'"),
        "in": THIS_PAPER,
    }


def result_skeleton(
    name: str, condition: str, baseline: str = "the comparison reported with it, or 'not reported'"
) -> dict:
    """A result to fill: what is measured (`name`), what the number holds for (`condition`), its comparison."""
    return {
        "name": todo(name),
        "value": todo("as printed in the paper, with its unit; prefix '≈' only when read from a figure"),
        "condition": todo(condition),
        "baseline": todo(baseline),
        "headline": True,
        "source": todo("page, figure or table"),
    }


def skeleton_paper() -> dict:
    return {
        "file": "paper.pdf",
        "version": todo("run fetch-pdf"),
        "source_url": todo("run fetch-pdf"),
        "host": todo("run fetch-pdf"),
        "license": todo("run fetch-pdf"),
        "pages": 0,
        "sha256": todo("run fetch-pdf"),
        "retrieved": todo("run fetch-pdf"),
        "note": todo(
            "what a reader should know about this copy (e.g. 'publisher version not open; arXiv preprint v2'), "
            "or 'none'"
        ),
    }


def skeleton_supplementary() -> dict:
    return {
        "status": todo("retrieved | partial | none-published | in-paper | not-open"),
        "note": todo("what the article publishes as supplementary material, what is here, what is missing and why"),
        "files": [],
    }


def skeleton(biblio, key: str, bib: dict) -> dict:
    """A new record of this bibliography: every field present, each TODO saying what goes there."""
    profile = biblio.plugin
    hints = {**HINTS, **profile.hints}
    return {
        "schema": 1,
        "key": key,
        "status": "draft",
        "kind": todo(" | ".join(biblio.vocab[profile.kind_vocab])),
        "bib": bib,
        "paper": skeleton_paper(),
        "supplementary": skeleton_supplementary(),
        "figures": [],
        "overview": {"one_line": todo(hints["one_line"]), "abstract": [todo(hints["abstract"])]},
        **profile.skeleton(biblio),
        "open_points": [],
        "curation": {"date": today(), "read": todo(hints["read"]), "checks": []},
    }


def is_sentinel(v) -> bool:
    return isinstance(v, str) and v.strip() in SENTINELS


def pending(v) -> bool:
    """A TODO still in place: reported once as such, skipped by the other checks."""
    return isinstance(v, str) and v.strip().upper().startswith("TODO")


def vlabel(vocab: Mapping, value: str) -> str:
    """The label of a vocabulary's value, or the value itself when the vocabulary lacks it."""
    entry = vocab.get(value)
    return entry["label"] if isinstance(entry, dict) else value
