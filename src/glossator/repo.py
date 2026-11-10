"""The library's git repository, as the setup commands and `sync` see it: its origin, its state, Git LFS."""

from __future__ import annotations

import re
import shutil
import subprocess
import tomllib
from pathlib import Path

LFS_PATTERNS = ("*.pdf", "*.PDF", "*.png", "*.xlsx", "*.docx")  # what a library keeps in Git LFS
IGNORED = (".work/", "__pycache__/", ".lock", "inbox/inbox.log")  # each computer's own (.lock: any lock file)
SETTINGS = "library.toml"


def git(repo: Path, *args: str, env: dict | None = None, timeout: float | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, errors="replace", env=env, timeout=timeout
    )


def tail(r: subprocess.CompletedProcess, n: int = 0) -> str:
    """What went wrong, in one whole line: git's first `fatal:` or `error:` line, else the last line said."""
    from .remote import tail as one_line

    return one_line(r)


def said(r: subprocess.CompletedProcess) -> str:
    """Everything git said, to match against (never shown cut)."""
    return f"{r.stderr or ''}\n{r.stdout or ''}"


def must(r: subprocess.CompletedProcess, what: str) -> str:
    if r.returncode != 0:
        raise RuntimeError(f"{what}: {tail(r)}")
    return r.stdout


def is_repo(path: Path) -> bool:
    return (path / ".git").exists()


def head(repo: Path) -> str | None:
    r = git(repo, "rev-parse", "HEAD") if is_repo(repo) else None
    return r.stdout.strip() if r is not None and r.returncode == 0 else None


def branch(repo: Path) -> str:
    return git(repo, "symbolic-ref", "--short", "HEAD").stdout.strip() or "main"


def origin_url(repo: Path) -> str | None:
    r = git(repo, "remote", "get-url", "origin") if is_repo(repo) else None
    return r.stdout.strip() if r is not None and r.returncode == 0 else None


def has_upstream(repo: Path) -> bool:
    return is_repo(repo) and git(repo, "rev-parse", "--abbrev-ref", "@{u}").returncode == 0


def is_clone(repo: Path) -> bool:
    """A clone has an origin (the original); the original has none."""
    return origin_url(repo) is not None


ACK = "glossator.original"  # git config: the original library.toml named when this computer last followed it


def acknowledged(repo: Path) -> str | None:
    return config(repo, ACK)


def acknowledge(repo: Path, value: str | None) -> None:
    """Remember the original library.toml names (as of now), so that sync speaks of a move only when it changes."""
    if value:
        git(repo, "config", ACK, value)
    else:
        git(repo, "config", "--unset", ACK)


def light(repo: Path) -> bool:
    """A light clone: its files in Git LFS stay placeholders (`lfs.fetchexclude = *`, set by join --light)."""
    return config(repo, "lfs.fetchexclude") == "*"


def dirty(repo: Path) -> list[str]:
    """`git status --porcelain`'s lines: what is not committed (untracked files included, ignored ones not)."""
    return [x for x in git(repo, "status", "--porcelain").stdout.splitlines() if x.strip()]


def ahead_behind(repo: Path) -> tuple[int, int] | None:
    """The commits here not on the upstream, and those there not here (as last fetched); None without one."""
    r = git(repo, "rev-list", "--left-right", "--count", "HEAD...@{u}")
    if r.returncode != 0:
        return None
    a, b = r.stdout.split()
    return int(a), int(b)


def config(repo: Path, key: str) -> str | None:
    r = git(repo, "config", "--get", key)
    return r.stdout.strip() if r.returncode == 0 else None


def identity(repo: Path | None = None) -> tuple[str | None, str | None]:
    """The name and e-mail git signs commits with, here (the repository's own, else the global ones)."""

    def get(key: str) -> str | None:
        args = ["git", *(["-C", str(repo)] if repo and is_repo(repo) else []), "config", "--get", key]
        r = subprocess.run(args, capture_output=True, text=True)
        return r.stdout.strip() or None

    return get("user.name"), get("user.email")


