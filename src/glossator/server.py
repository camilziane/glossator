"""The MCP server `glossator mcp`: the search index of build/ for any MCP client (Claude Code, the desktop app).

Every tool answers in a few lines on purpose: search, then read only the passages the answer needs. The server
reopens the index when `glossator build` rewrites it, so it never needs a restart.
"""

from __future__ import annotations

import contextlib
import threading
from collections.abc import Iterator
from typing import Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from .bibliography import bibliographies
from .index import DB_NAME, Index, NoIndexError, format_article, format_articles, format_hits, format_status
from .paths import BUILD
from .vectors import MODEL, embed_query, ready_for_queries


def library_line() -> str:
    """The bibliographies, for the instructions; a bibliography whose profile does not load (its message is on
    stderr) leaves the server up, its index still searchable."""
    try:
        return "; ".join(f"{b.name} ({b.title})" for b in bibliographies()) or "none yet"
    except SystemExit:
        return "not readable on this computer (`glossator doctor` says why)"


INSTRUCTIONS = (
    "The bibliographies of this library: "
    + library_line()
    + ". Each article has a curated record (facts checked against its PDF, each with its page) and the text of its "
    "PDFs. Search in English (the papers are), read only the passages the answer needs, and cite each fact as "
    "<key>, p. N (or <key>, record: <section>). Prefer the records for numbers; quote the PDFs' text word for word, "
    "and `verify` a citation you are not sure of before giving it. The inbox tools list the new papers the daily "
    "scout found and record the decisions you are given on them."
)
NO_INDEX = (
    "No search index here yet ({path}). Run `uv run glossator build` at the repository's root (for the demo: "
    "`GLOSSATOR_HOME=demo uv run glossator build`), then ask again: the server picks the new index up by itself."
)
READ_ONLY = ToolAnnotations(readOnlyHint=True, idempotentHint=True, openWorldHint=False)

server = MCPServer("glossator", instructions=INSTRUCTIONS)
_index: tuple[float, Index] | None = None


def index() -> Index:
    """The index, reopened when build/ has a newer one."""
    global _index
    path = BUILD / DB_NAME
    mtime = path.stat().st_mtime if path.exists() else 0.0
    if _index is None or _index[0] != mtime:
        _index = (mtime, Index(path))
    return _index[1]


@contextlib.contextmanager
def answers() -> Iterator[None]:
    """The failures a tool expects (no index yet, an unknown article or reference, an empty query) as a plain
    message for the client, not a crash with a traceback in the server's log."""
    try:
        yield
    except NoIndexError:
        raise ToolError(NO_INDEX.format(path=BUILD / DB_NAME)) from None
    except (KeyError, ValueError) as e:
        raise ToolError(str(e.args[0]) if e.args else e.__class__.__name__) from None


@server.tool(annotations=READ_ONLY)
def search(
    query: str,
    bibliography: str | None = None,
    article: str | None = None,
    scope: Literal["all", "records", "text"] = "all",
    limit: int = 8,
    mode: Literal["hybrid", "keyword", "semantic"] = "hybrid",
) -> str:
    """Find the passages that answer a query, best first, at most two per article. `query` in English (the papers
    are): words, a question, or "quoted phrases"; codes like CASP14 or r.m.s.d.95 as written. `mode`: 'hybrid'
    (words and meaning together, the default), 'keyword' (exact terms only) or 'semantic' (meaning only).
    `scope`: 'records' (the curated facts), 'text' (the PDFs) or 'all'. Each hit: a reference (pass it to
    `read`), the article, a snippet."""
    with answers():
        idx = index()
        hits = idx.search(query, bibliography, article, scope, max(1, min(limit, 30)), mode=mode, wait=False)
    hits = format_hits(hits)
    if mode != "keyword" and idx.last_mode == "keyword":
        hits += "\n(ranked by words only: the meaning model is still loading; ask again in a few seconds)"
    return hits


@server.tool(annotations=READ_ONLY)
def read(ref: str, whole_page: bool = False) -> str:
    """The text of one passage: a reference from `search` (`<bibliography>/<key>/paper.pdf#5.2`, or
    `.../record:details`). `whole_page` returns its whole page."""
    with answers():
        return index().read(ref, whole_page)


