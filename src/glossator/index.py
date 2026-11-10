"""The search index `build` writes into build/index.sqlite, and the searches made on it.

One SQLite file holds every article (its record, its summary), the text of its PDFs page by page, and a full-text
index (FTS5, ranked by BM25) over two kinds of passages:

- the record's facts, one passage per section or list item (`record:details`, `record:results[2]`), each the
  curated, checked value with its source;
- the PDFs' text, cut into passages of about a paragraph, each with its file and page (`paper.pdf` p. 5).

Every passage also has a vector (vectors.py: a small English embedding model run locally), and a search fuses the
two rankings, words (BM25) and meaning (cosine), by reciprocal rank: exact codes and terms (CASP14, r.m.s.d.95,
PPV) and paraphrases both find their passages. The text of a file is cached by its SHA-256 (the record holds it) and
a passage's vector by the hash of its text, so a build extracts and embeds only what is new. The searches return
short hits (a reference, the article, a snippet): an agent reads only the passages it needs.
"""

from __future__ import annotations

import collections
import datetime as dt
import json
import re
import sqlite3
from collections.abc import Iterable, Iterator
from pathlib import Path

import numpy as np

from .bibliography import Collection
from .pdf import office_text, pdf_page_texts, text_sources
from .render import Links, article_md, article_view, md_inl
from .vectors import ready_for_queries

SCHEMA = 1
DB_NAME = "index.sqlite"
TOKENIZE = "porter unicode61 remove_diacritics 2"
PASSAGE = 1000  # characters: about a paragraph, about 250 tokens
SPREADSHEET_CAP = 60_000  # characters of a spreadsheet's text that are indexed
SKIP_FIELDS = {"schema", "key", "status", "sha256", "bytes", "file", "source_url", "openalex", "figures"}
# PDF fonts often print these as one character: as letters, a word reads the same in the text and in a query.
LIGATURES = str.maketrans({"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"})

DDL = f"""
CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT);
CREATE TABLE articles (
    bib TEXT, key TEXT, doi TEXT, year INTEGER, cite TEXT, title TEXT, kind TEXT, status TEXT,
    one_line TEXT, glance TEXT, summary TEXT, record TEXT, PRIMARY KEY (bib, key));
CREATE TABLE files (bib TEXT, key TEXT, file TEXT, sha256 TEXT, pages INTEGER, PRIMARY KEY (bib, key, file));
CREATE TABLE chunks (sha256 TEXT, page INTEGER, n INTEGER, text TEXT, PRIMARY KEY (sha256, page, n));
CREATE TABLE embcache (hash TEXT PRIMARY KEY, vec BLOB);
CREATE TABLE vectors (rowid INTEGER PRIMARY KEY, hash TEXT);
CREATE VIRTUAL TABLE passages USING fts5(
    text, bib UNINDEXED, key UNINDEXED, source UNINDEXED, page UNINDEXED, n UNINDEXED, tokenize = '{TOKENIZE}');
"""


# --------------------------------------------------------------------------- text into passages


def clean(text: str) -> str:
    """One paragraph on one line: ligatures as letters, hyphenated line breaks joined, whitespace collapsed."""
    text = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", text.translate(LIGATURES))
    return re.sub(r"\s+", " ", text).strip()


def split(page: str, size: int = PASSAGE) -> list[str]:
    """A page's text in passages of at most about `size` characters, cut between paragraphs, else sentences."""
    pieces: list[str] = []
    for para in re.split(r"\n\s*\n", page):
        para = clean(para)
        if len(para) <= size:
            pieces.append(para)
        else:
            pieces += [s for s in re.split(r"(?<=[.!?;])\s+", para) if s]
    out, cur = [], ""
    for p in pieces:
        if cur and len(cur) + 1 + len(p) > size:
            out.append(cur)
            cur = ""
        cur = f"{cur} {p}".strip()
        while len(cur) > size * 1.5:  # a single sentence or table row that never ends
            out.append(cur[:size])
            cur = cur[size:]
    if cur:
        out.append(cur)
    merged: list[str] = []
    for p in out:  # a short tail (a last sentence, a caption) joins the passage before it
        if merged and len(p) < 200 and len(merged[-1]) + 1 + len(p) <= size * 1.5:
            merged[-1] = f"{merged[-1]} {p}"
        else:
            merged.append(p)
    return [p for p in merged if len(p) > 20]  # page numbers and running heads alone


