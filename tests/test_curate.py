"""glossator curate: headless curators, each sent back with check's errors until its article passes; no real claude."""

import json
import os
from pathlib import Path

import pytest

from glossator import curate, site
from glossator.bibliography import bibliographies


@pytest.fixture
def bib():
    return bibliographies()[0]


@pytest.fixture
def quiet(monkeypatch, tmp_path):
    monkeypatch.setattr(curate, "STATE", tmp_path / "curate.json")
    monkeypatch.setattr(curate, "REPORTS", tmp_path / "reports")
    monkeypatch.setattr(site, "build", lambda zotero=False: 0)


def test_a_brief_names_the_bibliography_the_paper_and_the_claims(bib):
    text = curate.brief(
        bib, "10.1234/x", ["Ada Lovelace", "Alan Turing"], "2026", "Journal", "A Title", claims=["91.5%"]
    )
    lib = curate.library_ref()  # the tests' library is a temporary folder, outside the checkout: named in full
    assert text == (
        f"Bibliography: {bib.name}.\nLibrary: {lib} (the bibliography's folder: {lib}/{bib.name}).\n"
        "Ada Lovelace, Alan Turing 2026, Journal, 'A Title', doi 10.1234/x.\nCited for: 91.5%."
    )
    assert curate.brief(bib, "10.1234/x").endswith("doi 10.1234/x.\nCited for: none given.")


def test_dois_are_cleaned_and_checked(bib):
    jobs = curate.from_dois(["https://doi.org/10.1234/ABC.5", "doi:10.5555/y"], bib)
    assert [j.doi for j in jobs] == ["10.1234/ABC.5", "10.5555/y"]
    with pytest.raises(ValueError):
        curate.from_dois(["not a doi"], bib)


def test_a_curator_is_sent_back_until_check_passes(bib, quiet, monkeypatch):
    runs, checks = [], iter([["quote not found p. 3"], []])

    def fake_run(prompt, session="", budget=0.0, permission_mode="auto"):
        runs.append((prompt, session))
        return {"session_id": "s1", "total_cost_usd": 0.5, "result": "done"}

    monkeypatch.setattr(curate, "claude_run", fake_run)
    monkeypatch.setattr(curate, "find_key", lambda job: "toy2026")
    monkeypatch.setattr(curate, "check_errors", lambda job: next(checks))
    jobs = curate.from_dois(["10.1234/x"], bib)
    assert curate.curate(jobs, parallel=2) == 0
    assert jobs[0].status == "done" and jobs[0].key == "toy2026" and jobs[0].cost == 1.0 and jobs[0].runs == 2
    assert runs[0] == (jobs[0].brief, "") and runs[1][1] == "s1" and "quote not found p. 3" in runs[1][0]
    saved = json.loads(curate.STATE.read_text())["jobs"][0]
    assert saved["status"] == "done" and saved["session"] == "s1"
    assert "## Run 2" in curate.report_path(jobs[0]).read_text()


def test_a_curator_that_cannot_get_the_paper_is_blocked(bib, quiet, monkeypatch):
    monkeypatch.setattr(curate, "claude_run", lambda *a, **k: {"session_id": "s", "result": "Blocked: no open PDF."})
    monkeypatch.setattr(curate, "find_key", lambda job: "")
    jobs = curate.from_dois(["10.1234/x"], bib)
    assert curate.curate(jobs) == 1
    assert jobs[0].status == "blocked" and jobs[0].runs == 1


def test_a_curator_still_failing_after_the_repairs_fails(bib, quiet, monkeypatch):
    monkeypatch.setattr(curate, "claude_run", lambda *a, **k: {"session_id": "s", "result": "done"})
    monkeypatch.setattr(curate, "find_key", lambda job: "toy2026")
    monkeypatch.setattr(curate, "check_errors", lambda job: ["still wrong"])
    jobs = curate.from_dois(["10.1234/x"], bib)
    assert curate.curate(jobs, after=False) == 1
    assert jobs[0].status == "failed" and jobs[0].runs == curate.REPAIRS + 1


def test_the_headless_run_is_unattended_and_bounded(monkeypatch):
    seen = {}

    class Done:
        returncode, stdout, stderr = 0, json.dumps({"session_id": "s", "result": "ok"}), ""

    def fake(cmd, **kw):
        seen.update(cmd=cmd, **kw)
        return Done()

    monkeypatch.setattr(curate, "find_claude", lambda: "/bin/claude")
    monkeypatch.setattr(curate.subprocess, "run", fake)
    assert curate.claude_run("brief", session="s0", budget=3)["result"] == "ok"
    cmd = seen["cmd"]
    assert cmd[:4] == ["/bin/claude", "-p", "--agent", "curator"] and seen["input"] == "brief"
    for flag, value in (
        ("--model", "sonnet"),
        ("--permission-prompts", "none"),
        ("--max-budget-usd", "3"),
        ("--resume", "s0"),
        ("--permission-mode", "auto"),
    ):
        assert cmd[cmd.index(flag) + 1] == value
    assert seen["env"]["GLOSSATOR_AGENT"] == "curator"  # the tool refuses what is not a curator's command


