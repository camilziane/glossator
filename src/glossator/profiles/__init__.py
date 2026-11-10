"""Profiles: the record formats of bibliographies, as plugins.

A bibliography's `biblio.json` names its profile (`"profile": "ml"`). The profile says what a record holds beyond
the base every record shares (records.py: `bib`, `paper`, `supplementary`, `figures`, `overview`, `open_points`,
`curation`): its own sections and their vocabularies, the skeleton `new` writes, how the article's view and the
bibliography's tables are drawn, what `check` verifies, the Zotero tags, and the PROFILE.md a new bibliography
starts from. Two profiles are built in: `ml` (methods) and `epidemio` (studies), both made by
`reference.reference_profile`, which suits most domains: a few `details` fields, `results`, `quotes`.

A library adds its own profiles as plugins: `library/profiles/<name>/profile.py`, a module that defines
`PROFILE = Profile(...)` (or `PROFILE = reference_profile(...)`) whose `name` is the folder's name. A plugin may keep
its files beside it (its PROFILE.md, a vocabulary.json) and read them from `Path(__file__).parent`.

    # library/profiles/ecology/profile.py
    from pathlib import Path

    from glossator.profiles.reference import reference_profile

    PROFILE = reference_profile(
        name="ecology",
        description="field studies: species, sites, methods and estimates",
        folder="ecology",
        title="Field ecology",
        template=(Path(__file__).parent / "PROFILE.md").read_text(encoding="utf-8"),
        details=[
            ("species", "Species", "the species studied, with their authority"),
            ("sites", "Sites", "where and when: region, habitat, period"),
            ("method", "Method", "how the data were collected: transects, traps, cameras, eDNA"),
        ],
        glance=("species", "sites", "method"),
        section="Study",
        lead="species",
        kinds={"survey": {"label": "Survey", "means": "counts or presence data from the field"}},
    )

A plugin is code: glossator imports it, with your rights, whenever it opens a bibliography of that profile or lists
the profiles (`glossator bibs`, `init`, `--help`). Keep plugins only in a library you own, and read the plugins of a
library you did not write before you open it. A bibliography whose plugin is missing or does not load stops every
command that reads it, with an error naming the bibliography and the plugin.

The API: `Profile` (what a plugin defines), `get(name, library)` (one profile), `available()` (the built-ins and the
library's plugins), `template(name)` and `render_template(name, ...)` (a profile's PROFILE.md), and the command-line
hook `add_commands(sub)` / `run_command(args, biblio)` for the commands a plugin adds (`Profile.commands`). The
building blocks of a plugin are in `glossator.records` (S, I, B, QUOTE, RESULT, todo, quote_skeleton,
result_skeleton, vocabularies, vlabel, is_sentinel, pending), `glossator.render` (val, vals, vword, joined, as_text,
headline_lines, results_blocks, figure_block, quotes_blocks, quote_where, related_item, hub_order, hub_article,
articles_table, kind_table) and `glossator.check` (Report, in_vocab, check_quote, check_metric_value)."""

from __future__ import annotations

import importlib
import importlib.util
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .. import paths
from ..records import HEAD, TAIL, VOCAB, Vocabulary, record_model, vocabularies

BUILTIN = ("ml", "epidemio")
PLUGINS = "profiles"  # the folder of library/ that holds its plugins
PLUGIN_FILE = "profile.py"


class ProfileError(Exception):
    """A profile that does not exist or does not load; the message says which and where."""


