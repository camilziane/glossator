"""The push to a Zotero library, against a Zotero kept in memory: what a first push writes, that a second
writes nothing, what its owner adds stays, an import is adopted, a new type rewrites the item. Nothing reaches
zotero.org: the tests have no key."""

import copy
import json
import shutil
import unicodedata

import pytest
import sample_library

from glossator import inbox as box
from glossator import zotero_web
from glossator.bibliography import Bibliography, collection

LIB = "/users/1"
FILE = "attachments:methods/articles/doe2024/paper.pdf"


def composed(value):
    """What Zotero keeps of a value: its text composed (NFC)."""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [composed(v) for v in value]
    if isinstance(value, dict):
        return {k: composed(v) for k, v in value.items()}
    return value


class FakeZotero:
    """Zotero's web API as the push uses it: versions, writes that change only the properties sent, children, text
    kept composed."""

    def __init__(self):
        self.version = 0
        self.cols: dict[str, dict] = {}
        self.items: dict[str, dict] = {}
        self.settings: dict[str, dict] = {}
        self.writes = 0

    def bump(self) -> int:
        self.version += 1
        return self.version

    def add(self, store: dict, data: dict) -> str:
        key = data.get("key") or zotero_web.new_key()
        defaults = {"tags": [], "relations": {}} | ({"collections": []} if store is self.items else {})
        store[key] = defaults | composed(data) | {"key": key, "version": self.bump()}
        return key

    def get_all(self, path: str, **params) -> list[dict]:
        parts = path.split("/")[3:]
        if parts == ["collections"]:
            found = self.cols.values()
        elif parts[0] == "collections" and parts[2:] == ["items", "top"]:
            found = [i for i in self.items.values() if parts[1] in i["collections"] and not i.get("parentItem")]
        elif parts in (["items"], ["items", "top"]):
            found = [i for i in self.items.values() if any(t["tag"] == params["tag"] for t in i["tags"])]
            found = [i for i in found if parts == ["items"] or not i.get("parentItem")]
        elif parts == ["items", "trash"]:
            found = [
                i for i in self.items.values() if i.get("deleted") and any(t["tag"] == params["tag"] for t in i["tags"])
            ]
            return [{"key": d["key"], "version": d["version"], "data": copy.deepcopy(d)} for d in found]
        elif parts[0] == "items" and parts[2:] == ["children"]:
            found = [i for i in self.items.values() if i.get("parentItem") == parts[1]]
        else:
            raise AssertionError(path)
        if parts != ["collections"]:  # items in the trash are not listed; collections are, with `deleted`
            found = [d for d in found if not d.get("deleted")]
        return [{"key": d["key"], "version": d["version"], "data": copy.deepcopy(d)} for d in found]

    def write(self, path: str, objects: list[dict]) -> list[str]:
        store = self.cols if path.endswith("/collections") else self.items
        failed = []
        for o in objects:
            self.writes += 1
            old = store.get(o["key"])
            if old is None:
                if "version" not in o:  # as zotero.org answers a new object whose key the client chose
                    failed.append(f"{o['key']}: 'version' property must be provided for 'key'-based writes")
                elif o.get("parentItem") and o["parentItem"] not in self.items:
                    failed.append(f"{o['key']}: no parent")
                elif any(c not in self.cols for c in o.get("collections", [])):
                    failed.append(f"{o['key']}: no such collection")
                else:
                    self.add(store, o)
            elif o.get("version") != old["version"]:
                failed.append(f"{o['key']}: 412")
            elif o.get("itemType", old.get("itemType")) != old.get("itemType"):
                failed.append(f"{o['key']}: a new type needs the whole item")
            else:
                old.update(composed({k: v for k, v in o.items() if k != "version"}), version=self.bump())
        return failed

    def call(self, method: str, path: str, params=None, body=None, headers=None):
        if path.endswith("/items") and method in ("GET", "DELETE"):  # the library's version; a deletion for good
            if method == "DELETE":
                assert headers["If-Unmodified-Since-Version"] == str(self.version)
                for k in params["itemKey"].split(","):
                    self.items.pop(k, None)
                self.bump()
            return [], {"Last-Modified-Version": self.version}
        if "/settings/" in path:  # a setting: {value, version}, absent until written (404)
            name = path.rsplit("/", 1)[1]
            if method == "GET":
                if name not in self.settings:
                    raise zotero_web.ZoteroError(f"GET {path}: HTTP 404: Setting not found", 404)
                return copy.deepcopy(self.settings[name]), {}
            assert method == "PUT" and body["version"] == self.settings.get(name, {}).get("version", 0)
            self.settings[name] = {"value": copy.deepcopy(body["value"]), "version": self.bump()}
            return None, {}
        assert method == "PUT"
        key = path.rsplit("/", 1)[1]
        assert body["version"] == self.items[key]["version"]
        self.writes += 1
        self.items[key] = {"tags": [], "collections": []} | composed(body) | {"version": self.bump()}
        return None, {}

    def top(self) -> list[dict]:
        return [i for i in self.items.values() if not i.get("parentItem") and not i.get("deleted")]

    def path(self, key: str) -> str:
        """A collection's names from the top: "glossator/Inbox/Methods/Reviews"."""
        c = self.cols[key]
        return (self.path(c["parentCollection"]) + "/" if c.get("parentCollection") else "") + c["name"]

    def kids(self, key: str) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for i in self.items.values():
            if i.get("parentItem") == key:
                out.setdefault(i["itemType"], []).append(i)
        return out