def test_a_curator_may_run_the_tool_and_little_else():
    """The allow-list holds the tool's commands, `date`, Git LFS's pull and the file and web tools: no shell, no
    interpreter; the deny rules (before any allow, whatever the mode) keep the keys and the tool's code out of reach."""
    cmd = curate.claude_command("/bin/claude", budget=5)
    start = cmd.index("--allowedTools") + 1
    allowed = cmd[start : cmd.index("--max-budget-usd")]
    assert allowed == curate.TOOLS
    bash = [t for t in allowed if t.startswith("Bash(")]
    assert bash and all(
        t.startswith(
            ("Bash(uv run --quiet glossator ", "Bash(uv run glossator ", "Bash(date", "Bash(git -C library lfs pull ")
        )
        for t in bash
    )
    assert "Bash(uv run *)" not in allowed and not any(t in ("Bash", "Bash(*)") for t in allowed)
    deny = json.loads(cmd[cmd.index("--settings") + 1])["permissions"]["deny"]
    for rule in (
        "Read(~/.ssh/**)",
        "Read(~/.config/**)",
        "Edit(./src/**)",
        "Edit(./.claude/agents/**)",
        "Bash(curl *)",
    ):
        assert rule in deny, rule
    assert not any("library" in r or ".work" in r for r in deny)  # the curator's own folder stays writable
    assert not any(r.startswith("Edit(./.claude/agent-memory") for r in deny)  # its memory too
    with pytest.raises(ValueError):
        curate.claude_command("/bin/claude", permission_mode="yolo")
    assert (
        curate.claude_command("/bin/claude", permission_mode="dontAsk")[cmd.index("--permission-mode") + 1] == "dontAsk"
    )


def test_within_a_curation_the_tool_runs_only_a_curators_commands(monkeypatch):
    monkeypatch.delenv("GLOSSATOR_AGENT", raising=False)
    assert curate.refusal("sync") is None  # at the terminal: anything
    monkeypatch.setenv("GLOSSATOR_AGENT", "curator")
    for ok in ("new", "fetch-pdf", "supp", "text", "page", "crop", "cite", "check", "vocab", "export", None):
        assert curate.refusal(ok) is None, ok
    for refused in ("sync", "build", "curate", "zotero", "inbox", "serve", "mcp", "notices"):
        assert "not a curator's command" in curate.refusal(refused), refused
    assert curate.refusal("registry", extra={"registry"}) is None  # a plugin profile's own command


def test_bypassing_the_permissions_is_said_aloud(bib, quiet, monkeypatch, capsys):
    monkeypatch.setattr(curate, "claude_run", lambda *a, **k: {"session_id": "s", "result": "done"})
    monkeypatch.setattr(curate, "find_key", lambda job: "toy2026")
    monkeypatch.setattr(curate, "check_errors", lambda job: [])
    curate.curate(curate.from_dois(["10.1234/x"], bib), permission_mode="bypassPermissions", after=False)
    assert "sandbox" in capsys.readouterr().err
    curate.curate(curate.from_dois(["10.1234/y"], bib), after=False)
    assert "bypassPermissions" not in capsys.readouterr().err


def test_the_project_settings_keep_the_keys_out_of_any_claude_session():
    from pathlib import Path

    settings = json.loads((Path(__file__).parents[1] / ".claude" / "settings.json").read_text())
    deny = settings["permissions"]["deny"]
    for rule in ("Read(~/.ssh/**)", "Read(~/.config/**)", "Read(./.env)"):
        assert rule in deny, rule
    assert not any(r.startswith("Edit(./src") for r in deny)  # contributors edit the code with Claude


# --------------------------------------------------------------------------- where the curator runs (a fake claude)

FAKE_CLAUDE = """#!{python}
import json, os, sys
names = ("GLOSSATOR_HOME", "GLOSSATOR_LIBRARY", "GLOSSATOR_AGENT")
seen = {{"cwd": os.getcwd(), "argv": sys.argv[1:], "env": {{k: os.environ.get(k) for k in names}}, "input": sys.stdin.read()}}
with open(os.environ["FAKE_CLAUDE_LOG"], "a") as f:
    f.write(json.dumps(seen) + "\\n")
print(json.dumps({{"session_id": "s1", "result": "[]", "total_cost_usd": 0}}))
"""


