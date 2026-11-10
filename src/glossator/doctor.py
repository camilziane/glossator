"""`glossator doctor`: what this computer has and lacks, where its library stands, whether Zotero is set up. It
reads only: each problem comes with the command that fixes it. `--offline` skips what needs the network (ssh to
the original, Zotero's web API); `--json` prints the checks for scripts. Exit 1 when a check fails."""

from __future__ import annotations

import json
import re
import shlex
import shutil
import subprocess
import sys
import tomllib
from dataclasses import asdict, dataclass
from pathlib import Path

from . import remote
from .remote import Address
from .repo import (
    acknowledged,
    ahead_behind,
    branch,
    config,
    dirty,
    git,
    head,
    identity,
    is_repo,
    lfs_hooks,
    lfs_placeholders,
    lfs_used,
    lfs_version,
    light,
    origin_url,
    original_at,
)

GROUPS = {"computer": "This computer", "library": "The library", "zotero": "Zotero"}


@dataclass
class Check:
    group: str
    id: str
    status: str  # ok | warn | fail | skip
    detail: str
    fix: str = ""


def version_of(cmd: list[str], pattern: str = r"(\d+(?:\.\d+)+)") -> str | None:
    if not shutil.which(cmd[0]):
        return None
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    m = re.search(pattern, r.stdout + r.stderr)
    return m.group(1) if m else "?"


# --------------------------------------------------------------------------- this computer


def computer_checks(library: Path) -> list[Check]:
    out = []
    uv = version_of(["uv", "--version"])
    py = ".".join(map(str, sys.version_info[:3]))
    out.append(
        Check("computer", "uv", "ok", f"uv {uv}, Python {py}")
        if uv
        else Check(
            "computer",
            "uv",
            "warn",
            f"no uv on the PATH (Python {py})",
            "docs.astral.sh/uv (to install and update glossator)",
        )
    )
    g = version_of(["git", "--version"])
    if not g:
        out.append(Check("computer", "git", "fail", "no git", "install git"))
    else:
        name, email = identity(library if is_repo(library) else None)
        if name and email:
            out.append(Check("computer", "git", "ok", f"git {g}, your name and email address set for commits"))
        else:
            out.append(
                Check(
                    "computer",
                    "git",
                    "fail",
                    f"git {g}, but no name or email address for commits (the library's commits need them)",
                    'git config --global user.name "Your Name" && git config --global user.email you@example.org',
                )
            )
    missing = [t for t in ("pdftotext", "pdftoppm", "pdfinfo") if not shutil.which(t)]
    out.append(
        Check(
            "computer",
            "poppler",
            "fail",
            f"poppler: {', '.join(missing)} missing",
            "apt install poppler-utils, or brew install poppler",
        )
        if missing
        else Check("computer", "poppler", "ok", "poppler: pdftotext, pdftoppm, pdfinfo")
    )
    lfs = lfs_version()
    is_light = is_repo(library) and light(library)
    if is_repo(library) and lfs_used(library):
        if lfs is None or lfs < (3, 0):
            out.append(
                Check(
                    "computer",
                    "git-lfs",
                    "warn" if is_light else "fail",
                    "no Git LFS: this light clone syncs records; adding PDFs here needs Git LFS 3.0 or later"
                    if is_light
                    else "the library keeps its PDFs in Git LFS: Git LFS 3.0 or later is needed",
                    "apt or brew install git-lfs (git-lfs.com)",
                )
            )
        elif not lfs_hooks(library):
            out.append(
                Check(
                    "computer",
                    "git-lfs",
                    "warn" if is_light else "fail",
                    f"Git LFS {lfs[0]}.{lfs[1]}, but its hooks are not in library/ (a push would lack the PDFs)",
                    f"git -C {shlex.quote(str(library))} lfs install --local",
                )
            )
        else:
            out.append(
                Check("computer", "git-lfs", "ok", f"Git LFS {lfs[0]}.{lfs[1]}, its hooks installed in library/")
            )
    else:
        out.append(
            Check(
                "computer",
                "git-lfs",
                "ok" if lfs else "skip",
                f"Git LFS {lfs[0]}.{lfs[1]}" if lfs else "no Git LFS (optional: PDFs in plain git)",
            )
        )
    out.append(claude_check())
    from .webapp import NODE_MIN, current, node_version, web_dir

    node = node_version()
    if node is None:
        out.append(
            Check(
                "computer",
                "node",
                "warn",
                "no Node: the reading room needs Node 20.19 or later",
                "nodejs.org (the rest works without it)",
            )
        )
    elif node[:2] < NODE_MIN:
        out.append(
            Check(
                "computer",
                "node",
                "warn",
                f"Node {'.'.join(map(str, node))}: the reading room needs 20.19 or later",
                "nodejs.org (the rest works without it)",
            )
        )
    else:
        out.append(Check("computer", "node", "ok", f"Node {'.'.join(map(str, node))}"))
    if web_dir() is not None:
        if current():
            out.append(Check("computer", "web-app", "ok", "web/out/: the reading room, built and current"))
        elif (web_dir() / "out" / "index.html").is_file():
            out.append(Check("computer", "web-app", "warn", "web/out/ is older than web/", "glossator web"))
        else:
            out.append(
                Check(
                    "computer",
                    "web-app",
                    "warn",
                    "web/out/: the reading room is not built (glossator serve shows the plain page)",
                    "glossator web",
                )
            )
    return out


