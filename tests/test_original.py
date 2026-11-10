"""`glossator promote` and `glossator follow`: three computers (myserver the original, lab2 and lab3 its clones,
folders here reached through a fake ssh, each with its own crontab file). After lab2's promote, myserver follows
lab2, lab2 runs the inbox, and lab3's next sync stops and says to follow lab2, at every sync until it does."""

import shlex
from types import SimpleNamespace

import pytest
from fake_tools import args, commit, git, make_tools, quiet, snapshot

from glossator import inbox, original, start, sync
from glossator.ask import DryRun, Stop
from glossator.remote import CRON_TAG, Shell, cron_entry, cron_time

SCOPE = "Methods that predict protein structure from sequence: architectures, training and benchmarks."


@pytest.fixture
def tools(tmp_path, monkeypatch):
    return make_tools(tmp_path, monkeypatch)


def daily(library, at="07:30", legacy=False) -> str:
    """A crontab line of `library`'s daily run, as glossator writes it (or as an earlier glossator did)."""
    h, m = at.split(":")
    if legacy:
        return f"{int(m)} {int(h)} * * * cd {shlex.quote(str(library.parent))} && uv run glossator inbox run {CRON_TAG}"
    return f"{int(m)} {int(h)} * * * cd / && GLOSSATOR_LIBRARY={shlex.quote(str(library))} x -m glossator inbox run {CRON_TAG}"


@pytest.fixture
def computers(tools):
    old = tools.root / "myserver" / "library"
    a = args("init", "--no-input", "--yes", "--no-lfs", "--name", "methods", "--profile", "ml", "--scope", SCOPE)
    start.init(quiet(), old, a)
    other = tools.root / "myserver" / "other" / "library"  # another library's daily run, on the same account
    (tools.hosts / "myserver.cron").write_text(
        f"{daily(old, legacy=True)}\n{daily(other, '05:00')}\n0 1 * * * backup\n"
    )
    clones = {}
    for name in ("lab2", "lab3"):
        clones[name] = tools.root / name / "library"
        git(tools.root, "clone", "-q", f"myserver:{old}", str(clones[name]))
    return SimpleNamespace(old=old, other=other, lab2=clones["lab2"], lab3=clones["lab3"], tools=tools)


def start_here(tools, library):
    def go(at):
        with tools.cron.open("a") as fh:
            fh.write(daily(library, at) + "\n")
        return f"daily at {at}"

    return go


def promote(c, *flags, asker=None):
    a = args("promote", "--no-input", "--yes", "--address", f"lab2:{c.lab2}", *flags)
    return original.promote(asker or quiet(), c.lab2, a, start_inbox=start_here(c.tools, c.lab2))


def old_cron(c) -> str:
    return (c.tools.hosts / "myserver.cron").read_text()


def follow(c, library, address, *flags, asker=None, stop=lambda: "stopped"):
    return original.follow(asker or quiet(), library, args("follow", address, "--no-input", "--yes", *flags), stop)


def test_promote_moves_the_original_and_only_its_daily_run(computers):
    c = computers
    assert promote(c) == 0
    lines = old_cron(c)
    assert "cd " + shlex.quote(str(c.old.parent)) not in lines  # this library's line went
    assert "0 5 * * *" in lines and "backup" in lines  # another library's daily run, and the rest, stay
    assert cron_time(cron_entry(Shell(), c.lab2)) == "07:30"  # the same time, here
    assert git(c.old, "remote", "get-url", "origin") == f"lab2:{c.lab2}"
    assert git(c.old, "rev-parse", "--abbrev-ref", "@{u}") == "origin/main"
    assert "denyCurrentBranch" not in (c.old / ".git" / "config").read_text()
    assert git(c.lab2, "remote") == ""
    assert git(c.lab2, "config", "receive.denyCurrentBranch") == "updateInstead"
    assert f'original = "lab2:{c.lab2}"' in (c.lab2 / "library.toml").read_text()
    assert git(c.old, "rev-parse", "HEAD") == git(c.lab2, "rev-parse", "HEAD")
    # myserver, a clone of lab2, syncs with it, without being told of a move it took part in
    commit(c.old, "methods/notes.md")
    assert sync.sync(log=lambda *_: None, library=c.old) == "in step"
    assert (c.lab2 / "methods" / "notes.md").exists()


