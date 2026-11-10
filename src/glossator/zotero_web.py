"""The bibliographies straight into your Zotero library, through Zotero's web API: `glossator zotero push|sync`,
`glossator build --zotero`, and after `curate` and each daily inbox run on a computer that has a key. Zotero's own
sync then brings them to the Zotero of every computer: nothing is imported by hand and nothing is doubled.

What goes to zotero.org: each article's reference, its summary as a note (the text `export` prints, the checked
claims included), and links to its files by paths relative to Zotero's "linked attachment base directory", which
each computer sets to its library/. The files never go. With the inbox: its waiting papers (reference, abstract,
Haiku's note, a link to the PDF fetched here) and the colored tags `accept` and `reject`.

In the collection named by library.toml's `zotero_collection` (default `glossator`; one sub-collection per
bibliography) the tool keeps the items' bibliographic fields, their automatic tags and their children tagged
`zotero_tag` (default `glossator`): the summary note and the linked files. It leaves what you add (manual tags,
other notes, annotations, other collections) and deletes no article: one that left the library is only named. The
inbox's papers no longer waiting go to Zotero's trash, which `glossator inbox purge` empties of them. A first push
adopts what a `zotero.rdf` import made (same DOI or key, the note that bears the article's title, the files at the
same place), so nothing is doubled.

The key (`~/.config/glossator/zotero-key`, or the file GLOSSATOR_ZOTERO_KEY names) is read, never written, never
shown: every message masks it."""

from __future__ import annotations

import html
import json
import mimetypes
import os
import re
import secrets
import stat
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from .bibliography import Collection
from .net import API_UA, PREPRINT_SERVERS
from .paths import LIBRARY
from .records import is_sentinel, pending
from .render import article_note
from .settings import zotero_collection, zotero_tag
from .util import fold
from .zotero import DEFAULT_TYPE, ITEM_TYPES, clean, files, split_name, tags

API = "https://api.zotero.org"
KEY_FILE = Path(os.environ.get("GLOSSATOR_ZOTERO_KEY") or Path.home() / ".config" / "glossator" / "zotero-key")
INBOX = "Inbox"  # in the top collection: Inbox / <bibliography> / <type>, the papers waiting for a decision
UNSORTED = "Unsorted"  # in Inbox: the papers Haiku gave no bibliography
KINDS = {"primary": "Primary studies", "review": "Reviews", "method": "Methods", "dataset": "Datasets"}
ACCEPT, REJECT = "accept", "reject"  # your tags on an inbox paper: the decision, applied by the next pull
COLORS = [{"name": ACCEPT, "color": "#5FB236"}, {"name": REJECT, "color": "#FF6666"}]  # Zotero's green and red
BATCH = 50  # objects per write: the API's limit
KEY_CHARS = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ"  # an object key: 8 of these
# The fields each item type has besides title, date, DOI, citationKey and url (Zotero's item templates).
FIELDS = {
    "journalArticle": ("publicationTitle", "journalAbbreviation", "volume", "issue", "pages", "PMID", "PMCID"),
    "conferencePaper": ("proceedingsTitle", "volume", "issue", "pages"),
    "bookSection": ("bookTitle", "volume", "pages"),
    "preprint": ("repository",),
}
VENUE = {"journalArticle": "publicationTitle", "conferencePaper": "proceedingsTitle", "bookSection": "bookTitle"}
IDS = (("pmid", "PMID"), ("pmcid", "PMCID"))  # in Extra when the item type has no field for them
KEPT = ("abstractNote", "shortTitle", "language", "accessDate", "rights", "archive", "archiveLocation", "callNumber")


class ZoteroError(RuntimeError):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code  # the HTTP status, when the server answered


# --------------------------------------------------------------------------- the names (library.toml)


def names() -> tuple[str, str]:
    """The top collection and the tag of what the tool writes in Zotero: library.toml's `zotero_collection` and
    `zotero_tag` (default `glossator` both)."""
    return zotero_collection(), zotero_tag()


def top_name() -> str:
    return zotero_collection()


def tag_name() -> str:
    return zotero_tag()


def inbox_tag() -> str:
    """The tag of the inbox's papers, and the label of their line in Extra (`<tag> inbox: <id>`)."""
    return f"{zotero_tag()} inbox"


def inbox_line() -> re.Pattern:
    """Extra's line naming the inbox paper an item stands for."""
    return re.compile(rf"^{re.escape(inbox_tag())}:\s*(\S+)\s*$", re.M | re.I)