def set_origin(repo: Path, url: str) -> None:
    """The repository's origin is `url`, and its branch follows the origin's (set without reaching it)."""
    if origin_url(repo) is None:
        must(git(repo, "remote", "add", "origin", url), "git remote add")
    else:
        must(git(repo, "remote", "set-url", "origin", url), "git remote set-url")
    b = branch(repo)
    must(git(repo, "config", f"branch.{b}.remote", "origin"), "git config")
    must(git(repo, "config", f"branch.{b}.merge", f"refs/heads/{b}"), "git config")


def commit_paths(repo: Path, paths: list[str], message: str) -> bool:
    """Commit these paths only (whatever else is staged); False when they hold nothing new."""
    paths = [p for p in paths if (repo / p).exists()]
    if not paths:
        return False
    must(git(repo, "add", "-A", "--", *paths), "git add")
    if git(repo, "diff", "--cached", "--quiet", "--", *paths).returncode == 0:
        return False
    must(git(repo, "commit", "-q", "-m", message, "--", *paths), "git commit")
    return True


# --------------------------------------------------------------------------- Git LFS


def lfs_version() -> tuple[int, int] | None:
    """Git LFS's version on this computer, or None."""
    if not shutil.which("git-lfs"):
        return None
    r = subprocess.run(["git", "lfs", "version"], capture_output=True, text=True)
    m = re.search(r"git-lfs/(\d+)\.(\d+)", r.stdout)
    return (int(m.group(1)), int(m.group(2))) if r.returncode == 0 and m else None


def lfs_used(repo: Path) -> bool:
    attributes = repo / ".gitattributes"
    return attributes.is_file() and "filter=lfs" in attributes.read_text(errors="replace")


def lfs_hooks(repo: Path) -> bool:
    """Are Git LFS's hooks installed in the repository (so that a push sends the files, not their placeholders)?"""
    hook = Path(git(repo, "rev-parse", "--git-path", "hooks/pre-push").stdout.strip() or "none")
    hook = hook if hook.is_absolute() else repo / hook
    return hook.is_file() and "lfs" in hook.read_text(errors="replace")


def lfs_placeholders(repo: Path) -> int:
    """How many files in Git LFS are only placeholders here (not downloaded)."""
    r = git(repo, "lfs", "ls-files") if shutil.which("git-lfs") else None
    if r is not None and r.returncode == 0:
        return sum(1 for ln in r.stdout.splitlines() if re.match(r"^[0-9a-f]+ - ", ln))
    from .util import lfs_oid

    files = git(repo, "ls-files", "-z", "--", *LFS_PATTERNS).stdout.split("\0")
    return sum(1 for f in files if f and lfs_oid(repo / f))


def is_pointer(repo: Path, rev: str, path: str) -> bool:
    r = subprocess.run(["git", "-C", str(repo), "cat-file", "-p", f"{rev}:{path}"], capture_output=True)
    return r.returncode == 0 and r.stdout.startswith(b"version https://git-lfs.github.com/spec/v1")


