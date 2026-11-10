"""`glossator join`: an original reached through a fake ssh (or a local path), cloned, built only when asked,
resumed when run again, and refused, with nothing changed, when this computer's library is another's."""

import shutil

import pytest
from fake_tools import args, commit, git, make_tools, quiet, snapshot

from glossator import join as joining
from glossator import start
from glossator.ask import Stop

SCOPE = "Methods that predict protein structure from sequence: architectures, training and benchmarks."
LFS = shutil.which("git-lfs") is not None


@pytest.fixture
def tools(tmp_path, monkeypatch):
    return make_tools(tmp_path, monkeypatch)


@pytest.fixture
def original(tools):
    """A library made by init on `myserver` (a folder here, reached through the fake ssh)."""
    library = tools.root / "myserver" / "library"
    a = args("init", "--no-input", "--yes", "--no-lfs", "--name", "methods", "--profile", "ml", "--scope", SCOPE)
    start.init(quiet(), library, a)
    return library


def run(tools, address, *flags, build=None, library=None):
    library = library or tools.root / "lab2" / "library"
    a = args("join", address, "--no-input", "--yes", "--no-web", *flags)
    return joining.join(quiet(), library, tools.root / "lab2" / "build", a, build=build), library


def test_join_clones_through_ssh_and_follows_the_original(tools, original):
    built = []
    code, library = run(tools, f"myserver:{original}", build=lambda: built.append(1) or 0)
    assert code == 0 and (library / "methods" / "biblio.json").is_file()
    assert git(library, "remote", "get-url", "origin") == f"myserver:{original}"
    assert git(library, "rev-parse", "--abbrev-ref", "@{u}") == "origin/main"
    assert built == [1]


def test_join_again_resumes_and_builds_only_when_the_library_moved(tools, original):
    built = []
    run(tools, f"myserver:{original}", build=lambda: built.append(1) or 0)
    library = tools.root / "lab2" / "library"
    (tools.root / "lab2" / "build").mkdir(exist_ok=True)
    (tools.root / "lab2" / "build" / "manifest.json").write_text(
        f'{{"library_head": "{git(library, "rev-parse", "HEAD")}"}}'
    )
    before = snapshot(library)
    code, _ = run(tools, f"myserver:{original}", build=lambda: built.append(2) or 0)
    assert code == 0 and built == [1] and snapshot(library) == before


def test_the_tools_folder_leads_to_its_library(tools, original):
    code, library = run(tools, f"myserver:{original.parent}", "--no-build")
    assert code == 0 and git(library, "remote", "get-url", "origin") == f"myserver:{original}"


def test_a_local_path_works_too(tools, original):
    code, library = run(tools, str(original), "--no-build")
    assert code == 0 and git(library, "remote", "get-url", "origin") == str(original)


def test_an_unreachable_original_says_how_to_fix_ssh(tools, original):
    with pytest.raises(Stop) as e:
        run(tools, f"down:{original}")
    assert "ssh-copy-id" in e.value.message and not (tools.root / "lab2").exists()


def test_no_repository_there_is_refused(tools, original):
    with pytest.raises(Stop) as e:
        run(tools, f"myserver:{tools.root / 'nothing'}")
    assert "no git repository" in e.value.message and not (tools.root / "lab2" / "library").exists()


def test_a_repository_without_bibliography_is_removed_again(tools):
    other = tools.root / "other"
    other.mkdir()
    git(other, "init", "-q")
    commit(other, "README.md")
    with pytest.raises(Stop):
        run(tools, f"myserver:{other}", "--no-build")
    assert not (tools.root / "lab2" / "library").exists()


def test_a_library_following_another_original_is_refused(tools, original):
    _, library = run(tools, f"myserver:{original}", "--no-build")
    before = snapshot(library)
    with pytest.raises(Stop) as e:
        run(tools, f"otherserver:{original}", "--no-build")
    assert "glossator follow" in e.value.message and snapshot(library) == before


def test_an_original_here_is_refused(tools, original):
    with pytest.raises(Stop) as e:
        run(tools, f"myserver:{original}", library=original)
    assert "original here" in e.value.message


def test_a_folder_of_other_files_is_refused(tools, original):
    library = tools.root / "lab2" / "library"
    library.mkdir(parents=True)
    (library / "notes.txt").write_text("mine")
    with pytest.raises(Stop) as e:
        run(tools, f"myserver:{original}")
    assert "not a git repository" in e.value.message and (library / "notes.txt").read_text() == "mine"


def test_an_original_refusing_pushes_is_set_to_accept_them(tools, original):
    git(original, "config", "--unset", "receive.denyCurrentBranch")
    run(tools, f"myserver:{original}", "--no-build")
    assert git(original, "config", "receive.denyCurrentBranch") == "updateInstead"


def test_only_this_librarys_daily_run_is_stopped(tools, original):
    """On one account, the original's own daily run (another library) is never touched by a join."""
    library = tools.root / "lab2" / "library"
    others = f"0 7 * * * cd / && GLOSSATOR_LIBRARY={original} x -m glossator inbox run # glossator-inbox\n"
    tools.cron.write_text(others)
    stopped = []
    a = args("join", f"myserver:{original}", "--no-input", "--yes", "--no-build", "--no-web")
    joining.join(quiet(), library, tools.root / "build", a, stop_inbox=lambda: stopped.append(1) or "stopped")
    assert stopped == [] and tools.cron.read_text() == others
    shutil.rmtree(library)
    tools.cron.write_text(f"0 7 * * * cd / && GLOSSATOR_LIBRARY={library} x -m glossator inbox run # glossator-inbox\n")
    joining.join(quiet(), library, tools.root / "build", a, stop_inbox=lambda: stopped.append(1) or "stopped")
    assert stopped == [1]


