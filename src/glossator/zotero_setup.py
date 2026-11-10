"""`glossator zotero setup`: your Zotero library follows the bibliographies.

1. The key: the page where you make it opens, the key is read without showing it (or from stdin with
   --key-stdin, never from the command line), checked against Zotero's web API (one read-only call) and kept in
   the key file, readable by you only, out of any git repository.
2. The base directory: Zotero links the files by paths relative to its "Linked Attachment Base Directory", which
   is this computer's library/ folder: the path is printed (and copied), and Zotero's own settings are read, never
   written, to see that it is set.
3. A dry run of the first sync, changing nothing."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import webbrowser
from collections.abc import Callable
from pathlib import Path

from . import zotero_web
from .ask import Asker, Stop
from .repo import git

KEY_PAGE = "https://www.zotero.org/settings/keys/new"
KEY_RE = re.compile(r"[A-Za-z0-9]{24}")
PREF = re.compile(r'user_pref\("extensions\.zotero\.baseAttachmentPath",\s*"((?:[^"\\]|\\.)*)"\);')


# --------------------------------------------------------------------------- the key


def check_key(key: str) -> str | None:
    return None if KEY_RE.fullmatch(key) else "this is not a Zotero key (24 letters and digits)"


class Refused(Stop):
    """zotero.org does not know the key (HTTP 400, 403 or 404): revoked, or mistyped."""


def verify(key: str) -> dict:
    """What Zotero says the key may do; a Stop that says why when it cannot be checked."""
    try:
        got = zotero_web.verify_key(key)
    except zotero_web.ZoteroError as e:
        if e.code in (400, 403, 404):
            raise Refused(
                f"zotero.org refuses this key (revoked, or mistyped): make a new one at {KEY_PAGE}, then glossator "
                "zotero setup again. Nothing was written.",
                1,
            ) from None
        raise Stop(f"zotero.org answered {e}: nothing written; setup again later", 1) from None
    except (urllib.error.URLError, OSError) as e:
        raise Stop(
            f"zotero.org not reached ({getattr(e, 'reason', e)}): nothing written; setup again when online", 1
        ) from None
    lacks = [k for k in ("library", "notes", "write") if not got.get(k)]
    if lacks:
        raise Stop(
            f"this key lacks {' and '.join(lacks)} access: edit it on zotero.org/settings/keys (or make another), "
            "then setup again. Nothing written.",
            1,
        )
    return got


def who(info: dict) -> str:
    return f"user {info.get('username') or '?'} ({info.get('user_id')})"


def inside_git(path: Path) -> bool:
    folder = path.parent
    while not folder.exists():
        folder = folder.parent
    return git(folder, "rev-parse", "--is-inside-work-tree").stdout.strip() == "true"


def store_key(path: Path, key: str) -> None:
    """Write the key, readable by its owner only, in a folder only its owner may enter when it is made here."""
    if not path.parent.exists():
        path.parent.mkdir(parents=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".zotero-key.")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(key + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    os.chmod(path, 0o600)


def open_page(asker: Asker, url: str, browser: bool) -> None:
    headless = bool(os.environ.get("SSH_CONNECTION")) or (
        sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    )
    if browser and not headless and asker.interactive:
        try:
            if webbrowser.open(url):
                asker.say(f"   Opening {url} in your browser…")
                return
        except webbrowser.Error:
            pass
    asker.say(f"   Open it on any device: {url}")


# --------------------------------------------------------------------------- the base directory


def zotero_prefs(home: Path | None = None) -> list[Path]:
    """The prefs.js of every Zotero profile of this account (Linux and macOS places)."""
    home = home or Path.home()
    places = [home / ".zotero" / "zotero", home / "Library" / "Application Support" / "Zotero" / "Profiles"]
    return sorted(p for place in places if place.is_dir() for p in place.glob("*/prefs.js"))


def base_directory(home: Path | None = None) -> tuple[bool, str | None]:
    """(Zotero is installed here, the base directory its settings hold or None)."""
    prefs = zotero_prefs(home)
    for p in prefs:
        m = PREF.search(p.read_text(encoding="utf-8", errors="replace"))
        if m:
            try:
                return True, json.loads(f'"{m.group(1)}"')  # a JavaScript string: JSON's escapes
            except ValueError:
                return True, m.group(1)
    return bool(prefs), None


def copy_to_clipboard(text: str) -> bool:
    """Copy with the first clipboard tool found; False when there is none (never an error)."""
    tools = [["pbcopy"]]
    if os.environ.get("WAYLAND_DISPLAY"):
        tools.append(["wl-copy"])
    if os.environ.get("DISPLAY"):
        tools += [["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]]
    for tool in tools:
        if shutil.which(tool[0]):
            try:
                if subprocess.run(tool, input=text, text=True, timeout=5).returncode == 0:
                    return True
            except (OSError, subprocess.TimeoutExpired):
                continue
    return False


def check_base(asker: Asker, library: Path, home: Path | None = None) -> bool:
    """Say whether Zotero's base directory is this library; True when it is (or Zotero is not here)."""
    installed, base = base_directory(home)
    if not installed:
        asker.mark("same", "no Zotero on this computer: set the base directory where you open Zotero")
        return True
    if base is None:
        asker.mark("same", "Zotero's base directory is not set yet (Zotero writes its settings when it quits)")
        return False
    if Path(base).expanduser().resolve() == library.resolve():
        asker.mark("ok", f"Zotero's base directory is {library} (read from its settings)")
        return True
    asker.mark("warn", f"Zotero's base directory is {base}, not {library}: the linked files would not open")
    return False