# --------------------------------------------------------------------------- the web API


class Api:
    """Zotero's web API, version 3, with your key; it waits when the server asks it to."""

    def __init__(self, key: str):
        self.key = key

    def masked(self, text: str) -> str:
        """`text` without the key: no message, log or exception ever shows it."""
        return text.replace(self.key, "<key>") if self.key else text

    def call(self, method: str, path: str, params: dict | None = None, body=None, headers: dict | None = None):
        url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        headers = {"Zotero-API-Version": "3", "Zotero-API-Key": self.key, "User-Agent": API_UA, **(headers or {})}
        data = None
        if body is not None:
            data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
        for attempt in range(5):
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    raw, got = r.read(), r.headers
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and attempt < 4:
                    time.sleep(float(e.headers.get("Retry-After") or 10))
                    continue
                detail = e.read().decode("utf-8", "replace").strip()[:300]
                raise ZoteroError(
                    self.masked(f"{method} {path}: HTTP {e.code}{': ' + detail if detail else ''}"), e.code
                ) from None
            except urllib.error.URLError as e:  # offline, a name not resolved: an OSError, its text masked
                raise OSError(self.masked(f"{method} {path}: {e.reason}")) from None
            if got.get("Backoff"):
                time.sleep(float(got["Backoff"]))
            return (json.loads(raw) if raw else None), got
        raise ZoteroError(self.masked(f"{method} {path}: the server stayed busy"))

    def get_all(self, path: str, **params) -> list[dict]:
        out: list[dict] = []
        while True:
            page, headers = self.call("GET", path, {**params, "limit": 100, "start": len(out)})
            out += page
            if not page or len(out) >= int(headers.get("Total-Results") or 0):
                return out

    def write(self, path: str, objects: list[dict]) -> list[str]:
        """POST the objects 50 at a time (new ones, or changes with their key and version); return the failures."""
        failed = []
        for i in range(0, len(objects), BATCH):
            chunk = objects[i : i + BATCH]
            got, _ = self.call("POST", path, body=chunk)
            for n, f in ((got or {}).get("failed") or {}).items():
                o = chunk[int(n)]
                what = o.get("title") or o.get("name") or o.get("itemType") or "change"
                failed.append(f"{o.get('key')} ({what}): {f.get('message')}")
        return failed


def configured() -> bool:
    return KEY_FILE.is_file()


def key_file_warning(path: Path | None = None) -> str | None:
    """Why the key file is too open (group or others may read it), or None."""
    path = path or KEY_FILE
    try:
        mode = path.stat().st_mode
    except OSError:
        return None
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        return f"warning: {path} can be read by other accounts of this computer: chmod 600 {path}"
    return None


def read_key(path: Path | None = None) -> str:
    """The key in the key file ("" when there is none), with a warning on stderr when the file is too open."""
    path = path or KEY_FILE
    try:
        key = path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    if key and (why := key_file_warning(path)):
        print(why, file=sys.stderr)
    return key


def verify_key(key: str, api: Api | None = None) -> dict:
    """What a key may do, asked of Zotero (read only): {"user_id", "username", "library", "notes", "write"}.
    Zotero's documented call is `GET /keys/<key>`; the key also goes as a header, and never shows in a message.
    Raises ZoteroError (with the HTTP status as `code`: 403 or 404 for a key Zotero does not know)."""
    api = api or Api(key)
    info, _ = api.call("GET", f"/keys/{key}")
    user = ((info or {}).get("access") or {}).get("user") or {}
    return {
        "user_id": info.get("userID"),
        "username": info.get("username", ""),
        "library": bool(user.get("library")),
        "notes": bool(user.get("notes")),
        "write": bool(user.get("write")),
    }


def connect(key: str | None = None) -> tuple[Api, str]:
    """The API with your key, and the path of your library (`/users/<id>`)."""
    if key is None:
        key = read_key()
    if not key:
        raise ZoteroError(f"no Zotero key: write yours in {KEY_FILE} (zotero.org/settings/keys)")
    api = Api(key)
    access = verify_key(key, api)
    if not (access["library"] and access["notes"] and access["write"]):
        raise ZoteroError("this key cannot change your library: allow library, notes and write access on zotero.org")
    return api, f"/users/{access['user_id']}"


# --------------------------------------------------------------------------- what the library holds