def claude_check() -> Check:
    v = version_of(["claude", "--version"])
    if v is None:
        return Check(
            "computer",
            "claude",
            "fail",
            "no Claude Code: the agents (curation, triage, questions) need it",
            "claude.com/claude-code",
        )
    try:
        r = subprocess.run(["claude", "auth", "status", "--json"], capture_output=True, text=True, timeout=30)
        status = json.loads(r.stdout) if r.returncode == 0 else {}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        status = {}
    if status.get("loggedIn"):
        return Check(
            "computer", "claude", "ok", f"Claude Code {v}, signed in ({status.get('authMethod', 'signed in')})"
        )
    import os

    if os.environ.get("ANTHROPIC_API_KEY"):
        return Check("computer", "claude", "ok", f"Claude Code {v}, an API key in ANTHROPIC_API_KEY")
    if not status:
        return Check(
            "computer", "claude", "warn", f"Claude Code {v}: its sign-in could not be read", "claude auth status"
        )
    return Check("computer", "claude", "fail", f"Claude Code {v}, not signed in", "claude auth login")


# --------------------------------------------------------------------------- the library


def library_checks(library: Path, build_dir: Path, offline: bool) -> list[Check]:
    from .paths import is_demo
    from .start import bibliography_names, join_line, watched

    q = shlex.quote(str(library))
    out = []
    if is_demo(library):
        return [Check("library", "library", "ok", f"{library}: the repository's demo (shown, never synced)")]
    names = bibliography_names(library)
    if not is_repo(library):
        if names:
            out.append(
                Check(
                    "library",
                    "library",
                    "fail",
                    f"{library}: bibliographies ({', '.join(names)}) but not in git",
                    "glossator init (makes this folder the library's repository, its files committed as they are)",
                )
            )
        elif library.is_dir() and any(library.iterdir()):
            out.append(
                Check(
                    "library",
                    "library",
                    "fail",
                    f"{library} holds files but no library (no bibliography, not a git repository)",
                    f"mv {q} {q}.old, then glossator init",
                )
            )
        else:
            out.append(
                Check(
                    "library",
                    "library",
                    "fail",
                    f"{library}: no library yet",
                    "glossator init (a new library), or glossator join HOST:PATH (an existing one)",
                )
            )
        return out
    origin = origin_url(library)
    if head(library) is None:
        fix = f"mv {q} {q}.old, then glossator join {shlex.quote(origin)}" if origin else "glossator init"
        out.append(Check("library", "library", "fail", f"{library}: no commit yet (a setup that stopped?)", fix))
        return out
    bad = []
    for n in names:
        try:
            cfg = json.loads((library / n / "biblio.json").read_text(encoding="utf-8"))
            if not cfg.get("profile") or not cfg.get("title"):
                bad.append(f"{n}/biblio.json (profile and title needed)")
        except ValueError as e:
            bad.append(f"{n}/biblio.json ({e})")
        if not (library / n / "PROFILE.md").is_file():
            bad.append(f"{n}/PROFILE.md missing")
    for f in ("library.toml", "inbox/watch.toml"):
        if (library / f).is_file():
            try:
                tomllib.loads((library / f).read_text(encoding="utf-8"))
            except tomllib.TOMLDecodeError as e:
                bad.append(f"{f} ({e})")
    if not names:
        out.append(Check("library", "library", "fail", f"{library}: no bibliography", "glossator bibs add NAME"))
    elif bad:
        out.append(Check("library", "library", "fail", "not readable: " + "; ".join(bad), "fix these files"))
    else:
        out.append(
            Check(
                "library",
                "library",
                "ok",
                f"{plural(len(names), 'bibliography', 'bibliographies')} ({', '.join(names)}): biblio.json and "
                "PROFILE.md readable",
            )
        )

    here = remote.Shell()
    cron = remote.cron_entry(here, library)
    # what the original's own tip names (as last fetched), else HEAD's: a clone that just followed reads its new one
    upstream = origin is not None and git(library, "rev-parse", "--verify", "-q", "@{u}").returncode == 0
    named = original_at(library, "@{u}" if upstream else "HEAD")
    if origin is None:
        if config(library, "receive.denyCurrentBranch") == "updateInstead":
            out.append(Check("library", "role", "ok", "the original: accepts the others' pushes"))
        else:
            out.append(
                Check(
                    "library",
                    "role",
                    "fail",
                    "the original, but it refuses the others' pushes",
                    f"git -C {q} config receive.denyCurrentBranch updateInstead",
                )
            )
        changed = [x for x in dirty(library) if not x.startswith("??")]
        if changed:
            out.append(
                Check(
                    "library",
                    "clean",
                    "fail",
                    f"{plural(len(changed), 'uncommitted change')} in the original's library: the others' pushes are "
                    "refused until they are committed",
                    f"git -C {q} status, then commit them",
                )
            )
        if named and named != acknowledged(library):
            out.append(
                Check(
                    "library",
                    "moved",
                    "warn",
                    f"library.toml names {named} as the original, and this computer has no origin: two originals?",
                    f"glossator follow {shlex.quote(named)} (if that one is the original)",
                )
            )
        if lfs_used(library):
            out.append(
                Check("library", "lfs-transfer", "ok", "git-lfs-transfer here: the others fetch the PDFs over ssh")
                if shutil.which("git-lfs-transfer")
                else Check(
                    "library",
                    "lfs-transfer",
                    "warn",
                    "no git-lfs-transfer here: the other computers cannot fetch the PDFs over ssh",
                    "github.com/charmbracelet/git-lfs-transfer",
                )
            )
        out += cron_checks(cron)
    else:
        try:
            address = Address.parse(origin)
        except ValueError:
            address = None
        out.append(Check("library", "role", "ok", f"a clone of {origin}"))
        if config(library, "receive.denyCurrentBranch") == "updateInstead":
            out.append(
                Check(
                    "library",
                    "accepts",
                    "warn",
                    "this clone accepts pushes (an earlier original?): a clone receives none",
                    f"git -C {q} config --unset receive.denyCurrentBranch",
                )
            )
        if named and named != acknowledged(library) and not (address and address.same(named)):  # not followed yet
            out.append(
                Check(
                    "library",
                    "moved",
                    "fail",
                    f"the original moved: library.toml names {named}, this computer follows {origin}",
                    f"glossator follow {shlex.quote(named)}",
                )
            )
        if cron:
            out.append(
                Check(
                    "library",
                    "inbox-cron",
                    "fail",
                    "this computer runs this library's daily inbox run: only the original should",
                    "glossator inbox stop",
                )
            )
        else:
            out.append(Check("library", "inbox-cron", "ok", "no daily inbox run here (the original runs it)"))
        if offline or address is None:
            out.append(Check("library", "reach", "skip", "the original not checked (--offline)"))
        else:
            why = remote.reachable(address)
            if why:
                out.append(
                    Check(
                        "library",
                        "reach",
                        "fail",
                        f"{address.name} not reached over ssh ({why})",
                        f"ssh {shlex.quote(address.target)} true",
                    )
                )
            else:
                git(library, "fetch", "-q", "origin", timeout=120)
                out.append(Check("library", "reach", "ok", f"{address.name} reached over ssh"))
                theirs = address.shell().git(address.remote_path, "remote", "get-url", "origin").stdout.strip()
                if theirs and Address.parse(theirs).path.rstrip("/") == str(library):
                    out.append(
                        Check(
                            "library",
                            "loop",
                            "fail",
                            f"origins in a loop: {origin} follows this computer, which follows it",
                            "glossator promote, on the computer that should be the original",
                        )
                    )
                if lfs_used(library) and address.host:
                    has = remote.has_command(address.shell(), "git-lfs-transfer")
                    out.append(
                        Check("library", "lfs-transfer", "ok", f"git-lfs-transfer on {address.name}")
                        if has
                        else Check(
                            "library",
                            "lfs-transfer",
                            "fail",
                            f"no git-lfs-transfer on {address.name}: the PDFs cannot go over ssh",
                            "install it there: github.com/charmbracelet/git-lfs-transfer",
                        )
                    )
        counts = ahead_behind(library)
        if counts is None:
            b = branch(library)
            out.append(
                Check(
                    "library",
                    "step",
                    "warn",
                    f"origin is {origin} but nothing was fetched from it",
                    f"git -C {q} fetch origin",
                )
                if config(library, f"branch.{b}.remote")
                else Check(
                    "library",
                    "step",
                    "warn",
                    f"{b} follows no branch of the original",
                    f"glossator follow {shlex.quote(origin)}",
                )
            )
        elif counts != (0, 0):
            out.append(
                Check(
                    "library",
                    "step",
                    "warn",
                    f"{plural(counts[0], 'commit')} here not on the original, {counts[1]} there not here",
                    "glossator sync",
                )
            )
        else:
            out.append(Check("library", "step", "ok", "in step with the original (as last fetched)"))
    if lfs_used(library):
        n = lfs_placeholders(library)
        if n and light(library):
            out.append(
                Check(
                    "library",
                    "lfs-files",
                    "ok",
                    f"a light clone: {plural(n, 'file')} in Git LFS {'stays a placeholder' if n == 1 else 'stay placeholders'}"
                    " (glossator join --full downloads them)",
                )
            )
        elif n and origin is None:
            out.append(
                Check(
                    "library",
                    "lfs-files",
                    "warn",
                    f"{plural(n, 'file')} in Git LFS only placeholders on the original",
                    f"git -C {q} lfs checkout (once a clone that has them sent them: git lfs push --all origin, there)",
                )
            )
        elif n:
            out.append(
                Check(
                    "library",
                    "lfs-files",
                    "warn",
                    f"{plural(n, 'file')} in Git LFS not downloaded here",
                    f"git -C {q} lfs pull",
                )
            )
    if (library / "inbox" / "watch.toml").is_file():
        try:
            unwatched = [n for n in names if n not in watched(library)]
        except Exception:  # noqa: BLE001 - reported above as not readable
            unwatched = []
        empty = []
        try:
            for w in tomllib.loads((library / "inbox" / "watch.toml").read_text(encoding="utf-8")).get("watch", []):
                if not w.get("queries") and not w.get("authors"):
                    empty.append(w.get("bib", "?"))
        except tomllib.TOMLDecodeError:
            pass
        if unwatched or empty:
            what = "; ".join(
                x
                for x in (
                    f"no watch for {', '.join(unwatched)}" if unwatched else "",
                    f"no query nor author for {', '.join(empty)}" if empty else "",
                )
                if x
            )
            out.append(
                Check(
                    "library",
                    "inbox-queries",
                    "warn",
                    f"inbox/watch.toml: {what}",
                    f"edit {shlex.quote(str(library / 'inbox' / 'watch.toml'))} in any text editor",
                )
            )
    try:
        built = json.loads((build_dir / "manifest.json").read_text())
    except (OSError, ValueError):
        built = None
    if built is None:
        out.append(Check("library", "build", "warn", "build/ is not written on this computer", "glossator build"))
    elif built.get("library_head") != head(library):
        out.append(Check("library", "build", "warn", "build/ is older than the library", "glossator build"))
    else:
        out.append(Check("library", "build", "ok", "build/ reflects the library as it is"))
    if origin is None:
        out.append(Check("library", "join", "ok", f"others join with: {join_line(library)}"))
    return out


