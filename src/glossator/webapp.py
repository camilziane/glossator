"""`glossator web` builds the reading room (the web app in web/, Next.js) into web/out/, once per computer;
`glossator demo` builds the demo library's index and data, then serves it.

web/out/.glossator-stamp records what it was built from: the commit of web/ (git's tree hash) and the hash of
package-lock.json. A second `glossator web` with the same sources does nothing; `npm ci` runs only when the lock
changed."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from .paths import CHECKOUT
from .repo import git

NODE_MIN = (20, 19)
STAMP = ".glossator-stamp"
MODULES_STAMP = ".glossator-lock"


def web_dir() -> Path | None:
    d = (CHECKOUT / "web") if CHECKOUT else None
    return d if d and (d / "package.json").is_file() else None


def node_version() -> tuple[int, int, int] | None:
    if not shutil.which("node"):
        return None
    r = subprocess.run(["node", "--version"], capture_output=True, text=True)
    m = re.match(r"v?(\d+)\.(\d+)\.(\d+)", r.stdout.strip())
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def lock_hash(web: Path) -> str:
    lock = web / "package-lock.json"
    return hashlib.sha256(lock.read_bytes()).hexdigest()[:16] if lock.is_file() else ""


def sources(web: Path) -> str | None:
    """What web/ is at: its tree in git (None: it has local changes, or it is not in git)."""
    root = web.parent
    r = git(root, "rev-parse", "HEAD:web")
    if r.returncode != 0:
        return None
    if git(root, "status", "--porcelain", "--", "web").stdout.strip():
        return None
    return r.stdout.strip()


def stamp(web: Path) -> dict:
    try:
        return json.loads((web / "out" / STAMP).read_text())
    except (OSError, ValueError):
        return {}


def current(web: Path | None = None) -> bool:
    """Is web/out/ built from web/ as it is?"""
    web = web or web_dir()
    if web is None or not (web / "out" / "index.html").is_file():
        return False
    src = sources(web)
    s = stamp(web)
    if src is None:  # not in git, or changed by hand: compare times
        newest = max(
            (
                p.stat().st_mtime
                for p in web.rglob("*")
                if p.is_file() and not {"out", "node_modules", ".next"} & set(p.relative_to(web).parts)
            ),
            default=0,
        )
        return (web / "out" / "index.html").stat().st_mtime >= newest
    return s.get("web") == src and s.get("lock") == lock_hash(web)


def build_web(force: bool = False, verbose: bool = False, out=None, then: bool = True) -> int:
    out = out or sys.stdout
    web = web_dir()
    if web is None:
        print(
            "error: the reading room's sources (web/) are not in this installation: they come with the repository "
            "(git clone, then glossator web)",
            file=sys.stderr,
        )
        return 1
    have = node_version()
    if have is None or have[:2] < NODE_MIN:
        found = f"Node {'.'.join(map(str, have))}" if have else "no Node"
        print(
            f"error: {found} here: the reading room needs Node {NODE_MIN[0]}.{NODE_MIN[1]} or later (nodejs.org, or brew "
            "install node); the rest of glossator works without it",
            file=sys.stderr,
        )
        return 1
    if not shutil.which("npm"):
        print("error: npm is missing (it comes with Node)", file=sys.stderr)
        return 1
    src = sources(web)
    if not force and current(web):
        print(
            "  · web/out/ is current (built from web/ as it is): nothing to do (--force rebuilds)",
            file=out,
        )
        return 0
    print(f"  ✓ Node {'.'.join(map(str, have))}", file=out)
    env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}
    lock = lock_hash(web)
    modules = web / "node_modules" / MODULES_STAMP
    steps = []
    if not modules.is_file() or modules.read_text().strip() != lock:
        steps.append(("npm ci (the first time: about a minute)", ["npm", "ci", "--no-fund", "--no-audit"]))
    steps.append(("next build", ["npm", "run", "build"]))
    for what, cmd in steps:
        print(f"  {what}…", file=out, flush=True)
        r = subprocess.run(cmd, cwd=web, env=env, capture_output=not verbose, text=True)
        if r.returncode != 0:
            if not verbose:
                print(((r.stdout or "") + (r.stderr or ""))[-3000:], file=sys.stderr)
            print(f"error: {' '.join(cmd)} failed in {web} (glossator web --verbose shows everything)", file=sys.stderr)
            return 1
        if cmd[1] == "ci":
            modules.write_text(lock + "\n")
    (web / "out").mkdir(exist_ok=True)
    (web / "out" / STAMP).write_text(json.dumps({"web": src, "lock": lock}) + "\n")
    print("  ✓ web/out/ built: the reading room", file=out)
    if then:
        print("Next: glossator serve --open", file=out)
    return 0


# --------------------------------------------------------------------------- glossator demo


def demo_home() -> Path | None:
    d = (CHECKOUT / "demo") if CHECKOUT else None
    return d if d and (d / "library").is_dir() else None


def demo(port: int, open_browser: bool, rebuild: bool) -> int:
    """Build the demo's index and data when they are missing (or with --rebuild), the reading room when Node is here and
    it is not built, then serve the demo (this command keeps running: Ctrl+C stops it)."""
    home = demo_home()
    if home is None:
        print("error: the demo comes with the repository: git clone it, then glossator demo", file=sys.stderr)
        return 1
    env = {**os.environ, "GLOSSATOR_HOME": str(home)}
    env.pop("GLOSSATOR_LIBRARY", None)
    me = [sys.executable, "-m", "glossator"]
    if rebuild or not (home / "build" / "manifest.json").is_file():
        print("Building the demo's index and data (the first time, the search model downloads once)…", flush=True)
        r = subprocess.run([*me, "build"], env=env)
        if r.returncode != 0:
            print("error: the demo's build failed (above)", file=sys.stderr)
            return r.returncode
    else:
        print(f"  · {home.name}/build/ is built (glossator demo --rebuild builds it again)")
    if not current() and node_version() and node_version()[:2] >= NODE_MIN:
        if build_web(then=False):
            return 1
    elif not current():
        print("  ! no reading room built here (it needs Node 20.19 or later: glossator web); the plain page is served")
    args = [*me, "serve", "--port", str(port)] + (["--open"] if open_browser else [])
    sys.stdout.flush()
    os.execvpe(args[0], args, env)
    return 0  # not reached
