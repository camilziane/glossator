"""The original: the computer the others sync with, where the daily inbox runs.

`glossator promote`, on a clone, makes it the original. From here it does the old original's part over ssh (it is
this computer's origin, so it is reachable): its crontab line, its origin, its refusal of pushes. It cannot reach
the other clones (git keeps no list of them): it commits the new address in library.toml (`original`), so that
each clone's next `glossator sync` stops and says `glossator follow <address>`.

The order keeps every moment consistent: the old original's daily run stops first (nothing commits there by itself
any more), this computer accepts pushes before it announces itself, the old original answers pulls (and so passes
the announcement on) until it becomes a clone, and this computer forgets its origin last.

`glossator follow ADDRESS` points this computer's library at another original (after a promote)."""

from __future__ import annotations

import getpass
import shlex
import shutil
import socket
import tomllib
from collections.abc import Callable
from pathlib import Path

from . import remote
from .ask import Asker, Step, Stop, run_plan
from .paths import shown
from .remote import Address
from .repo import (
    ACK,
    acknowledge,
    ahead_behind,
    branch,
    commit_paths,
    config,
    dirty,
    git,
    head,
    is_repo,
    lfs_placeholders,
    lfs_used,
    light,
    must,
    origin_url,
    original_at,
    set_origin,
    set_original,
)
from .start import check_time

PENDING_TIME = "glossator.promoteInboxAt"  # the old original's daily time, kept here until the run is moved
q = shlex.quote


def default_address(library: Path) -> str:
    return f"{getpass.getuser()}@{socket.getfqdn()}:{library}"


def parse(text: str) -> Address:
    try:
        return Address.parse(text)
    except ValueError as e:
        raise Stop(str(e), 2) from None


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def pending_announcement(library: Path) -> str | None:
    """The address of a promote stopped between its announcement and its push: the one commit here not on the old
    original, which only names this computer the original in library.toml."""
    counts = ahead_behind(library)
    if counts != (1, 0):
        return None
    files = git(library, "diff", "--name-only", "HEAD~1", "HEAD").stdout.split()
    named = original_at(library, "HEAD")
    return named if files == ["library.toml"] and named and named != original_at(library, "HEAD~1") else None


# --------------------------------------------------------------------------- glossator promote


