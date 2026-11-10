"""The daily scout's sources: new papers from OpenAlex, PubMed, arXiv and bioRxiv/medRxiv, asked directly (no
LLM, no key). Each returns candidates in one shape; `inbox.py` keeps the new ones and has them triaged."""

from __future__ import annotations

import collections
import datetime as dt
import functools
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET

from .net import NET_ERRORS, clean, get_json, http_get
from .util import fold

SOURCES = ("openalex", "pubmed", "arxiv", "biorxiv", "medrxiv")  # and "citations", of the whole library


def candidate(**kw) -> dict:
    """One paper: doi (lowercase, no resolver), title, abstract, authors, venue, date (YYYY-MM-DD), url, pdf,
    source, and the watch that found it."""
    c = {
        "doi": "",
        "title": "",
        "abstract": "",
        "authors": [],
        "venue": "",
        "date": "",
        "url": "",
        "pdf": "",
        "source": "",
        "bib": "",
        "query": "",
    }
    c.update({k: v for k, v in kw.items() if v is not None})
    c["doi"] = norm_doi(c["doi"])
    c["title"] = clean(c["title"])
    c["abstract"] = clean(c["abstract"])
    return c


def norm_doi(doi: str) -> str:
    return re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (doi or "").strip(), flags=re.I).lower()


def title_key(title: str) -> str:
    return fold(title)[:120]


# --------------------------------------------------------------------------- OpenAlex


def openalex_abstract(inverted: dict | None) -> str:
    if not inverted:
        return ""
    words = sorted((pos, w) for w, positions in inverted.items() for pos in positions)
    return " ".join(w for _, w in words)


@functools.lru_cache(maxsize=256)
def openalex_author(name: str) -> str:
    """The OpenAlex id of the best-known author of that name (the most works), or ''."""
    data = get_json("https://api.openalex.org/authors?" + urllib.parse.urlencode({"search": name, "per_page": "5"}))
    found = [a for a in (data or {}).get("results", []) if fold(a.get("display_name", "")) == fold(name)]
    found = found or (data or {}).get("results", [])[:1]
    return max(found, key=lambda a: a.get("works_count", 0))["id"].rsplit("/", 1)[-1] if found else ""


def openalex(query: str, since: str, n: int, author: bool = False) -> list[dict]:
    """Works first published since `since` matching a query (title, abstract, full text), or by an author."""
    params = {"per_page": str(n), "sort": "publication_date:desc"}
    filt = f"from_publication_date:{since},type:article|review|preprint"  # no datasets, no paratext
    if author:
        aid = openalex_author(query)
        if not aid:
            return []
        filt += f",authorships.author.id:{aid}"
    else:
        params["search"] = query
    params["filter"] = filt
    data = get_json("https://api.openalex.org/works?" + urllib.parse.urlencode(params)) or {}
    return [openalex_candidate(w) for w in data.get("results", [])]


def openalex_candidate(w: dict, source: str = "openalex") -> dict:
    loc = w.get("primary_location") or {}
    best = w.get("best_oa_location") or {}
    return candidate(
        doi=w.get("doi") or "",
        title=w.get("title") or "",
        abstract=openalex_abstract(w.get("abstract_inverted_index")),
        authors=[n for a in w.get("authorships") or [] if (n := (a.get("author") or {}).get("display_name"))],
        venue=((loc.get("source") or {}).get("display_name") or ""),
        date=w.get("publication_date") or "",
        url=w.get("doi") or w.get("id") or "",
        pdf=best.get("pdf_url") or "",
        source=source,
    )


def openalex_ids(dois: list[str]) -> dict[str, str]:
    """The OpenAlex id (W…) of each DOI OpenAlex knows, 50 DOIs per request."""
    out = {}
    for i in range(0, len(dois), 50):
        chunk = dois[i : i + 50]
        params = {"filter": "doi:" + "|".join(chunk), "select": "id,doi", "per_page": "50"}
        for w in (get_json("https://api.openalex.org/works?" + urllib.parse.urlencode(params)) or {}).get(
            "results", []
        ):
            if w.get("doi") and w.get("id"):
                out[norm_doi(w["doi"])] = w["id"].rsplit("/", 1)[-1]
    return out