@pytest.fixture
def fake_claude(tmp_path, monkeypatch):
    """A `claude` on the PATH that records its working directory, its arguments, its environment and its input."""
    import sys

    folder = tmp_path / "bin"
    folder.mkdir()
    exe = folder / "claude"
    exe.write_text(FAKE_CLAUDE.format(python=sys.executable))
    exe.chmod(0o755)
    log = tmp_path / "claude.log"
    monkeypatch.setenv("PATH", f"{folder}:{os.environ['PATH']}")
    monkeypatch.setenv("FAKE_CLAUDE_LOG", str(log))
    return lambda: [json.loads(line) for line in log.read_text().splitlines()]


def test_a_curator_runs_in_the_checkout_on_a_library_elsewhere(bib, fake_claude):
    """GLOSSATOR_HOME outside the checkout (`--home`): the agent runs where its definition is, reaches the library
    through --add-dir, and its `uv run glossator …` commands find the library through the environment."""
    from glossator.paths import CHECKOUT, LIBRARY, ROOT

    assert not LIBRARY.is_relative_to(CHECKOUT)  # the tests' library is a temporary folder
    job = curate.from_dois(["10.1234/x"], bib)[0]
    assert curate.claude_run(job.brief, budget=2)["session_id"] == "s1"
    (seen,) = fake_claude()
    assert (Path(seen["cwd"]) / ".claude" / "agents" / "curator.md").is_file()
    assert Path(seen["cwd"]) == CHECKOUT
    argv = seen["argv"]
    assert argv[argv.index("--add-dir") + 1] == str(LIBRARY) and argv.count("--add-dir") == 1
    assert seen["env"] == {"GLOSSATOR_HOME": str(ROOT), "GLOSSATOR_LIBRARY": str(LIBRARY), "GLOSSATOR_AGENT": "curator"}
    assert f"Library: {LIBRARY}" in seen["input"]
    allowed = argv[argv.index("--allowedTools") + 1 : argv.index("--max-budget-usd")]
    assert f"Bash(git -C {LIBRARY} lfs pull *)" in allowed
    deny = json.loads(argv[argv.index("--settings") + 1])["permissions"]["deny"]
    assert "Edit(./library/**)" in deny and "Edit(./src/**)" in deny  # the checkout's own library and code
    assert not any(str(LIBRARY) in rule for rule in deny)  # the library it curates stays writable


def test_a_curator_of_a_home_inside_the_checkout_needs_no_extra_folder(bib, fake_claude, tmp_path, monkeypatch):
    """GLOSSATOR_HOME=demo (inside the checkout): the same working directory, the library named relative to it."""
    from glossator import triage

    checkout = tmp_path / "checkout"
    (checkout / ".claude" / "agents").mkdir(parents=True)
    (checkout / ".claude" / "agents" / "curator.md").write_text("---\nname: curator\n---\n")
    home = checkout / "demo"
    monkeypatch.setattr(triage, "CHECKOUT", checkout)
    monkeypatch.setattr(triage, "ROOT", home)
    monkeypatch.setattr(triage, "LIBRARY", home / "library")
    job = curate.from_dois(["10.1234/x"], bib)[0]
    assert "Library: demo/library (the bibliography's folder: demo/library/" in job.brief
    curate.claude_run(job.brief)
    (seen,) = fake_claude()
    assert Path(seen["cwd"]).resolve() == checkout.resolve() and "--add-dir" not in seen["argv"]
    assert seen["env"]["GLOSSATOR_HOME"] == str(home) and seen["env"]["GLOSSATOR_LIBRARY"] == str(home / "library")
    assert "Bash(git -C demo/library lfs pull *)" in seen["argv"]
    deny = json.loads(seen["argv"][seen["argv"].index("--settings") + 1])["permissions"]["deny"]
    assert "Edit(./library/**)" in deny  # never the checkout's own library, when curating the demo


def test_the_checkouts_own_library_needs_no_mention(bib, monkeypatch, tmp_path):
    """The usual layout (library/ in the checkout): the brief and the rules are the plain ones."""
    from glossator import triage

    monkeypatch.setattr(triage, "CHECKOUT", tmp_path)
    monkeypatch.setattr(triage, "ROOT", tmp_path)
    monkeypatch.setattr(triage, "LIBRARY", tmp_path / "library")
    assert curate.library_ref() == "library" and triage.agent_dirs() == []
    assert "Library:" not in curate.brief(bib, "10.1234/x")
    assert curate.deny("library") == curate.DENY