def file_pages(path: Path) -> list[str]:
    """A file's text, one string per page (one page for office and text files)."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return pdf_page_texts(path)
    if ext in (".docx", ".xlsx"):
        text = office_text(path)
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    return [text[:SPREADSHEET_CAP] if ext in (".xlsx", ".csv", ".tsv") else text]


def flat_lines(value, prefix: str = "") -> Iterator[str]:
    """A record value as `field: value` lines, skipping checksums, file names, URLs and flags (true or false)."""
    if isinstance(value, dict):
        for k, v in value.items():
            if k not in SKIP_FIELDS:
                yield from flat_lines(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(value, list):
        if all(not isinstance(v, (dict, list)) for v in value):
            if value:
                yield f"{prefix}: {'; '.join(str(v) for v in value)}"
        else:
            for i, v in enumerate(value):
                yield from flat_lines(v, f"{prefix}[{i}]")
    elif value not in ("", None) and not isinstance(value, bool):
        yield f"{prefix}: {value}"


def record_passages(rec: dict) -> Iterator[tuple[str, str]]:
    """(source, text) for each section of a record, and for each item of its lists of objects."""
    for section, value in rec.items():
        if section in SKIP_FIELDS or section in ("kind",):
            continue
        if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
            for i, item in enumerate(value):
                text = "\n".join(flat_lines(item))
                if text:
                    yield f"record:{section}[{i}]", text
        else:
            text = "\n".join(flat_lines(value, section if not isinstance(value, dict) else ""))
            if text:
                yield f"record:{section}", text


# --------------------------------------------------------------------------- building


def glance_text(rec: dict, coll: Collection) -> str:
    """The article's "at a glance" lines, as on its page."""
    v = article_view(rec, coll)
    links = Links("md", coll.biblio, v["key"])
    return "\n".join(f"{label}: " + " / ".join(md_inl(line, links) for line in lines) for label, lines in v["glance"])


def add_vectors(db: sqlite3.Connection, previous: Path | None) -> dict:
    """A vector for every passage, reusing the previous index's vectors of the same text."""
    from .vectors import MODEL, embed_passages, text_hash, to_blob

    rows = db.execute("SELECT rowid, text FROM passages").fetchall()
    hashes = [text_hash(t) for _, t in rows]
    have: dict[str, bytes] = {}
    if previous and previous.exists():
        old = sqlite3.connect(f"file:{previous}?mode=ro", uri=True)
        try:
            have = dict(old.execute("SELECT hash, vec FROM embcache"))
        except sqlite3.OperationalError:  # an index built without vectors
            pass
        old.close()
    todo = sorted({h: t for (_, t), h in zip(rows, hashes, strict=True) if h not in have}.items())
    for (h, _), v in zip(todo, embed_passages([t for _, t in todo]), strict=True):
        have[h] = to_blob(v)
    db.executemany("INSERT OR IGNORE INTO embcache VALUES (?,?)", [(h, have[h]) for h in set(hashes)])
    db.executemany("INSERT INTO vectors VALUES (?,?)", [(rid, h) for (rid, _), h in zip(rows, hashes, strict=True)])
    return {"model": MODEL, "vectors": len(rows), "embedded": len(todo)}


