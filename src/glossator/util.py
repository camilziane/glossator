"""Small helpers: errors, dates, JSON, files, text folding and the numbers of a text."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

STOPWORDS = set(
    "a an the of and or for from with without in on at to by via into onto using use toward towards "
    "based its their our new is are be as that this these those".split()
)


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def today() -> str:
    return dt.date.today().isoformat()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


LFS_SPEC = b"version https://git-lfs.github.com/spec/v1"


def lfs_oid(path: Path) -> str | None:
    """The SHA-256 of the file a Git LFS placeholder stands for, when `path` is one: a clone that has not
    downloaded a PDF holds this short text in its place."""
    try:
        with path.open("rb") as fh:
            head = fh.read(512)
    except OSError:
        return None
    m = re.search(rb"^oid sha256:([0-9a-f]{64})$", head, re.M) if head.startswith(LFS_SPEC) else None
    return m.group(1).decode() if m else None


def git_head(repo: Path) -> str | None:
    """The commit a repository of its own is at (None: not one, or no commit yet)."""
    if not (repo / ".git").exists():
        return None
    r = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", check=False)


def fold(s: str, digits: bool = False) -> str:
    """ASCII, lowercase, letters only (and digits if asked): 'de la Cruz' -> 'delacruz'."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]" if digits else r"[^a-z]", "", s)


def alnum(s: str) -> str:
    """Letters and digits only, any script: how quotes are compared with the paper's text."""
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", s).lower())


NUMBER = r"\d+(?:\.\d+)?"


def number_text(text: str) -> tuple[str, str]:
    """A text with '.89' written 0.89, as is and with thousands joined ('12,500' -> 12500)."""
    t = re.sub(r"(?<![\d.])\.(\d)", r"0.\1", unicodedata.normalize("NFKC", text))
    return t, re.sub(r"(?<=\d)[,    ](?=\d{3}(?!\d))", "", t)


def numbers_in(text: str, both: bool = False) -> set[str]:
    """The numbers of a text; `both` also keeps the pieces of a number written with thousands separators."""
    t, joined = number_text(text)
    return set(re.findall(NUMBER, joined)) | (set(re.findall(NUMBER, t)) if both else set())


def percents_in(text: str) -> set[str]:
    t, joined = number_text(text)
    return set(re.findall(rf"({NUMBER})\s*%", joined)) | set(re.findall(rf"({NUMBER})\s*%", t))


def norm_doi(s: str) -> str:
    return re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", s.strip(), flags=re.I)


def title_words(title: str) -> list[str]:
    words = [fold(w) for w in re.findall(r"[^\W\d_]+", title)]
    return [w for w in words if len(w) >= 3 and w not in STOPWORDS]


def title_score(title: str, text: str) -> float:
    words = [w for w in title_words(title) if len(w) >= 4]
    if not words:
        return 1.0
    hay = fold(text, digits=True)
    return sum(w in hay for w in words) / len(words)