@dataclass
class Article:
    """One Zotero item: an article, in one or more bibliographies (the same DOI)."""

    doi: str
    rec: dict
    coll: Collection
    shorts: list[str] = field(default_factory=list)  # its bibliographies' sub-collections
    keys: list[str] = field(default_factory=list)  # its citation key in each


def bib_of(rec: dict) -> dict:
    return {
        k: v for k, v in (rec.get("bib") or {}).items() if v not in ("", None) and not (is_sentinel(v) or pending(v))
    }


def articles(colls: list[Collection]) -> list[Article]:
    by: dict[str, Article] = {}
    for coll in colls:
        for key in sorted(coll.recs):
            rec = coll.recs[key]
            doi = clean(bib_of(rec).get("doi") or "").lower()
            a = by.setdefault(doi or f"{coll.biblio.name}/{key}", Article(doi, rec, coll))
            a.shorts.append(coll.biblio.short)
            a.keys.append(key)
    return list(by.values())


def nfc(s: str) -> str:
    """Text as Zotero keeps it: composed ("å" one character), so that a record's "å" in two never differs."""
    return unicodedata.normalize("NFC", s)


def creator(name: str) -> dict:
    family, given = split_name(nfc(name))
    if not given:
        return {"creatorType": "author", "name": family}
    return {"creatorType": "author", "firstName": given, "lastName": family}


def item_fields(rec: dict) -> tuple[dict, list[str]]:
    """The item's own fields (its type, creators included), and the lines its Extra holds for the identifiers its
    type has no field for."""
    bib = bib_of(rec)
    ztype = ITEM_TYPES.get(bib.get("type") or "", DEFAULT_TYPE)[0]

    def s(k: str) -> str:
        return nfc(clean(bib.get(k) or ""))

    venue, short, doi = s("venue"), s("venue_short"), s("doi")
    have = {
        "title": s("title") or rec["key"],
        "date": s("date") or s("year"),
        "DOI": doi,
        "url": f"https://doi.org/{doi}" if doi else "",
        "citationKey": rec["key"],
        VENUE.get(ztype, "repository"): venue,
        "journalAbbreviation": short if short != venue else "",
        "volume": s("volume"),
        "issue": s("issue"),
        "pages": s("pages"),
        "PMID": s("pmid"),
        "PMCID": s("pmcid"),
    }
    own = ("title", "date", "DOI", "url", "citationKey", *FIELDS[ztype])
    out = {"itemType": ztype, **{k: have.get(k, "") for k in own}}
    out["creators"] = [creator(n) for n in bib.get("authors") or []]
    return out, [f"{label}: {s(k)}" for k, label in IDS if s(k) and label not in FIELDS[ztype]]


def wanted_files(rec: dict, coll: Collection, base: Path) -> list[dict]:
    """The article's linked files, by paths relative to Zotero's base directory (this computer's library/)."""
    out = []
    for path, title in files(rec, coll.biblio.articles / rec["key"]):
        rel = Path(os.path.relpath(path, base)).as_posix()
        kind = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        out.append({"rel": rel, "path": f"attachments:{rel}", "title": nfc(title), "contentType": kind})
    return out


# --------------------------------------------------------------------------- the inbox's papers


def inbox_papers() -> list[dict]:
    """The inbox's papers Zotero shows: waiting for a decision (new or accepted), rated at least show_from."""
    from . import inbox as box

    if not box.ITEMS.exists():
        return []
    show = int(box.load_watch().get("show_from", 1)) if box.WATCH.exists() else 1
    out = []
    for it in box.load_items():
        rel = (it.get("triage") or {}).get("relevance")
        if it.get("status") in ("new", "accepted") and (rel is None or rel >= show):
            out.append(it)
    return out


def inbox_fields(it: dict) -> dict:
    """An inbox paper's fields, from what the scout found: a preprint or a journal article."""
    venue, doi = nfc(clean(it.get("venue") or "")), clean(it.get("doi") or "")
    preprint = doi.lower().startswith(("10.48550/", "10.1101/")) or any(s in venue.lower() for s in PREPRINT_SERVERS)
    ztype = "preprint" if preprint else "journalArticle"
    return {
        "itemType": ztype,
        "title": nfc(clean(it.get("title") or it["id"])),
        "creators": [creator(n) for n in it.get("authors") or []],
        "date": clean(it.get("date") or ""),
        "DOI": doi,
        "url": clean(it.get("url") or (f"https://doi.org/{doi}" if doi else "")),
        VENUE.get(ztype, "repository"): venue,
        "abstractNote": nfc(clean(it.get("abstract") or "")),
    }