@pytest.fixture
def lib(tmp_path, monkeypatch):
    root = sample_library.make(tmp_path / "library")
    monkeypatch.setattr(zotero_web, "LIBRARY", root)
    return root


@pytest.fixture
def sample(lib):
    return collection(Bibliography.at(lib / "methods"))


@pytest.fixture
def fake():
    return FakeZotero()


def push(colls, fake, **kw):
    return zotero_web.push(colls, conn=(fake, LIB), **kw)


def test_the_tests_have_no_key():
    assert not zotero_web.configured()


def test_a_first_push_writes_it_all_and_a_second_nothing(sample, fake):
    p = push([sample], fake)
    assert p.counts["new"] == 1
    names = {c["name"]: c for c in fake.cols.values()}
    assert names["Methods"]["parentCollection"] == names["glossator"]["key"]
    (item,) = fake.top()
    assert item["itemType"] == "journalArticle" and item["citationKey"] == "doe2024"
    assert item["DOI"] == sample_library.DOI and item["url"] == f"https://doi.org/{sample_library.DOI}"
    assert item["publicationTitle"] == "Journal of Examples" and item["journalAbbreviation"] == "J. Examples"
    assert item["creators"][0] == {"creatorType": "author", "firstName": "Jane", "lastName": "Doe"}
    assert item["collections"] == [names["Methods"]["key"]] and "PMID" not in item["extra"]
    assert all(t["type"] == 1 for t in item["tags"]) and item["tags"]
    kids = fake.kids(item["key"])
    (note,), (pdf,) = kids["note"], kids["attachment"]
    assert sample_library.QUOTE in note["note"] and note["tags"] == [{"tag": "glossator", "type": 1}]
    assert pdf["path"] == FILE and pdf["linkMode"] == "linked_file" and pdf["contentType"] == "application/pdf"
    writes = fake.writes
    again = push([sample], fake)
    assert not again and fake.writes == writes
    assert zotero_web.report(again) == "Zotero: up to date (1 articles)"


def test_a_dry_run_writes_nothing(sample, fake):
    p = push([sample], fake, dry_run=True)
    assert p.counts["new"] == 1 and fake.writes == 0 and not fake.items
    assert zotero_web.report(p, dry_run=True).startswith("Zotero would change: 1 new articles")


def test_what_the_user_adds_stays(sample, fake):
    push([sample], fake)
    (item,) = fake.top()
    reading = fake.add(fake.cols, {"name": "Reading", "parentCollection": False})
    item["tags"].append({"tag": "to read"})
    item["collections"].append(reading)
    own = fake.add(fake.items, {"itemType": "note", "parentItem": item["key"], "note": "<p>mine</p>"})
    sample.recs["doe2024"]["overview"]["one_line"] = "A new one-line summary."
    p = push([sample], fake)
    assert p.counts["notes"] == 1 and p.counts["updated"] == 0
    assert {"tag": "to read"} in item["tags"] and reading in item["collections"]
    assert fake.items[own]["note"] == "<p>mine</p>"
    (ours,) = [n for n in fake.kids(item["key"])["note"] if n["key"] != own]
    assert "A new one-line summary." in ours["note"]


