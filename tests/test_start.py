"""`glossator init` and `glossator bibs add`: a library made from flags alone, the same from a terminal's answers,
nothing done twice, nothing changed when something is wrong."""

import json
import shutil
import tomllib

import pytest
from fake_tools import args, git, make_tools, quiet, scripted, snapshot

from glossator import start
from glossator.ask import DryRun, NeedsInput, Stop
from glossator.bibliography import Bibliography

LFS = shutil.which("git-lfs") is not None
SCOPE = "Methods that predict protein structure from sequence: architectures, training and benchmarks."
FLAGS = ["--no-input", "--yes", "--name", "methods", "--profile", "ml", "--scope", SCOPE]


@pytest.fixture
def tools(tmp_path, monkeypatch):
    return make_tools(tmp_path, monkeypatch)


def init(library, *more, asker=None, started=None, built=None):
    a = args("init", *FLAGS, "--no-lfs", *more)
    started = [] if started is None else started

    def start_inbox(at):
        started.append(at)
        return f"daily at {at}"

    return start.init(asker or quiet(), library, a, start_inbox=start_inbox, build=built)


def test_init_from_flags_makes_a_whole_library(tools):
    library = tools.root / "library"
    started = []
    assert (
        init(
            library, "--query", 'reef "heat" \\ stress', "--query", "AlphaFold", "--inbox-at", "07:30", started=started
        )
        == 0
    )
    assert git(library, "symbolic-ref", "--short", "HEAD") == "main"
    assert git(library, "config", "receive.denyCurrentBranch") == "updateInstead"
    assert set((library / ".gitignore").read_text().split()) >= {".work/", "inbox/inbox.log", ".lock"}
    assert tomllib.loads((library / "library.toml").read_text())["language"] == "English"
    bib = Bibliography.at(library / "methods")
    assert bib.profile == "ml" and bib.scope == SCOPE
    profile_md = (library / "methods" / "PROFILE.md").read_text()
    assert SCOPE in profile_md and "{{" not in profile_md
    watch = tomllib.loads((library / "inbox" / "watch.toml").read_text())["watch"]
    assert watch[0]["bib"] == "methods" and watch[0]["queries"] == ['reef "heat" \\ stress', "AlphaFold"]
    assert git(library, "log", "--format=%s") == "library: methods"  # one commit, of exactly these files
    assert set(git(library, "show", "--name-only", "--format=", "HEAD").split()) == {
        ".gitignore",
        "library.toml",
        "inbox/watch.toml",
        "methods/biblio.json",
        "methods/PROFILE.md",
    }
    assert started == ["07:30"]


@pytest.mark.skipif(not LFS, reason="needs Git LFS")
def test_init_with_git_lfs_tracks_the_files_and_installs_the_hooks(tools):
    library = tools.root / "library"
    a = args("init", *FLAGS, "--lfs")
    assert start.init(quiet(), library, a) == 0
    assert "*.pdf filter=lfs" in (library / ".gitattributes").read_text()
    assert "lfs" in (library / ".git" / "hooks" / "pre-push").read_text()


def test_init_twice_changes_nothing(tools):
    library = tools.root / "library"
    init(library)
    before = snapshot(library)
    asker = quiet()
    assert init(library, asker=asker) == 0
    assert snapshot(library) == before and "Nothing to do." in asker.out.getvalue()
    assert start.init(quiet(), library, args("init", "--no-input", "--yes")) == 0  # without flags too


def test_init_repairs_only_what_an_existing_library_lacks(tools):
    library = tools.root / "library"
    init(library)
    git(library, "config", "--unset", "receive.denyCurrentBranch")
    asker = quiet()
    assert start.init(asker, library, args("init", "--no-input", "--yes")) == 0
    assert git(library, "config", "receive.denyCurrentBranch") == "updateInstead"
    assert "1. let the other computers push here" in asker.out.getvalue()


def test_init_from_a_terminal(tools):
    library = tools.root / "library"
    answers = ["n", "", "1", "", "Protein structure prediction methods", "", SCOPE, "AlphaFold", "", "", ""]
    asker = scripted(answers)
    a = args("init")
    assert start.init(asker, library, a, start_inbox=lambda at: at) == 0
    cfg = json.loads((library / "methods" / "biblio.json").read_text())
    assert cfg == {
        "profile": "ml",
        "title": "Protein structure prediction methods",
        "short": "Protein structure",
        "scope": SCOPE,
    }
    out = asker.out.getvalue()
    assert "This will:" in out and "Done:" in out and "glossator join" in out
    assert not (tools.cron).exists()  # no daily time given: no crontab line


