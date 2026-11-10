"""The triage without Claude: where the claude command is found, which papers the next run triages again, where the
scout runs."""

import json
import os
import sys
from pathlib import Path

import pytest

from glossator import triage


def test_claude_is_found_beyond_a_short_path(tmp_path, monkeypatch):
    """A daily run started by cron has PATH=/usr/bin:/bin: the command is looked for where its installers put it."""
    home = tmp_path / "home"
    exe = home / ".local" / "bin" / "claude"
    exe.parent.mkdir(parents=True)
    exe.write_text("#!/bin/sh\n")
    exe.chmod(0o755)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setattr(triage, "CLAUDE_PLACES", ("~/.local/bin",))  # only this computer's fake home
    assert triage.find_claude() == str(exe) and triage.claude_dir() == str(exe.parent)
    exe.chmod(0o644)  # not executable: not a command
    assert triage.find_claude() is None and triage.claude_dir() is None


def test_without_claude_the_triage_says_so(monkeypatch):
    monkeypatch.setattr(triage, "find_claude", lambda: None)
    done, errors = triage.triage([{"id": "a", "title": "T", "abstract": "", "bib": "methods", "query": "q"}])
    assert done == {} and "not triaged" in errors[0] and "claude" in errors[0]


def test_the_papers_left_untriaged_are_triaged_by_the_next_run():
    items = [
        {"id": "b", "status": "new", "found": "2026-11-09"},
        {"id": "a", "status": "new", "found": "2026-11-08", "triage": None},
        {"id": "c", "status": "new", "found": "2026-11-10", "triage": {"relevance": 2}},
        {"id": "d", "status": "rejected", "found": "2026-11-01"},
        {"id": "e", "status": "accepted", "found": "2026-11-07"},
    ]
    assert [it["id"] for it in triage.untriaged(items)] == ["e", "a", "b"]
    assert [it["id"] for it in triage.untriaged(items, limit=1)] == ["e"]


def test_an_old_paper_is_described_to_haiku_as_a_new_one():
    """A filed paper has lost its `query` (it keeps `queries`): the prompt still says what found it."""
    old = {"id": "a", "title": "Coral bleaching", "bib": "ecology", "queries": ["ecology: coral reefs"]}
    text = triage.prompt([old])
    assert '"query": "ecology: coral reefs"' in text and "(no abstract)" in text


FAKE_CLAUDE = """#!{python}
import json, os, sys
names = ("GLOSSATOR_HOME", "GLOSSATOR_LIBRARY")
seen = {{"cwd": os.getcwd(), "argv": sys.argv[1:], "env": {{k: os.environ.get(k) for k in names}}}}
with open(os.environ["FAKE_CLAUDE_LOG"], "a") as f:
    f.write(json.dumps(seen) + "\\n")
print(json.dumps({{"result": '[{{"id": "a", "bib": "none", "relevance": 1, "summary": "S", "why": "W"}}]'}}))
"""


@pytest.fixture
def fake_claude(tmp_path, monkeypatch):
    """A `claude` on the PATH that records its working directory, its arguments and its environment."""
    folder = tmp_path / "bin"
    folder.mkdir()
    exe = folder / "claude"
    exe.write_text(FAKE_CLAUDE.format(python=sys.executable))
    exe.chmod(0o755)
    log = tmp_path / "claude.log"
    monkeypatch.setenv("PATH", f"{folder}:{os.environ['PATH']}")
    monkeypatch.setenv("FAKE_CLAUDE_LOG", str(log))
    return lambda: [json.loads(line) for line in log.read_text().splitlines()]


def test_the_scout_runs_in_the_checkout_whatever_the_home(fake_claude, tmp_path, monkeypatch):
    """The daily run's cron line sets GLOSSATOR_HOME: the scout still runs where its definition is, and its
    environment names the library. It reads nothing on disk, so no folder is added."""
    from glossator.paths import CHECKOUT, LIBRARY, ROOT

    paper = {"id": "a", "title": "Coral bleaching", "abstract": "", "bib": "methods", "query": "corals"}
    done, errors = triage.triage([paper])
    assert done["a"]["relevance"] == 1 and not errors
    checkout = tmp_path / "checkout"
    (checkout / ".claude" / "agents").mkdir(parents=True)
    (checkout / ".claude" / "agents" / "scout.md").write_text("---\nname: scout\n---\n")
    monkeypatch.setattr(triage, "CHECKOUT", checkout)
    monkeypatch.setattr(triage, "ROOT", checkout / "demo")
    monkeypatch.setattr(triage, "LIBRARY", checkout / "demo" / "library")
    triage.triage([paper])
    outside, inside = fake_claude()
    assert Path(outside["cwd"]) == CHECKOUT and (CHECKOUT / ".claude" / "agents" / "scout.md").is_file()
    assert outside["env"] == {"GLOSSATOR_HOME": str(ROOT), "GLOSSATOR_LIBRARY": str(LIBRARY)}
    assert Path(inside["cwd"]).resolve() == checkout.resolve()
    assert inside["env"] == {
        "GLOSSATOR_HOME": str(checkout / "demo"),
        "GLOSSATOR_LIBRARY": str(checkout / "demo" / "library"),
    }
    for seen in (outside, inside):
        assert seen["argv"][:4] == ["-p", "--agent", "scout", "--model"] and "--add-dir" not in seen["argv"]


def test_without_a_checkout_an_agent_runs_in_the_home(monkeypatch, tmp_path):
    """An installed package has no checkout: the home is the working directory, and the library is named in it."""
    monkeypatch.setattr(triage, "CHECKOUT", None)
    monkeypatch.setattr(triage, "ROOT", tmp_path)
    monkeypatch.setattr(triage, "LIBRARY", tmp_path / "library")
    assert triage.agent_cwd() == tmp_path and triage.library_ref() == "library" and triage.agent_dirs() == []
    monkeypatch.setattr(triage, "LIBRARY", tmp_path.parent / "elsewhere")
    assert triage.agent_dirs() == [str((tmp_path.parent / "elsewhere").resolve())]
