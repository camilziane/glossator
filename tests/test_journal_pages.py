"""An article's full reference for the web app, and the journal's page of each PDF page: from the record's note, or
from the page numbers a published PDF prints, or none when unsure."""

import hashlib
import json
import shutil

import pytest
import sample_library

from glossator import sitedata
from glossator.bibliography import Bibliography, collection
from glossator.pdf import journal_offset, journal_range
from glossator.sitedata import PageOffsets, reference_fields

needs_poppler = pytest.mark.skipif(shutil.which("pdftotext") is None, reason="poppler-utils not installed")


def page(body: str, number: int | None = None, top: bool = False) -> str:
    """A page's text as pdftotext gives it, its page number alone on its last line (or its first)."""
    lines = [f"Running head of the journal {body}", body, "More text of the page, with 12 and 2021 in it."]
    if number is not None:
        lines = [str(number), *lines] if top else [*lines, str(number)]
    return "\n".join(lines)


def test_an_article_carries_its_full_reference():
    rec = {
        "bib": {"authors": ["Ada Lovelace", "Alan Turing"], "volume": 7, "issue": "2", "pages": "101–110"},
        "paper": {"version": "publishedVersion", "note": "PDF page numbers are used (p. 1 = journal p. 101)."},
    }
    got = reference_fields(rec)
    assert got["authors_full"] == ["Ada Lovelace", "Alan Turing"]
    assert (got["volume"], got["issue"], got["pages"], got["version"]) == ("7", "2", "101–110", "publishedVersion")
    assert got["journal_offset"] == 100
    assert reference_fields(rec, detected=7)["journal_offset"] == 100  # the record's word first
    assert reference_fields({}, detected=7)["journal_offset"] == 7
    assert reference_fields({})["journal_offset"] is None


def test_a_consistent_run_of_page_numbers_gives_the_offset():
    pages = [page(f"p{i}", 582 + i, top=i % 2 == 0) for i in range(1, 8)]  # the journal's pages 583-589
    assert journal_offset(pages, "583–589") == 582
    assert journal_offset(pages) == 582  # no range to compare with: the run alone


def test_a_cover_page_shifts_the_numbers():
    pages = [page("Downloaded from the publisher. Cover.")] + [page(f"p{i}", i - 1) for i in range(2, 9)]
    assert journal_offset(pages, "e1234") == -1  # an article number: page 2 of the PDF is the article's page 1
    assert journal_offset(pages, "677–683") is None  # a range the numbers do not fall in


def test_the_journal_range_may_be_shorter_than_the_pdf():
    """A 7-page article followed by its methods and reporting summary, numbered on its own pages only."""
    pages = [page(f"p{i}", 2503 + i) for i in range(1, 8)] + [page(f"m{i}") for i in range(17)]
    assert journal_offset(pages, "2504–2510") == 2503
    assert journal_offset(pages) is None  # without the range, 7 of 24 pages are too few


@pytest.mark.parametrize(
    "pages",
    [
        [page(f"p{i}", n) for i, n in enumerate((14, 9, 88, 2, 61, 40), 1)],  # numbers that agree on nothing
        [page(f"p{i}", 100 + i if i < 4 else 200 + i) for i in range(1, 9)],  # two runs that disagree
        [page(f"p{i}", 10 + i) for i in range(1, 3)] + [page(f"q{i}") for i in range(6)],  # two pages only
        [page(f"p{i}") for i in range(10)],  # no page numbers
    ],
)
def test_page_numbers_that_do_not_agree_give_none(pages):
    assert journal_offset(pages) is None


def test_numbers_out_of_the_journal_range_give_none():
    """Off by one against the range the bibliography gives: unsure, so none."""
    pages = [page(f"p{i}", 3772 + i) for i in range(1, 12)]
    assert journal_offset(pages, "3772–3782") is None
    assert journal_offset(pages, "3773–3783") == 3772


def test_a_range_is_two_pages_apart():
    assert journal_range("583–589") == (583, 589) and journal_range("10-21") == (10, 21)
    assert journal_range("217–217") is None and journal_range("e8218") is None and journal_range("116241") is None


@needs_poppler
def test_the_build_finds_the_offset_once(tmp_path, monkeypatch):
    b = Bibliography.at(sample_library.make(tmp_path) / "methods")
    folder = b.articles / "doe2024"
    pages = [[*lines, str(100 + i)] for i, lines in enumerate([*sample_library.PAGES, ["Discussion."]], 1)]
    pdf = sample_library.pdf_bytes(pages)
    (folder / "paper.pdf").write_bytes(pdf)
    rec = json.loads((folder / "record.json").read_text())
    rec["bib"]["pages"] = "101–103"
    rec["paper"].update(pages=3, sha256=hashlib.sha256(pdf).hexdigest())
    (folder / "record.json").write_text(json.dumps(rec))
    coll = collection(b)
    kept = tmp_path / "build" / "journal-pages.json"
    offsets = PageOffsets(kept)
    assert sitedata.article(coll.recs["doe2024"], coll, {}, offsets)["journal_offset"] == 100
    offsets.save()
    assert kept.exists()

    def refuse(*a, **k):
        raise AssertionError("the PDF read again")

    monkeypatch.setattr(sitedata, "pdf_page_texts", refuse)
    assert PageOffsets(kept).of(folder, coll.recs["doe2024"]) == 100  # from build/, not from the PDF
    rec["paper"]["version"] = "acceptedVersion"
    assert PageOffsets(kept).of(folder, rec) is None  # only the published version's numbers are the journal's
