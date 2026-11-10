"""`glossator join ADDRESS`: an existing library on this computer. It checks ssh and Git LFS on both sides, clones
the library (its records first, then its files), turns Git LFS's hooks on, and builds this computer's own index and
data: nothing built elsewhere is copied. Run again, it resumes: the clone is kept, the missing files are fetched,
the build is redone only when the library moved."""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
from collections.abc import Callable
from pathlib import Path

from . import remote
from .ask import Asker, Step, Stop, run_plan
from .paths import shown
from .remote import Address
from .repo import (
    acknowledge,
    git,
    head,
    identity,
    is_repo,
    lfs_hooks,
    lfs_placeholders,
    lfs_used,
    lfs_version,
    light,
    must,
    origin_url,
    original_at,
)
from .start import bibliography_names, identity_steps

SIZE_RE = re.compile(r"\((\d+(?:\.\d+)?) (B|KB|MB|GB|TB)\)")
UNITS = {"B": 1, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12}


def human(n: float) -> str:
    for unit in ("TB", "GB", "MB", "KB"):
        if n >= UNITS[unit]:
            return f"{n / UNITS[unit]:.1f} {unit}"
    return f"{n:.0f} B"


def lfs_size(shell: remote.Shell, path: str) -> tuple[int, float] | None:
    """The files in Git LFS at the address, and their size (as `git lfs ls-files --size` gives them there)."""
    r = shell.git(path, "lfs", "ls-files", "--size")
    if r.returncode != 0:
        return None
    sizes = [float(m.group(1)) * UNITS[m.group(2)] for m in SIZE_RE.finditer(r.stdout)]
    return len(sizes), sum(sizes)


