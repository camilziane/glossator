"""`check` on a real bibliography, and what it refuses."""

import hashlib
import json
import shutil

import pytest
import sample_library

from glossator.bibliography import Bibliography, bibliographies, collection
from glossator.check import Report, check_article, corpus
from glossator.util import lfs_oid

needs_poppler = pytest.mark.skipif(shutil.which("pdftotext") is None, reason="poppler-utils not installed")


def smallest():
    return min(bibliographies(), key=lambda b: len(list(b.articles.iterdir())))


@needs_poppler
def test_the_smallest_bibliography_is_clean():
    b = smallest()
    coll = collection(b)
    for key, rec in coll.recs.items():
        rep = check_article(key, coll, lambda k, r=None, _rec=rec: corpus(b.articles / k, r or _rec))
        assert rep.errors == [], (key, rep.errors)


@needs_poppler
def test_a_todo_left_is_refused(tmp_path, monkeypatch):
    b = smallest()
    coll = collection(b)
    key, rec = next(iter(coll.recs.items()))
    rec = json.loads(json.dumps(rec))
    rec["overview"]["one_line"] = "TODO: what was done"
    coll.recs[key] = rec
    monkeypatch.setattr("glossator.check.load_json", lambda path: rec)
    rep = check_article(key, coll, lambda k, r=None: corpus(b.articles / k, r or rec))
    assert any("still TODO" in e for e in rep.errors)


def placeholder(path, oid=None):
    """Put in place of `path` what a clone that has not downloaded it holds (a Git LFS pointer)."""
    data = path.read_bytes()
    oid = oid or hashlib.sha256(data).hexdigest()
    path.write_text(f"version https://git-lfs.github.com/spec/v1\noid sha256:{oid}\nsize {len(data)}\n")


def test_an_lfs_placeholder_is_recognized(tmp_path):
    f = tmp_path / "paper.pdf"
    f.write_bytes(b"%PDF-1.4 a real file")
    assert lfs_oid(f) is None
    placeholder(f)
    assert lfs_oid(f) == hashlib.sha256(b"%PDF-1.4 a real file").hexdigest()


@needs_poppler
def test_a_pdf_not_downloaded_is_checked_by_its_checksum_only(tmp_path):
    b = Bibliography.at(sample_library.make(tmp_path) / "methods")
    folder = b.articles / "doe2024"
    rec = json.loads((folder / "record.json").read_text())
    rec["quotes"][0]["text"] = "A sentence the paper does not hold, which only its downloaded text could refute."
    (folder / "record.json").write_text(json.dumps(rec))

    def report():
        coll = collection(b)
        return check_article("doe2024", coll, lambda k, r=None: corpus(b.articles / k, r or coll.recs[k]))

    assert any(e.startswith("quotes[0]: not found") for e in report().errors)  # downloaded: the quote is read
    placeholder(folder / "paper.pdf")
    rep = report()
    assert rep.errors == [] and rep.unread == ["paper.pdf"]  # not downloaded: said, not read
    placeholder(folder / "paper.pdf", oid="0" * 64)
    assert any(e.startswith("paper.sha256") for e in report().errors)  # its checksum is still compared


@needs_poppler
def test_a_clone_may_lack_the_empty_folders(tmp_path):
    """git keeps no empty folder: a clone has no figures/ or supplementary/ when the record lists nothing there."""
    b = Bibliography.at(sample_library.make(tmp_path) / "methods")
    folder = b.articles / "doe2024"
    for sub in ("figures", "supplementary"):
        (folder / sub).rmdir()
    coll = collection(b)
    rep = check_article("doe2024", coll, lambda k, r=None: corpus(b.articles / k, r or coll.recs[k]))
    assert rep.errors == []