def test_a_clone_is_told_of_the_move_at_every_sync_until_it_follows(computers):
    c = computers
    commit(c.lab3, "methods/mine.md")  # a commit made here meanwhile
    promote(c)
    for _ in range(2):  # the second sync remembers it too
        with pytest.raises(RuntimeError, match=r"glossator follow lab2:") as e:
            sync.sync(log=lambda *_: None, library=c.lab3)
        assert "Your 1 commit stays here" in str(e.value)
    assert not (c.lab2 / "methods" / "mine.md").exists()  # nothing sent to the old original
    assert follow(c, c.lab3, f"lab2:{c.lab2}") == 0
    assert git(c.lab3, "remote", "get-url", "origin") == f"lab2:{c.lab2}"
    assert sync.sync(log=lambda *_: None, library=c.lab3) == "in step"
    assert sync.sync(log=lambda *_: None, library=c.lab3) == "in step"  # the move, followed, is not said again
    assert (c.lab2 / "methods" / "mine.md").exists()


def test_a_push_to_the_former_original_names_the_new_one(computers):
    c = computers
    promote(c)
    git(c.lab3, "config", "glossator.original", f"lab2:{c.lab2}")  # as if it had heard of the move
    git(c.old, "commit", "-q", "--allow-empty", "-m", "on the old one")
    commit(c.lab3, "methods/mine.md")
    with pytest.raises(RuntimeError, match=r"it is a clone now.*glossator follow"):
        sync.sync(log=lambda *_: None, library=c.lab3)


def test_promote_refuses_with_uncommitted_changes_here(computers):
    c = computers
    (c.lab2 / "methods" / "draft.md").write_text("draft")
    before = snapshot(c.old, c.lab2)
    with pytest.raises(Stop, match="uncommitted changes here"):
        promote(c)
    assert snapshot(c.old, c.lab2) == before


def test_promote_refuses_when_the_original_is_dirty(computers):
    c = computers
    (c.old / "methods" / "draft.md").write_text("a curation running there")
    with pytest.raises(Stop, match="myserver has uncommitted changes"):
        promote(c)
    assert "cd " + shlex.quote(str(c.old.parent)) in old_cron(c)


def test_promote_refuses_when_not_in_step(computers):
    c = computers
    commit(c.old, "methods/new.md")
    with pytest.raises(Stop, match="glossator sync"):
        promote(c)
    assert git(c.lab2, "remote") == "origin"


def test_promote_refuses_an_unreachable_original_and_names_old_gone(computers):
    c = computers
    git(c.lab2, "remote", "set-url", "origin", f"down:{c.old}")
    with pytest.raises(Stop, match="--old-gone"):
        promote(c)


def test_promote_with_the_old_original_gone(computers):
    c = computers
    git(c.lab2, "remote", "set-url", "origin", f"down:{c.old}")
    asker = quiet(yes=True)
    assert promote(c, "--old-gone", "--inbox-at", "06:15", asker=asker) == 0
    out = asker.out.getvalue()
    assert "commits it had that this computer lacks are lost" in out  # said, --yes or not
    assert "their sync cannot tell them" in out and "next glossator sync says the same" not in out
    assert git(c.lab2, "remote") == "" and cron_time(cron_entry(Shell(), c.lab2)) == "06:15"
    assert "cd " + shlex.quote(str(c.old.parent)) in old_cron(c)  # untouched: unreachable


def test_promote_old_gone_from_a_light_clone(computers):
    c = computers
    git(c.lab2, "config", "lfs.fetchexclude", "*")
    git(c.lab2, "remote", "set-url", "origin", f"down:{c.old}")
    assert promote(c, "--old-gone", "--no-inbox") == 0
    assert "fetchexclude" not in (c.lab2 / ".git" / "config").read_text()  # an original keeps every file


def test_promote_on_the_original_only_checks(computers):
    c = computers
    promote(c)
    asker = quiet()
    before = snapshot(c.lab2)
    assert promote(c, asker=asker) == 0
    assert "already the original" in asker.out.getvalue() and snapshot(c.lab2) == before


