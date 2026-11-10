"""A bibliography (a folder of library/ with a biblio.json), its records, and the files its curators share."""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path

from . import profiles
from .paths import LIBRARY
from .profiles import Profile, ProfileError
from .records import Vocabulary
from .util import die, dump_json, load_json, write_atomic


@dataclass(frozen=True)
class Bibliography:
    """One bibliography: its folders, its profile (a built-in or a plugin of its library, glossator.profiles) and
    the record format that follows."""

    root: Path

    @classmethod
    def at(cls, root: Path) -> Bibliography:
        biblio = cls(root.resolve())
        try:
            _ = biblio.plugin  # the profile is read now: a missing or broken plugin stops here
        except ProfileError as e:
            die(f"bibliography {biblio.name} ({biblio.config_file}): {e}")
        return biblio

    @property
    def name(self) -> str:
        return self.root.name

    @property
    def config_file(self) -> Path:
        return self.root / "biblio.json"

    @cached_property
    def config(self) -> dict:
        return json.loads(self.config_file.read_text(encoding="utf-8"))

    @property
    def profile(self) -> str:
        return self.config["profile"]

    @property
    def title(self) -> str:
        return self.config["title"]

    @property
    def scope(self) -> str:
        """What goes in it, in a few sentences (biblio.json's `scope`): what the inbox's triage reads."""
        return self.config.get("scope", "")

    @property
    def short(self) -> str:
        """The name of its tab on the page."""
        return self.config.get("short", self.title)

    @property
    def articles(self) -> Path:
        return self.root / "articles"

    @property
    def work(self) -> Path:
        return self.root / ".work"

    @cached_property
    def plugin(self) -> Profile:
        """Its profile: a built-in, or the plugin library/profiles/<profile>/profile.py of the library it is in."""
        return profiles.get(self.config.get("profile"), self.root.parent)

    @property
    def lock(self) -> Path:
        return self.root / self.plugin.lock

    @cached_property
    def format(self) -> dict:
        """The exact shape of its record.json: `check` refuses a missing or an extra key anywhere."""
        return self.plugin.model

    @cached_property
    def vocab(self) -> dict[str, Vocabulary]:
        """Every vocabulary its records use: its profile's, the base's, its figure roles."""
        return self.plugin.vocab

    @property
    def kind_vocab(self) -> str:
        return self.plugin.kind_vocab

    @property
    def figure_fields(self) -> dict[str, str]:
        """Its figure roles, and the record section whose `figure` field names each."""
        return self.plugin.figure_fields


def bibliographies() -> list[Bibliography]:
    """Every bibliography: the folders of library/ that hold a biblio.json, by their profile's order, then by name
    (none when library/ is empty)."""
    if not LIBRARY.is_dir():
        return []
    found = [Bibliography.at(p) for p in LIBRARY.iterdir() if p.is_dir() and (p / "biblio.json").is_file()]
    return sorted(found, key=lambda b: (b.plugin.order, b.name))


def pick_bibliography(argv: list[str]) -> tuple[Bibliography | None, list[str]]:
    """The bibliography a command line names (--bib NAME anywhere), else GLOSSATOR_ROOT, else the one the current
    directory is in; and the command line without --bib."""
    rest, name, i = [], None, 0
    while i < len(argv):
        if argv[i] == "--bib" and i + 1 < len(argv):
            name, i = argv[i + 1], i + 2
            continue
        if argv[i].startswith("--bib="):
            name = argv[i].split("=", 1)[1]
        else:
            rest.append(argv[i])
        i += 1
    if name is not None:
        names = [b.name for b in bibliographies()]
        if name not in names:
            die(f"--bib {name}: no such bibliography ({' | '.join(names)})")
        return Bibliography.at(LIBRARY / name), rest
    if os.environ.get("GLOSSATOR_ROOT"):
        return Bibliography.at(Path(os.environ["GLOSSATOR_ROOT"])), rest
    here = Path.cwd().resolve()
    for d in (here, *here.parents):
        if d.parent == LIBRARY and (d / "biblio.json").is_file():
            return Bibliography.at(d), rest
    return None, rest


@dataclass
class Collection:
    """Every readable record of a bibliography, with the indexes the pages and checks share, and what its profile
    collects across its articles (`shared`, e.g. a registry its records point to)."""

    biblio: Bibliography
    recs: dict[str, dict]
    doi2key: dict[str, str]
    shared: dict = field(default_factory=dict)


def collection(biblio: Bibliography) -> Collection:
    recs = {}
    for d in article_dirs(biblio):
        try:
            rec = load_json(d / "record.json")
        except (OSError, ValueError):
            continue
        if isinstance(rec, dict) and rec.get("key") == d.name:
            recs[d.name] = rec
    doi2key = {}
    for k, rec in recs.items():
        doi = (rec.get("bib") or {}).get("doi")
        if isinstance(doi, str):
            doi2key[doi.lower()] = k
    collect = biblio.plugin.collect
    return Collection(biblio, recs, doi2key, collect(biblio) if collect else {})


@contextlib.contextmanager
def locked(biblio):
    """Serialise the writes shared by parallel curators (new folders, what a profile keeps for the whole
    bibliography)."""
    biblio.lock.parent.mkdir(parents=True, exist_ok=True)
    with biblio.lock.open("w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def article_dirs(biblio) -> list[Path]:
    return sorted(p for p in biblio.articles.iterdir() if p.is_dir()) if biblio.articles.exists() else []


def open_article(biblio, key: str) -> tuple[Path, dict]:
    folder = biblio.articles / key
    if not (folder / "record.json").exists():
        die(f"articles/{key}/record.json not found (run: new --doi ...)")
    return folder, load_json(folder / "record.json")


def save_record(folder: Path, rec: dict) -> None:
    write_atomic(folder / "record.json", dump_json(rec))


def workdir(biblio, key: str) -> Path:
    d = biblio.work / key
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve_pdf(folder: Path, rel: str | None) -> Path:
    pdf = (folder / (rel or "paper.pdf")).resolve()
    if folder.resolve() not in pdf.parents or pdf.suffix.lower() != ".pdf" or not pdf.is_file():
        die(f"{rel}: not a PDF of this article (paper.pdf or supplementary/<name>.pdf)")
    return pdf