def promote(
    asker: Asker,
    library: Path,
    a,
    start_inbox: Callable[[str], str],
) -> int:
    if not is_repo(library):
        raise Stop(f"no library in {shown(library)}: glossator join ADDRESS (or glossator init)", 1)
    if head(library) is None:
        raise Stop(f"{shown(library)} has no commit: nothing to promote", 1)
    here = remote.Shell()
    origin = origin_url(library)
    if origin is None:
        return already_original(asker, library, a, start_inbox)
    old = parse(origin)
    sh = old.shell()
    name = old.name

    if asker.interactive:
        asker.say(f"This computer becomes the original of the library; {old}, its original, becomes a clone of it.")
    old_time = None
    old_lib = None
    pending = None
    if a.old_gone:
        asker.mark("warn", f"{name} is taken as gone: nothing is done there")
    else:
        why = remote.reachable(old)
        if why:
            raise Stop(f"{name} not reached ({why}). If it is gone for good: glossator promote --old-gone", 1)
    if dirty(library):
        raise Stop(f"uncommitted changes here: commit or drop them first (git -C {q(str(library))} status)", 1)
    asker.mark("ok", "no uncommitted change here")
    if not a.old_gone:
        r = git(library, "fetch", "-q", "origin")
        if r.returncode != 0:
            raise Stop(f"git fetch from {name}: {remote.tail(r)}", 1)
        counts = ahead_behind(library) or (0, 0)
        pending = pending_announcement(library)
        if counts != (0, 0) and not pending:
            raise Stop(
                f"not in step with {name} ({counts[0]} to send, {counts[1]} to get): glossator sync, then promote "
                "again",
                1,
            )
        asker.mark("ok", f"in step with {name}" + (" (but for the announcement of an earlier run)" if pending else ""))
        if sh.git(old.remote_path, "status", "--porcelain").stdout.strip():
            raise Stop(
                f"{name} has uncommitted changes in its library (a curation running there?): commit them there or "
                "wait, glossator sync here, then promote again",
                1,
            )
        if remote.inbox_running(sh):
            raise Stop(f"an inbox run is going on {name}: promote again when it ends", 1)
        old_lib = remote.real_path(sh, old.remote_path) or old.path
        old_time = remote.cron_time(remote.cron_entry(sh, old_lib))
        asker.mark(
            "ok", f"{name}: no uncommitted change, no inbox run going" + (f" (daily at {old_time})" if old_time else "")
        )
    uses_lfs = lfs_used(library)
    if uses_lfs:
        transfer = shutil.which("git-lfs-transfer")
        if not transfer:
            raise Stop(
                "git-lfs-transfer is not installed here: the other computers could not fetch the PDFs from this one. "
                "Install it (github.com/charmbracelet/git-lfs-transfer), then promote again",
                1,
            )
        asker.mark("ok", f"git-lfs-transfer here: {transfer}")
    missing = lfs_placeholders(library) if uses_lfs else 0
    if missing and not a.old_gone:
        asker.mark(
            "warn", f"{plural(missing, 'file')} in Git LFS not here: fetched first (every future clone comes from here)"
        )
    elif missing:
        asker.mark(
            "warn",
            f"{plural(missing, 'file')} in Git LFS not here, and {name} is gone: placeholders until a clone that has "
            "them sends them (there, once it follows this computer: git lfs push --all origin), then git -C "
            f"{q(str(library))} lfs checkout here",
        )

    address = asker.ask(
        "How do the other computers reach this one (ssh-name:path)?",
        pending or default_address(library),
        flag="--address",
        value=a.address,
        check=lambda t: _address_problem(t),
    )
    from_old = address
    if not a.old_gone:
        from_old = asker.ask(
            f"How does {name} reach it?",
            address,
            flag="--address-from-old",
            value=a.address_from_old,
            check=lambda t: _address_problem(t),
        )
        seen = remote.ls_remote_head(parse(from_old), sh)
        if seen == head(library):
            asker.mark("ok", f"{name} reaches this library ({from_old})")
        else:
            asker.mark(
                "warn",
                f"{name} cannot reach {from_old} yet: its own syncs fail until it can (on {name}: ssh-copy-id …); "
                "the move works without it",
            )
    at = None
    old_time = old_time or config(library, PENDING_TIME)  # a run stopped after the old daily run was taken out
    if not a.no_inbox:
        at = a.inbox_at or old_time
        if at is None:
            at = asker.optional(
                "Run the inbox every day here (a daily paid run on Claude Haiku)? A time HH:MM, or empty for not now",
                flag="--inbox-at",
                check=check_time,
            )
        elif check_time(at):
            raise Stop(f"--inbox-at {at}: {check_time(at)}", 2)

    steps: list[Step] = []
    if not a.old_gone and old_time:

        def act_stop() -> str:
            must(git(library, "config", PENDING_TIME, old_time), "git config")  # for a run that continues
            remote.cron_remove(sh, old_lib)
            r = git(library, "pull", "-q", "--ff-only")
            if r.returncode != 0 and not pending:
                raise RuntimeError(f"git pull: {remote.tail(r)}")
            return f"{name}: the daily run stopped; its last commits are here"

        steps.append(
            Step("stop the inbox's daily run (its crontab line), then get its last commits", act_stop, f"on {name}")
        )
    if (missing or light(library)) and not a.old_gone:

        def act_fetch() -> str:
            git(library, "config", "--unset", "lfs.fetchexclude")  # an original keeps every file
            git(library, "lfs", "fetch", "--all", "origin")  # old versions the original purged may be missing
            r = git(library, "lfs", "checkout")
            left = lfs_placeholders(library)
            if r.returncode != 0 or left:
                raise RuntimeError(f"{plural(left, 'file')} still missing ({remote.tail(r)})")
            return "every file in Git LFS is here"

        steps.append(Step(f"fetch the {plural(missing, 'missing file')} in Git LFS", act_fetch, "here"))
    elif light(library):
        steps.append(
            Step(
                "keep every file in Git LFS here (an original is not a light clone)",
                lambda: git(library, "config", "--unset", "lfs.fetchexclude") and "every file in Git LFS kept here",
                "here",
            )
        )
    if config(library, "receive.denyCurrentBranch") != "updateInstead":

        def act_accept() -> str:
            must(git(library, "config", "receive.denyCurrentBranch", "updateInstead"), "git config")
            return "this computer accepts the others' pushes"

        steps.append(Step("accept the others' pushes (receive.denyCurrentBranch = updateInstead)", act_accept, "here"))

    def act_announce() -> str:
        if set_original(library, address):
            try:
                commit_paths(library, ["library.toml"], f"original: {address}")
            except BaseException:
                git(library, "checkout", "-q", "--", "library.toml")  # as it was: a second run starts clean
                raise
        acknowledge(library, address)
        if a.old_gone:
            return f"library.toml: original = {address}"
        r = git(library, "push", "-q", "origin", f"HEAD:{branch(library)}")
        if r.returncode != 0:
            raise RuntimeError(f"git push to {name}: {remote.tail(r)}")
        return f"library.toml: original = {address}, sent to {name}"

    steps.append(
        Step(
            f'commit library.toml: original = "{address}"' + ("" if a.old_gone else f", send it to {name}"),
            act_announce,
            "here",
        )
    )
    if not a.old_gone:

        def act_old() -> str:
            path = old.remote_path
            b = sh.git(path, "symbolic-ref", "--short", "HEAD").stdout.strip() or "main"
            have = sh.git(path, "remote", "get-url", "origin")
            verb = "set-url" if have.returncode == 0 else "add"
            for args in (
                ("remote", verb, "origin", from_old),
                ("config", f"branch.{b}.remote", "origin"),
                ("config", f"branch.{b}.merge", f"refs/heads/{b}"),
                ("config", ACK, address),
            ):
                r = sh.git(path, *args)
                if r.returncode != 0:
                    raise RuntimeError(f"git {' '.join(args[:2])} on {name}: {remote.tail(r)}")
            sh.git(path, "config", "--unset", "receive.denyCurrentBranch")  # stale clones are refused, not merged
            fetched = sh.git(path, "fetch", "-q", "origin").returncode == 0
            return f"{name} follows {from_old}" + ("" if fetched else " (it cannot reach it yet: ssh keys there)")

        steps.append(
            Step(f"follow {from_old} (its origin) and refuse pushes (a clone receives none)", act_old, f"on {name}")
        )

    def act_forget() -> str:
        must(git(library, "remote", "remove", "origin"), "git remote remove")
        b = branch(library)
        git(library, "config", "--unset", f"branch.{b}.remote")
        git(library, "config", "--unset", f"branch.{b}.merge")
        return "this computer is the original"

    steps.append(
        Step(f"forget {name} as its original (git's origin): this computer is the original", act_forget, "here")
    )
    if at and remote.cron_time(remote.cron_entry(here, library)) != at:
        steps.append(Step(f"run the inbox every day at {at} here (your crontab)", lambda: start_inbox(at), "here"))

    if a.old_gone:
        asker.mark(
            "warn",
            f"{name} is gone: the commits it had that this computer lacks are lost. If it comes back, run nothing "
            f"there before glossator follow {q(address)}, and stop its daily run there (glossator inbox stop).",
        )
    if not run_plan(asker, steps, default=False):
        return 0
    git(library, "config", "--unset", PENDING_TIME)
    asker.say()
    asker.say("Done: this computer is the original.")
    if a.old_gone:
        asker.say(f"On every other computer ({name} is gone, so their sync cannot tell them):")
    else:
        asker.say("On every other computer (their next glossator sync says the same):")
    asker.say(f"  glossator follow {q(address)}")
    if not a.old_gone:
        asker.say(f"{name} is a clone of this computer; its build/ and Zotero settings are unchanged.")
    return 0


