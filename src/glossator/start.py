"""`glossator init` (a new library on this computer, which becomes its original) and `glossator bibs add` (another
bibliography in it). Both ask their questions, show what they will do, then do it; each step checks first, so a
second run changes nothing."""

from __future__ import annotations

import getpass
import json
import re
import shlex
import socket
import tomllib
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from . import remote
from .ask import Asker, Step, Stop, run_plan
from .paths import is_demo, shown
from .repo import (
    LFS_PATTERNS,
    append_lines,
    branch,
    commit_paths,
    config,
    git,
    head,
    identity,
    is_repo,
    lfs_attributes,
    lfs_hooks,
    lfs_used,
    lfs_version,
    missing_ignores,
    must,
    origin_url,
)
from .util import dump_json

NAME_RE = re.compile(r"[a-z0-9][a-z0-9_-]{0,39}")
RESERVED = {"inbox", "build", "profiles"}  # folders of library/ that are not bibliographies
TIME_RE = re.compile(r"([01]?\d|2[0-3]):[0-5]\d")


def profile_api():
    """The profiles glossator knows: `available()` and `template(name)`."""
    from . import profiles

    return profiles


# --------------------------------------------------------------------------- what a bibliography is made of


@dataclass
class NewBib:
    name: str
    profile: str
    title: str
    short: str
    scope: str
    queries: list[str] = field(default_factory=list)
    library: Path | None = None

    def config(self) -> dict:
        out = {"profile": self.profile, "title": self.title}
        if self.short != self.title:
            out["short"] = self.short
        return {**out, "scope": self.scope}

    def profile_md(self) -> str:
        text = profile_api().template(self.profile, self.library)
        for marker, value in (("{{name}}", self.name), ("{{title}}", self.title), ("{{scope}}", self.scope)):
            text = text.replace(marker, value)
        return text if text.endswith("\n") else text + "\n"


def check_name(library: Path) -> Callable[[str], str | None]:
    def check(name: str) -> str | None:
        if not NAME_RE.fullmatch(name):
            return "lowercase letters, digits, - and _ (at most 40), starting with a letter or a digit"
        if name in RESERVED:
            return f"{name} is a folder of the library itself: choose another name"
        if (library / name).exists():
            return f"library/{name} exists: choose another name"
        return None

    return check


def check_text(low: int, high: int) -> Callable[[str], str | None]:
    def check(text: str) -> str | None:
        if "\n" in text:
            return "one line"
        if not low <= len(text) <= high:
            return f"between {low} and {high} characters"
        return None

    return check


def default_short(title: str) -> str:
    """The title's first words, 24 characters at most."""
    out = ""
    for w in title.split():
        if len(f"{out} {w}".strip()) > 24:
            break
        out = f"{out} {w}".strip()
    return out or title[:24]


def check_query(q: str) -> str | None:
    return None if 2 <= len(q) <= 200 else "between 2 and 200 characters"


def check_time(t: str) -> str | None:
    return None if TIME_RE.fullmatch(t) else "a time HH:MM, e.g. 07:30"


def ask_bibliography(asker: Asker, library: Path, a, *, ask_queries: bool = True, name_flag: str = "--name") -> NewBib:
    """The questions of a new bibliography, each answered by its flag when given."""
    api = profile_api()
    known = api.available(library)
    if not known:
        raise Stop("no profile is available (glossator.profiles)", 1)
    if asker.interactive and a.profile is None:
        asker.say("Its profile is the shape of its records:")
    profile = asker.choose(
        "Profile",
        [(p.name, p.description) for p in known],
        known[0].name,
        flag="--profile",
        value=a.profile,
    )
    info = next(p for p in known if p.name == profile)
    check = check_name(library)
    default_name = info.folder if not check(info.folder) else None
    name = asker.ask("Folder name", default_name, flag=name_flag, value=a.name, check=check)
    title = asker.ask("Title", info.title, flag="--title", value=a.title, check=check_text(1, 120))
    short = title if len(title) <= 24 and a.short is None else None
    if short is None:
        short = asker.ask(
            "Tab name in the reading room", default_short(title), flag="--short", value=a.short, check=check_text(1, 24)
        )
    if asker.interactive and a.scope is None:
        asker.say("What goes in it, a sentence or two (the inbox's triage reads it).")
    scope = asker.ask("Scope", None, flag="--scope", value=a.scope, check=check_text(20, 600))
    queries: list[str] = []
    if ask_queries:
        queries = asker.lines(
            f"First queries of the daily inbox for {name}, one per line, an empty line to end (none: skip):",
            values=a.query,
            check=check_query,
        )
    return NewBib(name, profile, title, short, scope, queries, library)