def build_index(out: Path, colls: Iterable[Collection], previous: Path | None = None, vectors: bool = True) -> dict:
    """Write the index into `out` (a new file), reusing the text and the vectors a previous index already holds."""
    tmp = out.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript(DDL)
    cache = sqlite3.connect(f"file:{previous}?mode=ro", uri=True) if previous and previous.exists() else None
    stats = {
        "articles": 0,
        "files": 0,
        "pages": 0,
        "text_passages": 0,
        "record_passages": 0,
        "extracted": 0,
        "reused": 0,
        "per_bibliography": {},
        "no_text": [],  # files without a text layer (scanned): only their record is searchable
    }
    for coll in colls:
        b = coll.biblio
        stats["per_bibliography"][b.name] = len(coll.recs)
        for key, rec in sorted(coll.recs.items()):
            bib = rec.get("bib") or {}
            db.execute(
                "INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    b.name,
                    key,
                    bib.get("doi"),
                    bib.get("year"),
                    bib.get("cite"),
                    bib.get("title"),
                    rec.get("kind"),
                    rec.get("status"),
                    (rec.get("overview") or {}).get("one_line"),
                    glance_text(rec, coll),
                    article_md(rec, coll),
                    json.dumps(rec, ensure_ascii=False),
                ),
            )
            stats["articles"] += 1
            for source, text in record_passages(rec):
                db.execute("INSERT INTO passages VALUES (?,?,?,?,?,?)", (text, b.name, key, source, None, None))
                stats["record_passages"] += 1
            folder = b.articles / key
            shas = {"paper.pdf": (rec.get("paper") or {}).get("sha256")}
            shas |= {f["file"]: f.get("sha256") for f in (rec.get("supplementary") or {}).get("files", [])}
            for path in text_sources(folder, rec):
                rel = path.relative_to(folder).as_posix()
                sha = shas.get(rel) or f"{b.name}/{key}/{rel}"
                known = cache.execute("SELECT pages FROM files WHERE sha256 = ?", (sha,)).fetchone() if cache else None
                if known is not None:  # the same file was indexed last time: its text is there, even if empty
                    pages = known[0]
                    rows = cache.execute("SELECT page, n, text FROM chunks WHERE sha256 = ?", (sha,)).fetchall()
                    stats["reused"] += 1
                else:
                    texts = file_pages(path)
                    pages = len(texts)
                    rows = [(p, n, t) for p, page in enumerate(texts, 1) for n, t in enumerate(split(page))]
                    stats["extracted"] += 1
                if not rows:
                    stats["no_text"].append(f"{b.name}/{key}/{rel}")
                db.executemany("INSERT OR IGNORE INTO chunks VALUES (?,?,?,?)", [(sha, *r) for r in rows])
                db.execute("INSERT INTO files VALUES (?,?,?,?,?)", (b.name, key, rel, sha, pages))
                db.executemany(
                    "INSERT INTO passages VALUES (?,?,?,?,?,?)", [(t, b.name, key, rel, p, n) for p, n, t in rows]
                )
                stats["files"] += 1
                stats["pages"] += pages
                stats["text_passages"] += len(rows)
    if cache:
        cache.close()
    if vectors:
        try:
            stats |= add_vectors(db, previous)
        except Exception as e:  # no model (offline) or no fastembed: the keyword search still works
            stats["vectors"] = 0
            stats["vector_error"] = f"{e.__class__.__name__}: {e}"
    built = dt.datetime.now().isoformat(timespec="seconds")
    db.executemany(
        "INSERT INTO meta VALUES (?,?)", [("schema", str(SCHEMA)), ("built", built), ("stats", json.dumps(stats))]
    )
    db.execute("INSERT INTO passages(passages) VALUES ('optimize')")
    db.commit()
    db.close()
    tmp.replace(out)
    return {"built": built, **stats}


# --------------------------------------------------------------------------- searching


class NoIndexError(FileNotFoundError):
    """No search index at that path yet: `glossator build` writes it."""


