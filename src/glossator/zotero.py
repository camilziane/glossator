"""The bibliographies as a Zotero library: one Zotero RDF file (Zotero: File → Import), one collection per
bibliography. Each article carries its bibliographic fields, its key (`Citation Key:` in Extra, which Better BibTeX
and Zotero read), tags from the vocabularies (its kind, and what its profile adds), its PDF and supplementary files as
attachments, and its summary (the text `export` prints) as a note.

The note holds what the curator wrote, the checked claims included, which may quote one's own unpublished documents;
Zotero syncs notes to zotero.org when its sync is on. The files do not go: they are linked, not stored.

The files are linked by paths relative to the RDF file, so the same file works in any clone whose build/ sits beside
the bibliographies. At import, "Link to files in original location" keeps them out of Zotero's storage, and so out
of its file sync. Zotero cannot update an import: `--since DATE` writes only the articles added since then."""

from __future__ import annotations

import mimetypes
import os
import re
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

from .bibliography import Collection
from .paths import LIBRARY
from .records import is_sentinel, pending, vlabel
from .render import article_note
from .util import today

ZOTERO_NAME = "zotero.rdf"

NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "z": "http://www.zotero.org/namespaces/export#",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "bib": "http://purl.org/net/biblio#",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "link": "http://purl.org/rss/1.0/modules/link/",
    "prism": "http://prismstandard.org/namespaces/1.2/basic/",
}
for _prefix, _uri in NS.items():
    ET.register_namespace(_prefix, _uri)

# The record's bib.type -> Zotero's item type, the RDF class of the item, the class of its container (None: none).
ITEM_TYPES = {
    "journal-article": ("journalArticle", "bib:Article", "bib:Journal"),
    "proceedings-article": ("conferencePaper", "bib:Article", "bib:Journal"),
    "conference paper": ("conferencePaper", "bib:Article", "bib:Journal"),
    "book-chapter": ("bookSection", "bib:BookSection", "bib:Book"),
    "preprint": ("preprint", "bib:Article", None),
    "posted-content": ("preprint", "bib:Article", None),
}
DEFAULT_TYPE = ITEM_TYPES["journal-article"]

PARTICLES = {"van", "von", "der", "den", "de", "del", "della", "di", "da", "du", "dos", "das", "la", "le", "ten", "ter"}
SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}
GROUPS = re.compile(r"\b(consortium|group|collaboration|investigators|team|study|network|initiative)\b", re.I)


def q(name: str) -> str:
    prefix, local = name.split(":")
    return f"{{{NS[prefix]}}}{local}"


def clean(s) -> str:
    """Text XML can hold: no control characters."""
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(s)).strip()


def sub(parent: ET.Element, name: str, text=None, **attrs) -> ET.Element:
    e = ET.SubElement(parent, q(name), {q(k.replace("_", ":", 1)): v for k, v in attrs.items()})
    if text is not None:
        e.text = clean(text)
    return e


def split_name(name: str) -> tuple[str, str]:
    """(family, given) of "Given Family": "Johannes P. van Dijk" -> ("van Dijk", "Johannes P."); a group's name stays
    whole, as a family name."""
    toks = clean(name).split()
    if len(toks) < 2 or GROUPS.search(name):
        return " ".join(toks), ""
    suffix = ""
    if len(toks) > 2 and toks[-1].rstrip(".").lower() in SUFFIXES:
        suffix = toks.pop()
    i = len(toks) - 1
    while i > 1 and toks[i - 1].lower() in PARTICLES:
        i -= 1
    given = " ".join(toks[:i])
    return " ".join(toks[i:]), f"{given}, {suffix}" if suffix else given


def tags(rec: dict, coll: Collection) -> list[str]:
    """The article's kind, then the tags its profile adds (Profile.tags), each once."""
    out = [vlabel(coll.biblio.vocab[coll.biblio.kind_vocab], rec["kind"])] if rec.get("kind") else []
    if coll.biblio.plugin.tags:
        out += coll.biblio.plugin.tags(rec, coll)
    return list(dict.fromkeys(t for t in out if t))


def files(rec: dict, folder: Path) -> list[tuple[Path, str]]:
    """(file, title) of the paper and its supplementary files that are there."""
    paper = folder / ((rec.get("paper") or {}).get("file") or "paper.pdf")
    out = [(paper, "Full Text PDF")] if paper.is_file() else []
    for s in (rec.get("supplementary") or {}).get("files") or []:
        f = folder / s.get("file", "")
        if s.get("file") and f.is_file():
            out.append((f, s.get("label") or f.name))
    return out