def queries(n: int) -> str:
    return f"{n} quer{'y' if n == 1 else 'ies'}"


def watch_path(library: Path) -> Path:
    return library / "inbox" / "watch.toml"


def watched(library: Path) -> set[str]:
    path = watch_path(library)
    if not path.is_file():
        return set()
    try:
        return {w.get("bib") for w in tomllib.loads(path.read_text(encoding="utf-8")).get("watch", [])}
    except tomllib.TOMLDecodeError as e:
        raise Stop(f"{path}: not readable TOML ({e}): fix it first", 1) from None


def add_watch(library: Path, bib: NewBib) -> str:
    """Write the bibliography's [[watch]] block in inbox/watch.toml, appended to the file as text (its comments
    stay), the file's header first if it is new."""
    from .inbox import WATCH_HEADER, watch_block

    path = watch_path(library)
    path.parent.mkdir(parents=True, exist_ok=True)
    if bib.name in watched(library):
        return f"inbox/watch.toml already watches for {bib.name}"
    lines = [] if path.is_file() else list(WATCH_HEADER)
    append_lines(path, lines + watch_block(bib.name, bib.queries))
    tomllib.loads(path.read_text(encoding="utf-8"))  # still TOML
    return f"inbox/watch.toml: {queries(len(bib.queries))} for {bib.name}"


def write_bibliography(library: Path, bib: NewBib) -> str:
    folder = library / bib.name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "biblio.json").write_text(dump_json(bib.config()), encoding="utf-8")
    if not (folder / "PROFILE.md").exists():
        (folder / "PROFILE.md").write_text(bib.profile_md(), encoding="utf-8")
    return f"{bib.name}/biblio.json and {bib.name}/PROFILE.md (profile {bib.profile})"


def existing_same(library: Path, a) -> str | None:
    """When NAME exists with exactly the settings the flags give: its name (nothing to write)."""
    if not a.name or not (library / a.name / "biblio.json").is_file():
        return None
    try:
        have = json.loads((library / a.name / "biblio.json").read_text(encoding="utf-8"))
    except ValueError:
        return None
    want = {k: v for k, v in (("profile", a.profile), ("title", a.title), ("short", a.short), ("scope", a.scope))}
    same = all(v is None or have.get(k, have.get("title") if k == "short" else None) == v for k, v in want.items())
    if same:
        return a.name
    raise Stop(
        f"library/{a.name} exists with other settings: edit library/{a.name}/biblio.json, or choose another name", 1
    )


def pending(library: Path, paths: list[str]) -> list[str]:
    """Those of `paths` that git does not hold as they are here (new or changed, not committed)."""
    paths = [p for p in paths if (library / p).exists() or is_repo(library)]
    if not paths:
        return []
    if not is_repo(library):
        return [p for p in paths if (library / p).exists()]
    out = git(library, "status", "--porcelain", "--untracked-files=all", "-z", "--", *paths).stdout
    return [e[3:] for e in out.split("\0") if len(e) > 3]


def owned(library: Path, names: list[str]) -> list[str]:
    """The files init and bibs add write, and commit."""
    files = [".gitattributes", ".gitignore", "library.toml", "inbox/watch.toml"]
    return files + [f"{n}/{f}" for n in names for f in ("biblio.json", "PROFILE.md")]


def watch_has_queries(library: Path) -> bool:
    path = watch_path(library)
    try:
        return any(w.get("queries") for w in tomllib.loads(path.read_text(encoding="utf-8")).get("watch", []))
    except (OSError, tomllib.TOMLDecodeError):
        return False


def bibliography_names(library: Path) -> list[str]:
    if not library.is_dir():
        return []
    return sorted(p.name for p in library.iterdir() if p.is_dir() and (p / "biblio.json").is_file())


def join_line(library: Path) -> str:
    """How another computer joins this library, as far as this computer knows its own name."""
    return f"glossator join {shlex.quote(f'{getpass.getuser()}@{socket.getfqdn()}:{library}')}"


def edit_line(path: Path) -> str:
    return f"edit {shlex.quote(shown(path))} in any text editor"


