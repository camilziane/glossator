"""Where things are: the package's own files, the bibliographies (library/), what `build` writes (build/)."""

from __future__ import annotations

import os
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
# The folder that holds library/ and build/: GLOSSATOR_HOME, else this checkout (src/glossator -> the repository),
# else the current directory (an installed package).
CHECKOUT = PACKAGE.parents[1] if (PACKAGE.parents[1] / "pyproject.toml").is_file() else None
ROOT = Path(os.environ.get("GLOSSATOR_HOME") or CHECKOUT or Path.cwd()).resolve()
# The bibliographies: library/, a git repository of its own (GLOSSATOR_LIBRARY points the tool at another one).
LIBRARY = Path(os.environ.get("GLOSSATOR_LIBRARY") or ROOT / "library").resolve()
# What `build` writes, git-ignored: the page (index.html), the search index (index.sqlite), the Zotero library
# (zotero.rdf), manifest.json.
BUILD = ROOT / "build"
SITE_NAME = "index.html"


def shown(path: Path) -> str:
    """A path as a message names it: from the current directory when it is below it, else in full."""
    try:
        rel = Path(path).resolve().relative_to(Path.cwd().resolve())
    except ValueError:
        return str(path)
    return rel.as_posix() if rel.parts else "."


def is_demo(path: Path) -> bool:
    """Is this folder the repository's demo (or inside it)? Its library is shown, never changed by setup."""
    if CHECKOUT is None:
        return False
    try:
        Path(path).resolve().relative_to((CHECKOUT / "demo").resolve())
    except ValueError:
        return False
    return True