@dataclass(frozen=True)
class Profile:
    """A record format. The callables receive the record (a dict), the bibliography's `Collection`
    (bibliography.py: `.biblio`, `.recs`, `.doi2key`, `.shared`) and, for checks, a `Report` (check.py) and
    `texts(key)`, the text of an article's files (None when they are not downloaded on this computer)."""

    name: str  # what biblio.json's "profile" says; a plugin's folder name
    description: str  # one line: what bibliographies of this profile hold
    folder: str  # the folder a new bibliography of this profile gets by default
    title: str  # the title it gets by default
    template: str  # its PROFILE.md, with the markers {{name}} {{title}} {{scope}}
    sections: Mapping[str, Any]  # its own sections of record.json, between `overview` and `open_points`: their shapes
    skeleton: Callable  # (biblio) -> its sections of a new record, each TODO saying what goes there
    kind_vocab: str  # the vocabulary record.kind takes: one of `vocabularies`
    vocabularies: Mapping[str, Mapping]  # name -> {value: {"label", "means"}}, in the order `vocab` prints them
    figure_roles: Mapping[str, Mapping]  # role -> {"section", "label", "means"}: the section (an object with a
    # `figure` field) that names the figure; `crop --role` makes figures/<role>.png
    view: Callable  # (rec, coll) -> (glance, sections): its tiles, and its sections between overview and open points
    hub_tables: Callable  # (coll) -> [(id, title, ("table", head, rows))]: the bibliography's tables
    check: Callable  # (rep, rec, coll, texts) -> None: what `check` verifies in its sections
    check_collection: Callable | None = None  # (rep, coll) -> None: what `check --all` verifies across articles
    tags: Callable | None = None  # (rec, coll) -> [str]: Zotero tags after the kind's
    collect: Callable | None = None  # (biblio) -> dict: what its articles share (Collection.shared), e.g. a registry
    commands: Callable | None = None  # (subparsers) -> None: its commands, each with set_defaults(fn=f(biblio, args))
    hints: Mapping[str, str] = field(
        default_factory=dict
    )  # the base's TODOs it words otherwise: one_line, abstract, read
    lock: str = ".work/.lock"  # the lock file of parallel writes, relative to the bibliography's folder
    order: int = 0  # bibliographies are listed by this, then by name

    def __post_init__(self):
        clash = sorted(set(self.sections) & (set(HEAD) | set(TAIL)))
        if clash:
            raise ProfileError(f"profile {self.name}: {', '.join(clash)} belong to the base of every record")
        if self.kind_vocab not in self.vocabularies:
            raise ProfileError(f"profile {self.name}: kind_vocab {self.kind_vocab} is not one of its vocabularies")
        for role, f in self.figure_roles.items():
            section = self.sections.get(f.get("section"))
            if not (isinstance(section, Mapping) and "figure" in section):
                raise ProfileError(
                    f"profile {self.name}: figure role {role} names no section of its own with a `figure` field"
                )

    @property
    def model(self) -> dict:
        """The exact shape of its record.json: the base and its sections."""
        return record_model(self.sections)

    @property
    def vocab(self) -> dict[str, Vocabulary]:
        """Every vocabulary its records use, in the order `vocab` prints them: its own, the base's, its figure
        roles."""
        roles = {r: {"label": f["label"], "means": f["means"]} for r, f in self.figure_roles.items()}
        return {**vocabularies(self.vocabularies), **VOCAB, "figure_role": Vocabulary("figure_role", roles)}

    @property
    def figure_fields(self) -> dict[str, str]:
        """Its figure roles, and the section whose `figure` field names each."""
        return {r: f["section"] for r, f in self.figure_roles.items()}


_loaded: dict[Path, Profile] = {}


def plugin_file(name: str, library: Path | None = None) -> Path:
    return (library or paths.LIBRARY) / PLUGINS / name / PLUGIN_FILE


def builtin(name: str) -> Profile:
    return importlib.import_module(f"{__name__}.{name}").PROFILE


