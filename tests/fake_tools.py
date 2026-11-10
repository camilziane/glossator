"""Fakes for the setup commands' tests: a `crontab` that keeps its table in a file, an `ssh` that runs its command on
this computer (each host with its own crontab file; the host `down` is never reached), and a home folder of the
test's own, so that git's settings and the real crontab are never touched."""

from __future__ import annotations

import io
import os
import subprocess
from types import SimpleNamespace

CRONTAB = """#!/bin/sh
f="${CRONTAB_FILE:?CRONTAB_FILE is not set}"
case "$1" in
  -l) if [ -f "$f" ]; then cat "$f"; else echo "no crontab" >&2; exit 1; fi ;;
  -r) rm -f "$f" ;;
  -) cat > "$f" ;;
  *) cat "$1" > "$f" ;;
esac
"""

SSH = """#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -o|-p|-i|-l|-F) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
host="${1#*@}"; shift
if [ "$host" = "down" ]; then echo "ssh: connect to host down port 22: Connection refused" >&2; exit 255; fi
export CRONTAB_FILE="${FAKE_SSH_DIR:?}/$host.cron"
exec sh -c "$*"
"""


def make_tools(tmp_path, monkeypatch):
    """Fake crontab and ssh first on the PATH, a home of the test's own (git signs as Test), the real crontab
    never reached. Each test module makes it its `tools` fixture."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, text in (("crontab", CRONTAB), ("ssh", SSH)):
        (bin_dir / name).write_text(text)
        (bin_dir / name).chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    (home / ".gitconfig").write_text(
        "[user]\n\tname = Test\n\temail = test@example.org\n[init]\n\tdefaultBranch = main\n"
    )
    hosts = tmp_path / "hosts"
    hosts.mkdir()
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.setenv("CRONTAB_FILE", str(tmp_path / "here.cron"))
    monkeypatch.setenv("FAKE_SSH_DIR", str(hosts))

    def offline(*_a, **_k):
        raise AssertionError("a test reached the network (zotero.org or another site): fake it")

    monkeypatch.setattr("urllib.request.urlopen", offline)  # nothing of these tests goes online
    return SimpleNamespace(bin=bin_dir, home=home, hosts=hosts, cron=tmp_path / "here.cron", root=tmp_path)


def git(repo, *args) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def commit(repo, name: str, text: str = "x") -> None:
    (repo / name).parent.mkdir(parents=True, exist_ok=True)
    (repo / name).write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", name)


def args(*argv: str):
    """The command line as glossator's parser reads it."""
    from glossator.cli import build_parser

    return build_parser()[0].parse_args(list(argv))


def quiet(yes: bool = True, dry_run: bool = False):
    """An Asker that reads nothing, its output kept."""
    from glossator.ask import Asker

    return Asker(interactive=False, yes=yes, dry_run=dry_run, out=io.StringIO())


def scripted(answers: list[str], yes: bool = False):
    """An Asker that reads these answers, in order, as from a terminal."""
    from glossator.ask import Asker

    feed = iter(answers)
    prompts: list[str] = []

    def read(prompt: str) -> str:
        prompts.append(prompt)
        try:
            return next(feed)
        except StopIteration:
            raise EOFError from None

    asker = Asker(interactive=True, yes=yes, out=io.StringIO(), read=read, read_secret=read)
    asker.prompts = prompts
    return asker


def snapshot(*repos) -> dict:
    """What a failed command must leave as it was: each repository's HEAD, remotes, config and files."""
    out = {}
    for r in repos:
        if (r / ".git").exists():
            out[str(r)] = (
                git(r, "rev-parse", "HEAD") if git(r, "rev-list", "--all") else "",
                git(r, "remote", "-v"),
                (r / ".git" / "config").read_text(),
                sorted(str(p.relative_to(r)) for p in r.rglob("*") if ".git" not in p.parts),
            )
        else:
            out[str(r)] = r.exists() and sorted(str(p) for p in r.rglob("*"))
    return out
