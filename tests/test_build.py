"""build writes build/ on this computer only; the Zotero sync is its own command; a decision rewrites the page alone."""

import json

import pytest

from glossator import cli, site, zotero_web
from glossator.paths import BUILD
from glossator.sitedata import DATA


def refuse(*args, **kwargs):
    raise AssertionError("Zotero's web API reached")


def test_build_never_reaches_zotero(monkeypatch, capsys):
    monkeypatch.setattr(zotero_web, "configured", lambda: True)
    monkeypatch.setattr(zotero_web, "take_decisions", refuse)
    monkeypatch.setattr(zotero_web, "push", refuse)
    assert cli.main(["build"]) == 0
    assert (BUILD / "index.html").exists() and json.loads((BUILD / DATA).read_text())["bibliographies"]
    assert "glossator zotero sync" in capsys.readouterr().out


def test_zotero_pull_applies_the_decisions_without_pushing(monkeypatch, capsys):
    monkeypatch.setattr(zotero_web, "configured", lambda: True)
    monkeypatch.setattr(zotero_web, "take_decisions", lambda dry_run=False: ["W1 accepted"])
    monkeypatch.setattr(zotero_web, "push", refuse)
    pages = []
    monkeypatch.setattr(site, "write_page", lambda colls=None: pages.append(1) or 0)
    assert cli.main(["zotero", "pull"]) == 0
    assert "W1 accepted" in capsys.readouterr().out and pages == [1]


def test_zotero_sync_pulls_then_pushes(monkeypatch):
    calls = []
    monkeypatch.setattr(zotero_web, "configured", lambda: True)
    monkeypatch.setattr(zotero_web, "take_decisions", lambda dry_run=False: calls.append("pull") or [])
    monkeypatch.setattr(zotero_web, "inbox_papers", lambda: [])
    monkeypatch.setattr(zotero_web, "push", lambda colls, dry_run=False, inbox=None: calls.append("push") or "plan")
    monkeypatch.setattr(zotero_web, "report", lambda plan, dry_run=False: "reported")
    assert cli.main(["zotero", "sync", "--dry-run"]) == 0
    assert calls == ["pull", "push"]


def test_without_a_key_the_sync_says_so(capsys):
    assert site.zotero_sync() == 1
    assert "no key" in capsys.readouterr().err


def test_zotero_pull_belongs_to_no_bibliography():
    with pytest.raises(SystemExit):
        cli.main(["zotero", "pull", "--bib", "methods"])