def test_a_note_zotero_rewrote_is_left_alone(sample, fake):
    push([sample], fake)
    (note,) = fake.kids(fake.top()[0]["key"])["note"]
    note["note"] = f'<div data-schema-version="9">{note["note"]}</div>'
    assert not push([sample], fake)


def test_an_import_is_adopted(sample, fake):
    """What `zotero.rdf` made in Zotero: the key in Extra, an untagged note, a file at an absolute path."""
    top = fake.add(fake.cols, {"name": "glossator", "parentCollection": False})
    sub = fake.add(fake.cols, {"name": "Methods", "parentCollection": top})
    item = fake.add(
        fake.items,
        {
            "itemType": "journalArticle",
            "title": sample_library.TITLE,
            "DOI": sample_library.DOI,
            "extra": "Citation Key: doe2024\nOriginal date: 2023",
            "collections": [sub],
        },
    )
    old = f'<div data-schema-version="9"><h1>{sample_library.TITLE}</h1><p>an old summary</p></div>'
    note = fake.add(fake.items, {"itemType": "note", "parentItem": item, "note": old})
    path = "/Users/me/glossator/library/methods/articles/doe2024/paper.pdf"
    pdf = fake.add(
        fake.items,
        {"itemType": "attachment", "linkMode": "linked_file", "parentItem": item, "path": path, "title": "PDF"},
    )
    p = push([sample], fake)
    assert p.counts["new"] == 0 and set(fake.items) == {item, note, pdf}
    assert fake.items[item]["citationKey"] == "doe2024" and fake.items[item]["extra"] == "Original date: 2023"
    assert sample_library.QUOTE in fake.items[note]["note"] and fake.items[note]["tags"] == [
        {"tag": "glossator", "type": 1}
    ]
    assert fake.items[pdf]["path"] == FILE
    assert not push([sample], fake)


def test_a_new_type_rewrites_the_item(sample, fake):
    push([sample], fake)
    (item,) = fake.top()
    item["abstractNote"] = "their own abstract"
    sample.recs["doe2024"]["bib"]["type"] = "preprint"
    p = push([sample], fake)
    assert p.counts["updated"] == 1
    item = fake.items[item["key"]]
    assert item["itemType"] == "preprint" and item["repository"] == "Journal of Examples"
    assert "publicationTitle" not in item and item["abstractNote"] == "their own abstract"
    assert not push([sample], fake)


def test_one_article_in_two_bibliographies_is_one_item(lib, sample, fake):
    shutil.copytree(lib / "methods", lib / "other")
    cfg = json.loads((lib / "other" / "biblio.json").read_text())
    (lib / "other" / "biblio.json").write_text(json.dumps(cfg | {"short": "Other"}))
    other = collection(Bibliography.at(lib / "other"))
    push([sample, other], fake)
    (item,) = fake.top()
    names = {c["key"]: c["name"] for c in fake.cols.values()}
    assert sorted(names[k] for k in item["collections"]) == ["Methods", "Other"]
    push([sample], fake)  # one bibliography alone keeps the item in the other
    assert sorted(names[k] for k in fake.items[item["key"]]["collections"]) == ["Methods", "Other"]


def test_an_article_that_left_is_named_not_deleted(sample, fake):
    push([sample], fake)
    sample.recs.clear()
    p = push([sample], fake)
    assert p.gone == [sample_library.TITLE] and len(fake.top()) == 1
    assert "no longer in the library" in zotero_web.report(p)


def test_letters_in_two_characters_are_sent_composed(sample, fake):
    """A record's "å" written as "a" and a ring: Zotero keeps it as one character, and a second push must not
    write it again."""
    decomposed = unicodedata.normalize("NFD", "David A. Bjånes")
    sample.recs["doe2024"]["bib"]["authors"].append(decomposed)
    sample.recs["doe2024"]["overview"]["one_line"] = f"By {decomposed}."
    push([sample], fake)
    (item,) = fake.top()
    assert item["creators"][-1]["lastName"] == "Bjånes" and len(item["creators"][-1]["lastName"]) == 6
    assert not push([sample], fake)