# --------------------------------------------------------------------------- glossator zotero setup


def setup(asker: Asker, library: Path, a, dry_run: Callable[[], int] | None = None, home: Path | None = None) -> int:
    key_file = zotero_web.KEY_FILE
    collection, _tag = zotero_web.names()
    if a.check:
        return check(asker, library, key_file, home)
    if asker.interactive:
        asker.say("Zotero, optional: your Zotero library follows the bibliographies (a collection")
        asker.say(f'"{collection}", one sub-collection per bibliography, each article with its summary as a note')
        asker.say("and its files linked, never uploaded). It needs a key of your zotero.org account on this computer.")
        asker.say()
    if inside_git(key_file):
        raise Stop(
            f"{key_file} is inside a git repository: keep the key out of git. Point GLOSSATOR_ZOTERO_KEY at a file "
            "outside any repository and export it in your shell profile; the daily run needs it too",
            1,
        )
    have = zotero_web.read_key(key_file)
    changed = False
    info = None
    dead = False
    if have and not a.key_stdin:
        try:
            info = verify(have) if not check_key(have) else None
        except Refused:
            dead = True
            asker.mark("warn", f"the key in {key_file} does not work any more (revoked, or mistyped): make a new one")
        if info:
            asker.mark("same", f"the key in {key_file} works: {who(info)}")
    if info is None:
        asker.say("1. The key. On zotero.org, make one with these three boxes ticked:")
        asker.say("     Allow library access · Allow notes access · Allow write access")
        if not a.key_stdin:
            open_page(asker, KEY_PAGE, not a.no_browser)
        key = sys.stdin.readline().strip() if a.key_stdin else asker.secret("Paste the key (it does not show)")
        if check_key(key):
            raise Stop(f"{check_key(key)}: nothing written", 2)
        info = verify(key)
        asker.mark("ok", f"it works: {who(info)}, with library, notes and write access")
        if have and have != key and not dead:
            if not asker.replace(f"Replace the key in {key_file} with this one?"):
                raise Stop("the key was kept", 0)
        if have != key:
            if asker.dry_run:
                asker.say("Dry run: the key was not stored. Run again without --dry-run.")
                return 0
            else:
                store_key(key_file, key)
                changed = True
                asker.mark("ok", f"kept in {key_file}, readable by you only, out of git")
        else:
            asker.mark("same", f"the key in {key_file} is this one")
    if zotero_web.key_file_warning(key_file) and not asker.dry_run:
        os.chmod(key_file, 0o600)
        asker.mark("ok", f"{key_file}: made readable by you only")

    try:
        asker.say()
        asker.say("2. Where Zotero finds the files, on each computer where you open Zotero. In Zotero:")
        asker.say("     Settings → Advanced → Files and Folders → Linked Attachment Base Directory → Choose…")
        copied = copy_to_clipboard(str(library))
        asker.say(f"   and choose this folder{' (copied to the clipboard)' if copied else ''}:")
        asker.say(f"     {library}")
        asker.say("   If Zotero offers to update the existing attachments, say yes.")
        if not check_base(asker, library, home) and asker.interactive:
            got = (
                asker._line(
                    "Press Enter once it is set and Zotero is closed (it saves its settings when it quits); s: skip: "
                )
                .strip()
                .lower()
            )
            if got != "s":
                check_base(asker, library, home)

        asker.say()
        if dry_run and changed and asker.confirm("3. See what the first sync would do, changing nothing?", True):
            dry_run()
        asker.say()
        asker.say("Done.")
        asker.next_steps(
            [("glossator zotero sync", "do it; then the daily inbox run and glossator build --zotero keep it in step")]
        )
    except (KeyboardInterrupt, Stop) as e:  # Ctrl+C, or the end of input at a question
        if isinstance(e, Stop) and e.code != 130:
            raise
        done = f"the key is stored in {key_file} and works" if (changed or info) else "nothing changed"
        raise Stop(
            f"interrupted: {done}; the rest (Zotero's base directory, the dry run) was not finished: glossator "
            "zotero setup again finishes it",
            130,
        ) from None
    return 0


def check(asker: Asker, library: Path, key_file: Path, home: Path | None = None) -> int:
    """--check: the key works, its file is private, the base directory is set; nothing written."""
    have = zotero_web.read_key(key_file)
    if not have:
        raise Stop(f"no key in {key_file}: glossator zotero setup", 1)
    status = 0
    try:
        info = verify(have)
        asker.mark("ok", f"the key in {key_file} works: {who(info)}")
    except Refused as e:
        asker.mark("fail", e.message)
        status = 1
    except Stop:
        asker.mark("warn", "Zotero not reached (offline?): the key was not checked")
    if zotero_web.key_file_warning(key_file):
        asker.mark("warn", f"{key_file} can be read by other accounts", f"chmod 600 {key_file}")
        status = 1
    if not check_base(asker, library, home):
        status = 1
    return status
