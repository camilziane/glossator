"""`glossator sync`: the library's commits going both ways between a clone and its origin (a local folder stands
for the original), nothing built, and the tool's own folder never touched."""

import subprocess
from types import SimpleNamespace

import pytest

from glossator import sync


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def commit(repo, name, text="x"):
    (repo / name).parent.mkdir(parents=True, exist_ok=True)
    (repo / name).write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", name)


@pytest.fixture
def two_computers(tmp_path, monkeypatch):
    """The original (a tool folder and its library, both accepting pushes) and a clone of both."""
    for var, value in (("NAME", "Test"), ("EMAIL", "test@example.org")):
        monkeypatch.setenv(f"GIT_AUTHOR_{var}", value)
        monkeypatch.setenv(f"GIT_COMMITTER_{var}", value)
    full = tmp_path / "full" / "glossator"
    for repo in (full, full / "library"):
        repo.mkdir(parents=True, exist_ok=True)
        git(repo, "init", "-q", "-b", "main")
        git(repo, "config", "receive.denyCurrentBranch", "updateInstead")
        commit(repo, "README.md")
    clone = tmp_path / "clone" / "glossator"
    subprocess.run(["git", "clone", "-q", str(full), str(clone)], check=True)
    subprocess.run(["git", "clone", "-q", str(full / "library"), str(clone / "library")], check=True)
    monkeypatch.setattr(sync, "LIBRARY", clone / "library")
    return SimpleNamespace(full=full, clone=clone)


def test_a_clone_sends_its_commits_and_builds_nothing(two_computers):
    full, clone = two_computers.full, two_computers.clone
    commit(clone / "library", "added-here.json")
    assert sync.sync(log=lambda *_: None) == "in step"
    assert (full / "library" / "added-here.json").exists()  # pushed, and in the original's folder
    assert not (clone / "build").exists() and not (full / "build").exists()  # no build, anywhere


def test_new_articles_pulled_are_named_for_a_build(two_computers):
    commit(two_computers.full / "library", "methods/articles/doe2024/record.json")
    assert "glossator build" in sync.sync(log=lambda *_: None)
    assert (two_computers.clone / "library" / "methods/articles/doe2024/record.json").exists()


def test_the_inbox_comes_with_a_sync(two_computers):
    """The daily run's papers, committed on the original, are on the clone after a sync, and counted."""
    full = two_computers.full / "library"
    commit(full, "inbox/items/old2026.json", '{"status": "new"}')
    sync.sync(log=lambda *_: None)
    commit(full, "inbox/items/old2026.json", '{"status": "rejected"}')  # decided there
    commit(full, "inbox/items/doe2026.json", '{"status": "new"}')
    commit(full, "inbox/items/roe2026.json", '{"status": "new"}')
    got = sync.sync(log=lambda *_: None)
    assert "inbox: 2 new papers" in got and "glossator build" not in got  # no article came
    assert (two_computers.clone / "library" / "inbox/items/doe2026.json").exists()


def test_when_both_sides_committed_this_computers_commits_are_replayed(two_computers):
    full, clone = two_computers.full, two_computers.clone
    commit(full / "library", "added-there.json")
    commit(clone / "library", "added-here.json")
    sync.sync(log=lambda *_: None)
    for computer in (full, clone):
        assert {"added-there.json", "added-here.json"} <= {p.name for p in (computer / "library").iterdir()}


def test_a_conflict_stops_with_nothing_changed(two_computers):
    full, clone = two_computers.full, two_computers.clone
    commit(full / "library", "same.json", "there")
    commit(clone / "library", "same.json", "here")
    before = git(clone / "library", "rev-parse", "HEAD")
    with pytest.raises(RuntimeError, match="conflict"):
        sync.sync(log=lambda *_: None)
    assert git(clone / "library", "rev-parse", "HEAD") == before
    assert (clone / "library" / "same.json").read_text() == "here"


