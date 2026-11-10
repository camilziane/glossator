"""The daily run's own failures: a paper an earlier run could not triage is triaged by the next, a run that fails
says so in `inbox status`, and the crontab line finds Claude Code. No network, no real crontab."""

import datetime as dt
import json

import pytest

from glossator import inbox, scout, site, triage


@pytest.fixture
def box(tmp_path, monkeypatch):
    """An inbox in a temporary folder, its notices just checked (no Crossref), nothing found online."""
    for name, rel in (
        ("INBOX", ""),
        ("ITEMS", "items"),
        ("STATE", "state.json"),
        ("WATCH", "watch.toml"),
        ("LOCK", ".lock"),
        ("PDFS", "pdfs"),
        ("LOG", "inbox.log"),
    ):
        monkeypatch.setattr(inbox, name, tmp_path / rel if rel else tmp_path)
    monkeypatch.setattr(inbox, "known", lambda: (set(), set()))
    monkeypatch.setattr(inbox, "commit", lambda message: None)
    monkeypatch.setattr(scout, "fetch", lambda w, since, n: ([], []))
    monkeypatch.setattr(scout, "citing_library", lambda since, n: [])
    monkeypatch.setattr(site, "write_page", lambda *a, **k: 0)
    monkeypatch.setattr("glossator.zotero_web.configured", lambda: False)
    inbox.WATCH.write_text('citations = false\n[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    today = dt.date.today().isoformat()
    inbox.STATE.write_text(json.dumps({"notices_checked": today, "notices": {}}))
    return tmp_path


def paper(i: str, **kw) -> dict:
    return {"id": i, "title": f"Paper {i}", "authors": ["Ada Lovelace"], "status": "new", "found": "2026-11-01", **kw}


def test_papers_left_untriaged_are_triaged_by_the_next_run(box, monkeypatch):
    inbox.save_item(paper("old1"))
    inbox.save_item(paper("old2", triage={"bib": "methods", "relevance": 1}))
    inbox.save_item(paper("gone", status="rejected"))
    asked = []

    def fake(todo, shots=None):
        asked.extend(c["id"] for c in todo)
        return {c["id"]: {"bib": "methods", "relevance": 3} for c in todo}, []

    monkeypatch.setattr(triage, "triage", fake)
    inbox.run(log=lambda *_: None)
    assert asked == ["old1"]
    assert inbox.load_json(box / "items" / "old1.json")["triage"]["relevance"] == 3


def test_a_failed_run_is_said_by_status_and_cleared_by_the_next(box, monkeypatch, tmp_path):
    def broken(w, since, n):
        raise RuntimeError("the network is down")

    monkeypatch.setattr(scout, "fetch", broken)
    monkeypatch.setattr(inbox, "scheduled", lambda: None)
    with pytest.raises(RuntimeError):
        inbox.run(log=lambda *_: None)
    said = inbox.status()
    assert "Last run FAILED at" in said and "RuntimeError: the network is down" in said
    monkeypatch.setattr(scout, "fetch", lambda w, since, n: ([], []))
    monkeypatch.setattr(triage, "triage", lambda todo, shots=None: ({}, []))
    inbox.run(log=lambda *_: None)
    assert "FAILED" not in inbox.status()


def test_status_counts_the_papers_waiting_for_a_triage(box, monkeypatch):
    monkeypatch.setattr(inbox, "scheduled", lambda: None)
    inbox.save_item(paper("old1"))
    assert "1 paper not triaged" in inbox.status()


def test_the_cron_line_finds_claude_code(monkeypatch):
    monkeypatch.setattr(triage, "claude_dir", lambda: "/opt/claude code/bin")
    line = inbox.cron_line("07:30")
    assert "/opt/claude code/bin" in line and "'PATH=" not in line  # quoted as one PATH value


def test_start_warns_without_claude_code(monkeypatch, tmp_path):
    monkeypatch.setattr(inbox, "WATCH", tmp_path / "watch.toml")
    inbox.WATCH.write_text('[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    monkeypatch.setattr(triage, "claude_dir", lambda: None)
    monkeypatch.setattr(inbox, "crontab", lambda: [])
    written = []
    real = inbox.subprocess.run

    def run(cmd, *a, **k):
        if cmd[:2] == ["crontab", "-"]:
            written.append(k.get("input"))
            return type("R", (), {"returncode": 0, "stderr": "", "stdout": ""})()
        return real(cmd, *a, **k)

    monkeypatch.setattr(inbox.subprocess, "run", run)
    said = inbox.start("07:30")
    assert "Claude Code (claude) is not found" in said and written and inbox.CRON_TAG in written[0]


def test_a_crontab_that_refuses_is_said_not_raised(monkeypatch, tmp_path):
    monkeypatch.setattr(inbox, "WATCH", tmp_path / "watch.toml")
    inbox.WATCH.write_text('[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    monkeypatch.setattr(inbox, "crontab", lambda: [])
    real = inbox.subprocess.run

    def run(cmd, *a, **k):
        if cmd[:2] == ["crontab", "-"]:
            return type("R", (), {"returncode": 1, "stderr": "crontab: your account may not use cron", "stdout": ""})()
        return real(cmd, *a, **k)

    monkeypatch.setattr(inbox.subprocess, "run", run)
    with pytest.raises(RuntimeError, match="crontab refused the change: crontab: your account may not use cron"):
        inbox.start("07:30")


def test_the_demo_has_no_inbox(monkeypatch):
    from glossator import paths

    if paths.CHECKOUT is None:
        pytest.skip("not a checkout")
    monkeypatch.setattr(inbox, "LIBRARY", paths.CHECKOUT / "demo" / "library")
    for action in (lambda: inbox.init(), lambda: inbox.start("07:30"), lambda: inbox.run(log=lambda *_: None)):
        with pytest.raises(ValueError, match="repository's demo"):
            action()