def plural(n: int, word: str, words: str | None = None) -> str:
    return f"{n} {word if n == 1 else (words or word + 's')}"


def cron_checks(line: str | None) -> list[Check]:
    if not line:
        return [Check("library", "inbox-cron", "warn", "no daily inbox run here", "glossator inbox start --at 07:30")]
    when = remote.cron_time(line)
    fix = f"glossator inbox start --at {when} (writes it again, with full paths)"
    try:
        command = line.rsplit(remote.CRON_TAG, 1)[0].replace("\\%", "%")
        words = shlex.split(command)[5:]
    except ValueError:  # a line written by hand: not checked further
        return [Check("library", "inbox-cron", "warn", f"daily inbox run at {when}, its line not readable", fix)]
    problems = []
    for i, w in enumerate(words):
        if w in ("cd", "--project") and i + 1 < len(words) and not Path(words[i + 1]).exists():
            problems.append(f"{words[i + 1]} is gone")
        if w.startswith("PATH="):
            parts = w[len("PATH=") :].split(":")
            if any(not d or d == "." or not d.startswith("/") for d in parts):
                problems.append("its PATH holds '.' or an empty or relative folder")
    after = words[words.index("&&") + 1 :] if "&&" in words else []
    exe = next((w for w in after if "=" not in w), None)
    if exe and not exe.startswith("/"):
        problems.append(f"it calls {exe} by name (cron's PATH may not find it)")
    elif exe and not Path(exe).exists():
        problems.append(f"{exe} is gone")
    if problems:
        return [Check("library", "inbox-cron", "fail", f"the daily run at {when}: {'; '.join(problems)}", fix)]
    if not any(w.startswith("GLOSSATOR_LIBRARY=") for w in words):
        return [
            Check(
                "library",
                "inbox-cron",
                "warn",
                f"the daily run at {when} is written the way of an earlier glossator (its library not named)",
                fix,
            )
        ]
    return [Check("library", "inbox-cron", "ok", f"daily inbox run at {when}")]