def inbox_note(it: dict) -> str:
    """Haiku's word on the paper, as a note: relevance, bibliography, type, summary, why, and how to decide."""
    t, e = it.get("triage") or {}, html.escape
    stars = "★" * (t.get("relevance") or 0) or "·"
    head = " · ".join(x for x in (stars, t.get("bib"), t.get("kind"), f"found {it.get('found', '')}") if x)
    parts = [f"<h1>{e(it.get('title') or it['id'])}</h1>", f"<p><b>{e(head)}</b> (Haiku's triage)</p>"]
    parts += [f"<p>{e(t['summary'])}</p>"] if t.get("summary") else []
    parts += [f"<p><i>{e(t['why'])}</i></p>"] if t.get("why") else []
    parts.append(
        "<p>Decide in Zotero: key 1 (tag accept) or 2 (tag reject), applied by the next build; or "
        f"glossator inbox accept {e(it['id'])} · reject {e(it['id'])} · fetch {e(it['id'])}</p>"
    )
    return nfc("".join(parts))


def inbox_files(it: dict, base: Path) -> list[dict]:
    """The paper's PDF in inbox/pdfs/, when it was fetched."""
    from . import inbox as box

    here = box.pdf_here(it)
    if not here:
        return []
    rel = Path(os.path.relpath(here, base)).as_posix()
    return [{"rel": rel, "path": f"attachments:{rel}", "title": "Full Text PDF", "contentType": "application/pdf"}]


# --------------------------------------------------------------------------- comparing


def ids_of(data: dict) -> tuple[str, set[str]]:
    """An item's DOI, and its citation keys: the field, or "Citation Key:" in Extra (a zotero.rdf import)."""
    keys = {data["citationKey"]} if data.get("citationKey") else set()
    for line in (data.get("extra") or "").splitlines():
        m = re.match(r"\s*citation key:\s*(\S+)", line, re.I)
        if m:
            keys.add(m.group(1))
    return (data.get("DOI") or "").strip().lower(), keys


def note_text(note: str) -> str:
    """A note's words: Zotero rewrites a note's HTML when it opens it, never its text."""
    return nfc(" ".join(html.unescape(re.sub(r"<[^>]+>", " ", note or "")).split()))


def our_tags(names: list[str], remote: list[dict], drop: tuple = ()) -> list[dict]:
    """The tool's tags (automatic), and your own (manual) that are not among them nor in `drop`."""
    mine = [{"tag": t, "type": 1} for t in names]
    return mine + [t for t in remote if not t.get("type") and t["tag"] not in names and t["tag"] not in drop]


def same_tags(a: list[dict], b: list[dict]) -> bool:
    return {(t["tag"], t.get("type", 0)) for t in a} == {(t["tag"], t.get("type", 0)) for t in b}


def our_extra(remote: str, lines: list[str]) -> str:
    """The identifier lines the tool writes, then your own lines (a citation key moved to its field)."""
    labels = {"citation key", inbox_tag().lower(), *(label.lower() for _, label in IDS)}
    keep = [ln for ln in (remote or "").splitlines() if ln.split(":", 1)[0].strip().lower() not in labels]
    return "\n".join(lines + keep)


def new_key() -> str:
    # A new object carries its key and `version: 0` (zotero.org refuses a key without a version).
    return "".join(secrets.choice(KEY_CHARS) for _ in range(8))


# --------------------------------------------------------------------------- the push


@dataclass
class Plan:
    collections: list[dict] = field(default_factory=list)  # new collections, parents first
    create: list[dict] = field(default_factory=list)  # new items, each before its children
    update: list[dict] = field(default_factory=list)  # changes: key, version and the properties that change
    replace: list[dict] = field(default_factory=list)  # items whose type changes: whole objects
    counts: dict = field(
        default_factory=lambda: dict.fromkeys(("new", "updated", "notes", "files", "same", "inbox", "trashed"), 0)
    )
    gone: list[str] = field(default_factory=list)  # in the collection, no longer in the library: left there
    doubles: dict[str, int] = field(default_factory=dict)  # other top collections of the same name: key -> items
    restored: bool = False  # the tool's top collection was in Zotero's trash
    colors: list[str] = field(default_factory=list)  # the colored tags added, with their keys: "accept (1)"

    def __bool__(self) -> bool:
        return bool(self.collections or self.create or self.update or self.replace)