def citing(seeds: dict[str, tuple[str, str]], since: str, n: int) -> list[dict]:
    """The works published since `since` that cite the library's articles (`seeds`: OpenAlex id → (bibliography,
    key)), those citing the most of them first: the citation graph's newest edges, as Connected Papers and
    citation chasing use it. Each goes to the bibliography of most of the articles it cites; its `query` names
    them and `links` counts them."""
    ids, works = list(seeds), {}
    for i in range(0, len(ids), 50):
        filt = f"cites:{'|'.join(ids[i : i + 50])},from_publication_date:{since},type:article|review|preprint"
        params = {"filter": filt, "per_page": "100", "sort": "publication_date:desc"}
        for w in (get_json("https://api.openalex.org/works?" + urllib.parse.urlencode(params)) or {}).get(
            "results", []
        ):
            works[w.get("id")] = w
    out = []
    for w in works.values():
        cited = [seeds[r.rsplit("/", 1)[-1]] for r in w.get("referenced_works") or [] if r.rsplit("/", 1)[-1] in seeds]
        if not cited:
            continue
        c = openalex_candidate(w, "citations")
        c["bib"] = collections.Counter(b for b, _ in cited).most_common(1)[0][0]
        c["query"] = "cites " + ", ".join(sorted({k for _, k in cited})[:6]) + (" …" if len(cited) > 6 else "")
        c["links"] = len(cited)
        out.append(c)
    out.sort(key=lambda c: c["date"], reverse=True)  # the newest first, then (stable) those citing the most
    out.sort(key=lambda c: -c["links"])
    return out[:n]


def citing_library(since: str, n: int) -> list[dict]:
    """New papers citing the articles of every bibliography (`citing`), the DOIs looked up in OpenAlex once."""
    from .bibliography import bibliographies, collection

    by_doi = {}
    for b in bibliographies():
        for key, rec in collection(b).recs.items():
            doi = norm_doi((rec.get("bib") or {}).get("doi", ""))
            if doi.startswith("10."):
                by_doi[doi] = (b.name, key)
    ids = openalex_ids(sorted(by_doi))
    return citing({w: by_doi[d] for d, w in ids.items()}, since, n)


# --------------------------------------------------------------------------- PubMed

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def pubmed(query: str, since: str, n: int, author: bool = False) -> list[dict]:
    """Articles entered in PubMed since `since` (entry date) matching a query or an author."""
    term = f"{query}[Author]" if author else query
    params = {
        "db": "pubmed",
        "term": term,
        "mindate": since.replace("-", "/"),
        "maxdate": "3000",
        "datetype": "edat",
        "retmax": str(n),
        "retmode": "json",
    }
    ids = ((get_json(f"{EUTILS}/esearch.fcgi?" + urllib.parse.urlencode(params)) or {}).get("esearchresult") or {}).get(
        "idlist", []
    )
    if not ids:
        return []
    try:
        raw = http_get(f"{EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id={','.join(ids)}")[0]
        root = ET.fromstring(raw)
    except (*NET_ERRORS, ET.ParseError):
        return []
    out = []
    for art in root.iter("PubmedArticle"):
        a = art.find(".//Article")
        if a is None:
            continue
        doi = next((e.text or "" for e in art.iter("ArticleId") if e.get("IdType") == "doi"), "")
        pmid = (art.findtext(".//PMID") or "").strip()
        year = a.findtext(".//PubDate/Year") or a.findtext(".//ArticleDate/Year") or ""
        month = a.findtext(".//ArticleDate/Month") or "01"
        day = a.findtext(".//ArticleDate/Day") or "01"
        authors = [
            " ".join(x for x in (au.findtext("ForeName"), au.findtext("LastName")) if x) for au in a.iter("Author")
        ]
        out.append(
            candidate(
                doi=doi,
                title="".join(a.find("ArticleTitle").itertext()) if a.find("ArticleTitle") is not None else "",
                abstract=" ".join("".join(t.itertext()) for t in a.iter("AbstractText")),
                authors=authors,
                venue=a.findtext(".//Journal/Title") or "",
                date=f"{year}-{month:0>2}-{day:0>2}" if year else "",
                url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                source="pubmed",
            )
        )
    return out


# --------------------------------------------------------------------------- arXiv

ATOM = {"a": "http://www.w3.org/2005/Atom"}