# --------------------------------------------------------------------------- Zotero


def zotero_checks(library: Path, offline: bool) -> list[Check]:
    from . import zotero_web
    from .zotero_setup import base_directory

    key_file = zotero_web.KEY_FILE
    if not key_file.is_file():
        return [Check("zotero", "zotero-key", "skip", "not set up (optional)", "glossator zotero setup")]
    out = []
    if zotero_web.key_file_warning(key_file):
        out.append(
            Check(
                "zotero",
                "zotero-mode",
                "warn",
                f"{key_file} can be read by other accounts",
                f"chmod 600 {shlex.quote(str(key_file))}",
            )
        )
    if offline:
        out.append(Check("zotero", "zotero-key", "skip", f"a key in {key_file}, not checked (--offline)"))
    else:
        try:
            key = key_file.read_text(encoding="utf-8").strip()
            info = zotero_web.verify_key(key)
            lacks = [k for k in ("library", "notes", "write") if not info.get(k)]
            out.append(
                Check(
                    "zotero",
                    "zotero-key",
                    "fail",
                    f"the key lacks {' and '.join(lacks)} access",
                    "zotero.org/settings/keys, then glossator zotero setup",
                )
                if lacks
                else Check(
                    "zotero",
                    "zotero-key",
                    "ok",
                    f"a key in {key_file}: user {info.get('username') or info.get('user_id')}, library, notes and "
                    "write access",
                )
            )
        except zotero_web.ZoteroError as e:
            if e.code in (400, 403, 404):
                out.append(
                    Check(
                        "zotero",
                        "zotero-key",
                        "fail",
                        "zotero.org refuses the key (revoked, or mistyped)",
                        "glossator zotero setup (makes a new one replace it)",
                    )
                )
            else:
                out.append(
                    Check("zotero", "zotero-key", "warn", "Zotero not reached (offline?): the key was not checked")
                )
        except Exception:  # noqa: BLE001 - the network: a warning, never a crash
            out.append(Check("zotero", "zotero-key", "warn", "Zotero not reached (offline?): the key was not checked"))
    installed, base = base_directory()
    if not installed:
        out.append(Check("zotero", "zotero-base", "skip", "no Zotero on this computer"))
    elif base and Path(base).expanduser().resolve() == library.resolve():
        out.append(Check("zotero", "zotero-base", "ok", f"Zotero's base directory: {library}"))
    else:
        out.append(
            Check(
                "zotero",
                "zotero-base",
                "warn",
                f"Zotero's base directory is {base or 'not set'}, not {library}",
                "glossator zotero setup (step 2)",
            )
        )
    return out