def identity_steps(asker: Asker, library: Path, a) -> list[Step]:
    """Git signs every commit (yours, and the inbox's own): ask a name and an email address when git has none."""
    name, email = identity(library if is_repo(library) else None)
    if name and email:
        return []
    if asker.interactive:
        asker.say("Git has no name or email address for commits on this computer; the library's commits need them.")
    name = name or asker.ask(
        "Your name for the library's commits", getpass.getuser(), flag="--git-name", value=a.git_name
    )
    email = email or asker.ask(
        "Your email address for them",
        None,
        flag="--git-email",
        value=a.git_email,
        check=lambda e: None if re.fullmatch(r"[^@\s]+@[^@\s]+", e) else "an email address, such as you@example.org",
    )

    def act() -> str:
        must(git(library, "config", "user.name", name), "git config")
        must(git(library, "config", "user.email", email), "git config")
        return f"commits signed {name} <{email}> in this library"

    return [Step(f"sign this library's commits {name} <{email}> (its own git settings)", act)]


def commit_step(library: Path, files: Callable[[], list[str]], message: str, *, everything: bool = False) -> Step:
    """Commit what init or bibs add wrote (or, adopting a folder, all of it), and nothing else."""

    def act() -> str:
        if everything:
            must(git(library, "add", "-A"), "git add")
            if git(library, "diff", "--cached", "--quiet").returncode == 0 and head(library):
                return "nothing new to commit"
            must(git(library, "commit", "-q", "-m", message), "git commit")
            return f'committed: "{message}"'
        if not commit_paths(library, files(), message):
            return "nothing new to commit"
        return f'committed: "{message}"'

    return Step(f'commit {"the library" if everything else "these files"}: "{message}"', act)


# --------------------------------------------------------------------------- glossator init