def test_files_for_git_lfs_are_not_pushed_without_its_hooks(two_computers, tmp_path, monkeypatch):
    """A PDF committed where Git LFS is not set up goes into git whole: it is not sent."""
    monkeypatch.setenv("HOME", str(tmp_path))  # no Git LFS in this account's git settings
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    library = two_computers.clone / "library"
    commit(library, ".gitattributes", "*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    for hook in (library / ".git" / "hooks").glob("pre-push"):
        hook.unlink()
    commit(library, "methods/articles/doe2024/paper.pdf", "%PDF-1.4 whole")
    with pytest.raises(RuntimeError, match="Nothing was sent"):
        sync.sync(log=lambda *_: None)
    assert not (two_computers.full / "library" / ".gitattributes").exists()


def test_records_push_without_git_lfs(two_computers):
    """A light clone, or a computer without Git LFS, still sends the records it edits."""
    full, library = two_computers.full / "library", two_computers.clone / "library"
    commit(full, ".gitattributes", "*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    sync.sync(log=lambda *_: None)
    for hook in (library / ".git" / "hooks").glob("pre-push"):
        hook.unlink()
    commit(library, "methods/articles/doe2024/record.json", "{}")
    assert sync.sync(log=lambda *_: None) == "in step"
    assert (full / "methods/articles/doe2024/record.json").exists()


def test_received_commits_are_counted(two_computers):
    said = []
    commit(two_computers.full / "library", "one.json")
    sync.sync(log=said.append)
    assert "library: 1 commit received" in said


def test_a_conflict_says_nothing_changed_and_how_to_merge(two_computers):
    full, clone = two_computers.full, two_computers.clone
    commit(full / "library", "same.json", "there")
    commit(clone / "library", "same.json", "here")
    with pytest.raises(RuntimeError) as e:
        sync.sync(log=lambda *_: None)
    assert "Nothing changed" in str(e.value) and "same.json" in str(e.value) and "hint:" not in str(e.value)


def test_on_the_original_there_is_nothing_to_sync(two_computers, monkeypatch):
    monkeypatch.setattr(sync, "LIBRARY", two_computers.full / "library")
    assert "this is the original" in sync.sync(log=lambda *_: None)


def test_the_tools_own_folder_is_never_synced(two_computers):
    """The tool is updated like any program: its commits stay where they are, in both directions."""
    full, clone = two_computers.full, two_computers.clone
    commit(full, "tool-change-there.py")
    commit(clone, "tool-change-here.py")
    sync.sync(log=lambda *_: None)
    assert not (clone / "tool-change-there.py").exists() and not (full / "tool-change-here.py").exists()


def test_a_library_that_is_not_in_git_says_how_to_start(tmp_path):
    with pytest.raises(RuntimeError, match="glossator init"):
        sync.sync(log=lambda *_: None, library=tmp_path)


def test_a_push_refused_by_a_former_original_says_so(two_computers):
    git(two_computers.full / "library", "config", "--unset", "receive.denyCurrentBranch")
    commit(two_computers.clone / "library", "added-here.json")
    with pytest.raises(RuntimeError, match="refuses pushes into its folder"):
        sync.sync(log=lambda *_: None)


def test_an_old_clone_following_the_named_original_under_another_spelling_goes_on(two_computers):
    """A clone made before glossator remembered the original: library.toml writes its origin otherwise."""
    full, clone = two_computers.full / "library", two_computers.clone / "library"
    commit(full, "library.toml", f'original = "file://{full}/"\n')
    assert sync.sync(log=lambda *_: None) == "in step"
    assert git(clone, "config", "glossator.original") == f"file://{full}/"


def test_a_move_message_says_how_to_record_an_original_already_followed(two_computers):
    full = two_computers.full / "library"
    commit(full, "library.toml", 'original = "lab9:/srv/library"\n')
    with pytest.raises(RuntimeError) as e:
        sync.sync(log=lambda *_: None)
    assert "glossator follow lab9:/srv/library" in str(e.value)
    assert f"glossator follow {full}" in str(e.value) and "records it" in str(e.value)