def paper(i, rel=2, kind="review", bib="methods", status="new", doi=None):
    return {
        "id": i,
        "doi": doi or f"10.1/{i}",
        "title": f"A paper called {i}",
        "authors": ["Ada Lovelace", "Alan Turing"],
        "venue": "bioRxiv" if kind == "method" else "Journal of Tests",
        "date": "2026-11-05",
        "abstract": "What it found.",
        "status": status,
        "found": "2026-11-07",
        "triage": {"bib": bib, "relevance": rel, "kind": kind, "summary": "A summary.", "why": "Why."},
    }


def test_the_inbox_is_a_collection_by_bibliography_then_type(sample, fake):
    papers = [paper("a1"), paper("b2", kind="method", rel=1), paper("c3", bib="none", rel=3)]
    p = push([sample], fake, inbox=papers)
    assert p.counts["inbox"] == 3
    where = {i["title"]: sorted(fake.path(c) for c in i["collections"]) for i in fake.top()}
    assert where["A paper called a1"] == ["glossator/Inbox/Methods/Reviews"]
    assert where["A paper called b2"] == ["glossator/Inbox/Methods/Methods"]
    assert where["A paper called c3"] == ["glossator/Inbox/Unsorted"]
    (b2,) = [i for i in fake.top() if i["title"] == "A paper called b2"]
    assert b2["itemType"] == "preprint" and b2["repository"] == "bioRxiv" and b2["abstractNote"] == "What it found."
    assert {t["tag"] for t in b2["tags"]} == {"glossator inbox", "relevance 1"}
    (note,) = fake.kids(b2["key"])["note"]
    assert "A summary." in note["note"] and "glossator inbox accept b2" in note["note"]
    assert not push([sample], fake, inbox=papers)  # nothing new: nothing written


def test_a_fetched_pdf_is_linked_and_a_decision_shows(sample, fake, lib, monkeypatch):
    monkeypatch.setattr(box, "PDFS", lib / "inbox" / "pdfs")
    (lib / "inbox" / "pdfs").mkdir(parents=True)
    (lib / "inbox" / "pdfs" / "a1.pdf").write_bytes(b"%PDF-1.4")
    a1 = paper("a1") | {"pdf_file": "pdfs/a1.pdf"}
    push([sample], fake, inbox=[a1])
    (item,) = [i for i in fake.top() if i["title"] == "A paper called a1"]
    assert fake.kids(item["key"])["attachment"][0]["path"] == "attachments:inbox/pdfs/a1.pdf"
    push([sample], fake, inbox=[a1 | {"status": "accepted"}])
    assert "accepted" in {t["tag"] for t in fake.items[item["key"]]["tags"]}


def test_a_rejected_paper_goes_to_the_trash(sample, fake):
    push([sample], fake, inbox=[paper("a1"), paper("b2")])
    p = push([sample], fake, inbox=[paper("b2")])  # a1 rejected: no longer among the papers waiting
    assert p.counts["trashed"] == 1
    assert [i["title"] for i in fake.top() if "glossator inbox" in {t["tag"] for t in i["tags"]}] == [
        "A paper called b2"
    ]


def test_a_paper_added_becomes_its_article(sample, fake, lib, monkeypatch):
    """The inbox's item, its PDF annotated in Zotero, is the article's once curated: one item, out of the Inbox,
    its note the summary, its link the article's PDF."""
    monkeypatch.setattr(box, "PDFS", lib / "inbox" / "pdfs")
    (lib / "inbox" / "pdfs").mkdir(parents=True)
    (lib / "inbox" / "pdfs" / "doe2024.pdf").write_bytes(b"%PDF-1.4")
    waiting = paper("doe2024", doi=sample_library.DOI) | {"pdf_file": "pdfs/doe2024.pdf"}
    articles = collection(Bibliography.at(lib / "methods"))
    rec = articles.recs.pop("doe2024")  # not curated yet
    push([articles], fake, inbox=[waiting])
    (item,) = fake.top()
    (pdf,) = fake.kids(item["key"])["attachment"]
    articles.recs["doe2024"] = rec  # curated, marked done: no longer in the inbox
    p = push([articles], fake, inbox=[])
    assert p.counts["trashed"] == 0 and p.counts["new"] == 0
    (item,) = fake.top()
    assert [fake.path(c) for c in item["collections"]] == ["glossator/Methods"]
    assert item["citationKey"] == "doe2024" and "glossator inbox" not in item["extra"]
    assert "glossator inbox" not in {t["tag"] for t in item["tags"]}
    (note,) = fake.kids(item["key"])["note"]
    assert sample_library.QUOTE in note["note"]
    (same,) = fake.kids(item["key"])["attachment"]
    assert same["key"] == pdf["key"] and same["path"] == FILE  # the same attachment: its annotations stay
    assert not push([articles], fake, inbox=[])