@server.tool(annotations=READ_ONLY)
def verify(key: str, text: str, page: int | None = None, bibliography: str | None = None) -> str:
    """Check a citation before giving it: is `text` (a quote, or the words of a claim) on page `page` of article
    `key`'s PDFs? Answers verbatim (word for word on that page), close (most of its words together on that page or
    the next), elsewhere (on another page: cite that one), or absent; with the page and an excerpt."""
    with answers():
        v = index().verify(key, text, page, bibliography)
    where = f"p. {v['page']} of {v['file']}" if v.get("page") else "nowhere"
    return f"{v['found']}: {key}, {where} ({int(v['score'] * 100)}% of the words together)" + (
        f'\n"{v["excerpt"]}"' if v.get("excerpt") else ""
    )


@server.tool(annotations=READ_ONLY)
def article(key: str, bibliography: str | None = None, sections: list[str] | None = None, summary: bool = False) -> str:
    """One article: by default its citation, one-line summary, "at a glance" and the names of its record's
    sections; `sections` (e.g. ['details', 'results']) returns those sections of the record; `summary` the whole
    curated summary (long)."""
    with answers():
        return format_article(index(), key, bibliography, sections, summary)


@server.tool(annotations=READ_ONLY)
def list_articles(bibliography: str | None = None, contains: str | None = None) -> str:
    """Every article (or one bibliography's), one line each: reference, citation, title. `contains` keeps the lines
    with that text."""
    with answers():
        lines = format_articles(index().articles(bibliography)).splitlines()
    if contains:
        lines = [x for x in lines if contains.lower() in x.lower()]
    return "\n".join(lines) or "No article."


@server.tool(annotations=READ_ONLY)
def status() -> str:
    """When the index was built, what it holds, and whether the meaning model is loaded yet."""
    try:
        idx = index()
    except NoIndexError:
        return NO_INDEX.format(path=BUILD / DB_NAME)
    model = "no vectors in this index" if not idx.has_vectors() else ("ready" if ready_for_queries() else "loading")
    return f"{format_status(idx)}\nSemantic search ({MODEL}): {model}."


@server.tool(annotations=READ_ONLY)
def inbox(
    status: Literal["new", "accepted", "rejected", "added"] = "new",
    bibliography: str | None = None,
    include_low: bool = False,
    limit: int = 30,
) -> str:
    """The paper inbox: papers the daily scout found and Haiku triaged, waiting for a decision. Each: id,
    relevance (★ to ★★★), bibliography, first author, year, venue, title ("PDF here" when its open PDF was
    fetched into library/inbox/pdfs/), a summary in the library's language and why. `include_low` also lists those
    rated below the inbox's threshold."""
    from . import inbox as box

    rows = box.items(status, bibliography, show_from=0 if include_low else None)[: max(1, min(limit, 100))]
    head = box.status().splitlines()[1] if box.STATE.exists() else "No run yet."
    return head + "\n\n" + ("\n".join(box.line(it) for it in rows) or "Nothing here.")


@server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True))
def inbox_decide(ids: list[str], decision: Literal["accept", "reject"], note: str = "") -> str:
    """Record a decision on inbox papers: 'accept' (to be added by /glossator-add inbox) or 'reject' (never
    proposed again). Only on an explicit instruction, for the ids it names."""
    from . import inbox as box

    return "\n".join(box.decide(ids, "accepted" if decision == "accept" else "rejected", note))


@server.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True))
def inbox_fetch(ids: list[str] | None = None, min_relevance: int | None = None) -> str:
    """Fetch the open PDFs of inbox papers into library/inbox/pdfs/ (checked: a PDF bearing the paper's title), and
    commit them so that a sync brings them to the library's other computers: the papers named, or every paper
    waiting for a decision rated at least `min_relevance` (by default the inbox's fetch_from). Only when asked."""
    from . import inbox as box

    lines: list[str] = []
    box.fetch(ids or None, min_relevance, log=lines.append)
    return "\n".join(line.strip() for line in lines)


def warm_up() -> None:
    """Load the index's vectors and the query model in the background: the first search does not wait for them."""
    try:
        if index().has_vectors():
            embed_query("warm up")
    except Exception:  # no index yet, or no model: searches say so themselves
        pass


def main() -> None:
    threading.Thread(target=warm_up, daemon=True).start()
    server.run("stdio")
