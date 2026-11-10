"""The network: metadata from Crossref, OpenAlex and DataCite, open copies, PubMed Central's open data."""

from __future__ import annotations

import html
import http.client
import json
import re
import urllib.parse
import urllib.request

from . import __version__
from .records import IMAGE_EXT, todo

PROJECT_URL = "https://github.com/camilziane/glossator"
# The public APIs (Crossref, OpenAlex, PubMed, arXiv, bioRxiv, Zotero) are asked as the tool, with its address.
API_UA = f"glossator/{__version__} (+{PROJECT_URL})"
# A paper's PDF or supplementary file, from a publisher's or a repository's site, is asked as a browser: some of these
# sites refuse any other client. Disclosed in docs/privacy.md.
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


AWS = "https://pmc-oa-opendata.s3.amazonaws.com"


# These hosts answer scripted downloads with a bot check: tried last.
BLOCKING_HOSTS = ("ncbi.nlm.nih.gov", "europepmc.org")


PREPRINT_SERVERS = (
    "biorxiv",
    "medrxiv",
    "arxiv",
    "research square",
    "researchsquare",
    "ssrn",
    "preprints.org",
    "psyarxiv",
    "osf.io",
)


NET_ERRORS = (OSError, ValueError, http.client.HTTPException)


def web_url(url: str) -> str:
    """The URL, when it is a web address (http or https); anything else (file:, ftp:, data:) is refused, so that no
    command reads a local file through a URL it was given."""
    if urllib.parse.urlsplit(url).scheme.lower() not in ("http", "https"):
        raise ValueError(f"not a web address (http or https): {url[:80]}")
    return url