def init(asker: Asker, library: Path, a, start_inbox: Callable[[str], str] | None = None, build=None) -> int:
    """A new library on this computer, which becomes its original; on an existing one, only what it lacks (an
    interrupted init finishes: its files committed, its daily run scheduled)."""
    q = shlex.quote
    if is_demo(library):
        raise Stop(
            f"{shown(library)} is the repository's demo (--home or GLOSSATOR_HOME points at it): init makes a library "
            "of your own. Unset GLOSSATOR_HOME, or give another folder: glossator --home PATH init",
            1,
        )
    if is_repo(library) and origin_url(library):
        asker.mark("same", f"{shown(library)} is a clone of {origin_url(library)}: nothing to start here")
        asker.say("Keep it in step: glossator sync. Make this computer the original: glossator promote.")
        return 0
    if library.exists() and not library.is_dir():
        raise Stop(f"{shown(library)} is a file: move it away first (mv {q(str(library))} {q(str(library))}.old)", 1)
    names = bibliography_names(library)
    adopt = bool(names) and not is_repo(library)
    if library.is_dir() and any(library.iterdir()) and not is_repo(library) and not names:
        raise Stop(
            f"{shown(library)} exists, holds files and is not a library (no bibliography, not a git repository). "
            f"Nothing changed. Move it away (mv {q(str(library))} {q(str(library))}.old), then glossator init",
            1,
        )
    fresh = not names
    if a.inbox_at is not None and check_time(a.inbox_at):
        raise Stop(f"--inbox-at {a.inbox_at}: {check_time(a.inbox_at)}", 2)
    if fresh and asker.interactive:
        asker.say("A new library on this computer, which becomes its original: the computer the others clone")
        asker.say("from, where the daily inbox runs.")
        asker.say(f"Library folder: {shown(library)}")
    elif adopt:
        asker.mark(
            "same",
            f"{shown(library)} holds bibliographies ({', '.join(names)}) but is not in git: init makes it the "
            "library's repository, its files committed as they are",
        )
    elif not fresh:
        asker.mark(
            "same",
            f"{shown(library)} already holds a library ({', '.join(names)}). To add a bibliography: glossator bibs "
            "add NAME",
        )
    steps: list[Step] = []
    lfs = lfs_used(library)
    unborn = is_repo(library) and head(library) is None  # `git init` done (by hand, or a run stopped): no commit yet
    if not is_repo(library) or (unborn and not lfs):
        have = lfs_version()
        lfs_default = have is not None and have >= (3, 0)
        lfs = asker.confirm(
            "Keep PDFs and figures in Git LFS? Recommended to sync several computers.", lfs_default, value=a.lfs
        )
        if lfs and (have is None or have < (3, 0)):
            raise Stop("Git LFS 3.0 or later is needed (git-lfs.com; apt or brew install git-lfs), or --no-lfs", 1)
        if not lfs and asker.interactive:
            asker.mark("warn", "without Git LFS the PDFs go into git itself; turning it on later rewrites history")

    language = None
    if (fresh or adopt) and not (library / "library.toml").exists():
        language = asker.ask(
            "Language of the inbox's summaries", "English", flag="--language", value=a.language, check=check_text(2, 40)
        )
    bib = None
    if fresh:
        if asker.interactive:
            asker.say()
            asker.say("The first bibliography.")
        bib = ask_bibliography(asker, library, a)
    elif a.name and a.name not in names:
        raise Stop(f"this library exists: add {a.name} with glossator bibs add {q(a.name)}", 2)
    has_queries = bool(bib and bib.queries) or watch_has_queries(library)
    at = a.inbox_at
    if at is not None and not has_queries:
        raise Stop("--inbox-at needs queries for the daily run: give them with --query TEXT", 2)
    if at is None and has_queries and not remote.cron_entry(remote.Shell(), library):
        at = asker.optional(
            "Run the inbox every day on this computer (a daily paid run on Claude Haiku)? A time HH:MM, or empty "
            "for not now",
            flag="--inbox-at",
            check=check_time,
        )

    if not is_repo(library):

        def act_git() -> str:
            library.mkdir(parents=True, exist_ok=True)
            must(git(library, "init", "-q"), "git init")
            must(git(library, "symbolic-ref", "HEAD", "refs/heads/main"), "git symbolic-ref")
            return f"{shown(library)}: a git repository (branch main)"

        steps.append(Step(f"make {shown(library)} a git repository (branch main)", act_git))
    if unborn and branch(library) != "main":

        def act_branch() -> str:
            must(git(library, "symbolic-ref", "HEAD", "refs/heads/main"), "git symbolic-ref")
            return "its branch is main"

        steps.append(Step("name its branch main (no commit yet)", act_branch))
    new_lines = lfs_attributes(library) if lfs else []
    if new_lines or (lfs and is_repo(library) and not lfs_hooks(library)):

        def act_lfs() -> str:
            if new_lines:
                append_lines(library / ".gitattributes", new_lines)
            must(git(library, "lfs", "install", "--local"), "git lfs install")
            return "Git LFS: " + (f"{' '.join(LFS_PATTERNS)}, " if new_lines else "") + "its hooks installed here"

        what = f"keep {' '.join(LFS_PATTERNS)} in Git LFS (.gitattributes) and " if new_lines else ""
        steps.append(Step(f"{what}install Git LFS's hooks here", act_lfs))
    ignores = missing_ignores(library)
    if ignores:
        steps.append(
            Step(
                f"write .gitignore: {' '.join(ignores)}",
                lambda: append_lines(library / ".gitignore", ignores) or ".gitignore: " + " ".join(ignores),
            )
        )
    if language:

        def act_settings() -> str:
            (library / "library.toml").write_text(
                "# This library's settings (every key is optional).\n"
                f"language = {json.dumps(language, ensure_ascii=False)}   # the inbox's summaries\n",
                encoding="utf-8",
            )
            return f'library.toml (language = "{language}")'

        steps.append(Step(f'write library.toml (language = "{language}")', act_settings))
    if bib:
        steps.append(
            Step(
                f"write {bib.name}/biblio.json and {bib.name}/PROFILE.md (profile {bib.profile})",
                lambda: write_bibliography(library, bib),
            )
        )
        if bib.queries:
            steps.append(
                Step(
                    f"write inbox/watch.toml with {queries(len(bib.queries))} for {bib.name}",
                    lambda: add_watch(library, bib),
                )
            )
    if not is_repo(library) or config(library, "receive.denyCurrentBranch") != "updateInstead":

        def act_accept() -> str:
            must(git(library, "config", "receive.denyCurrentBranch", "updateInstead"), "git config")
            return "the other computers can push here"

        steps.append(Step("let the other computers push here (receive.denyCurrentBranch = updateInstead)", act_accept))
    steps += identity_steps(asker, library, a)
    all_names = names + ([bib.name] if bib else [])
    left = pending(library, owned(library, all_names))
    left_bibs = sorted({f.split("/")[0] for f in left if f.split("/")[0] in names})
    first = not is_repo(library) or head(library) is None
    shown_bibs = all_names if (bib or adopt or first) else left_bibs
    message = f"library: {', '.join(shown_bibs)}" if shown_bibs else "library: settings"
    writes = bool(bib or ignores or language or new_lines)
    if adopt or writes or left:
        steps.append(commit_step(library, lambda: owned(library, all_names), message, everything=adopt))
    if at and remote.cron_time(remote.cron_entry(remote.Shell(), library)) != at:
        steps.append(Step(f"add this library's daily inbox run at {at} to your crontab", lambda: start_inbox(at)))
    if (fresh or adopt) and build is not None:
        want_build = asker.confirm(
            "Build the search index and the reading room's data now (seconds)?", False, value=a.build
        )
        if want_build:

            def act_build() -> str:
                if build():
                    raise RuntimeError("the build reported a problem (above)")
                return "build/ written: glossator serve --open opens the reading room"

            steps.append(Step("build this computer's search index and data (glossator build)", act_build))

    if not steps:
        asker.mark("same", "git, .gitignore, accepts the others' pushes, everything committed: all set")
        asker.say("Nothing to do.")
        return 0
    if not run_plan(asker, steps):
        return 0
    asker.say()
    names = bibliography_names(library)
    asker.say(
        f"Done: {shown(library)}, the original, {len(names)} bibliograph{'y' if len(names) == 1 else 'ies'} "
        f"({', '.join(names)})."
    )
    rows = []
    if bib:
        rows += [
            (edit_line(library / bib.name / "PROFILE.md"), "what the curator notes for each article (optional)"),
            (f"glossator --bib {q(bib.name)} curate <DOI>", "a first article (a curator agent, Claude Code)"),
        ]
        if bib.queries:
            rows.append(("glossator inbox run", "a first look for new papers, now"))
    asker.next_steps(rows)
    asker.next_steps([(join_line(library), "")], "On another computer (as it reaches this one):")
    return 0