def _address_problem(text: str) -> str | None:
    try:
        Address.parse(text)
    except ValueError as e:
        return str(e)
    return None


def already_original(asker: Asker, library: Path, a, start_inbox: Callable[[str], str]) -> int:
    """On the original: only what an interrupted promote (or a hand-made library) left undone."""
    asker.mark("same", "this computer is already the original")
    steps = []
    if config(library, "receive.denyCurrentBranch") != "updateInstead":

        def act_accept() -> str:
            must(git(library, "config", "receive.denyCurrentBranch", "updateInstead"), "git config")
            return "this computer accepts the others' pushes"

        steps.append(Step("accept the others' pushes (receive.denyCurrentBranch = updateInstead)", act_accept))
    at = a.inbox_at or config(library, PENDING_TIME)
    if at and check_time(at):
        raise Stop(f"--inbox-at {at}: {check_time(at)}", 2)
    if at and remote.cron_time(remote.cron_entry(remote.Shell(), library)) != at:
        steps.append(Step(f"run the inbox every day at {at} here (your crontab)", lambda: start_inbox(at)))
    if not steps:
        if not remote.cron_entry(remote.Shell(), library):
            asker.mark("warn", "no daily inbox run here: glossator inbox start --at 07:30 (or promote --inbox-at)")
        asker.say("Nothing to do.")
        return 0
    if run_plan(asker, steps):
        git(library, "config", "--unset", PENDING_TIME)
    return 0