class Folders:
    """Your collections, and the ones the plan adds (parents first)."""

    def __init__(self, cols: list[dict], p: Plan):
        self.keys = {(c["name"], c.get("parentCollection") or False): c["key"] for c in cols}
        self.known = {c["key"] for c in cols}
        self.p = p

    def get(self, name: str, parent: str | bool = False) -> str:
        if (name, parent) not in self.keys:
            self.keys[(name, parent)] = new_key()
            self.p.collections.append(
                {"key": self.keys[(name, parent)], "version": 0, "name": name, "parentCollection": parent}
            )
        return self.keys[(name, parent)]

    def under(self, root: str) -> set[str]:
        """`root` and every collection below it."""
        out, todo = set(), [root]
        while todo:
            k = todo.pop()
            out.add(k)
            todo += [c for (_, parent), c in self.keys.items() if parent == k]
        return out


def plan(
    api: Api, lib: str, colls: list[Collection], base: Path | None = None, inbox: list[dict] | None = None
) -> Plan:
    """What to write so that your library holds these bibliographies as they are now, and, given the inbox's
    papers, the collection `<zotero_collection> / Inbox`."""
    base = base or LIBRARY
    p = Plan()
    coll_name, our_tag, box_tag, box_line = top_name(), tag_name(), inbox_tag(), inbox_line()
    arts = articles(colls)
    cols = [c["data"] for c in api.get_all(f"{lib}/collections")]  # those in Zotero's trash too (`deleted`)
    tops = [c["key"] for c in cols if c["name"] == coll_name and not c.get("parentCollection")]
    trashed = {c["key"]: c["version"] for c in cols if c.get("deleted")}
    folders = Folders([c for c in cols if c["key"] not in trashed or c["key"] in tops], p)
    kids: dict[str, list[dict]] = {}
    for i in api.get_all(f"{lib}/items", tag=our_tag):
        kids.setdefault(i["data"].get("parentItem"), []).append(i["data"])
    if len(tops) > 1:  # two imports of zotero.rdf, say: the tool keeps the one that holds its notes and files

        def tree_items(k: str) -> list[str]:
            return [i["key"] for c in folders.under(k) for i in api.get_all(f"{lib}/collections/{c}/items/top")]

        found = {k: tree_items(k) for k in tops}
        best = max(tops, key=lambda k: (sum(i in kids for i in found[k]), len(found[k])))
        folders.keys[(coll_name, False)] = best
        p.doubles = {k: len(set(found[k])) for k in tops if k != best and k not in trashed}
    top = folders.get(coll_name)
    if top in trashed:  # the tool's collection, in Zotero's trash: back to the library, with what it holds
        p.collections.append({"key": top, "version": trashed[top], "deleted": False})
        p.restored = True
    shorts = {c.biblio.name: c.biblio.short for c in colls}
    subs = {s: folders.get(s, top) for s in dict.fromkeys(shorts.values())}
    managed = set(subs.values())
    items: dict[str, dict] = {}
    for k in [top, *managed]:
        if k in folders.known:
            items |= {i["key"]: i["data"] for i in api.get_all(f"{lib}/collections/{k}/items/top")}
    waiting: dict[str, dict] = {}  # the inbox's items in Zotero
    if inbox is not None:
        managed |= folders.under(folders.get(INBOX, top))
        waiting = {i["key"]: i["data"] for i in api.get_all(f"{lib}/items/top", tag=box_tag)}
    by_doi: dict[str, dict] = {}
    by_key: dict[str, list[dict]] = {}
    for d in (items | waiting).values():  # an inbox paper that became an article is that article's item
        doi, keys = ids_of(d)
        if doi:
            by_doi.setdefault(doi, d)
        for k in keys:
            by_key.setdefault(k, []).append(d)

    matched: set[str] = set()

    def place(
        d: dict | None, fields: dict, extra: list[str], tag_names: list[str], mine: list[str], note, want, drop=()
    ):
        """Write the item: new, or the changes to `d`, and its children."""
        if d is None or d["key"] in matched:
            key = new_key()
            p.create.append(
                {"key": key, "version": 0, **fields, "extra": "\n".join(extra), "tags": our_tags(tag_names, [])}
                | {"collections": mine}
            )
            p.create.append(child_note(key, note))
            p.create += [child_file(key, f) for f in want]
            return "new"
        matched.add(d["key"])
        change = item_change(d, fields, extra, tag_names, mine, managed, drop)
        if "itemType" in change:
            p.replace.append({k: d[k] for k in KEPT if d.get(k)} | change | {"relations": d.get("relations") or {}})
        elif len(change) > 2:  # more than its key and version
            p.update.append(change)
        theirs = kids.get(d["key"], [])
        if not any(c["itemType"] == "note" for c in theirs):  # a first push: what an import made
            theirs = [c["data"] for c in api.get_all(f"{lib}/items/{d['key']}/children")]
        children(p, d["key"], theirs, note, want)
        return "updated" if "itemType" in change or len(change) > 2 else "same"

    # Zotero's merge of duplicates keeps the oldest item, yours, without the tool's DOI or citation key: an
    # item of the tool's collection with neither is found by its title
    by_title = {fold(d.get("title") or "", True): d for d in items.values() if ids_of(d) == ("", set())}
    for a in arts:
        fields, extra = item_fields(a.rec)
        d = by_doi.get(a.doi) if a.doi else None
        d = d or next((r for k in a.keys for r in by_key.get(k, []) if not ids_of(r)[0] or not a.doi), None)
        d = d or by_title.get(fold(fields["title"], True))
        tag_names = [nfc(t) for t in tags(a.rec, a.coll)]
        mine = sorted({subs[s] for s in a.shorts})
        note, want = nfc(article_note(a.rec, a.coll)), wanted_files(a.rec, a.coll, base)
        p.counts[place(d, fields, extra, tag_names, mine, note, want)] += 1
    p.gone = sorted(
        d.get("title") or k for k, d in items.items() if k not in matched and set(subs.values()) & set(d["collections"])
    )

    if inbox is not None:
        dois = {a.doi for a in arts if a.doi}
        by_id = {m.group(1): d for d in waiting.values() if (m := box_line.search(d.get("extra") or ""))}
        for it in inbox:
            if (it.get("doi") or "").lower() in dois:  # curated already, not yet marked done: its article shows it
                continue
            t = it.get("triage") or {}
            short = shorts.get(t.get("bib") or "")
            inbox_top = folders.get(INBOX, top)
            mine = [folders.get(KINDS.get(t.get("kind"), "Other"), folders.get(short, inbox_top))] if short else []
            mine = mine or [folders.get(UNSORTED, inbox_top)]
            d = by_id.get(it["id"]) or by_doi.get((it.get("doi") or "").lower() or "-")
            names = [box_tag, f"relevance {t['relevance']}" if t.get("relevance") is not None else "not triaged"]
            accepted = it.get("status") == "accepted"
            names += ["accepted"] if accepted else []
            want, extra = inbox_files(it, base), [f"{box_tag}: {it['id']}"]
            drop = (ACCEPT,) if accepted else ()  # your `accept`, applied: the tool's `accepted` says it now
            got = place(d, inbox_fields(it), extra, names, mine, inbox_note(it), want, drop)
            p.counts["inbox"] += got != "same"
        for k, d in waiting.items():  # rejected, or rated below show_from now: to Zotero's trash
            if k not in matched and box_line.search(d.get("extra") or ""):
                p.update.append({"key": k, "version": d["version"], "deleted": 1})
                p.counts["trashed"] += 1
    return p