# --------------------------------------------------------------------------- glossator bibs add


def bibs_add(asker: Asker, library: Path, a) -> int:
    """Another bibliography in the library: its biblio.json, its PROFILE.md, its watch, one commit."""
    if not is_repo(library) and not bibliography_names(library):
        raise Stop(f"no library in {shown(library)}: glossator init (a new one) or glossator join HOST:PATH", 1)
    if is_demo(library):
        raise Stop(f"{shown(library)} is the repository's demo: add bibliographies to a library of your own", 1)
    same = existing_same(library, a)
    if same:
        left = pending(library, owned(library, [same])) if is_repo(library) and not a.no_commit else []
        if not left:
            asker.mark("same", f"{same} exists with these settings, committed: nothing to do")
            return 0
        asker.mark("same", f"{same} exists with these settings, not committed yet ({', '.join(left)})")
        if not run_plan(asker, [commit_step(library, lambda: left, f"bibliography: {same}")]):
            return 0
        return 0
    bib = ask_bibliography(asker, library, a, ask_queries=True, name_flag="NAME")
    steps = [
        Step(
            f"write {bib.name}/biblio.json and {bib.name}/PROFILE.md (profile {bib.profile})",
            lambda: write_bibliography(library, bib),
        )
    ]
    if watch_path(library).is_file() or bib.queries:
        steps.append(
            Step(f"add {bib.name} to inbox/watch.toml ({queries(len(bib.queries))})", lambda: add_watch(library, bib))
        )
    if is_repo(library) and not a.no_commit:
        files = [f"{bib.name}/biblio.json", f"{bib.name}/PROFILE.md", "inbox/watch.toml"]
        steps.append(commit_step(library, lambda: files, f"bibliography: {bib.name}"))
    if not run_plan(asker, steps):
        return 0
    asker.say()
    asker.say(f"Done: {bib.name} ({bib.title}).")
    rows = [
        (edit_line(library / bib.name / "PROFILE.md"), "what the curator notes for each article (optional)"),
        (f"glossator --bib {shlex.quote(bib.name)} curate <DOI>", "a first article"),
    ]
    if is_repo(library) and origin_url(library):
        rows.append(("glossator sync", "sends it to the original"))
    asker.next_steps(rows)
    return 0