@needs_poppler
def test_check_says_what_it_proved(capsys):
    """Each article's line counts the quotes found in its paper's text and the numbers of its results printed there;
    the last line sums them."""
    import argparse

    from glossator.check import cmd_check

    b = next(b for b in bibliographies() if b.name == "methods")
    assert cmd_check(b, argparse.Namespace(all=False, keys=["doe2024"])) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0] == "doe2024: no errors, no warnings. Found in the paper's text: 1 quote, 1 number."
    assert out[-1] == "methods: 1 article, no errors. Found in the papers' text: 1 quote, 1 number."


def test_counts_read_as_words():
    from glossator.check import count

    assert [count(n, "error") for n in (0, 1, 2)] == ["no errors", "1 error", "2 errors"]


@needs_poppler
def test_a_number_not_in_the_paper_is_not_counted(tmp_path):
    b = Bibliography.at(sample_library.make(tmp_path) / "methods")
    folder = b.articles / "doe2024"
    rec = json.loads((folder / "record.json").read_text())
    rec["results"][0]["value"] = "93.5%"
    (folder / "record.json").write_text(json.dumps(rec))
    coll = collection(b)
    rep = check_article("doe2024", coll, lambda k, r=None: corpus(b.articles / k, r or coll.recs[k]))
    assert any(e.startswith("results[0].value: 93.5 is not in the paper's text") for e in rep.errors)
    assert (rep.quotes, rep.numbers) == (1, 0)


def pages_corpus(*files: tuple[str, list[str], int]) -> dict:
    """What `corpus` reads from PDFs, made from text: (file name, its pages, its printed page offset) each."""
    from glossator.check import number_list
    from glossator.util import numbers_in, percents_in

    raw = "\n".join(t for _, pages, _ in files for t in pages)
    return {
        "numbers": numbers_in(raw, both=True),
        "percents": percents_in(raw),
        "files": [
            {
                "file": name,
                "paper": name == "paper.pdf",
                "pages": [(numbers_in(t, both=True), number_list(t)) for t in pages],
                "offset": offset,
            }
            for name, pages, offset in files
        ],
    }


PAPER = [
    "Title page. Received 2021.",
    "The median backbone accuracy was 0.96 Å (95% confidence interval = 0.85–1.16 Å), against 2.8 Å for the next "
    "best method. Of the targets, 0.93 were predicted.",
    "Discussion of the method.",
    "Methods, continued.",
    "Table 2. Runtime 1.1 min per protein over 5 runs; 0.96 again in a table.",
]


def value_report(value: str, source: str, c: dict | None = None):
    from glossator.check import check_metric_value

    rep = Report("x")
    check_metric_value(rep, "results[0].value", value, c or pages_corpus(("paper.pdf", PAPER, 0)), source)
    return rep


def test_a_number_on_the_cited_page_passes():
    rep = value_report("0.96 Å (95% confidence interval = 0.85–1.16 Å)", "p. 2, main text")
    assert rep.errors == [] and rep.warnings == [] and rep.numbers == 4


def test_a_number_from_another_page_is_a_warning():
    rep = value_report("1.1 min", "p. 2, Methods")
    assert rep.errors == []
    assert rep.warnings == [
        "results[0].value: 1.1 is in the paper but not on p. 2, the page its source cites (nor beside it)"
    ]
    assert value_report("1.1 min", "pp. 2–5").warnings == []
    assert value_report("1.1 min", "p. 4").warnings == []  # the page beside: a table running over


def test_a_single_digit_is_not_looked_for_on_its_page():
    assert value_report("1.1 min over 5 runs", "p. 5").warnings == []
    assert value_report("5 runs", "p. 2").warnings == []  # a digit is on every page or none


def test_an_estimate_must_come_with_its_own_interval():
    """0.93 and 2.8 are printed on p. 2, but not where the interval 0.85–1.16 is."""
    for wrong in ("0.93", "2.8"):
        rep = value_report(f"{wrong} Å (95% confidence interval = 0.85–1.16 Å)", "p. 2 (journal p. 584), main text")
        assert rep.errors == []
        assert rep.warnings == [
            f"results[0].value: {wrong} is on p. 2, the page its source cites, but not with 0.85 and 1.16 as the "
            "paper prints them"
        ]
    assert value_report("2.8 Å (0.96 Å for ours)", "p. 2").warnings == []  # no interval: the order is free