def test_a_clone_stopped_half_way_is_made_again(tools, original):
    library = tools.root / "lab2" / "library"
    library.mkdir(parents=True)
    git(library, "init", "-q")
    git(library, "remote", "add", "origin", f"myserver:{original}")  # what a killed clone leaves: no commit
    code, _ = run(tools, f"myserver:{original}", "--no-build")
    assert code == 0 and (library / "methods" / "biblio.json").is_file()


def test_a_commitless_folder_of_other_things_is_refused(tools, original):
    library = tools.root / "lab2" / "library"
    library.mkdir(parents=True)
    git(library, "init", "-q")
    git(library, "remote", "add", "origin", f"myserver:{original}")
    (library / "notes.txt").write_text("mine")
    with pytest.raises(Stop, match="no commit"):
        run(tools, f"myserver:{original}", "--no-build")
    assert (library / "notes.txt").read_text() == "mine"


def test_a_clone_of_a_clone_is_refused_without_a_terminal_and_never_changed(tools, original):
    middle = tools.root / "middle" / "library"
    git(tools.root, "clone", "-q", str(original), str(middle))
    before = (middle / ".git" / "config").read_text()
    with pytest.raises(Stop, match="join the original"):
        run(tools, f"middle:{middle}", "--no-build")  # --yes does not answer this one
    assert (middle / ".git" / "config").read_text() == before and not (tools.root / "lab2" / "library").exists()


def test_a_light_clone_stays_light(tools, original):
    code, library = run(tools, f"myserver:{original}", "--light", "--no-build")
    assert code == 0 and git(library, "config", "lfs.fetchexclude") == "*"
    code, _ = run(tools, f"myserver:{original}", "--no-build")  # joined again without --light: still light
    assert code == 0 and git(library, "config", "lfs.fetchexclude") == "*"


def test_local_addresses_with_a_tilde_or_relative(tools, original, monkeypatch):
    monkeypatch.chdir(tools.root)
    code, library = run(tools, "myserver/library", "--no-build")
    assert code == 0 and git(library, "remote", "get-url", "origin") == str(original)
    shutil.rmtree(library)
    rel = original.relative_to(tools.home) if original.is_relative_to(tools.home) else None
    if rel is None:  # the test's home is beside the library: reach it through ~ anyway
        (tools.home / "lib").symlink_to(original)
        rel = "lib"
    code, library = run(tools, f"~/{rel}", "--no-build")
    assert code == 0


def test_the_same_original_written_otherwise_resumes(tools, original):
    run(tools, f"myserver:{original}", "--no-build")
    asker = quiet()
    a = args("join", f"ssh://myserver{original}/", "--no-input", "--yes", "--no-build", "--no-web")
    assert joining.join(asker, tools.root / "lab2" / "library", tools.root / "lab2" / "build", a) == 0
    assert "here already" in asker.out.getvalue()


def test_a_local_original_refusing_pushes_is_named(tools, original):
    git(original, "config", "--unset", "receive.denyCurrentBranch")
    asker = quiet()
    a = args("join", str(original), "--no-input", "--yes", "--no-build", "--no-web")
    joining.join(asker, tools.root / "lab2" / "library", tools.root / "lab2" / "build", a)
    assert f"the original ({original}) refuses pushes" in asker.out.getvalue()


def test_without_a_build_the_next_step_says_to_build(tools, original):
    asker = quiet()
    a = args("join", f"myserver:{original}", "--no-input", "--yes", "--no-build", "--no-web")
    joining.join(asker, tools.root / "lab2" / "library", tools.root / "lab2" / "build", a)
    lines = [ln.split()[:3] for ln in asker.out.getvalue().splitlines()]
    assert lines.index(["glossator", "build", "this"]) + 1 == lines.index(["glossator", "serve", "--open"])


@pytest.mark.skipif(not LFS, reason="needs Git LFS")
def test_files_in_git_lfs_come_with_the_clone(tools, original):
    git(original, "lfs", "install", "--local")
    commit(original, ".gitattributes", "*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    commit(original, "methods/articles/doe2024/paper.pdf", "%PDF-1.4 a pdf")
    code, library = run(tools, str(original), "--no-build")
    assert code == 0
    assert (library / "methods/articles/doe2024/paper.pdf").read_text() == "%PDF-1.4 a pdf"
    assert "lfs" in (library / ".git" / "hooks" / "pre-push").read_text()


def test_a_dry_run_clones_nothing(tools, original):
    a = args("join", f"myserver:{original}", "--no-input", "--dry-run", "--no-web")
    from glossator.ask import DryRun

    with pytest.raises(DryRun):
        joining.join(quiet(dry_run=True), tools.root / "lab2" / "library", tools.root / "build", a)
    assert not (tools.root / "lab2" / "library").exists()


@pytest.mark.skipif(not LFS, reason="needs Git LFS")
def test_join_full_makes_a_light_clone_full(tools, original):
    git(original, "lfs", "install", "--local")
    commit(original, ".gitattributes", "*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    commit(original, "methods/articles/doe2024/paper.pdf", "%PDF-1.4 a pdf")
    code, library = run(tools, str(original), "--light", "--no-build")
    paper = library / "methods/articles/doe2024/paper.pdf"
    assert code == 0 and paper.read_text().startswith("version https://git-lfs")  # a placeholder
    a = args("join", "--full", "--no-input", "--yes", "--no-build", "--no-web")  # ADDRESS: the clone's origin
    code = joining.join(quiet(), library, tools.root / "lab2" / "build", a)
    assert code == 0 and paper.read_text() == "%PDF-1.4 a pdf"
    assert "fetchexclude" not in (library / ".git" / "config").read_text()
