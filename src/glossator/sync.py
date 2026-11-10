"""`glossator sync`: library/ goes both ways with the computer it was cloned from (git's `origin`, the original). It
pulls, replaying this computer's commits on the original's when both have new ones, then pushes this computer's
commits, the library's files through Git LFS. It never builds: each computer writes its own build/ with
`glossator build`. On the original itself (no origin) there is nothing to sync. The tool itself is not synced:
it is updated like any program (`git pull` in its folder, then `uv sync`).

library.toml's `original` names the original once `glossator promote` moved it. Each clone remembers the one it
follows (git config `glossator.original`, written by join, follow and promote); when library.toml names another,
sync stops before sending anything and says to follow it (`glossator follow <address>`), at every sync until it
is followed."""

from __future__ import annotations

import re
import shlex
from pathlib import Path

from .paths import LIBRARY
from .remote import Address
from .repo import (
    acknowledge,
    acknowledged,
    branch,
    config,
    dirty,
    git,
    has_upstream,
    head,
    lfs_push_problem,
    origin_url,
    original_at,
    said,
    tail,
)


def run_git(repo: Path, *args: str):
    return git(repo, *args)


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def moved(repo: Path) -> str | None:
    """The original library.toml names when this computer follows another one (a move not followed yet)."""
    named = original_at(repo, "HEAD")
    if not named or named == acknowledged(repo):
        return None
    if Address.parse(origin_url(repo) or "/").same(named):  # it follows that one already: remembered from now
        acknowledge(repo, named)
        return None
    return named


def pull(name: str, repo: Path, log) -> None:
    """Fast-forward to the original; when both sides have new commits, replay this computer's on top of the
    original's (a conflict stops it, nothing changed)."""
    before = head(repo)
    r = run_git(repo, "pull", "--ff-only")
    if r.returncode == 0:
        got = int(run_git(repo, "rev-list", "--count", f"{before}..HEAD").stdout.strip() or 0) if before else 0
        log(f"{name}: {plural(got, 'commit')} received" if got else f"{name}: up to date")
        return
    if not re.search(r"fast-forward|diverg", said(r), re.I):
        raise RuntimeError(f"{name}: git pull: {tail(r)}")
    q = shlex.quote(str(repo))
    if dirty(repo):
        raise RuntimeError(
            f"{name}: this computer and the original both have new commits, and uncommitted changes are in the way. "
            f"Nothing changed. Commit them (git -C {q} add -A && git -C {q} commit -m 'my changes'), then "
            "glossator sync"
        )
    r = run_git(repo, "pull", "--rebase")
    if r.returncode != 0:
        files = sorted(set(re.findall(r"CONFLICT \([^)]*\): (?:Merge conflict in )?(\S+)", said(r))))
        run_git(repo, "rebase", "--abort")
        where = f" ({', '.join(files)})" if files else ""
        raise RuntimeError(
            f"{name}: your commits and the original's change the same lines{where}. Nothing changed. To merge them by "
            f"hand: git -C {q} pull --rebase, edit the files it names, git -C {q} add them, git -C {q} rebase "
            "--continue, then glossator sync"
        )
    log(f"{name}: your commits replayed on the original's")


def push(name: str, repo: Path, log) -> None:
    """Send this computer's commits to the original; files in Git LFS only with Git LFS's hooks (else the original
    would get placeholders without their files)."""
    ahead = run_git(repo, "rev-list", "--count", "@{u}..HEAD").stdout.strip()
    if not ahead.isdigit() or ahead == "0":
        return
    problem = lfs_push_problem(repo)
    if problem:
        raise RuntimeError(f"{name}: {problem}")
    r = run_git(repo, "push")
    if r.returncode != 0:
        text = said(r)
        if "unstaged changes" in text or "would be overwritten" in text or "Working directory has" in text:
            raise RuntimeError(
                f"{name}: the original refused the push while its library has uncommitted changes (a curation "
                "running there?); glossator sync again later"
            )
        if re.search(r"refusing to update checked out branch|denyCurrentBranch", text):
            named = original_at(repo, "@{u}")
            if named:
                raise RuntimeError(
                    f"{name}: the original refuses pushes: it is a clone now. Its library.toml names {named!r} as the "
                    f"original: glossator follow {shlex.quote(named)}, then glossator sync."
                )
            raise RuntimeError(f"{name}: the original refuses pushes into its folder: glossator doctor says why")
        raise RuntimeError(f"{name}: git push: {tail(r)}")
    log(f"{name}: {plural(int(ahead), 'commit')} sent to the original")


def sync(log=print, library: Path | None = None) -> str:
    """Pull library/ from its original, then push this computer's commits; build/ is left alone."""
    library = library or LIBRARY
    q = shlex.quote(str(library))
    if not (library / ".git").exists():
        raise RuntimeError(f"{library} is not a git repository: glossator init (a new library) or glossator join")
    origin = origin_url(library)
    if origin is None:
        return "this is the original (no origin to sync with): the other computers sync with it"
    if head(library) is None:
        raise RuntimeError(
            f"{library} has no commit (a clone that stopped half-way?): move it away, then glossator join "
            f"{shlex.quote(origin)}"
        )
    if not has_upstream(library):
        b = branch(library)
        if config(library, f"branch.{b}.remote"):
            raise RuntimeError(
                f"origin is {origin} but nothing was fetched from it: git -C {q} fetch origin, then glossator sync"
            )
        raise RuntimeError(f"{b} follows no branch of the original: glossator follow {shlex.quote(origin)}")
    before = head(library)
    pull("library", library, log)
    after = head(library)
    named = moved(library)
    if named:
        ahead = run_git(library, "rev-list", "--count", "@{u}..HEAD").stdout.strip()
        n = int(ahead) if ahead.isdigit() else 0
        kept = f" Your {plural(n, 'commit')} {'stays' if n == 1 else 'stay'} here until then." if n else ""
        origin = origin_url(library) or ""
        raise RuntimeError(
            f"the original moved: library.toml names {named!r}. Run glossator follow {shlex.quote(named)} here (with "
            f"the name this computer's ssh gives it, if another), then glossator sync.{kept} If this computer follows "
            f"that original already under another name, glossator follow {shlex.quote(origin)} records it."
        )
    push("library", library, log)
    notes = []
    if dirty(library):
        notes.append("library: uncommitted changes stay on this computer until you commit them (then sync again)")
    if before and after != before:
        changes = [
            ln.split("\t")
            for ln in run_git(library, "diff", "--no-renames", "--name-status", before, after).stdout.splitlines()
        ]
        if any(path.endswith("/record.json") for _, path, *_ in changes):
            notes.append("new articles here: glossator build updates this computer's build/ (search index, data)")
        papers = sum(st == "A" and path.startswith("inbox/items/") for st, path, *_ in changes)
        if papers:
            notes.append(
                f"inbox: {plural(papers, 'new paper')} (glossator inbox list, or the reading room's Inbox after a "
                "build)"
            )
    return "\n".join(notes) or "in step"