def load_plugin(path: Path) -> Profile:
    """The Profile a plugin file defines (`PROFILE`), imported once per process."""
    path = path.resolve()
    if path in _loaded:
        return _loaded[path]
    name = path.parent.name
    where = paths.shown(path)
    if name in BUILTIN:
        raise ProfileError(f"{where}: {name} is a built-in profile; give the plugin another name")
    module_name = f"glossator_profile_{name}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module  # a dataclass in the plugin looks its module up there
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        sys.modules.pop(module_name, None)
        raise ProfileError(f"{where} does not load ({e.__class__.__name__}: {e})") from e
    profile = getattr(module, "PROFILE", None)
    if not isinstance(profile, Profile):
        raise ProfileError(f"{where} defines no PROFILE = Profile(...)")
    if profile.name != name:
        raise ProfileError(f"{where}: PROFILE.name is {profile.name!r}, not its folder's name {name!r}")
    _loaded[path] = profile
    return profile


def get(name: str, library: Path | None = None) -> Profile:
    """The profile `name`: a built-in, else the plugin library/profiles/<name>/profile.py of `library` (the
    library of this computer by default)."""
    if name in BUILTIN:
        return builtin(name)
    if not isinstance(name, str) or not name or "/" in name or name.startswith("."):
        raise ProfileError(f"profile {name!r}: the name of a built-in profile ({' | '.join(BUILTIN)}) or a plugin")
    path = plugin_file(name, library)
    if not path.is_file():
        raise ProfileError(
            f"profile {name!r} is neither built in ({' | '.join(BUILTIN)}) nor a plugin of this library "
            f"({paths.shown(path)} is missing)"
        )
    return load_plugin(path)


def plugin_names(library: Path | None = None) -> list[str]:
    folder = (library or paths.LIBRARY) / PLUGINS
    if not folder.is_dir():
        return []
    return sorted(p.name for p in folder.iterdir() if (p / PLUGIN_FILE).is_file() and p.name not in BUILTIN)


def available(library: Path | None = None) -> list[Profile]:
    """Every profile a bibliography of this library can name: the built-ins, then its plugins (one that does not
    load is left out, and said on stderr)."""
    out = [builtin(n) for n in BUILTIN]
    for name in plugin_names(library):
        try:
            out.append(load_plugin(plugin_file(name, library)))
        except ProfileError as e:
            print(f"warning: {e}", file=sys.stderr)
    return out


def template(name: str, library: Path | None = None) -> str:
    """The PROFILE.md a new bibliography of profile `name` starts from, with the markers {{name}} {{title}}
    {{scope}}. KeyError for a profile that does not exist; ProfileError for a plugin that does not load."""
    if name not in BUILTIN and not plugin_file(name, library).is_file():
        raise KeyError(name)
    return get(name, library).template


def render_template(name: str, *, folder: str, title: str, scope: str, library: Path | None = None) -> str:
    """The PROFILE.md of a new bibliography: the template of its profile with its folder, title and scope."""
    text = template(name, library)
    for marker, value in (("{{name}}", folder), ("{{title}}", title), ("{{scope}}", scope)):
        text = text.replace(marker, value)
    return text


def add_commands(sub, library: Path | None = None) -> None:
    """Add every available profile's commands to the subparsers `sub` (argparse); each remembers its profile, so
    that `run_command` runs it on a bibliography of that profile only."""
    for profile in available(library):
        if profile.commands is None:
            continue
        before = set(sub.choices)
        try:
            profile.commands(sub)
        except Exception as e:  # argparse refuses a name taken by another command
            print(f"warning: the commands of profile {profile.name} are not available ({e})", file=sys.stderr)
            continue
        for cmd in set(sub.choices) - before:
            sub.choices[cmd].set_defaults(_profile=profile.name)


def run_command(a, biblio) -> int | None:
    """Run a profile's command (`add_commands`) on `biblio`; None when `a` is not one."""
    from ..util import die

    name = getattr(a, "_profile", None)
    if name is None:
        return None
    cmd = getattr(a, "cmd", None) or "this command"
    if biblio is None:
        die(f"which bibliography? {cmd} works on a bibliography of profile {name}: --bib NAME")
    if biblio.profile != name:
        die(f"{cmd} works on a bibliography of profile {name}; {biblio.name} is of profile {biblio.profile}")
    return a.fn(biblio, a)