class Index:
    """A built index, opened read-only."""

    def __init__(self, path: Path):
        if not path.exists():
            raise NoIndexError(f"{path}: no index yet (run: glossator build)")
        self.path = path
        self.db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._vectors: tuple[list[int], np.ndarray] | None = None
        self.last_mode = ""

    def meta(self) -> dict:
        m = dict(self.db.execute("SELECT name, value FROM meta").fetchall())
        return {"built": m.get("built"), **json.loads(m.get("stats", "{}"))}

    def cite(self, bib: str, key: str) -> str:
        row = self.db.execute("SELECT cite FROM articles WHERE bib = ? AND key = ?", (bib, key)).fetchone()
        return row["cite"] if row else key

    def search(
        self,
        query: str,
        bib: str | None = None,
        key: str | None = None,
        scope: str = "all",
        limit: int = 8,
        per_article: int = 2,
        mode: str = "hybrid",
        wait: bool = True,
    ) -> list[dict]:
        """The best passages for a query, at most `per_article` from one article. `mode`: 'hybrid' (words and
        meaning, fused by reciprocal rank), 'keyword' (BM25: all the words, then any of them) or 'semantic'.
        `wait`: load the embedding model if it is not yet (else search by words only until it is)."""
        query = query.translate(LIGATURES)
        where, args = filters(bib, key, scope)
        words = self._keyword(query, where, args, POOL)
        meaning = []
        if mode != "keyword" and self.has_vectors() and (wait or ready_for_queries()):
            meaning = self._semantic(query, where, args, POOL)
        self.last_mode = "keyword" if not meaning else mode
        if mode == "keyword" or not meaning:
            order = [rid for rid, _ in words]
        elif mode == "semantic":
            order = meaning
        else:
            order = fuse([[rid for rid, _ in words], meaning], [1.0, SEMANTIC_WEIGHT])
        snips = dict(words)
        out, seen = [], {}
        for rid in order:
            r = self.db.execute(
                "SELECT bib, key, source, page, n, text FROM passages WHERE rowid = ?", (rid,)
            ).fetchone()
            k = (r["bib"], r["key"])
            if seen.get(k, 0) >= per_article:
                continue
            seen[k] = seen.get(k, 0) + 1
            snippet = clean(snips[rid]) if rid in snips else excerpt(r["text"], query)
            out.append(
                {
                    "ref": ref_of(r["bib"], r["key"], r["source"], r["page"], r["n"]),
                    "cite": self.cite(r["bib"], r["key"]),
                    "snippet": snippet,
                }
            )
            if len(out) == limit:
                break
        return out

    def _keyword(self, query: str, where: list[str], args: list, n: int) -> list[tuple[int, str]]:
        """(rowid, snippet), best first: the passages with all the words, then those with any of them."""
        out: dict[int, str] = {}
        for q in fts_queries(query):
            sql = (
                f"SELECT rowid, snippet(passages, 0, '', '', '…', 24) AS snip FROM passages "
                f"WHERE {' AND '.join(['passages MATCH ?', *where])} ORDER BY bm25(passages) LIMIT ?"
            )
            for r in self.db.execute(sql, [q, *args, n]):
                out.setdefault(r["rowid"], r["snip"])
            if len(out) >= n // 2:
                break
        return list(out.items())[:n]

    def has_vectors(self) -> bool:
        if self._vectors is None:
            try:
                rows = self.db.execute(
                    "SELECT v.rowid, e.vec FROM vectors v JOIN embcache e ON e.hash = v.hash ORDER BY v.rowid"
                ).fetchall()
            except sqlite3.OperationalError:  # an index built without vectors
                rows = []
            from .vectors import from_blobs

            self._vectors = ([r[0] for r in rows], from_blobs([r[1] for r in rows]))
        return bool(self._vectors[0])

    def _semantic(self, query: str, where: list[str], args: list, n: int) -> list[int]:
        """rowids, closest in meaning first, among the passages the filters keep and close enough to mean anything."""
        from .vectors import embed_query

        ids, matrix = self._vectors
        scores = matrix @ embed_query(query)
        if where:
            keep = {r[0] for r in self.db.execute(f"SELECT rowid FROM passages WHERE {' AND '.join(where)}", args)}
            scores = np.where([rid in keep for rid in ids], scores, -np.inf)
        best = np.argsort(-scores)[:n]
        return [ids[i] for i in best if scores[i] >= SEMANTIC_FLOOR]

    def read(self, ref: str, whole_page: bool = False) -> str:
        """The passage a reference names (`bib/key/paper.pdf#5.2`, `bib/key/record:details`), or its page."""
        bib, key, source, page, n = parse_ref(ref)
        if source.startswith("record:"):
            row = self.db.execute(
                "SELECT text FROM passages WHERE bib = ? AND key = ? AND source = ?", (bib, key, source)
            ).fetchone()
            if row is None:
                raise KeyError(f"{ref}: no such record section")
            return row["text"]
        f = self.db.execute(
            "SELECT sha256 FROM files WHERE bib = ? AND key = ? AND file = ?", (bib, key, source)
        ).fetchone()
        if f is None:
            raise KeyError(f"{ref}: no such file")
        sha = f["sha256"] or source
        if whole_page or n is None:
            rows = self.db.execute("SELECT text FROM chunks WHERE sha256 = ? AND page = ? ORDER BY n", (sha, page))
        else:
            rows = self.db.execute("SELECT text FROM chunks WHERE sha256 = ? AND page = ? AND n = ?", (sha, page, n))
        text = "\n\n".join(r["text"] for r in rows)
        if not text:
            raise KeyError(f"{ref}: no text there")
        return text

    def article(self, key: str, bib: str | None = None) -> sqlite3.Row:
        rows = self.db.execute(
            "SELECT * FROM articles WHERE key = ?" + (" AND bib = ?" if bib else ""), (key, bib) if bib else (key,)
        ).fetchall()
        if not rows:
            raise KeyError(f"{key}: no such article")
        if len(rows) > 1:
            raise KeyError(f"{key}: in {', '.join(r['bib'] for r in rows)}; name the bibliography")
        return rows[0]

    def verify(self, key: str, text: str, page: int | None = None, bib: str | None = None) -> dict:
        """Whether `text` (a quote, or a claim's words) is on the page an answer cites of an article's PDFs: the page
        itself first, then its neighbours, then the whole article. Returns {found: verbatim | close | elsewhere |
        absent, page, file, score (the share of the text's words found together), excerpt}."""
        art = self.article(key, bib)
        want = re.findall(r"\w+", text.translate(LIGATURES).lower())
        if not want:
            raise ValueError("text: the words to look for")
        files = self.db.execute(
            "SELECT file, sha256, pages FROM files WHERE bib = ? AND key = ? ORDER BY file != 'paper.pdf', file",
            (art["bib"], key),
        ).fetchall()
        flat = " ".join(want)

        def best_on(sha: str, pg: int) -> tuple[float, str]:
            body = " ".join(
                r["text"]
                for r in self.db.execute("SELECT text FROM chunks WHERE sha256 = ? AND page = ? ORDER BY n", (sha, pg))
            )
            words = re.findall(r"\w+", body.translate(LIGATURES).lower())
            if not words:
                return 0.0, ""
            if flat in " ".join(words):
                return 1.0, excerpt(body, text, 300)
            # the window of the text's length holding most of its words, in their order or not
            need, n, top, at = collections.Counter(want), len(want), 0, 0
            win = collections.Counter(words[:n])
            for i in range(max(1, len(words) - n + 1)):
                if i:
                    win[words[i - 1]] -= 1
                    if i + n - 1 < len(words):
                        win[words[i + n - 1]] += 1
                hit = sum(min(c, win[w]) for w, c in need.items())
                if hit > top:
                    top, at = hit, i
            return top / n, " ".join(words[max(0, at - 5) : at + n + 5])

        order: list[tuple[str, str, int]] = []
        for f in files:
            pages = range(1, (f["pages"] or 0) + 1)
            near = [p for p in (page, page - 1, page + 1) if page and p in pages] if page else []
            order += [(f["file"], f["sha256"], p) for p in near]
        cited = len(order)
        for f in files:
            order += [
                (f["file"], f["sha256"], p)
                for p in range(1, (f["pages"] or 0) + 1)
                if (f["file"], f["sha256"], p) not in order
            ]
        best = {"score": 0.0}
        for i, (file, sha, pg) in enumerate(order):
            score, ex = best_on(sha or file, pg)
            if score > best["score"]:
                best = {"score": round(score, 2), "file": file, "page": pg, "excerpt": ex}
            if score == 1.0 or (i == cited - 1 and best["score"] >= 0.8):
                break
        near = page is not None and abs(best.get("page", -9) - page) <= 1
        if best["score"] == 1.0 and (page is None or best["page"] == page):
            best["found"] = "verbatim"
        elif best["score"] >= 0.8 and (page is None or near):
            best["found"] = "close"
        elif best["score"] >= 0.8:
            best["found"] = "elsewhere"
        else:
            best["found"] = "absent"
        return {"key": key, "bib": art["bib"], "cited_page": page, **best}

    def articles(self, bib: str | None = None) -> list[sqlite3.Row]:
        sql = "SELECT bib, key, year, cite, title, kind, status FROM articles"
        return self.db.execute(
            sql + (" WHERE bib = ?" if bib else "") + " ORDER BY bib, year DESC, key", (bib,) if bib else ()
        ).fetchall()