def item_change(
    d: dict, fields: dict, extra: list[str], tag_names: list[str], mine: list[str], managed: set, drop: tuple = ()
) -> dict:
    """The properties of the item `d` that differ from the record's, with its key and version."""
    change = {"key": d["key"], "version": d["version"]}
    if d["itemType"] != fields["itemType"]:
        change |= fields  # a new type: the whole item is written again
    else:
        change |= {k: v for k, v in fields.items() if d.get(k, [] if k == "creators" else "") != v}
    ex = our_extra(d.get("extra") or "", extra)
    if ex != (d.get("extra") or "") or "itemType" in change:
        change["extra"] = ex
    tg = our_tags(tag_names, d.get("tags") or [], drop)
    if not same_tags(tg, d.get("tags") or []) or "itemType" in change:
        change["tags"] = tg
    cl = [c for c in d.get("collections") or [] if c not in managed] + mine
    if set(cl) != set(d.get("collections") or []) or "itemType" in change:
        change["collections"] = cl
    return change


def child_note(parent: str, note: str) -> dict:
    return {"key": new_key(), "version": 0, "itemType": "note", "parentItem": parent, "note": note} | {
        "tags": [{"tag": tag_name(), "type": 1}]
    }


def child_file(parent: str, f: dict) -> dict:
    return {
        "key": new_key(),
        "version": 0,
        "itemType": "attachment",
        "linkMode": "linked_file",
        "parentItem": parent,
        "title": f["title"],
        "path": f["path"],
        "contentType": f["contentType"],
        "tags": [{"tag": tag_name(), "type": 1}],
    }