# --------------------------------------------------------------------------- glossator follow


def announced_there(sh: remote.Shell, path: str) -> str | None:
    """The original library.toml names in the library at that address (its HEAD), without fetching it."""
    r = sh.git(path, "show", "HEAD:library.toml")
    if r.returncode != 0:
        return None
    try:
        value = tomllib.loads(r.stdout).get("original")
    except tomllib.TOMLDecodeError:
        return None
    return value if isinstance(value, str) and value else None


def follow(asker: Asker, library: Path, a, stop_inbox: Callable[[], str]) -> int:
    if not is_repo(library):
        raise Stop(f"no library in {shown(library)}: glossator join {q(a.address)}", 1)
    address = parse(a.address)
    mine = origin_url(library)
    sh = address.shell()
    if address.same(mine):
        acknowledge(library, original_at(library, "HEAD"))
        if git(library, "rev-parse", "--verify", "-q", "@{u}").returncode != 0:  # a follow stopped before its fetch
            git(library, "fetch", "-q", "origin")
        asker.mark("same", f"this computer already follows {address}")
        asker.say("Nothing to do.")
        return 0
    if head(library) is None:
        raise Stop(f"{shown(library)} has no commit: glossator join {q(str(address))} instead", 1)
    why = remote.reachable(address)
    if why:
        raise Stop(f"ssh {address.target}: {why} (ssh without a password prompt is needed)", 1)
    if remote.ls_remote_head(address) is None:
        raise Stop(f"no git repository at {address}: nothing changed", 1)
    roots = git(library, "rev-list", "--max-parents=0", "HEAD").stdout.split()
    if not any(sh.git(address.remote_path, "cat-file", "-e", f"{root}^{{commit}}").returncode == 0 for root in roots):
        raise Stop(f"{address} holds another library (no history in common with this one): nothing changed", 1)
    asker.mark("ok", f"{address}: the same library")
    theirs = sh.git(address.remote_path, "remote", "get-url", "origin")
    if theirs.returncode == 0 and theirs.stdout.strip():
        them = theirs.stdout.strip()
        asker.mark("warn", f"{address} is itself a clone of {them}: follow the original instead")
        if not asker.interactive or not asker.confirm("Follow this clone anyway?", False):
            raise Stop(f"nothing changed: follow the original, glossator follow {q(them)}", 1)
    if lfs_used(library) and address.host and not remote.has_command(sh, "git-lfs-transfer"):
        asker.mark("warn", f"{address.name} has no git-lfs-transfer: the PDFs cannot go over ssh until it has")
    announced = announced_there(sh, address.remote_path)
    if announced and not address.same(announced):
        asker.mark("same", f"its library.toml names the original {announced} (as that computer sees itself)")

    def act_origin() -> str:
        set_origin(library, str(address))
        acknowledge(library, announced)
        r = git(library, "fetch", "-q", "origin")
        if r.returncode != 0:
            raise RuntimeError(f"git fetch: {remote.tail(r)}")
        return f"this computer follows {address}"

    steps = [
        Step(
            f"follow {address}" + (f" (was {mine})" if mine else "") + f": git's origin, {branch(library)} follows it",
            act_origin,
        )
    ]
    if config(library, "receive.denyCurrentBranch") == "updateInstead":

        def act_refuse() -> str:
            git(library, "config", "--unset", "receive.denyCurrentBranch")
            return "pushes to this computer refused (it is a clone)"

        steps.append(Step("refuse pushes here (a clone receives none)", act_refuse))
    if remote.cron_entry(remote.Shell(), library):
        asker.mark("warn", "this computer runs this library's daily inbox run; the original runs it")
        if asker.confirm("Stop it here?", True):
            steps.append(Step("stop this library's daily inbox run here", stop_inbox))
    if not run_plan(asker, steps):
        return 0
    counts = ahead_behind(library)
    asker.say()
    asker.say(f"Done: this computer follows {address}.")
    if counts and counts[0]:
        asker.say(f"{plural(counts[0], 'commit')} here not on it yet.")
    asker.say("Next: glossator sync")
    return 0