POOL = 50  # candidates each ranking brings to the fusion
RRF_K = 60  # the usual constant of reciprocal rank fusion
# The meaning's weight in the fusion, the words' being 1, chosen with `evaluate` (the claims the records checked,
# as queries): on a library of a few hundred articles, the words alone found the cited article in the top 10 for 78%
# of them, the even fusion for 72%, this weight for 76%; without the claims' numbers, 71%, 67% and 70%. The meaning
# still ranks the passages the words miss (synonyms, a question in other terms).
SEMANTIC_WEIGHT = 0.25
# The meaning's floor: a passage less similar than this to the query is not a match. With bge-small, queries unrelated
# to a library (nonsense words, recipes, football) reach at most 0.69 on any of its passages; queries on its subjects
# reach 0.75 or more on their ten best.
SEMANTIC_FLOOR = 0.70


def filters(bib: str | None, key: str | None, scope: str) -> tuple[list[str], list]:
    where, args = [], []
    if bib:
        where.append("bib = ?")
        args.append(bib)
    if key:
        where.append("key = ?")
        args.append(key)
    if scope == "records":
        where.append("source LIKE 'record:%'")
    elif scope == "text":
        where.append("source NOT LIKE 'record:%'")
    return where, args


def fuse(rankings: list[list[int]], weights: list[float] | None = None) -> list[int]:
    """Weighted reciprocal rank fusion: an item's score is the sum of weight / (60 + its rank) over the rankings."""
    score: dict[int, float] = {}
    for ranking, w in zip(rankings, weights or [1.0] * len(rankings), strict=True):
        for rank, rid in enumerate(ranking):
            score[rid] = score.get(rid, 0.0) + w / (RRF_K + rank + 1)
    return sorted(score, key=lambda rid: -score[rid])