def manifest_head(build_dir: Path) -> str | None:
    try:
        return json.loads((build_dir / "manifest.json").read_text()).get("library_head")
    except (OSError, ValueError):
        return None


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def join(
    asker: Asker,
    library: Path,
    build_dir: Path,
    a,
    build: Callable[[], int] | None = None,
    web: Callable[[], int] | None = None,
    web_current: Callable[[], bool] | None = None,
    stop_inbox: Callable[[], str] | None = None,
) -> int:
    q = shlex.quote
    mine_now = origin_url(library) if is_repo(library) else None  # on a clone, ADDRESS may be left out
    text = (
        a.address
        or mine_now
        or asker.ask(
            "The original's library (ssh-name:path, as glossator doctor prints it on the original)",
            None,
            flag="ADDRESS",
        )
    )
    try:
        address = Address.parse(text)
    except ValueError as e:
        raise Stop(str(e), 2) from None

    # ---------------------------------------------------------------- this computer's side
    resume = False
    half_done = False
    if is_repo(library):
        mine = origin_url(library)
        if mine is None:
            raise Stop(f"{shown(library)} is an original here (it has no origin): nothing to join", 1)
        mine_a = Address.parse(mine)
        same = mine_a.same(address) or mine_a.same(address.child("library"))
        if head(library) is None:
            only_git = all(p.name == ".git" for p in library.iterdir())
            if not (same and only_git):
                raise Stop(
                    f"{shown(library)} has no commit (a clone that stopped half-way?). Nothing changed. Move it away "
                    f"(mv {q(str(library))} {q(str(library))}.old), then glossator join {q(str(address))}",
                    1,
                )
            half_done = True
            asker.mark("warn", f"{shown(library)} is a clone of {mine} that stopped half-way: it is made again")
        elif not same:
            raise Stop(
                f"{shown(library)} follows {mine}, another original. To change it: glossator follow {q(str(address))}",
                1,
            )
        else:
            address = mine_a
            resume = True
            asker.mark("same", f"{shown(library)} is here already, a clone of {address}")
    elif library.exists() and (not library.is_dir() or any(library.iterdir())):
        raise Stop(
            f"{shown(library)} exists and is not a git repository. Nothing changed. Move it away "
            f"(mv {q(str(library))} {q(str(library))}.old), then join again",
            1,
        )

    # ---------------------------------------------------------------- the original's side
    shell = address.shell()
    label = address.host or f"the original ({address})"
    uses_lfs = lfs_used(library) if resume else False
    full = bool(getattr(a, "full", False))
    is_light = ((light(library) if resume else False) or a.light) and not full
    size = None
    fix_push = False
    if not resume:
        why = remote.reachable(address)
        if why:
            raise Stop(
                f"ssh {address.target}: {why}\n  glossator needs ssh without a password prompt: ssh-copy-id "
                f"{address.target} (or a Host entry in ~/.ssh/config), then join again",
                1,
            )
        if address.host:
            asker.mark("ok", f"ssh {address.target} (no password prompt)")
        if remote.ls_remote_head(address) is None:
            inner = address.child("library")
            if remote.ls_remote_head(inner) is not None:
                asker.mark("same", f"{address} is the tool's folder; its library is {inner}")
                address = inner
            else:
                raise Stop(
                    f"no git repository at {address}: give the original's library folder (glossator doctor on the "
                    "original prints the address to join)",
                    1,
                )
        theirs = shell.git(address.remote_path, "remote", "get-url", "origin")
        if theirs.returncode == 0 and theirs.stdout.strip():
            them = theirs.stdout.strip()
            asker.mark("warn", f"{address} is itself a clone of {them}: join the original instead")
            if not asker.interactive or not asker.confirm("Join this clone anyway?", False):
                raise Stop(f"nothing changed: join the original, glossator join {q(them)}", 1)
        else:
            accepts = shell.git(address.remote_path, "config", "--get", "receive.denyCurrentBranch").stdout.strip()
            if accepts == "updateInstead":
                asker.mark("ok", f"{label}: the original, accepts the others' pushes")
            else:
                asker.mark("warn", f"{label} refuses pushes into its folder: your commits could not go back")
                fix_push = asker.confirm(f"Let {label} accept them (git config there)?", True)
        uses_lfs = "filter: lfs" in shell.git(address.remote_path, "check-attr", "filter", "--", "x.pdf").stdout
        if uses_lfs:
            have = lfs_version()
            if have is None or have < (3, 0):
                if not a.light:
                    raise Stop(
                        "Git LFS 3.0 or later is needed for the PDFs (apt or brew install git-lfs; git-lfs.com), or "
                        "--light (the records only)",
                        1,
                    )
            else:
                asker.mark("ok", f"Git LFS {have[0]}.{have[1]} here")
            if address.host:
                where = remote.has_command(shell, "git-lfs-transfer")
                if where:
                    asker.mark("ok", f"git-lfs-transfer on {address.name}")
                elif a.light:
                    asker.mark("warn", f"no git-lfs-transfer on {address.name}: the PDFs stay placeholders here")
                else:
                    raise Stop(
                        f"{address.name} has no git-lfs-transfer on the PATH ssh commands get: the PDFs cannot come "
                        "over ssh. Install it there (github.com/charmbracelet/git-lfs-transfer: one binary in "
                        "/usr/local/bin or ~/.local/bin), then join again; or --light (the records only)",
                        1,
                    )
            size = lfs_size(shell, address.remote_path)
            if size and size[0]:
                asker.mark(
                    "ok",
                    f"{plural(size[0], 'file')} in Git LFS, {human(size[1])}"
                    + (
                        (": it stays a placeholder here" if size[0] == 1 else ": they stay placeholders here")
                        + " (--light)"
                        if a.light
                        else ""
                    ),
                )
            elif size:
                asker.mark("ok", "no file in Git LFS yet")

    stop_cron = False
    if stop_inbox and remote.cron_entry(remote.Shell(), library):
        asker.mark("warn", "this computer runs this library's daily inbox run; only the original should")
        stop_cron = asker.confirm("Stop it here?", True)

    # ---------------------------------------------------------------- the plan
    steps: list[Step] = []
    created = not library.exists() or half_done

    if not resume:

        def act_clone() -> str:
            if half_done:
                shutil.rmtree(library)
            library.parent.mkdir(parents=True, exist_ok=True)
            env = {**os.environ, "GIT_LFS_SKIP_SMUDGE": "1"}
            r = git(library.parent, "clone", "-q", str(address), str(library), env=env)
            if r.returncode != 0:
                if created and library.exists():
                    shutil.rmtree(library, ignore_errors=True)
                raise RuntimeError(remote.tail(r))
            names = bibliography_names(library)
            if not names:
                if created:
                    shutil.rmtree(library, ignore_errors=True)
                raise RuntimeError(f"{address} is a git repository but holds no bibliography (no */biblio.json)")
            if a.light:
                git(library, "config", "lfs.fetchexclude", "*")  # stays light: pulls never download the files
            acknowledge(library, original_at(library, "HEAD"))
            return f"cloned ({len(names)} bibliograph{'y' if len(names) == 1 else 'ies'}: {', '.join(names)})"

        what = " (records only: a light clone)" if a.light else " (records first)"
        steps.append(Step(f"clone {address} into {shown(library)}{what}", act_clone))
    elif a.light and not light(library):
        steps.append(
            Step(
                "keep this clone light (its files in Git LFS stay placeholders)",
                lambda: git(library, "config", "lfs.fetchexclude", "*") and "a light clone",
            )
        )
    elif full and light(library):
        steps.append(
            Step(
                "make this light clone full: every file in Git LFS downloaded from now on",
                lambda: git(library, "config", "--unset", "lfs.fetchexclude") and "a full clone",
            )
        )
    if fix_push:

        def act_accept() -> str:
            r = shell.git(address.remote_path, "config", "receive.denyCurrentBranch", "updateInstead")
            if r.returncode != 0:
                raise RuntimeError(remote.tail(r))
            return f"{label} accepts the others' pushes"

        steps.append(Step(f"on {label}: accept the others' pushes", act_accept))
    name, email = identity(library if resume else None)
    if not (name and email):
        steps += identity_steps(asker, library, a)
    have_lfs = lfs_version()
    if uses_lfs and have_lfs and (not resume or not lfs_hooks(library)):

        def act_hooks() -> str:
            must(git(library, "lfs", "install", "--local"), "git lfs install")
            return "Git LFS's hooks (your pushes carry the PDFs)"

        steps.append(Step("turn Git LFS on in it (its hooks: your pushes carry the PDFs)", act_hooks))
    some = size is None or size[0] > 0
    if (
        uses_lfs
        and have_lfs
        and not is_light
        and ((not resume and some) or (resume and (lfs_placeholders(library) or (full and light(library)))))
    ):
        what = f"the {plural(size[0], 'file')} in Git LFS ({human(size[1])})" if size else "every file in Git LFS"

        def act_pull() -> str:
            r = git(library, "lfs", "pull")
            left = lfs_placeholders(library)
            if r.returncode != 0 or left:
                raise RuntimeError(
                    f"{plural(left, 'file')} not downloaded ({remote.tail(r)}); glossator join again resumes "
                    f"(or git -C {q(str(library))} lfs pull)"
                )
            return f"downloaded {what}"

        steps.append(Step(f"download {what}", act_pull))
    if stop_cron:
        steps.append(Step("stop this library's daily inbox run here (the original runs it)", stop_inbox))
    built = False
    if build and a.build is not False and (not resume or manifest_head(build_dir) != head(library)):
        built = True

        def act_build() -> str:
            if build():
                raise RuntimeError("the build reported a problem (above); glossator build again")
            return "this computer's search index and the reading room's data (build/)"

        steps.append(
            Step(
                "build this computer's search index and data: every PDF read once, the search model downloaded once "
                "(a few minutes)",
                act_build,
            )
        )
    if web and a.web is not False and web_current is not None and not web_current():
        if shutil.which("node"):

            def act_web() -> str:
                if web():
                    raise RuntimeError("the reading room did not build (above); glossator web again")
                return "the reading room (web/out/)"

            steps.append(Step("build the reading room (glossator web; Node, about a minute)", act_web))
        else:
            asker.mark("warn", "no Node here: the reading room needs Node 20.19 or later (glossator web)")

    if not steps:
        asker.say("Nothing to do: glossator sync keeps it in step.")
        return 0
    if not run_plan(asker, steps):
        return 0
    asker.say()
    asker.say(f"Done: this computer follows {address}.")
    rows = [] if built or manifest_head(build_dir) else [("glossator build", "this computer's search index and data")]
    rows += [
        ("glossator serve --open", "the reading room"),
        ("glossator sync", "before and after you add articles here (git both ways; never builds)"),
        ("glossator zotero setup", "if Zotero should follow on this computer too"),
    ]
    asker.next_steps(rows)
    return 0
