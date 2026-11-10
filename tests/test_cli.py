"""The command line itself: grouped help, a description for every command and flag, --version, a bibliography's
name where article keys go, a curator kept to its commands, and the generated reference up to date."""

import argparse
import subprocess
import sys
from pathlib import Path

import pytest

from glossator import __version__, cli

ROOT = Path(__file__).resolve().parents[1]


def test_bare_glossator_prints_the_grouped_help(capsys):
    assert cli.main([]) == 0
    out = capsys.readouterr().out
    titles = [title for title, _ in cli.GROUPS]
    assert [out.index(f"\n{t}:\n") for t in titles] == sorted(out.index(f"\n{t}:\n") for t in titles)
    assert titles[-1] == "Curator tools" and "Examples:" in out


def test_every_command_is_in_one_group_and_every_argument_says_what_it_is():
    parser, sub = cli.build_parser()
    grouped = [name for _, cmds in cli.GROUPS for name, _ in cmds]
    assert sorted(grouped) == sorted(sub.choices) and len(grouped) == len(set(grouped))
    for name, sp in sub.choices.items():
        assert sp.description, name
        for action in sp._actions:
            if isinstance(action, argparse._HelpAction) or action.help == argparse.SUPPRESS:
                continue
            assert action.help, f"{name} {action.option_strings or action.dest}"


def test_version(capsys):
    with pytest.raises(SystemExit) as e:
        cli.main(["--version"])
    assert e.value.code == 0 and capsys.readouterr().out.strip() == f"glossator {__version__}"


def test_a_bibliography_name_where_keys_go_checks_all_its_articles(monkeypatch):
    seen = []
    monkeypatch.setattr("glossator.check.cmd_check", lambda b, a: seen.append((b.name, a.all, a.keys)) or 0)
    assert cli.main(["check", "methods"]) == 0
    assert seen == [("methods", True, [])]


def test_a_curator_is_kept_to_its_commands(monkeypatch, capsys):
    monkeypatch.setenv("GLOSSATOR_AGENT", "curator")
    for line in (["sync"], ["bibs", "add", "reefs"], ["init"]):
        with pytest.raises(SystemExit):
            cli.main(line)
        assert "not a curator's command" in capsys.readouterr().err
    assert cli.main(["bibs"]) == 0  # listing is allowed


def test_the_cli_reference_is_up_to_date():
    r = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "gen_cli_reference.py"), "--check"], capture_output=True, text=True
    )
    assert r.returncode == 0, r.stderr


def test_an_article_key_without_bib_finds_its_bibliography(monkeypatch):
    seen = []
    monkeypatch.setattr("glossator.check.cmd_check", lambda b, a: seen.append((b.name, a.keys)) or 0)
    assert cli.main(["check", "doe2024"]) == 0
    assert seen == [("methods", ["doe2024"])]
    with pytest.raises(SystemExit):
        cli.main(["check", "nosuch2099"])


def test_bibs_lists_with_a_header(capsys):
    assert cli.main(["bibs"]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == "name\tprofile\tarticles\ttitle\tscope" and lines[1].startswith("methods\t")


def test_home_points_glossator_at_another_folder(tmp_path, capfd):
    (tmp_path / "library" / "reefs").mkdir(parents=True)
    (tmp_path / "library" / "reefs" / "biblio.json").write_text('{"profile": "ml", "title": "Reefs", "scope": "x"}')
    assert cli.main(["--home", str(tmp_path), "bibs"]) == 0
    out = capfd.readouterr().out
    assert "reefs\tml\t0\tReefs" in out and "methods" not in out
    with pytest.raises(SystemExit):
        cli.main(["--home", str(tmp_path / "missing"), "bibs"])


def test_inbox_start_shows_its_line_first(tmp_path, monkeypatch, capsys):
    from fake_tools import make_tools

    from glossator import inbox

    tools = make_tools(tmp_path, monkeypatch)
    monkeypatch.setattr(inbox, "WATCH", tmp_path / "watch.toml")
    assert cli.main(["inbox", "start", "--at", "06:45"]) == 1  # no watch.toml yet
    inbox.WATCH.write_text('[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    assert cli.main(["inbox", "start", "--at", "06:45", "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "add this library's daily inbox run at 06:45" in out and "-m glossator inbox run" in out
    assert not tools.cron.exists()
    assert cli.main(["inbox", "start", "--at", "06:45", "--no-input", "--yes"]) == 0
    assert "45 6 * * *" in tools.cron.read_text()


def test_a_failed_vector_build_is_said(monkeypatch, capsys, tmp_path):
    from glossator import paths, site

    monkeypatch.setattr(site, "BUILD", tmp_path / "build")  # never the shared sample's build/

    def no_vectors(db, colls, previous=None):
        db.parent.mkdir(parents=True, exist_ok=True)
        db.write_bytes(b"")
        keys = ("articles", "files", "pages", "text_passages", "record_passages", "extracted", "reused")
        return {**dict.fromkeys(keys, 1), "vector_error": "OSError: the search model is not downloaded"}

    monkeypatch.setattr(site, "build_index", no_vectors)
    monkeypatch.setattr(site, "library", lambda colls, out, since=None: {"items": 1, "files": 1, "collections": {}})
    site.build()
    captured = capsys.readouterr()
    assert "the semantic search's vectors were not built (OSError" in captured.err
    assert (
        "1 article (" in captured.out and "1 file," in captured.out and paths.shown(tmp_path / "build") in captured.out
    )


def test_home_wins_over_an_exported_library(tmp_path, capfd, monkeypatch):
    (tmp_path / "library" / "reefs").mkdir(parents=True)
    (tmp_path / "library" / "reefs" / "biblio.json").write_text('{"profile": "ml", "title": "Reefs", "scope": "x"}')
    monkeypatch.setenv("GLOSSATOR_LIBRARY", str(tmp_path / "elsewhere"))
    assert cli.main(["--home", str(tmp_path), "bibs"]) == 0
    got = capfd.readouterr()
    assert "reefs\tml" in got.out and "GLOSSATOR_LIBRARY" in got.err


def test_home_is_taken_only_before_the_command():
    assert cli.take_home(["--home", "/h", "bibs"]) == ("/h", ["bibs"])
    assert cli.take_home(["--bib", "x", "--home=/h", "check"]) == ("/h", ["--bib", "x", "check"])
    assert cli.take_home(["bibs", "add", "x", "--scope", "--home", "/h"]) == (
        None,
        ["bibs", "add", "x", "--scope", "--home", "/h"],
    )