def excerpt(text: str, query: str, width: int = 200) -> str:
    """The sentence of a passage that shares the most words with the query, cut to about `width` characters."""
    words = {w for w in re.findall(r"\w+", query.lower()) if len(w) > 2}
    sentences = re.split(r"(?<=[.!?;])\s+", clean(text)) or [text]
    best = max(sentences, key=lambda x: len(words & set(re.findall(r"\w+", x.lower()))))
    return best if len(best) <= width else best[:width].rsplit(" ", 1)[0] + "…"


def ref_of(bib: str, key: str, source: str, page, n) -> str:
    return f"{bib}/{key}/{source}" + (f"#{page}.{n}" if page is not None else "")


def parse_ref(ref: str) -> tuple[str, str, str, int | None, int | None]:
    m = re.fullmatch(r"([^/]+)/([^/]+)/(.+?)(?:#(\d+)(?:\.(\d+))?)?", ref.strip())
    if not m:
        raise KeyError(f"{ref}: a reference is <bibliography>/<key>/<file>#<page>[.<passage>] or .../record:<section>")
    bib, key, source, page, n = m.groups()
    return bib, key, source, int(page) if page else None, int(n) if n is not None else None


def fts_queries(query: str) -> list[str]:
    """FTS5 queries for what a person types: "quoted phrases" kept, every other word quoted (so codes like CASP14,
    r.m.s.d.95 or 10.1038/x are searched as they are); all the words, then any of them."""
    phrases = re.findall(r'"([^"]+)"', query)
    rest = re.sub(r'"[^"]*"', " ", query)
    words = [w for w in re.findall(r"[\w][\w.\-/]*[\w]|[\w]", rest) if len(w) > 1 or w.isdigit()]
    terms = [f'"{p.strip()}"' for p in phrases if p.strip()] + [f'"{w}"' for w in words]
    if not terms:
        raise ValueError("an empty query")
    return list(dict.fromkeys([" AND ".join(terms), " OR ".join(terms)]))


# --------------------------------------------------------------------------- short answers (CLI and MCP server)


def format_hits(hits: list[dict]) -> str:
    if not hits:
        return "No passage matches. Try other words, fewer words, or scope='all'."
    return "\n".join(f"{i}. {h['ref']} — {h['cite']}\n   {h['snippet']}" for i, h in enumerate(hits, 1))


def format_verify(got: dict) -> str:
    """What `verify` found, in one line: "verbatim on p. 2", "close on p. 3 (92% of the words)", "elsewhere: p. 5",
    "absent"; a supplementary file is named. `verify --json` (and a pipe) print the whole result instead."""
    found = got["found"]
    if found == "absent":
        return "absent" + (
            f" (at most {got['score']:.0%} of the words, on p. {got['page']})" if got.get("page") else ""
        )
    where = f"p. {got['page']}" + (f" of {got['file']}" if got.get("file") not in (None, "paper.pdf") else "")
    share = f" ({got['score']:.0%} of the words)" if got.get("score", 1) < 1 else ""
    return f"{found}: {where}{share}" if found == "elsewhere" else f"{found} on {where}{share}"