def test_of_two_top_collections_of_that_name_the_tools_is_kept(sample, fake):
    """An older import beside the tool's collection: the tool goes on with its own and names the other."""
    push([sample], fake)
    old = fake.add(fake.cols, {"name": "glossator", "parentCollection": False})
    sub = fake.add(fake.cols, {"name": "Methods", "parentCollection": old})
    fake.add(fake.items, {"itemType": "journalArticle", "title": "An old import", "collections": [sub]})
    p = push([sample], fake)
    assert not p and p.doubles == {old: 1}
    assert "delete it with its items" in zotero_web.report(p)


def test_a_collection_in_the_trash(sample, fake):
    """Zotero's trash holds collections (`deleted`): an older `glossator` there is no double, and the tool's own
    `glossator` there comes back with its sub-collections, nothing else changed."""
    push([sample], fake, inbox=[])
    old = fake.add(fake.cols, {"name": "glossator", "parentCollection": False, "deleted": True})
    fake.add(fake.items, {"itemType": "journalArticle", "title": "An old import", "collections": [old]})
    assert not push([sample], fake, inbox=[]).doubles
    top = next(k for k, c in fake.cols.items() if c["name"] == "glossator" and k != old)
    fake.cols[top]["deleted"] = True
    p = push([sample], fake, dry_run=True, inbox=[])
    assert p.restored and "would be restored" in zotero_web.report(p, dry_run=True)
    p = push([sample], fake, inbox=[])
    assert p.restored and not p.create and not p.update and not fake.cols[top]["deleted"]
    assert fake.cols[old]["deleted"] and not push([sample], fake, inbox=[])


@pytest.fixture
def waiting(tmp_path, monkeypatch):
    """An inbox on disk (no git): a1, b2 and d4 new, c3 accepted."""
    for name, rel in (
        ("INBOX", "inbox"),
        ("ITEMS", "inbox/items"),
        ("PDFS", "inbox/pdfs"),
        ("STATE", "inbox/state.json"),
    ):
        monkeypatch.setattr(box, name, tmp_path / rel)
    monkeypatch.setattr(box, "WATCH", tmp_path / "inbox" / "watch.toml")
    (tmp_path / "inbox" / "items").mkdir(parents=True)
    for i, status in (("a1", "new"), ("b2", "new"), ("c3", "accepted"), ("d4", "new")):
        box.save_item(paper(i, status=status))


def tag(fake, i, *names):
    """Tags put by hand on the inbox paper `i` in Zotero."""
    (item,) = [d for d in fake.top() if f"glossator inbox: {i}" in d.get("extra", "")]
    item["tags"] += [{"tag": n} for n in names]
    item["version"] = fake.bump()


def test_decisions_tagged_in_zotero(sample, fake, waiting):
    """`accept` or `reject` on an inbox paper in Zotero is its decision: the next build applies it (without a date,
    the same on every computer), the tool's `accepted` replaces their `accept`, a rejected paper goes to the
    trash; both tags at once decide nothing."""
    push([sample], fake, inbox=zotero_web.inbox_papers())
    tag(fake, "a1", "accept")
    tag(fake, "b2", "reject")
    tag(fake, "c3", "reject")
    tag(fake, "d4", "accept", "reject")
    conn = (fake, LIB)
    assert zotero_web.take_decisions(dry_run=True, conn=conn) == [
        "a1: would be accepted",
        "b2: would be rejected",
        "c3: would be rejected",
    ]
    assert {it["id"]: it["status"] for it in box.load_items()} == {
        "a1": "new",
        "b2": "new",
        "c3": "accepted",
        "d4": "new",
    }
    assert sorted(zotero_web.take_decisions(conn=conn)) == ["a1: accepted", "b2: rejected", "c3: rejected"]
    items = {it["id"]: it for it in box.load_items()}
    assert [items[i]["status"] for i in ("a1", "b2", "c3", "d4")] == ["accepted", "rejected", "rejected", "new"]
    assert items["a1"]["decided_in"] == "zotero" and "decided" not in items["a1"]
    push([sample], fake, inbox=zotero_web.inbox_papers())
    left = {d["extra"]: {t["tag"] for t in d["tags"]} for d in fake.top() if "glossator inbox" in d.get("extra", "")}
    assert left == {
        "glossator inbox: a1": {"glossator inbox", "relevance 2", "accepted"},
        "glossator inbox: d4": {"glossator inbox", "relevance 2", "accept", "reject"},
    }
    assert not zotero_web.take_decisions(conn=conn)


