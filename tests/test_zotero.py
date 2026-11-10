"""The Zotero library: what an article becomes, its summary note, the links to its files, `--since`."""

import json
import os
import urllib.parse
import xml.etree.ElementTree as ET

import pytest
import sample_library

from glossator import zotero
from glossator.bibliography import Bibliography, Collection, collection

SECRET = "a private claim that only the note may carry"


def ns(name):
    return zotero.q(name)


@pytest.fixture
def make(tmp_path, monkeypatch):
    """make(bib, key, **bib_fields): a bibliography folder holding one article with its files (a record cut down
    to what the item reads: its note is a stand-in, a whole record's note is tested on the sample library)."""
    monkeypatch.setattr(zotero, "article_note", lambda rec, coll: f"<p>summary of {rec['key']}</p>")

    def _make(bib="health", key="vandermeer2020", profile="epidemio", **fields):
        root = tmp_path / bib
        folder = root / "articles" / key
        (folder / "supplementary").mkdir(parents=True, exist_ok=True)
        (root / "biblio.json").write_text(json.dumps({"profile": profile, "title": bib, "short": bib.upper()}))
        (folder / "paper.pdf").write_bytes(b"%PDF-1.4")
        (folder / "supplementary" / "data.xlsx").write_bytes(b"x")
        rec = {
            "key": key,
            "kind": "cohort",
            "bib": {
                "title": "Heat exposure and hospital admissions",
                "authors": ["Johannes P. van der Meer", "Ada Lovelace", "Heat and Health Study Group"],
                "year": 2020,
                "date": "2020-05-01",
                "venue": "Journal of Invented Epidemiology",
                "venue_short": "J. Invented Epidemiol.",
                "volume": "17",
                "issue": "none",
                "pages": "036019",
                "doi": "10.1088/x",
                "pmid": "123",
                "pmcid": "none",
                "type": "journal-article",
                **fields,
            },
            "paper": {"file": "paper.pdf"},
            "supplementary": {"files": [{"file": "supplementary/data.xlsx", "label": "Data"}]},
            "overview": {"one_line": SECRET, "abstract": [SECRET]},
            "open_points": [SECRET],
            "curation": {"checks": [{"claim": SECRET, "verdict": "confirmed"}]},
        }
        return Collection(Bibliography.at(root), {key: rec}, {}, {})

    return _make


def test_an_article_and_its_files(make, tmp_path):
    out = tmp_path / "build" / "zotero.rdf"
    got = zotero.library([make()], out)
    assert got == {"items": 1, "files": 2, "collections": {"HEALTH": 1}}
    text = out.read_text(encoding="utf-8")
    assert SECRET not in text and ">none<" not in text  # curator text only in the note; no placeholder
    root = ET.parse(out).getroot()
    item = root.find(ns("bib:Article"))
    note = item.find(ns("dcterms:isReferencedBy")).get(ns("rdf:resource"))
    memos = {m.get(ns("rdf:about")): m.findtext(ns("rdf:value")) for m in root.iter(ns("bib:Memo"))}
    assert memos == {note: "<p>summary of vandermeer2020</p>"}
    assert item.findtext(ns("z:itemType")) == "journalArticle"
    people = [(p.findtext(ns("foaf:surname")), p.findtext(ns("foaf:givenName"))) for p in item.iter(ns("foaf:Person"))]
    assert people == [("van der Meer", "Johannes P."), ("Lovelace", "Ada"), ("Heat and Health Study Group", None)]
    assert "DOI 10.1088/x" in [e.text for e in item.findall(ns("dc:identifier"))]
    assert item.findtext(ns("dc:description")) == "Citation Key: vandermeer2020\nPMID: 123"
    assert [e.text for e in item.findall(ns("dc:subject"))] == ["Cohort study"]
    paths = [e.get(ns("rdf:resource")) for e in root.iter(ns("z:path"))]
    assert all((out.parent / urllib.parse.unquote(p)).resolve().is_file() for p in paths) and len(paths) == 2
    assert not any(os.path.isabs(urllib.parse.unquote(p)) for p in paths)  # relative: works in any clone
    coll = root.find(ns("z:Collection"))
    assert [e.get(ns("rdf:resource")) for e in coll.findall(ns("dcterms:hasPart"))] == [item.get(ns("rdf:about"))]


def test_a_preprint_names_its_server(make, tmp_path):
    out = tmp_path / "z.rdf"
    zotero.library([make(type="preprint", venue="arXiv")], out)
    item = ET.parse(out).getroot().find(ns("bib:Article"))
    assert item.findtext(ns("z:itemType")) == "preprint" and item.find(ns("dcterms:isPartOf")) is None
    assert item.findtext(f"{ns('dc:publisher')}/{ns('foaf:Organization')}/{ns('foaf:name')}") == "arXiv"


def test_one_article_in_two_bibliographies_is_one_item(make, tmp_path):
    out = tmp_path / "z.rdf"
    got = zotero.library([make(), make(bib="ml", key="vandermeer2020ml", profile="ml")], out)
    assert got["items"] == 1 and got["collections"] == {"HEALTH": 1, "ML": 1}


def test_since_keeps_the_articles_added_since(make, tmp_path, monkeypatch):
    old, new = make(key="old2019"), make(bib="ml", key="new2026", profile="ml", doi="10.1/new")
    monkeypatch.setattr(zotero, "added_dates", lambda: {"health/old2019": "2026-01-05"})
    got = zotero.library([old, new], tmp_path / "z.rdf", since="2026-01-06")  # new2026 is not committed yet
    assert got["collections"] == {"ML": 1}
    assert zotero.library([old, new], tmp_path / "z.rdf", since="2026-01-05")["items"] == 2


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Amélie de Vries", ("de Vries", "Amélie")),
        ("Anna K. Van Berkel", ("Van Berkel", "Anna K.")),
        ("Henry W. Fowler Jr.", ("Fowler", "Henry W., Jr.")),
        ("Plato", ("Plato", "")),
    ],
)
def test_names_are_split_family_last(name, expected):
    assert zotero.split_name(name) == expected


def test_the_note_is_the_summary_export_prints(tmp_path):
    """A whole record's note: the summary's text, the checked claims included, as HTML Zotero reads."""
    b = Bibliography.at(sample_library.make(tmp_path / "library") / "methods")
    rec_file = b.articles / "doe2024" / "record.json"
    rec = json.loads(rec_file.read_text())
    rec["curation"]["checks"] = [{"claim": SECRET, "verdict": "confirmed (p. 1)"}]
    rec_file.write_text(json.dumps(rec))
    out = tmp_path / "build" / "zotero.rdf"
    zotero.library([collection(b)], out)
    html = ET.parse(out).getroot().find(ns("bib:Memo")).findtext(ns("rdf:value"))
    assert html.startswith(f"<h1>{sample_library.TITLE}</h1>")
    for text in (sample_library.QUOTE, SECRET, "<h2>At a glance</h2>", "<table>"):
        assert text in html, text
    assert "href=" not in html.replace('href="https://', "")  # a note follows only web links