def format_articles(rows) -> str:
    return "\n".join(
        f"{r['bib']}/{r['key']} · {r['cite']} · {r['title']}" + ("" if r["status"] == "complete" else " · draft")
        for r in rows
    )


def format_article(
    idx: Index, key: str, bib: str | None = None, sections: list[str] | None = None, summary: bool = False
) -> str:
    """An article in a few lines (its glance and the names of its record's sections), or the sections asked for,
    or its whole summary."""
    a = idx.article(key, bib)
    if summary:
        return a["summary"]
    sources = [
        r["source"]
        for r in idx.db.execute(
            "SELECT source FROM passages WHERE bib = ? AND key = ? AND source LIKE 'record:%'", (a["bib"], a["key"])
        )
    ]
    head = f"{a['bib']}/{a['key']} — {a['cite']} — doi:{json.loads(a['record'])['bib'].get('doi')}\n{a['title']}"
    if not sections:
        names = list(dict.fromkeys(re.sub(r"\[\d+\]$", "", s.removeprefix("record:")) for s in sources))
        return (
            f"{head}\n{a['one_line']}\n\n{a['glance']}\n\nRecord sections (ask for them by name): "
            f"{', '.join(names)}; files: "
            + ", ".join(
                f"{r['file']} ({r['pages']} p.)"
                for r in idx.db.execute("SELECT file, pages FROM files WHERE bib = ? AND key = ?", (a["bib"], a["key"]))
            )
        )
    out = [head]
    for name in sections:
        picked = [s for s in sources if s == f"record:{name}" or re.fullmatch(rf"record:{re.escape(name)}\[\d+\]", s)]
        if not picked:
            out.append(f"[{name}] no such section")
        for s in picked:
            ref = f"{a['bib']}/{a['key']}/{s}"
            out.append(f"[{s.removeprefix('record:')}]\n{idx.read(ref)}")
    return "\n\n".join(out)


def format_status(idx: Index) -> str:
    m = idx.meta()
    per = ", ".join(f"{k} {v}" for k, v in m.get("per_bibliography", {}).items())
    return (
        f"Index of {m.get('built')}: {m.get('articles')} articles ({per}), {m.get('files')} files, "
        f"{m.get('pages')} pages, {m.get('text_passages', 0) + m.get('record_passages', 0)} passages "
        f"({m.get('record_passages')} from the records). {idx.path}"
    )


def evaluate(idx: Index, colls, modes=("keyword", "semantic", "hybrid"), log=print) -> dict:
    """How well the search finds what the records checked: each claim a curator confirmed with its page
    (`curation.checks`) is a query; a hit is its article in the top 5 or 10 passages of the PDFs' text, or that
    article's cited page in the top 10. Returns {mode: {article@5, article@10, page@10}} and the number of claims."""
    cases = []
    for coll in colls:
        for key, rec in coll.recs.items():
            for c in (rec.get("curation") or {}).get("checks") or []:
                pages = {int(p) for p in re.findall(r"p\. ?(\d+)", c.get("verdict", ""))}
                if pages and "confirmed" in c.get("verdict", "").lower():
                    cases.append((c["claim"], coll.biblio.name, key, pages))
    out = {"claims": len(cases)}
    for mode in modes:
        a5 = a10 = p10 = 0
        for claim, bib, key, pages in cases:
            hits = idx.search(claim, scope="text", limit=10, per_article=3, mode=mode)
            mine = [h for h in hits if h["ref"].startswith(f"{bib}/{key}/")]
            a5 += any(h in mine for h in hits[:5])
            a10 += bool(mine)
            p10 += any("#" in h["ref"] and int(h["ref"].split("#")[1].split(".")[0]) in pages for h in mine)
        n = max(1, len(cases))
        out[mode] = {"article@5": round(a5 / n, 3), "article@10": round(a10 / n, 3), "page@10": round(p10 / n, 3)}
        log(f"{mode:8}  article@5 {a5 / n:.3f}  article@10 {a10 / n:.3f}  page@10 {p10 / n:.3f}  ({len(cases)} claims)")
    return out