def arxiv(query: str, since: str, n: int, author: bool = False) -> list[dict]:
    """Preprints submitted to arXiv since `since` matching a query (all fields) or an author."""
    words = " AND ".join(
        f'{"au" if author else "all"}:"{w}"' if " " in w else f"{'au' if author else 'all'}:{w}"
        for w in ([query] if author else query.split())
    )
    params = {"search_query": words, "sortBy": "submittedDate", "sortOrder": "descending", "max_results": str(n)}
    try:
        root = ET.fromstring(http_get("https://export.arxiv.org/api/query?" + urllib.parse.urlencode(params))[0])
    except (*NET_ERRORS, ET.ParseError):
        return []
    out = []
    for e in root.findall("a:entry", ATOM):
        published = (e.findtext("a:published", "", ATOM) or "")[:10]
        if published < since:
            continue
        aid = (e.findtext("a:id", "", ATOM) or "").rsplit("/abs/", 1)[-1]
        aid = re.sub(r"v\d+$", "", aid)
        out.append(
            candidate(
                doi=f"10.48550/arXiv.{aid}",
                title=e.findtext("a:title", "", ATOM),
                abstract=e.findtext("a:summary", "", ATOM),
                authors=[x.findtext("a:name", "", ATOM) for x in e.findall("a:author", ATOM)],
                venue="arXiv",
                date=published,
                url=f"https://arxiv.org/abs/{aid}",
                pdf=f"https://arxiv.org/pdf/{aid}",
                source="arxiv",
            )
        )
    return out


# --------------------------------------------------------------------------- bioRxiv / medRxiv


@functools.lru_cache(maxsize=8)
def rxiv_all(server: str, since: str, categories: tuple[str, ...], max_pages: int = 60) -> tuple[dict, ...]:
    return tuple(rxiv(server, since, list(categories), max_pages))


def rxiv(server: str, since: str, categories: list[str], max_pages: int = 60) -> list[dict]:
    """Every preprint posted on bioRxiv or medRxiv since `since` in the given categories (their API has no keyword
    search: the watch's queries filter them afterwards, see `matches`)."""
    today = dt.date.today().isoformat()
    cats = {c.lower() for c in categories}
    out, cursor = [], 0
    for _ in range(max_pages):
        data = get_json(f"https://api.biorxiv.org/details/{server}/{since}/{today}/{cursor}") or {}
        items = data.get("collection") or []
        for p in items:
            if cats and (p.get("category") or "").lower() not in cats:
                continue
            doi = p.get("doi") or ""
            out.append(
                candidate(
                    doi=doi,
                    title=p.get("title") or "",
                    abstract=p.get("abstract") or "",
                    authors=[a.strip() for a in (p.get("authors") or "").split(";") if a.strip()],
                    venue=server,
                    date=p.get("date") or "",
                    category=(p.get("category") or "").lower(),
                    url=f"https://www.{server}.org/content/{doi}v{p.get('version', '1')}",
                    pdf=f"https://www.{server}.org/content/{doi}v{p.get('version', '1')}.full.pdf",
                    source=server,
                )
            )
        total = int(((data.get("messages") or [{}])[0]).get("total", 0) or 0)
        cursor += len(items)
        if not items or cursor >= total:
            break
    return out


def matches(c: dict, query: str) -> bool:
    """Every word of the query (or "quoted phrase") is in the title or the abstract."""
    text = f"{c['title']} {c['abstract']}".lower()
    phrases = re.findall(r'"([^"]+)"', query)
    words = re.sub(r'"[^"]*"', " ", query).lower().split()
    return all(p.lower() in text for p in phrases) and all(w in text for w in words)


def fetch(watch: dict, since: str, per_query: int) -> tuple[list[dict], list[str]]:
    """Every candidate one watch finds, and the errors met (a source down is noted, never fatal)."""
    sources = watch.get("sources") or list(SOURCES)
    found, errors = [], []

    def add(items: list[dict], query: str) -> None:
        for c in items:
            c["bib"], c["query"] = watch["bib"], query
        found.extend(items)

    for query in watch.get("queries", []):
        for name, fn in (("openalex", openalex), ("pubmed", pubmed), ("arxiv", arxiv)):
            if name in sources:
                try:
                    add(fn(query, since, per_query), query)
                except Exception as e:  # one source down must not stop the others
                    errors.append(f'{name} "{query}": {e.__class__.__name__}: {e}')
    for author in watch.get("authors", []):
        for name, fn in (("openalex", openalex),):
            if name in sources:
                try:
                    add(fn(author, since, per_query, author=True), f"author: {author}")
                except Exception as e:
                    errors.append(f"{name} author {author}: {e.__class__.__name__}: {e}")
    for server in ("biorxiv", "medrxiv"):
        if server in sources and watch.get("queries"):  # their API has no search: queries filter every new preprint
            try:
                cats = {x.lower() for x in watch.get(f"{server}_categories", [])}
                posted = [c for c in rxiv_all(server, since, ()) if not cats or c["category"] in cats]  # once per run
            except Exception as e:
                errors.append(f"{server}: {e.__class__.__name__}: {e}")
                continue
            for query in watch.get("queries", []):
                add([dict(c) for c in posted if matches(c, query)], query)
    return found, errors


def dump(cands: list[dict]) -> str:
    return json.dumps(cands, ensure_ascii=False, indent=1)