def lfs_push_problem(repo: Path, base: str = "@{u}") -> str | None:
    """Why the commits not on the origin yet cannot be pushed as they are, or None. Only the files they add or change
    under Git LFS's rules count: a file committed whole (Git LFS missing when it was added) would go into git itself;
    a placeholder needs Git LFS's hooks to send its file. Records and settings push without Git LFS."""
    if not lfs_used(repo):
        return None
    changed = git(repo, "diff", "--name-only", "-z", "--diff-filter=AM", base, "HEAD").stdout.split("\0")
    changed = [c for c in changed if c]
    if not changed:
        return None
    attrs = git(repo, "check-attr", "-z", "filter", "--", *changed).stdout.split("\0")
    tracked = [attrs[i] for i in range(0, len(attrs) - 2, 3) if attrs[i + 2] == "lfs"]
    if not tracked:
        return None
    q = shlex_quote(str(repo))
    whole = [t for t in tracked if not is_pointer(repo, "HEAD", t)]
    if whole:
        names = ", ".join(whole[:3]) + (f" and {len(whole) - 3} more" if len(whole) > 3 else "")
        return (
            f"these commits add files that belong in Git LFS ({names}), committed whole because Git LFS was not "
            f"installed here, so they would go into git itself. Nothing was sent. Install Git LFS (apt or brew "
            f"install git-lfs; git-lfs.com), then: git -C {q} lfs install --local && git -C {q} add --renormalize . "
            f"&& git -C {q} commit -m 'files into Git LFS', then glossator sync"
        )
    if not lfs_hooks(repo):
        return (
            f"these commits add files in Git LFS ({len(tracked)}), and Git LFS's hooks are not installed here, so "
            f"the original would get placeholders without their files. Nothing was sent. Run git -C {q} lfs install "
            "--local (Git LFS: apt or brew install git-lfs), then glossator sync"
        )
    return None


def shlex_quote(s: str) -> str:
    import shlex

    return shlex.quote(s)


def lfs_attributes(repo: Path) -> list[str]:
    """The .gitattributes lines a library needs for Git LFS and does not have."""
    have = (repo / ".gitattributes").read_text().splitlines() if (repo / ".gitattributes").is_file() else []
    want = [f"{p} filter=lfs diff=lfs merge=lfs -text" for p in LFS_PATTERNS]
    return [w for w in want if w not in have]


def missing_ignores(repo: Path) -> list[str]:
    have = (repo / ".gitignore").read_text().splitlines() if (repo / ".gitignore").is_file() else []
    return [x for x in IGNORED if x not in have]


def append_lines(path: Path, lines: list[str]) -> None:
    text = path.read_text() if path.is_file() else ""
    if text and not text.endswith("\n"):
        text += "\n"
    path.write_text(text + "".join(f"{x}\n" for x in lines))


# --------------------------------------------------------------------------- library.toml's `original`


def original_at(repo: Path, rev: str) -> str | None:
    """The address library.toml names as the original, at a commit (None: not named, or no such file)."""
    r = git(repo, "show", f"{rev}:{SETTINGS}")
    if r.returncode != 0:
        return None
    try:
        value = tomllib.loads(r.stdout).get("original")
    except tomllib.TOMLDecodeError:
        return None
    return value if isinstance(value, str) and value else None


def moved_to(repo: Path, before: str | None, after: str | None) -> str | None:
    """The new original's address, when the commits between `before` and `after` move it (library.toml)."""
    if not before or not after or before == after:
        return None
    new = original_at(repo, after)
    return new if new and new != original_at(repo, before) else None


def set_original(repo: Path, address: str) -> bool:
    """Write `original = "<address>"` in library.toml, keeping every other line; False when it already says so."""
    path = repo / SETTINGS
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    line = f"original = {toml_string(address)}  # the computer the others sync with (glossator promote)"
    pattern = re.compile(r"^original\s*=.*$", re.M)
    if pattern.search(text):
        try:
            if tomllib.loads(text).get("original") == address:
                return False
        except tomllib.TOMLDecodeError:
            pass
        text = pattern.sub(lambda _: line, text, count=1)
    else:
        # before any [table], where a bare key belongs
        m = re.search(r"^\[", text, re.M)
        text = (
            text[: m.start()] + line + "\n" + text[m.start() :]
            if m
            else text + ("" if not text or text.endswith("\n") else "\n") + line + "\n"
        )
    path.write_text(text, encoding="utf-8")
    return True


def toml_string(s: str) -> str:
    """A TOML basic string (JSON's escapes are TOML's)."""
    import json

    return json.dumps(s, ensure_ascii=False)
