"""Which bibliography a command works on, and what its profile implies."""

import json

import pytest

from glossator import bibliography
from glossator.bibliography import bibliographies, collection, pick_bibliography
from glossator.check import Report, shape
from glossator.profiles import available
from glossator.records import HEAD, skeleton


def test_every_bibliography_has_a_known_profile():
    found = bibliographies()
    assert found, "the sample library has no bibliography"
    assert all(b.profile in {p.name for p in available()} for b in found)


def test_bibliographies_of_profiles_of_one_order_come_by_name(tmp_path, monkeypatch):
    for name, profile in (("zeta", "ml"), ("alpha", "epidemio")):
        (tmp_path / name).mkdir()
        (tmp_path / name / "biblio.json").write_text(json.dumps({"profile": profile, "title": name}))
    monkeypatch.setattr(bibliography, "LIBRARY", tmp_path)
    assert [b.name for b in bibliographies()] == ["alpha", "zeta"]


def test_an_empty_library_has_no_bibliography(tmp_path, monkeypatch):
    monkeypatch.setattr(bibliography, "LIBRARY", tmp_path / "library")
    assert bibliographies() == []


@pytest.mark.parametrize(
    "argv", [["--bib", "methods", "vocab"], ["vocab", "--bib", "methods"], ["--bib=methods", "vocab"]]
)
def test_bib_is_read_anywhere_on_the_line(argv):
    biblio, rest = pick_bibliography(argv)
    assert biblio is not None and biblio.name == "methods"
    assert rest == ["vocab"]


def test_unknown_bibliography_stops(capsys):
    with pytest.raises(SystemExit):
        pick_bibliography(["--bib", "nope", "vocab"])
    assert "no such bibliography" in capsys.readouterr().err


def test_current_directory_names_the_bibliography(monkeypatch):
    ml = next(b for b in bibliographies() if b.name == "methods")
    monkeypatch.delenv("GLOSSATOR_ROOT", raising=False)
    monkeypatch.chdir(ml.articles)
    biblio, _ = pick_bibliography(["vocab"])
    assert biblio == ml


def test_profile_sets_format_kinds_and_figures():
    for b in bibliographies():
        assert b.format == b.plugin.model and b.kind_vocab in b.vocab
        assert all(b.format[section]["figure"] == "" for section in b.figure_fields.values())
        assert list(b.vocab["figure_role"]) == list(b.figure_fields)


def test_a_new_record_has_exactly_the_format_of_its_bibliography():
    bib = {k: ([] if isinstance(v, list) else 0 if isinstance(v, int) else "x") for k, v in HEAD["bib"].items()}
    for b in bibliographies():
        rep = Report("skeleton")
        shape("record", skeleton(b, "test2000", bib), b.format, rep)
        assert rep.errors == [], (b.name, rep.errors)


def test_every_record_is_read():
    for b in bibliographies():
        coll = collection(b)
        assert len(coll.recs) == len([d for d in b.articles.iterdir() if d.is_dir()]), b.name
        assert all(rec["key"] == key for key, rec in coll.recs.items())


def test_list_has_one_line_per_article_with_its_doi(capsys):
    from glossator.cli import main

    assert main(["list"]) == 0
    lines = capsys.readouterr().out.splitlines()
    total = sum(len(collection(b).recs) for b in bibliographies())
    assert len(lines) == total
    assert all(len(line.split("\t")) == 6 and line.split("\t")[2].startswith("10.") for line in lines)


def test_a_key_says_when_the_manuscripts_are_not_on_this_computer(tmp_path, monkeypatch):
    """A clone may lack the BibTeX files of refs_bibs: the key is then first author + year, and `new` says why."""
    from glossator import commands
    from glossator.bibliography import Bibliography

    bib = tmp_path / "methods"
    (bib / "articles").mkdir(parents=True)
    (bib / "biblio.json").write_text('{"profile": "ml", "title": "Methods"}')
    meta = {"doi": "10.1/x", "families": ["Zhang"], "year": 2019, "title": "Making networks shift-invariant"}
    refs = tmp_path / "refs.bib"
    monkeypatch.setattr(commands, "refs_bibs", lambda: [refs])
    key, why = commands.derive_key(Bibliography.at(bib), meta)
    assert key == "zhang2019" and "refs.bib" in why and "not on this computer" in why
    refs.write_text("@article{zhang2019shift,\n  doi = {10.1/x},\n}\n")
    assert commands.derive_key(Bibliography.at(bib), meta)[0] == "zhang2019shift"  # here: the manuscript's key


def test_vocab_prints_the_profile_and_base_vocabularies(capsys):
    from glossator.commands import cmd_vocab

    b = next(b for b in bibliographies() if b.name == "methods")
    assert cmd_vocab(b, None) == 0
    names = [line[:-1] for line in capsys.readouterr().out.splitlines() if line and not line.startswith((" ", "A "))]
    assert names == ["ml_kind", "paper_version", "supplementary_status", "figure_role"]


def test_a_file_given_by_hand_must_be_in_the_library(tmp_path, capsys):
    """`--file` copies a file into the records: only one under the library, never any file of this computer."""
    from glossator.commands import hand_file

    b = next(b for b in bibliographies() if b.name == "methods")
    inside = b.work / "manual" / "paper.pdf"
    assert hand_file(b, str(inside)) == inside.resolve()
    assert hand_file(b, None) is None
    with pytest.raises(SystemExit):
        hand_file(b, str(tmp_path / "secret.txt"))
    assert "--file: a file under" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        hand_file(b, str(b.root.parent / ".." / "elsewhere.pdf"))
