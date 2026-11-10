"""The page's data: what the web app (`web/`) shows, written by `build` as `build/data/library.json`.

The same view the HTML page and the Markdown export are written from (`render.article_view`, `render.hub_tables`),
as JSON: a block is `{"t": kind, ...}`, an inline part a string or `{"t": kind, ...}`. Every file is named by its
path under `library/` (`library/<bibliography>/articles/<key>/paper.pdf`), which `glossator serve` serves beside the
app, and another article by its bibliography and key. The web app holds no rule of a profile: it draws blocks."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from pathlib import Path

from . import inbox
from .bibliography import Collection
from .paths import BUILD
from .pdf import journal_offset, pdf_page_texts
from .records import is_sentinel
from .render import GENERATED, article_view, hub_order, hub_tables, short_authors
from .util import lfs_oid, load_json, write_atomic
from .zotero import tags

VERSION = 1  # the format's version, raised when a field changes meaning or goes
DATA = "data/library.json"  # under build/


def files_href(bib: str, key: str, href: str) -> str:
    """A link of an article's view: a web address as it is, a file of the article under library/."""
    if href.startswith(("http:", "https:", "#")):
        return href
    return f"library/{bib}/articles/{key}/{href}"


def inline(parts: list, bib: str, key: str = "") -> list:
    """Inline parts as JSON: a string, or {"t": "a", "href", "text"}, {"t": "art", "bib", "key", "text"},
    {"t": "em" | "b" | "muted" | "todo" | "badge" | "sub", "text"}."""
    out = []
    for p in parts:
        if isinstance(p, str):
            out.append(p)
        elif p[0] == "a":
            out.append({"t": "a", "href": files_href(bib, key, p[1]), "text": p[2]})
        elif p[0] == "art":
            out.append({"t": "art", "bib": bib, "key": p[1], "text": p[2]})
        elif p[1] or p[0] != "sub":
            out.append({"t": p[0], "text": p[1]})
    return out


def blocks(bl: list, bib: str, key: str = "") -> list:
    """Blocks as JSON: p, h3, fields, bullets, table, quote, figure, source."""
    out = []
    for b in bl:
        kind = b[0]
        if kind in ("p", "source"):
            out.append({"t": kind, "c": inline(b[1], bib, key)})
        elif kind == "h3":
            out.append({"t": "h3", "text": b[1]})
        elif kind == "fields":
            out.append({"t": "fields", "items": [{"label": lb, "c": inline(v, bib, key)} for lb, v in b[1]]})
        elif kind == "bullets":
            out.append({"t": "bullets", "items": [inline(v, bib, key) for v in b[1]]})
        elif kind == "table":
            out.append({"t": "table", "head": b[1], "rows": [[inline(c, bib, key) for c in row] for row in b[2]]})
        elif kind == "quote":
            out.append({"t": "quote", "c": inline(b[1], bib, key), "cite": inline(b[2], bib, key)})
        elif kind == "figure":
            out.append(
                {"t": "figure", "src": files_href(bib, key, b[1]), "alt": b[2], "caption": inline(b[3], bib, key)}
            )
    return out


def plain(parts: list) -> str:
    return "".join(p if isinstance(p, str) else p.get("text", "") for p in parts)


def notices() -> dict[str, list[dict]]:
    """The notices the inbox's weekly check found (`notices.py`), keyed `<bibliography>/<key>`."""
    return (load_json(inbox.STATE).get("notices") or {}) if inbox.STATE.exists() else {}


# A record's own word on its PDF's pages: paper.note "… (p. 1 = journal p. 1031)".
JOURNAL_PAGE = re.compile(r"p\.\s?1\s?=\s?journal p\.\s?(\d+)")
OFFSETS = "journal-pages.json"  # under build/: the offset found in each published PDF, so that it is read once
DETECTION = 1  # the version of pdf.journal_offset whose results OFFSETS keeps


def note_offset(rec: dict) -> int | None:
    """The journal offset the record states in paper.note ("p. 1 = journal p. N"), if it does."""
    m = JOURNAL_PAGE.search(str((rec.get("paper") or {}).get("note") or ""))
    return int(m.group(1)) - 1 if m else None


def reference_fields(rec: dict, detected: int | None = None) -> dict:
    """What a full reference needs beyond the card: every author, volume, issue, the journal's pages, the PDF's
    version, and how a PDF page maps to the journal's (`journal_offset`: journal page = PDF page + offset): the
    record's word when it states it, else what the published PDF's own page numbers show (`detected`), else null."""
    b, paper = rec.get("bib") or {}, rec.get("paper") or {}
    stated = note_offset(rec)
    return {
        "authors_full": [a for a in b.get("authors") or [] if isinstance(a, str) and a],
        "volume": str(b.get("volume") or ""),
        "issue": str(b.get("issue") or ""),
        "pages": str(b.get("pages") or ""),
        "version": str(paper.get("version") or ""),
        "journal_offset": stated if stated is not None else detected,
    }