def children(p: Plan, parent: str, theirs: list[dict], note: str, want: list[dict]) -> None:
    """The summary note and the linked files of an item already in Zotero: rewritten when they changed, adopted
    (tagged) when an import made them, added when missing."""

    def tagged(c: dict) -> bool:
        return any(t["tag"] == tag_name() for t in c.get("tags") or [])

    def ours(c: dict) -> list[dict]:
        return our_tags([tag_name()], c.get("tags") or [])

    notes = [c for c in theirs if c["itemType"] == "note"]
    title = note_text(re.search(r"<h1>.*?</h1>", note).group(0)) if "<h1>" in note else None
    mine = next((c for c in notes if tagged(c)), None)
    mine = mine or next((c for c in notes if title and note_text(c.get("note")).startswith(title)), None)
    if mine is None:
        p.create.append(child_note(parent, note))
        p.counts["notes"] += 1
    elif note_text(mine.get("note")) != note_text(note) or not tagged(mine):
        p.update.append({"key": mine["key"], "version": mine["version"], "note": note, "tags": ours(mine)})
        p.counts["notes"] += 1
    links = [c for c in theirs if c["itemType"] == "attachment" and c.get("linkMode") == "linked_file"]
    # The inbox's PDF of a paper that became an article: it now links the article's PDF (annotations stay on it).
    inboxed = [c for c in links if tagged(c) and (c.get("path") or "").startswith("attachments:inbox/")]
    inboxed = [c for c in inboxed if c.get("path") not in {f["path"] for f in want}]
    for f in want:
        have = next((c for c in links if c.get("path") == f["path"]), None)
        have = have or next(
            (c for c in links if not tagged(c) and (c.get("path") or "").endswith("/" + f["rel"])), None
        )
        if have is None and inboxed:
            have = inboxed.pop(0)
        if have is None:
            p.create.append(child_file(parent, f))
            p.counts["files"] += 1
        elif have.get("path") != f["path"] or have.get("title") != f["title"] or not tagged(have):
            change = {"path": f["path"], "title": f["title"], "contentType": f["contentType"], "tags": ours(have)}
            p.update.append({"key": have["key"], "version": have["version"], **change})
            p.counts["files"] += 1
        links = [c for c in links if c is not have]


def colors(api: Api, lib: str, dry_run: bool = False) -> list[str]:
    """Zotero's colored tags `accept` and `reject`, added where missing after your own (keys 1 and 2 when
    there are none): a key pressed on a selected item puts its tag on or off. Returns those added, with their key."""
    try:
        got, _ = api.call("GET", f"{lib}/settings/tagColors")
        value, version = got.get("value") or [], got.get("version", 0)
    except ZoteroError as e:
        if e.code != 404:  # 404: no colored tag yet
            raise
        value, version = [], 0
    have = {c.get("name") for c in value}
    missing = [c for c in COLORS if c["name"] not in have]
    if missing and not dry_run:
        api.call("PUT", f"{lib}/settings/tagColors", body={"value": value + missing, "version": version})
    return [f"{c['name']} ({len(value) + n + 1})" for n, c in enumerate(missing)]


def decisions(api: Api, lib: str) -> dict[str, str]:
    """The decisions tagged in Zotero on the inbox's papers: id -> accepted | rejected (both tags: none)."""
    out = {}
    for i in api.get_all(f"{lib}/items/top", tag=inbox_tag()):
        d = i["data"]
        m = inbox_line().search(d.get("extra") or "")
        names = {t["tag"] for t in d.get("tags") or []}
        if m and (ACCEPT in names) != (REJECT in names):
            out[m.group(1)] = "accepted" if ACCEPT in names else "rejected"
    return out


