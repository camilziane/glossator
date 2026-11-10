"""This library's own settings: library/library.toml, optional, versioned with the bibliographies. Every key has a
default, so a library without the file works.

    language = "English"                # the language of the inbox's summaries and Haiku's reasons
    refs_bibs = ["../paper/refs.bib"]   # BibTeX files whose keys `new` reuses for the articles they cite
    zotero_collection = "glossator"     # Zotero: the collection holding one sub-collection per bibliography
    zotero_tag = "glossator"            # Zotero: the tag on the notes and linked files the tool writes

The inbox's papers go to the sub-collection `<zotero_collection> / Inbox` and carry the tag `<zotero_tag> inbox`
(and the line `<zotero_tag> inbox: <id>` in Extra). A Zotero library filled under other names keeps working when
library.toml names them.
"""

from __future__ import annotations

import tomllib
from functools import cache
from pathlib import Path

from .paths import LIBRARY

SETTINGS_NAME = "library.toml"
DEFAULTS = {"language": "English", "zotero_collection": "glossator", "zotero_tag": "glossator"}


@cache
def settings() -> dict:
    path = LIBRARY / SETTINGS_NAME
    return tomllib.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def text_setting(name: str) -> str:
    """A setting that is one line of text: library.toml's value, else its default (an empty value is the default)."""
    value = settings().get(name)
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{SETTINGS_NAME}: {name} is text (in quotes), not {value!r}")
    value = " ".join((value or "").split())
    return value or DEFAULTS[name]


def language() -> str:
    return text_setting("language")


def zotero_collection() -> str:
    """The Zotero collection that holds one sub-collection per bibliography (and the inbox's `Inbox`)."""
    name = text_setting("zotero_collection")
    if "/" in name:
        raise ValueError(f"{SETTINGS_NAME}: zotero_collection is one collection's name, without '/': {name!r}")
    return name


def zotero_tag() -> str:
    """The tag the tool puts on what it writes in Zotero; the inbox's papers carry `<tag> inbox`."""
    return text_setting("zotero_tag")


def refs_bibs() -> list[Path]:
    """The BibTeX files `new` takes citation keys from (paths relative to library/)."""
    return [(LIBRARY / p).resolve() for p in settings().get("refs_bibs", [])]