def test_promote_interrupted_continues(computers, monkeypatch):
    c = computers
    real = original.commit_paths

    def boom(*_a, **_k):
        raise RuntimeError("interrupted")

    monkeypatch.setattr(original, "commit_paths", boom)
    with pytest.raises(Stop, match="continues"):
        promote(c)
    monkeypatch.setattr(original, "commit_paths", real)
    assert "cd " + shlex.quote(str(c.old.parent)) not in old_cron(c)  # step 1 was done
    assert promote(c) == 0
    assert git(c.lab2, "remote") == "" and git(c.old, "remote", "get-url", "origin") == f"lab2:{c.lab2}"
    assert cron_time(cron_entry(Shell(), c.lab2)) == "07:30"  # the old time, remembered across the two runs
    assert "promoteInboxAt" not in (c.lab2 / ".git" / "config").read_text()


def test_promote_stopped_after_its_announcement_resumes(computers, monkeypatch):
    """Killed between the commit naming this computer and its push: one commit ahead, which promote accepts."""
    c = computers
    real = original.git

    def no_push(repo, *a, **k):
        if a[:1] == ("push",):
            raise KeyboardInterrupt
        return real(repo, *a, **k)

    monkeypatch.setattr(original, "git", no_push)
    with pytest.raises(Stop, match="interrupted"):
        promote(c)
    monkeypatch.setattr(original, "git", real)
    assert git(c.lab2, "rev-list", "--count", "origin/main..HEAD") == "1"
    assert promote(c) == 0
    assert git(c.lab2, "remote") == "" and git(c.old, "rev-parse", "HEAD") == git(c.lab2, "rev-parse", "HEAD")


def test_follow_refuses_another_library_without_fetching_it(computers, tools):
    c = computers
    other = tools.root / "other" / "library"
    a = args("init", "--no-input", "--yes", "--no-lfs", "--name", "reefs", "--profile", "ml", "--scope", SCOPE)
    start.init(quiet(), other, a)
    objects = sum(1 for _ in (c.lab3 / ".git" / "objects").rglob("*"))
    before = snapshot(c.lab3)
    with pytest.raises(Stop, match="another library"):
        follow(c, c.lab3, f"otherhost:{other}")
    assert git(c.lab3, "remote", "get-url", "origin") == f"myserver:{c.old}"
    assert snapshot(c.lab3)[str(c.lab3)][1:] == before[str(c.lab3)][1:]
    assert sum(1 for _ in (c.lab3 / ".git" / "objects").rglob("*")) == objects  # nothing of it fetched


def test_a_dry_run_of_follow_fetches_nothing(computers):
    c = computers
    promote(c)
    commit(c.lab2, "methods/new.md")
    with pytest.raises(DryRun):
        original.follow(quiet(dry_run=True), c.lab3, args("follow", f"lab2:{c.lab2}", "--dry-run"), lambda: "")
    assert git(c.lab3, "remote", "get-url", "origin") == f"myserver:{c.old}"
    r = __import__("subprocess").run(["git", "-C", str(c.lab3), "cat-file", "-e", git(c.lab2, "rev-parse", "HEAD")])
    assert r.returncode != 0


def test_the_same_address_written_otherwise_is_already_followed(computers):
    c = computers
    asker = quiet()
    assert follow(c, c.lab3, f"ssh://myserver{c.old}/", asker=asker) == 0
    assert "already follows" in asker.out.getvalue()


def test_follow_twice_is_a_no_op_and_a_former_original_stops_its_own_run(computers):
    c = computers
    promote(c)
    c.tools.cron.write_text(f"{daily(c.lab3)}\n{daily(c.other, '05:00')}\n")
    git(c.lab3, "config", "receive.denyCurrentBranch", "updateInstead")
    stopped = []
    assert follow(c, c.lab3, f"lab2:{c.lab2}", stop=lambda: stopped.append(1) or "stopped") == 0
    assert stopped == [1] and "denyCurrentBranch" not in (c.lab3 / ".git" / "config").read_text()
    asker = quiet()
    assert follow(c, c.lab3, f"lab2:{c.lab2}", asker=asker) == 0
    assert "already follows" in asker.out.getvalue()