def item(root: ET.Element, uri: str, rec: dict, coll: Collection, base: Path) -> int:
    """Write one article, its attachments and its summary note; return how many files it links."""
    bib = {
        k: v for k, v in (rec.get("bib") or {}).items() if v not in ("", None) and not (is_sentinel(v) or pending(v))
    }
    ztype, cls, container_cls = ITEM_TYPES.get(bib.get("type") or "", DEFAULT_TYPE)
    node = sub(root, cls, rdf_about=uri)
    sub(node, "z:itemType", ztype)
    sub(node, "dc:title", bib.get("title") or rec["key"])
    if bib.get("authors"):
        seq = sub(sub(node, "bib:authors"), "rdf:Seq")
        for name in bib["authors"]:
            family, given = split_name(name)
            person = sub(sub(seq, "rdf:li"), "foaf:Person")
            sub(person, "foaf:surname", family)
            if given:
                sub(person, "foaf:givenName", given)
    venue = bib.get("venue") or ""
    if container_cls and venue:
        box = sub(sub(node, "dcterms:isPartOf"), container_cls)
        sub(box, "dc:title", venue)
        if bib.get("venue_short") and bib["venue_short"] != venue:
            sub(box, "dcterms:alternative", bib["venue_short"])
        if bib.get("volume"):
            sub(box, "prism:volume", bib["volume"])
        if bib.get("issue"):
            sub(box, "prism:number", bib["issue"])
    elif venue:  # a preprint: its server is the repository
        sub(sub(sub(node, "dc:publisher"), "foaf:Organization"), "foaf:name", venue)
    if bib.get("pages"):
        sub(node, "bib:pages", bib["pages"])
    if bib.get("date") or bib.get("year"):
        sub(node, "dc:date", bib.get("date") or bib["year"])
    if bib.get("doi"):
        sub(node, "dc:identifier", f"DOI {bib['doi']}")
        sub(sub(sub(node, "dc:identifier"), "dcterms:URI"), "rdf:value", f"https://doi.org/{bib['doi']}")
    extra = [f"Citation Key: {rec['key']}"]
    extra += [f"{label}: {bib[k]}" for k, label in (("pmid", "PMID"), ("pmcid", "PMCID")) if bib.get(k)]
    sub(node, "dc:description", "\n".join(extra))
    for tag in tags(rec, coll):
        sub(node, "dc:subject", tag)
    attached = files(rec, coll.biblio.articles / rec["key"])
    for n in range(1, len(attached) + 1):
        sub(node, "link:link", rdf_resource=f"{uri}-file{n}")
    for n, (path, title) in enumerate(attached, 1):
        att = sub(root, "z:Attachment", rdf_about=f"{uri}-file{n}")
        sub(att, "z:itemType", "attachment")
        sub(att, "z:path", rdf_resource=urllib.parse.quote(os.path.relpath(path, base)))  # as Zotero writes it
        sub(att, "dc:title", title)
        sub(att, "link:type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    sub(node, "dcterms:isReferencedBy", rdf_resource=f"{uri}-summary")  # a child note, as Zotero writes it
    sub(sub(root, "bib:Memo", rdf_about=f"{uri}-summary"), "rdf:value", article_note(rec, coll))
    return len(attached)


def added_dates() -> dict[str, str]:
    """When each record entered git ('<bib>/<key>' -> YYYY-MM-DD); one not committed yet is missing."""
    r = subprocess.run(
        ["git", "-C", str(LIBRARY), "log", "--no-renames", "--diff-filter=A", "--format=%x00%as", "--name-only",
         "--", "*/articles/*/record.json"],
        capture_output=True, text=True,
    )  # fmt: skip
    out, date = {}, ""
    for line in r.stdout.splitlines() if r.returncode == 0 else []:
        if line.startswith("\0"):
            date = line[1:]
        elif line.strip():
            parts = line.split("/")
            out.setdefault(f"{parts[0]}/{parts[2]}", date)  # newest first: a key added again keeps its last add
    return out


def library(colls: list[Collection], out: Path, since: str | None = None) -> dict:
    """Write the Zotero RDF of these bibliographies to `out` (only the articles added on or after `since`, a
    YYYY-MM-DD); return what it holds. An article in two bibliographies is one item in two collections."""
    dates = added_dates() if since else {}
    root = ET.Element(q("rdf:RDF"))
    base = out.parent.resolve()
    uris: dict[str, str] = {}  # DOI (or bib/key) -> item uri
    members: list[tuple[Collection, list[str]]] = []
    n_files = 0
    for coll in colls:
        mine = []
        for key in sorted(coll.recs):
            rec = coll.recs[key]
            if since and dates.get(f"{coll.biblio.name}/{key}", today()) < since:
                continue
            doi = ((rec.get("bib") or {}).get("doi") or "").lower()
            ident = doi or f"{coll.biblio.name}/{key}"
            if ident not in uris:
                uris[ident] = f"#item-{coll.biblio.name}-{key}"
                n_files += item(root, uris[ident], rec, coll, base)
            mine.append(uris[ident])
        members.append((coll, mine))
    for coll, mine in members:
        if not mine:
            continue
        c = sub(root, "z:Collection", rdf_about=f"#collection-{coll.biblio.name}")
        sub(c, "dc:title", coll.biblio.short)
        for uri in mine:
            sub(c, "dcterms:hasPart", rdf_resource=uri)
    ET.indent(root, space=" ")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".{out.name}.{os.getpid()}.tmp")
    ET.ElementTree(root).write(tmp, encoding="UTF-8", xml_declaration=True)
    os.replace(tmp, out)
    return {
        "items": len(uris),
        "files": n_files,
        "collections": {coll.biblio.short: len(mine) for coll, mine in members if mine},
    }