def test_the_colored_tags_are_added_once(sample, fake):
    """Keys 1 and 2 when the library has no colored tag; after theirs otherwise; never twice; a dry run writes none."""
    p = push([sample], fake, dry_run=True, inbox=[])
    assert p.colors == ["accept (1)", "reject (2)"] and "tagColors" not in fake.settings
    p = push([sample], fake, inbox=[])
    assert p.colors == ["accept (1)", "reject (2)"] and fake.settings["tagColors"]["value"] == zotero_web.COLORS
    assert "press its number" in zotero_web.report(p)
    assert push([sample], fake, inbox=[]).colors == []
    fake.settings["tagColors"]["value"] = [{"name": "to read", "color": "#2EA8E5"}, zotero_web.COLORS[1]]
    assert push([sample], fake, inbox=[]).colors == ["accept (3)"]
    assert [c["name"] for c in fake.settings["tagColors"]["value"]] == ["to read", "reject", "accept"]
    assert push([sample], fake).colors == []  # one bibliography alone: no inbox, no colored tags


def test_a_merge_in_zotero_keeps_the_users_item(sample, fake):
    """Zotero's "Merge" of duplicates keeps the older item, the owner's,, without the tool's DOI and citation key, and
    moves the children to it: the tool finds it by its title and makes it the article's, no new item."""
    push([sample], fake)
    (mine,) = fake.top()
    own = fake.add(fake.cols, {"name": "Reading list", "parentCollection": False})
    old = fake.add(
        fake.items,
        {"itemType": "journalArticle", "title": mine["title"].upper(), "collections": [own, *mine["collections"]]},
    )
    for kid in fake.items.values():
        if kid.get("parentItem") == mine["key"]:
            kid["parentItem"] = old
    mine["deleted"] = 1
    p = push([sample], fake)
    assert p.counts["new"] == 0 and p.counts["updated"] == 1 and not p.create
    (item,) = fake.top()
    assert item["key"] == old and item["DOI"] and item["citationKey"] == "doe2024"
    assert own in item["collections"]  # their own collection stays
    assert not push([sample], fake)


def test_the_inbox_papers_in_the_trash_are_deleted_for_good(sample, fake):
    """`inbox purge`: the inbox's items in Zotero's trash go for good, with their children; nothing else."""
    push([sample], fake, inbox=[paper("a1"), paper("b2")])
    push([sample], fake, inbox=[paper("b2")])  # a1 rejected: to the trash
    before = len(fake.items)
    assert zotero_web.purge_trash(dry_run=True, conn=(fake, LIB)) == 1 and len(fake.items) == before
    assert zotero_web.purge_trash(conn=(fake, LIB)) == 1
    assert not any("glossator inbox: a1" in i.get("extra", "") for i in fake.items.values())
    assert all(i.get("parentItem") in fake.items for i in fake.items.values() if i.get("parentItem"))
    assert len(fake.items) == before - 2  # a1 and its note (no PDF linked)
    assert [i["title"] for i in fake.top() if "glossator inbox" in i.get("extra", "")] == ["A paper called b2"]
    assert zotero_web.purge_trash(conn=(fake, LIB)) == 0