# --------------------------------------------------------------------------- glossator doctor


def run_checks(library: Path, build_dir: Path, offline: bool = False) -> list[Check]:
    return computer_checks(library) + library_checks(library, build_dir, offline) + zotero_checks(library, offline)


def doctor(library: Path, build_dir: Path, offline: bool = False, as_json: bool = False, checks=None) -> int:
    checks = run_checks(library, build_dir, offline) if checks is None else checks
    warnings = sum(c.status == "warn" for c in checks)
    problems = sum(c.status == "fail" for c in checks)
    if as_json:
        print(json.dumps({"checks": [asdict(c) for c in checks], "warnings": warnings, "problems": problems}, indent=1))
        return 1 if problems else 0
    from .ask import marks_for, safe_text

    m = marks_for(sys.stdout)
    marks = {"ok": m["ok"], "warn": m["warn"], "fail": m["fail"], "skip": m["same"]}
    group = None
    for c in checks:
        if c.group != group:
            group = c.group
            print(safe_text(GROUPS[group] + (f": {library}" if group == "library" else ""), sys.stdout))
        line = f"  {marks[c.status]} {c.detail}" + (f" {m['fix']} {c.fix}" if c.fix and c.status != "ok" else "")
        print(safe_text(line, sys.stdout))
    print(
        ", ".join(
            x
            for x in (
                f"{warnings} warning{'s' if warnings != 1 else ''}" if warnings else "",
                f"{problems} problem{'s' if problems != 1 else ''}" if problems else "",
            )
            if x
        )
        or "All set."
    )
    return 1 if problems else 0