class PageOffsets:
    """The journal offsets of the published PDFs (pdf.journal_offset), read once per PDF and journal range and kept
    in build/ (OFFSETS): a build reads only the PDFs it has not seen."""

    def __init__(self, path: Path | None = None):
        self.path = path or BUILD / OFFSETS
        try:
            kept = load_json(self.path)
        except (OSError, ValueError):
            kept = {}
        fresh = isinstance(kept, dict) and kept.get("detection") == DETECTION and isinstance(kept.get("offsets"), dict)
        self.known: dict = kept["offsets"] if fresh else {}
        self.changed = False

    def of(self, folder: Path, rec: dict) -> int | None:
        """The offset of the article's paper.pdf, when it is the published version and here (not a placeholder)."""
        paper = rec.get("paper") or {}
        pdf = folder / "paper.pdf"
        if paper.get("version") != "publishedVersion" or not paper.get("sha256") or not pdf.is_file():
            return None
        pages = str((rec.get("bib") or {}).get("pages") or "")
        ident = f"{paper['sha256']} {pages}"
        if ident not in self.known:
            if lfs_oid(pdf):
                return None
            self.known[ident] = journal_offset(pdf_page_texts(pdf), pages)
            self.changed = True
        return self.known[ident]

    def save(self) -> None:
        if self.changed:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            write_atomic(self.path, json.dumps({"detection": DETECTION, "offsets": self.known}, indent=0) + "\n")
            self.changed = False


def article(rec: dict, coll: Collection, found: dict | None = None, offsets: PageOffsets | None = None) -> dict:
    """An article: what lists, filters and searches it (its card, with its full reference), and its whole view."""
    bib, key = coll.biblio.name, rec["key"]
    b = rec.get("bib") or {}
    detected = offsets.of(coll.biblio.articles / key, rec) if offsets and note_offset(rec) is None else None
    card = {
        "key": key,
        "cite": b.get("cite") or key,
        "title": b.get("title") or key,
        "authors": short_authors(b.get("authors") or []),
        "year": int(b["year"]) if str(b.get("year", "")).isdigit() else None,
        "venue": b.get("venue", ""),
        "doi": b.get("doi", "") if not is_sentinel(b.get("doi", "")) else "",
        "status": rec.get("status", ""),
        "tags": tags(rec, coll) if rec.get("status") == "complete" else [],
        "one_line": (rec.get("overview") or {}).get("one_line", ""),
        # retractions, expressions of concern, corrections: {type, label, doi, date, title}
        "notices": (found or {}).get(f"{bib}/{key}", []),
        **reference_fields(rec, detected),
    }
    try:
        v = article_view(rec, coll)
    except (KeyError, TypeError, AttributeError) as e:  # `check` names what is wrong
        return {**card, "error": f"{e.__class__.__name__}: {e}"}
    return {
        **card,
        "view": {
            "kicker": inline(v["kicker"], bib, key),
            "meta": inline(v["meta"], bib, key),
            "lab": inline(v["lab"], bib, key),
            "files": [
                {"href": files_href(bib, key, href), "label": label, "primary": primary}
                for href, label, primary in v["files"]
            ],
            "lead": inline(v["lead"], bib, key),
            "draft": v["draft"],
            "glance": [{"label": lb, "lines": [inline(x, bib, key) for x in lines]} for lb, lines in v["glance"]],
            "sections": [
                {"id": sid, "title": title, "blocks": blocks(bl, bib, key)} for sid, title, bl in v["sections"]
            ],
            "footer": inline(v["footer"], bib, key),
        },
    }


def bibliography(coll: Collection, found: dict | None = None, offsets: PageOffsets | None = None) -> dict:
    """A bibliography: its profile, its tables (the hub) and its articles, newest first."""
    bi = coll.biblio
    recs = coll.recs
    return {
        "name": bi.name,
        "short": bi.short,
        "title": bi.title,
        "profile": bi.profile,
        "scope": bi.scope,
        "complete": sum(1 for r in recs.values() if r.get("status") == "complete"),
        "tables": [
            {"id": sid, "title": title, "head": table[1], "rows": [[inline(c, bi.name) for c in r] for r in table[2]]}
            for sid, title, table in hub_tables(coll)
        ],
        "articles": [article(recs[k], coll, found, offsets) for k in hub_order(recs)],
    }


def inbox_paper(it: dict) -> dict:
    """An inbox paper as the page shows it; its PDF when this computer has it."""
    t = it.get("triage") or {}
    here = inbox.pdf_here(it)
    return {
        "id": it["id"],
        "title": it.get("title", ""),
        "authors": [a for a in it.get("authors") or [] if isinstance(a, str) and a],
        "venue": it.get("venue") or "",
        "date": it.get("date") or "",
        "doi": it.get("doi") or "",
        "url": it.get("url") or "",
        "pdf": f"library/{here.relative_to(inbox.INBOX.parent).as_posix()}" if here else "",
        "pdf_online": (it.get("pdf") or "") if not here else "",
        "abstract": it.get("abstract") or "",
        "status": it.get("status") or "",
        "found": it.get("found") or "",
        "sources": it.get("sources") or [],
        "queries": it.get("queries") or [],
        "triage": {k: t.get(k) for k in ("bib", "relevance", "kind", "summary", "why", "by")},
        "prior": it.get("prior"),  # {bib, score 0–1, by: similarity | model}: closeness to the library, or null
    }


def library_data(colls: Iterable[Collection], built: str) -> dict:
    """Everything the page shows: every bibliography, and the inbox's papers waiting for a decision."""
    colls, found, offsets = list(colls), notices(), PageOffsets()
    data = {
        "version": VERSION,
        "built": built,
        "generated": GENERATED,
        "bibliographies": [bibliography(c, found, offsets) for c in colls],
        "inbox": None,
    }
    offsets.save()
    if inbox.INBOX.exists():
        state = load_json(inbox.STATE) if inbox.STATE.exists() else {}
        waiting = inbox.items("new") + inbox.items("accepted")
        data["inbox"] = {"last_run": state.get("last_run", ""), "papers": [inbox_paper(it) for it in waiting]}
    return data