def test_without_a_terminal_a_missing_scope_names_its_flag(tools):
    library = tools.root / "library"
    with pytest.raises(NeedsInput) as e:
        start.init(quiet(), library, args("init", "--no-input", "--yes", "--no-lfs"))
    assert e.value.flag == "--scope" and not library.exists()


def test_without_yes_the_plan_is_shown_and_nothing_is_done(tools):
    library = tools.root / "library"
    a = args("init", *[f for f in FLAGS if f != "--yes"], "--no-lfs")
    with pytest.raises(Stop) as e:
        start.init(quiet(yes=False), library, a)
    assert e.value.code == 2 and not library.exists()


def test_a_dry_run_writes_nothing(tools):
    library = tools.root / "library"
    with pytest.raises(DryRun):
        start.init(quiet(dry_run=True), library, args("init", *FLAGS, "--no-lfs", "--dry-run"))
    assert not library.exists()


def test_a_folder_of_other_files_is_refused_and_left_alone(tools):
    library = tools.root / "library"
    library.mkdir()
    (library / "notes.txt").write_text("mine")
    before = snapshot(library)
    with pytest.raises(Stop) as e:
        init(library)
    assert e.value.code == 1 and "not a git repository" in e.value.message and snapshot(library) == before


def test_a_clone_is_not_initialised(tools):
    original = tools.root / "original"
    init(original)
    clone = tools.root / "clone"
    git(tools.root, "clone", "-q", str(original), str(clone))
    before = snapshot(clone)
    asker = quiet()
    assert start.init(asker, clone, args("init", "--no-input", "--yes")) == 0
    assert "is a clone of" in asker.out.getvalue() and snapshot(clone) == before


@pytest.mark.parametrize("name", ["Inbox", ".x", "a/b", "build", "profiles", "x" * 41, "inbox"])
def test_a_bad_folder_name_is_refused(tools, name):
    library = tools.root / "library"
    with pytest.raises(Stop) as e:
        start.init(quiet(), library, args("init", *FLAGS[:2], "--name", name, "--scope", SCOPE, "--no-lfs"))
    assert e.value.code == 2 and not library.exists()


def test_init_then_a_build_on_the_empty_library(tools, monkeypatch):
    library = tools.root / "library"
    built = []
    init(library, "--build", built=lambda: built.append(1) or 0)
    assert built == [1]


def test_bibs_add_appends_a_watch_and_keeps_the_comments(tools):
    library = tools.root / "library"
    init(library, "--query", "AlphaFold")
    watch = library / "inbox" / "watch.toml"
    watch.write_text(watch.read_text() + "# my own note\n")
    git(library, "commit", "-qam", "note")
    a = args("bibs", "add", "reefs", "--no-input", "--yes", "--profile", "epidemio", "--title", "Coral reefs")
    a.scope, a.query = (
        "Field studies of coral bleaching: surveys, rates, and the conditions they follow.",
        ["coral bleaching"],
    )
    assert start.bibs_add(quiet(), library, a) == 0
    text = watch.read_text()
    assert "# my own note" in text
    assert [w["bib"] for w in tomllib.loads(text)["watch"]] == ["methods", "reefs"]
    assert Bibliography.at(library / "reefs").profile == "epidemio"
    assert git(library, "log", "-1", "--format=%s") == "bibliography: reefs"
    assert not git(library, "status", "--porcelain")


def test_bibs_add_with_the_same_settings_is_a_no_op_and_with_others_is_refused(tools):
    library = tools.root / "library"
    init(library)
    a = args("bibs", "add", "methods", "--no-input", "--yes", "--profile", "ml")
    asker = quiet()
    assert start.bibs_add(asker, library, a) == 0 and "nothing to do" in asker.out.getvalue()
    a = args("bibs", "add", "methods", "--no-input", "--yes", "--profile", "epidemio")
    with pytest.raises(Stop) as e:
        start.bibs_add(quiet(), library, a)
    assert "other settings" in e.value.message


def test_bibs_add_without_commit(tools):
    library = tools.root / "library"
    init(library)
    a = args("bibs", "add", "reefs", "--no-input", "--yes", "--profile", "ml", "--no-commit")
    a.scope = SCOPE
    assert start.bibs_add(quiet(), library, a) == 0
    assert "reefs/" in git(library, "status", "--porcelain")