def test_the_daily_run_starts_only_on_the_original_and_only_with_a_watch(computers, monkeypatch):
    c = computers
    monkeypatch.setattr(inbox, "LIBRARY", c.lab3)
    with pytest.raises(ValueError, match="glossator promote"):
        inbox.start("07:30")
    monkeypatch.setattr(inbox, "LIBRARY", c.old)
    monkeypatch.setattr(inbox, "WATCH", c.old / "inbox" / "watch.toml")
    with pytest.raises(ValueError, match="inbox init"):
        inbox.start("07:30")
    assert not c.tools.cron.exists()
    inbox.WATCH.parent.mkdir(parents=True, exist_ok=True)
    inbox.WATCH.write_text('[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    c.tools.cron.write_text(daily(c.other, "05:00") + "\n")
    inbox.start("07:30")
    assert cron_time(cron_entry(Shell(), c.old)) == "07:30"
    assert cron_time(cron_entry(Shell(), c.other)) == "05:00"  # another library's daily run is kept
    inbox.stop()
    assert cron_entry(Shell(), c.old) is None and cron_time(cron_entry(Shell(), c.other)) == "05:00"


def test_a_daily_run_on_a_clone_is_refused(computers, monkeypatch):
    monkeypatch.setattr(inbox, "LIBRARY", computers.lab3)
    with pytest.raises(ValueError, match="clone"):
        inbox.run(log=lambda *_: None)


def test_the_cron_line_runs_this_library_with_absolute_paths(monkeypatch, tmp_path):
    odd = tmp_path / "a folder with 100% spaces"
    monkeypatch.setattr(inbox, "ROOT", odd)
    monkeypatch.setattr(inbox, "LIBRARY", odd / "library")
    monkeypatch.setenv("GLOSSATOR_ZOTERO_KEY", str(tmp_path / "key"))
    monkeypatch.setenv("PATH", f".:{tmp_path}/bin:/usr/bin:/bin")
    line = inbox.cron_line("07:05")
    assert line.startswith("5 7 * * * cd ") and line.endswith(CRON_TAG)
    words = shlex.split(line[len("5 7 * * * ") : -len(CRON_TAG)].replace("\\%", "%"))
    assert words[1] == str(odd) and "100\\% spaces" in line  # one word for the shell, % escaped for cron
    env = dict(w.split("=", 1) for w in words if "=" in w and not w.startswith("-"))
    assert env["GLOSSATOR_HOME"] == str(odd) and env["GLOSSATOR_LIBRARY"] == str(odd / "library")
    assert env["GLOSSATOR_ZOTERO_KEY"] == str(tmp_path / "key")
    assert all(d.startswith("/") for d in env["PATH"].split(":"))  # never '.'
    exe = words[words.index("&&") + 1 + 4]
    assert exe.startswith("/") and words[words.index(exe) + 1 : words.index(exe) + 5] == [
        "-m",
        "glossator",
        "inbox",
        "run",
    ]


def test_doctor_right_after_follow_is_quiet(computers):
    """A clone that follows the new original before any sync: its HEAD still names the original before; the tip
    of its new origin names the new one, which it follows."""
    from glossator import doctor

    c = computers
    (c.old / "library.toml").write_text(f'language = "English"\noriginal = "myserver:{c.old}"\n')
    git(c.old, "commit", "-qam", "an earlier move named myserver")
    for clone in (c.lab2, c.lab3):
        git(clone, "pull", "-q")
        git(clone, "config", "glossator.original", f"myserver:{c.old}")
    promote(c)
    assert follow(c, c.lab3, f"lab2:{c.lab2}") == 0
    ids = {x.id: x for x in doctor.library_checks(c.lab3, c.tools.root / "build", offline=True)}
    assert "moved" not in ids


def test_follow_refuses_a_clone_without_a_terminal(computers):
    c = computers
    before = snapshot(c.lab3)
    with pytest.raises(Stop, match="follow the original"):
        follow(c, c.lab3, f"lab2:{c.lab2}")  # lab2 is a clone of myserver: --yes does not answer this
    assert snapshot(c.lab3) == before