def test_a_number_not_in_the_paper_stays_an_error():
    rep = value_report("0.71 Å (95% confidence interval = 0.85–1.16 Å)", "p. 2")
    assert rep.errors[0].startswith("results[0].value: 0.71 is not in the paper's text") and rep.warnings == []


def test_a_source_without_a_page_of_the_pdf_is_not_judged():
    assert value_report("1.1 min", "Table 2").warnings == []  # no page cited
    assert value_report("1.1 min", "p. 584").warnings == []  # a page the PDF does not have


def test_a_page_as_the_journal_prints_it():
    c = pages_corpus(("paper.pdf", PAPER, 582))  # the journal's pages 583-587
    assert value_report("1.1 min", "p. 587, Table 2", c).warnings == []
    assert (
        value_report("1.1 min", "p. 584", c)
        .warnings[0]
        .endswith("not on p. 584, the page its source cites (nor beside it)")
    )


def test_a_supplementary_page_when_the_source_names_it():
    si = ["Supplementary methods.", "Notes.", "More notes.", "Training took 7.5 days."]
    c = pages_corpus(("paper.pdf", PAPER, 0), ("si.pdf", si, 0))
    assert value_report("7.5 days", "Supplementary Information, p. 4", c).warnings == []
    # without naming the supplementary material, a page is the paper's
    assert value_report("7.5 days", "p. 4", c).warnings[0].startswith("results[0].value: 7.5 is in the paper but not")


def test_the_pages_a_source_cites():
    from glossator.check import cited_pages, estimates, printed_offset

    assert cited_pages("p. 2 (journal p. 584), main text; Fig. 1a") == [2, 584]
    assert cited_pages("pp. 3–5, Table 1; p. 9") == [3, 4, 5, 9]
    assert cited_pages("pp. 3, 7 and 8") == [3, 7, 8]
    assert cited_pages("p. 8, 10 (Fig. 5)") == [8, 10]
    assert cited_pages("p. 11, 3.5 Results") == [11]  # 3.5 is a section
    assert cited_pages("page 4, Methods") == [4]
    assert cited_pages("Table 2, Extended Data Fig. 3") == []
    footers = [f"Some text of page {i}.\nMore text.\n{100 + i}" for i in range(1, 6)]
    assert printed_offset(footers) == 100 and printed_offset(["no number here", "nor here"]) == 0
    assert estimates("1.48% [1.11, 1.85]; 4.72% word [3.67, 5.87]") == [
        ["1.48", "1.11", "1.85"],
        ["4.72", "3.67", "5.87"],
    ]
    assert estimates("9.1% (95% CI 7.2, 11.2)") == [["9.1", "7.2", "11.2"]]
    assert estimates("38% then 27% (50-word vocabulary)") == []


@needs_poppler
def test_check_warns_of_a_result_away_from_its_cited_page(tmp_path):
    b = Bibliography.at(sample_library.make(tmp_path) / "methods")
    folder = b.articles / "doe2024"
    pages = [*sample_library.PAGES, ["Discussion."], ["Appendix."]]
    pdf = sample_library.pdf_bytes(pages)
    (folder / "paper.pdf").write_bytes(pdf)
    rec = json.loads((folder / "record.json").read_text())
    rec["paper"].update(pages=len(pages), sha256=hashlib.sha256(pdf).hexdigest())
    rec["results"][0]["source"] = "p. 4"
    (folder / "record.json").write_text(json.dumps(rec))
    coll = collection(b)
    rep = check_article("doe2024", coll, lambda k, r=None: corpus(b.articles / k, r or coll.recs[k]))
    assert rep.errors == []
    assert rep.warnings == [
        "results[0].value: 91.5 is in the paper but not on p. 4, the page its source cites (nor beside it)"
    ]