def test_an_interrupted_init_commits_and_schedules_when_run_again(tools, monkeypatch):
    """Stopped after it wrote the bibliography: the second run commits what the first wrote and schedules the run."""
    library = tools.root / "library"
    real = start.commit_paths

    def interrupted(*_a, **_k):
        raise KeyboardInterrupt

    monkeypatch.setattr(start, "commit_paths", interrupted)
    with pytest.raises(Stop) as e:
        init(library, "--query", "AlphaFold", "--inbox-at", "07:30")
    assert e.value.code == 130 and "are done" in e.value.message
    monkeypatch.setattr(start, "commit_paths", real)
    started = []
    assert init(library, "--query", "AlphaFold", "--inbox-at", "07:30", started=started) == 0
    assert git(library, "log", "--format=%s") == "library: methods"
    assert not git(library, "status", "--porcelain") and started == ["07:30"]


def test_inbox_at_without_queries_is_refused(tools):
    with pytest.raises(Stop) as e:
        init(tools.root / "library", "--inbox-at", "07:30")
    assert e.value.code == 2 and "--query" in e.value.message


def test_init_on_the_demo_says_it_is_the_demo(tools):
    from glossator import paths

    if paths.CHECKOUT is None:
        pytest.skip("not a checkout")
    with pytest.raises(Stop, match="repository's demo"):
        init(paths.CHECKOUT / "demo" / "library")


def test_init_adopts_a_folder_of_bibliographies(tools):
    library = tools.root / "library"
    (library / "methods").mkdir(parents=True)
    (library / "methods" / "biblio.json").write_text('{"profile": "ml", "title": "Methods", "scope": "x"}\n')
    (library / "methods" / "PROFILE.md").write_text("# methods\n")
    asker = quiet()
    assert start.init(asker, library, args("init", "--no-input", "--yes", "--no-lfs")) == 0
    assert "init makes it the library's repository" in asker.out.getvalue()
    assert "methods/biblio.json" in git(library, "show", "--name-only", "--format=", "HEAD")
    assert not git(library, "status", "--porcelain")


def test_a_folder_of_other_files_gets_the_exact_commands(tools):
    library = tools.root / "library"
    library.mkdir()
    (library / "notes.txt").write_text("mine")
    with pytest.raises(Stop) as e:
        init(library)
    assert f"mv {library} {library}.old" in e.value.message


def test_bibs_add_commits_an_uncommitted_same_bibliography(tools):
    """Written but not committed (a run stopped, or --no-commit): the original stays dirty and refuses every push."""
    library = tools.root / "library"
    init(library)
    a = args("bibs", "add", "reefs", "--no-input", "--yes", "--profile", "ml", "--no-commit")
    a.scope = SCOPE
    start.bibs_add(quiet(), library, a)
    assert git(library, "status", "--porcelain")
    a = args("bibs", "add", "reefs", "--no-input", "--yes", "--profile", "ml")
    asker = quiet()
    assert start.bibs_add(asker, library, a) == 0
    assert not git(library, "status", "--porcelain") and "not committed yet" in asker.out.getvalue()


def test_a_bad_name_for_bibs_add_names_the_positional(tools):
    library = tools.root / "library"
    init(library)
    a = args("bibs", "add", "Bad Name", "--no-input", "--yes", "--profile", "ml")
    with pytest.raises(Stop) as e:
        start.bibs_add(quiet(), library, a)
    assert e.value.message.startswith("NAME Bad Name")
    with pytest.raises(Stop) as e:
        start.init(quiet(), tools.root / "other", args("init", *FLAGS[:2], "--name", "Bad Name", "--no-lfs"))
    assert e.value.message.startswith("--name Bad Name")


def test_printed_commands_are_quoted(tools):
    library = tools.root / "a library"
    asker = quiet()
    init(library, asker=asker)
    out = asker.out.getvalue()
    assert f"edit '{library}/methods/PROFILE.md' in any text editor" in out
    assert "glossator join '" in out


def test_a_new_library_is_not_called_an_existing_one(tools):
    asker = quiet()
    init(tools.root / "library", asker=asker)
    assert "already holds" not in asker.out.getvalue()


@pytest.mark.skipif(not LFS, reason="needs Git LFS")
def test_init_after_git_init_still_offers_git_lfs_and_names_the_branch(tools):
    """`git init library` done by hand (or an init stopped inside its first step): no commit yet."""
    library = tools.root / "library"
    library.mkdir()
    git(library, "init", "-q", "-b", "master")
    assert start.init(quiet(), library, args("init", *FLAGS, "--lfs")) == 0
    assert git(library, "symbolic-ref", "--short", "HEAD") == "main"
    assert "*.pdf filter=lfs" in (library / ".gitattributes").read_text()
    assert git(library, "log", "--format=%s") == "library: methods"