def test_the_names_are_the_librarys_settings(sample, fake, monkeypatch):
    """library.toml's `zotero_collection` and `zotero_tag` (default `glossator`) name what the tool writes; the
    inbox's collection, tag and Extra line follow them."""
    from glossator import settings

    assert zotero_web.names() == ("glossator", "glossator")
    monkeypatch.setattr(settings, "settings", lambda: {"zotero_collection": "Readings", "zotero_tag": "kept"})
    assert zotero_web.names() == ("Readings", "kept") and zotero_web.inbox_tag() == "kept inbox"
    push([sample], fake, inbox=[paper("a1")])
    assert {c["name"] for c in fake.cols.values() if not c.get("parentCollection")} == {"Readings"}
    (item,) = [i for i in fake.top() if i["title"] == "A paper called a1"]
    assert [fake.path(c) for c in item["collections"]] == ["Readings/Inbox/Methods/Reviews"]
    assert "kept inbox: a1" in item["extra"] and {"kept inbox", "relevance 2"} <= {t["tag"] for t in item["tags"]}
    notes = [n for i in fake.top() for n in fake.kids(i["key"]).get("note", [])]
    assert notes and all(n["tags"] == [{"tag": "kept", "type": 1}] for n in notes)
    item["tags"] += [{"tag": "accept"}]
    assert zotero_web.decisions(fake, LIB) == {"a1": "accepted"}
    monkeypatch.setattr(settings, "settings", lambda: {"zotero_collection": "a/b"})
    with pytest.raises(ValueError):
        zotero_web.names()
    monkeypatch.setattr(settings, "settings", lambda: {"zotero_tag": 3})
    with pytest.raises(ValueError):
        zotero_web.names()


class Answers:
    """urlopen's stand-in: each call raises or answers the next of `answers`, and the URLs asked are kept."""

    def __init__(self, *answers):
        self.answers, self.urls = list(answers), []

    def __call__(self, req, timeout=None):
        self.urls.append(req.full_url)
        got = self.answers.pop(0)
        if isinstance(got, Exception):
            raise got
        return got


class Reply:
    def __init__(self, body: dict):
        self.body, self.headers = json.dumps(body).encode(), {}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code: int, body: bytes = b""):
    import io
    import urllib.error

    return urllib.error.HTTPError("https://api.zotero.org/x", code, "no", {}, io.BytesIO(body))


KEY = "AbCdEfGhIjKlMnOpQrStUvWx"


def test_the_key_never_shows_in_a_message(monkeypatch):
    import urllib.error

    monkeypatch.setattr(zotero_web.time, "sleep", lambda s: None)
    for answers, kind in (
        ([http_error(403, b"Forbidden for " + KEY.encode())], zotero_web.ZoteroError),
        ([http_error(429)] * 5, zotero_web.ZoteroError),  # the server stayed busy
        ([urllib.error.URLError(f"no route to api.zotero.org/keys/{KEY}")], OSError),
    ):
        monkeypatch.setattr(zotero_web.urllib.request, "urlopen", Answers(*answers))
        with pytest.raises(kind) as e:
            zotero_web.verify_key(KEY)
        assert KEY not in str(e.value) and "<key>" in str(e.value), str(e.value)


def test_a_key_is_verified_read_only(monkeypatch):
    access = {"userID": 42, "username": "reader", "access": {"user": {"library": True, "notes": True, "write": True}}}
    answers = Answers(Reply(access))
    monkeypatch.setattr(zotero_web.urllib.request, "urlopen", answers)
    got = zotero_web.verify_key(KEY)
    assert got == {"user_id": 42, "username": "reader", "library": True, "notes": True, "write": True}
    assert answers.urls == [f"https://api.zotero.org/keys/{KEY}"]
    monkeypatch.setattr(zotero_web.urllib.request, "urlopen", Answers(Reply(access | {"access": {"user": {}}})))
    with pytest.raises(zotero_web.ZoteroError, match="cannot change your library"):
        zotero_web.connect(KEY)


def test_a_key_file_others_can_read_is_warned_about(tmp_path, capsys):
    path = tmp_path / "zotero-key"
    path.write_text(KEY + "\n")
    path.chmod(0o644)
    assert "chmod 600" in zotero_web.key_file_warning(path)
    assert zotero_web.read_key(path) == KEY and "chmod 600" in capsys.readouterr().err
    path.chmod(0o600)
    assert zotero_web.key_file_warning(path) is None
    assert zotero_web.read_key(path) == KEY and capsys.readouterr().err == ""
    assert zotero_web.read_key(tmp_path / "none") == ""