class WebOnly(urllib.request.HTTPRedirectHandler):
    """Redirects followed only to web addresses."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        web_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(WebOnly)


def http_get(url: str, *, ua: str = API_UA, timeout: int = 60) -> tuple[bytes, str]:
    req = urllib.request.Request(web_url(url), headers={"User-Agent": ua, "Accept": "*/*"})
    with OPENER.open(req, timeout=timeout) as resp:
        return resp.read(), resp.headers.get_content_type()


def get_json(url: str):
    try:
        return json.loads(http_get(url)[0])
    except NET_ERRORS:
        return None


def q(doi: str) -> str:
    return urllib.parse.quote(doi, safe="/")


def clean(s) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def first(seq):
    return seq[0] if seq else None


def metadata(doi: str) -> dict | None:
    """Bibliographic data from Crossref, completed by OpenAlex (ids, institutions), DataCite for arXiv."""
    cr = (get_json(f"https://api.crossref.org/works/{q(doi)}") or {}).get("message")
    oa = get_json(f"https://api.openalex.org/works/doi:{q(doi)}")
    dc = None
    if not (cr or oa):
        dc = ((get_json(f"https://api.datacite.org/dois/{q(doi)}") or {}).get("data") or {}).get("attributes")
        if not dc:
            return None
    m = {
        "doi": doi,
        "title": "",
        "authors": [],
        "families": [],
        "year": 0,
        "date": "",
        "venue": "",
        "venue_short": "",
        "volume": "none",
        "issue": "none",
        "pages": "none",
        "type": "",
        "pmid": "none",
        "pmcid": "none",
        "openalex": "none",
        "last_inst": [],
        "oa": oa,
    }
    if cr:
        people = [a for a in cr.get("author") or [] if a.get("family") or a.get("name")]
        m["title"] = clean(first(cr.get("title")))
        m["authors"] = [
            " ".join(p for p in (a.get("given"), a.get("family")) if p) if a.get("family") else a["name"]
            for a in people
        ]
        m["families"] = [a.get("family") or a["name"] for a in people]
        parts = [p for p in (((cr.get("issued") or {}).get("date-parts") or [[None]])[0] or []) if p]
        if parts:
            m["year"] = int(parts[0])
            m["date"] = "-".join([str(int(parts[0]))] + [f"{int(p):02d}" for p in parts[1:3]])
        m["venue"] = clean(first(cr.get("container-title"))) or clean(
            first([i.get("name") for i in cr.get("institution") or [] if i.get("name")])
        )
        m["venue_short"] = clean(first(cr.get("short-container-title"))) or m["venue"]
        m["volume"] = cr.get("volume") or "none"
        m["issue"] = cr.get("issue") or "none"
        m["pages"] = (cr.get("page") or cr.get("article-number") or "none").replace("-", "–")
        m["type"] = cr.get("type") or ""
    # PubMed ids from Europe PMC's exact DOI match first: OpenAlex merges an article with its preprint and can
    # give the preprint's PMID.
    if not doi.lower().startswith("10.48550/"):
        search = urllib.parse.urlencode({"query": f'DOI:"{doi}"', "format": "json", "resultType": "lite"})
        res = (
            (get_json(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?{search}") or {}).get("resultList")
            or {}
        ).get("result") or []
        hit = next((r for r in res if (r.get("doi") or "").lower() == doi.lower()), {})
        m["pmid"] = hit.get("pmid") or "none"
        m["pmcid"] = hit.get("pmcid") or "none"
    if oa:
        ids = oa.get("ids") or {}
        m["openalex"] = (oa.get("id") or "").rstrip("/").rsplit("/", 1)[-1] or "none"
        if m["pmid"] == "none" and ids.get("pmid"):
            m["pmid"] = re.sub(r"\D", "", ids["pmid"].rstrip("/").rsplit("/", 1)[-1]) or "none"
        if m["pmcid"] == "none" and ids.get("pmcid"):
            m["pmcid"] = "PMC" + re.sub(r"\D", "", ids["pmcid"].rstrip("/").rsplit("/", 1)[-1])
        auths = oa.get("authorships") or []
        if not m["title"]:
            m["title"] = clean(oa.get("title") or oa.get("display_name"))
        if not m["authors"]:
            m["authors"] = [a["author"]["display_name"] for a in auths]
            m["families"] = [a["author"]["display_name"].split()[-1] for a in auths]
        if not m["year"]:
            m["year"] = int(oa.get("publication_year") or 0)
            m["date"] = oa.get("publication_date") or str(m["year"])
        if not m["venue"]:
            src = (oa.get("primary_location") or {}).get("source") or {}
            m["venue"] = m["venue_short"] = src.get("display_name") or ""
        biblio = oa.get("biblio") or {}
        if m["volume"] == "none" and biblio.get("volume"):
            m["volume"] = biblio["volume"]
        if m["issue"] == "none" and biblio.get("issue"):
            m["issue"] = biblio["issue"]
        if m["pages"] == "none" and biblio.get("first_page"):
            m["pages"] = "–".join(p for p in (biblio.get("first_page"), biblio.get("last_page")) if p)
        m["type"] = m["type"] or oa.get("type") or ""
        last = next((a for a in auths if a.get("author_position") == "last"), None)
        m["last_inst"] = [i["display_name"] for i in (last or {}).get("institutions") or []]
    if dc:
        creators = dc.get("creators") or []
        publisher = dc.get("publisher")
        m["title"] = clean(first([t.get("title") for t in dc.get("titles") or []]))
        m["authors"] = [
            " ".join(p for p in (c.get("givenName"), c.get("familyName")) if p) or c.get("name", "") for c in creators
        ]
        m["families"] = [c.get("familyName") or (c.get("name") or "").split(",")[0] for c in creators]
        m["year"] = int(dc.get("publicationYear") or 0)
        m["date"] = str(m["year"])
        m["venue"] = m["venue_short"] = publisher if isinstance(publisher, str) else (publisher or {}).get("name", "")
        m["type"] = ((dc.get("types") or {}).get("resourceTypeGeneral") or "preprint").lower()
    m["families"] = [f.title() if f.isupper() else f for f in m["families"]]
    return m


def cite_label(families: list[str], year: int, venue_short: str) -> str:
    fam = [f for f in families if f]
    who = (
        "Anonymous"
        if not fam
        else fam[0]
        if len(fam) == 1
        else f"{fam[0]} & {fam[1]}"
        if len(fam) == 2
        else f"{fam[0]} et al."
    )
    return f"{who} {year}, {venue_short}" if venue_short else f"{who} {year}"


def make_bib(m: dict) -> dict:
    inst = "; ".join(m["last_inst"]) or "no institution listed"
    return {
        "title": m["title"] or todo("title"),
        "authors": m["authors"] or [todo("authors")],
        "year": m["year"],
        "date": m["date"] or todo("publication date YYYY-MM-DD"),
        "venue": m["venue"] or todo("journal or server"),
        "venue_short": m["venue_short"] or todo("abbreviated journal"),
        "volume": m["volume"],
        "issue": m["issue"],
        "pages": m["pages"],
        "doi": m["doi"],
        "pmid": m["pmid"],
        "pmcid": m["pmcid"],
        "openalex": m["openalex"],
        "type": m["type"] or todo("journal-article | posted-content | proceedings-article | ..."),
        "cite": cite_label(m["families"], m["year"], m["venue_short"]),
        "place": todo(
            f"short place of the group as cited in a talk (e.g. 'DeepMind', 'ETH Zurich', 'Stanford'); "
            f"OpenAlex lists the last author at: {inst}"
        ),
        "lab": todo("lab and principal investigators, e.g. 'Protein Design Group (J. Doe, R. Roe)'"),
    }


def aws_listing(pmcid: str) -> list[tuple[str, int]]:
    """Files of the latest version of an article in PubMed Central's open data (PDF, supplements)."""
    try:
        data, _ = http_get(f"{AWS}/?list-type=2&prefix={urllib.parse.quote(pmcid)}.")
    except NET_ERRORS:
        return []
    items = []
    for block in re.findall(r"<Contents>(.*?)</Contents>", data.decode("utf-8", "replace"), re.S):
        k, size = re.search(r"<Key>(.*?)</Key>", block), re.search(r"<Size>(\d+)</Size>", block)
        if k:
            items.append((html.unescape(k.group(1)), int(size.group(1)) if size else 0))
    if not items:
        return []

    def version(prefix: str) -> int:
        tail = prefix.rsplit(".", 1)[-1]
        return int(tail) if tail.isdigit() else 0

    latest = max({k.split("/", 1)[0] for k, _ in items}, key=version)
    return [(f"{AWS}/{k}", size) for k, size in items if k.startswith(latest + "/")]


def is_main_or_image(url: str, pmcid: str) -> bool:
    name = url.rsplit("/", 1)[-1]
    return bool(re.fullmatch(rf"{pmcid}\.\d+\.(pdf|xml|txt|json)", name)) or name.lower().endswith(IMAGE_EXT)