def take_decisions(dry_run: bool = False, conn: tuple[Api, str] | None = None) -> list[str]:
    """Apply in the inbox the decisions tagged in Zotero that change a paper's status (a new one accepted or
    rejected, an accepted one rejected), each committed as `glossator inbox accept|reject` does; returns them."""
    from . import inbox as box

    if not box.ITEMS.exists():
        return []
    api, lib = conn or connect()
    status = {it["id"]: it.get("status") for it in box.load_items()}
    todo: dict[str, list[str]] = {}
    for i, s in sorted(decisions(api, lib).items()):
        if status.get(i) in ("new", "accepted") and status[i] != s:
            todo.setdefault(s, []).append(i)
    if dry_run:
        return [f"{i}: would be {s}" for s, ids in todo.items() for i in ids]
    return [line for s, ids in todo.items() for line in box.decide(ids, s, via="zotero")]


def purge_trash(dry_run: bool = False, conn: tuple[Api, str] | None = None) -> int:
    """Delete for good the inbox's papers in Zotero's trash (rejected, or rated lower), with their note and file
    link: the trash holds no file of theirs (the PDFs are linked), only their entries. Returns how many."""
    api, lib = conn or connect()
    gone = {
        i["key"]
        for i in api.get_all(f"{lib}/items/trash", tag=inbox_tag())
        if inbox_line().search(i["data"].get("extra") or "")
    }
    if dry_run or not gone:
        return len(gone)
    kids = [i["key"] for i in api.get_all(f"{lib}/items", tag=tag_name()) if i["data"].get("parentItem") in gone]
    keys = kids + sorted(gone)  # the children first
    _, got = api.call("GET", f"{lib}/items", {"limit": 1})
    version = got.get("Last-Modified-Version")
    for i in range(0, len(keys), BATCH):
        chunk = ",".join(keys[i : i + BATCH])
        _, got = api.call(
            "DELETE", f"{lib}/items", {"itemKey": chunk}, headers={"If-Unmodified-Since-Version": str(version)}
        )
        version = got.get("Last-Modified-Version") or version
    return len(gone)


def push(
    colls: list[Collection], dry_run: bool = False, conn: tuple[Api, str] | None = None, inbox: list[dict] | None = None
) -> Plan:
    """Bring your Zotero library in step with these bibliographies, and with the inbox's papers when they are
    given (`inbox_papers()`); with `dry_run`, only say what would change."""
    api, lib = conn or connect()
    p = plan(api, lib, colls, inbox=inbox)
    if inbox is not None:
        p.colors = colors(api, lib, dry_run)
    if dry_run or not p:
        return p
    failed = api.write(f"{lib}/collections", p.collections)
    failed += api.write(f"{lib}/items", p.update)  # before the new children, with the versions just read
    for obj in p.replace:
        try:
            api.call("PUT", f"{lib}/items/{obj['key']}", body=obj)
        except ZoteroError as e:
            failed.append(str(e))
    failed += api.write(f"{lib}/items", p.create)
    if failed:
        raise ZoteroError("some changes were refused (run it again):\n  " + "\n  ".join(failed[:10]))
    return p


def report(p: Plan, dry_run: bool = False) -> str:
    c = p.counts
    total = c["new"] + c["updated"] + c["same"]
    if not p:
        out = f"Zotero: up to date ({total} articles)"
    else:
        verb = "would change" if dry_run else "changed"
        parts = [f"{c['new']} new articles", f"{c['updated']} references", f"{c['notes']} notes", f"{c['files']} files"]
        parts += [f"{c['inbox']} inbox papers"] if c["inbox"] else []
        parts += [f"{c['trashed']} inbox papers to the trash"] if c["trashed"] else []
        out = f"Zotero {verb}: " + ", ".join(parts) + f" (of {total} articles)"
    if p.colors:
        out += (
            f"\nZotero: colored tags {' and '.join(p.colors)} {'would be ' if dry_run else ''}added: select an inbox"
            " paper, press its number"
        )
    if p.restored:
        out += f"\nZotero: the collection `{top_name()}` was in the trash: {'would be ' if dry_run else ''}restored"
    if p.doubles:
        n = sum(p.doubles.values())
        out += (
            f"\nZotero: {len(p.doubles)} other collection(s) `{top_name()}` ({n} items, an older import?) left as they are:"
            " in Zotero, the one whose articles have no summary note; delete it with its items"
            ' ("Delete Collection and Items")'
        )
    if p.gone:
        out += (
            f"\nZotero: {len(p.gone)} items of `{top_name()}` are no longer in the library, left there: "
            + "; ".join(p.gone[:5])
        )
    return out
