"""Profiles as plugins: the built-ins, a library's own plugin, a broken one, the command-line hook and the base every
record shares."""

import argparse
import json
import shutil
import textwrap

import pytest

from glossator import profiles
from glossator.bibliography import Bibliography, bibliographies, collection
from glossator.check import Report, check_article, corpus, shape
from glossator.profiles import Profile, ProfileError
from glossator.records import HEAD, TAIL, record_model, skeleton
from glossator.render import article_md, article_view, hub_tables
from glossator.zotero import tags

# A library's plugin: field ecology in the reference form, its PROFILE.md beside it.
REFERENCE_PLUGIN = """
from pathlib import Path

from glossator.profiles.reference import reference_profile

PROFILE = reference_profile(
    name="ecology",
    description="field studies: species, sites, methods and estimates",
    folder="ecology",
    title="Field ecology",
    template=(Path(__file__).parent / "PROFILE.md").read_text(encoding="utf-8"),
    details=[
        ("species", "Species", "the species studied"),
        ("sites", "Sites", "where and when"),
        ("method", "Method", "how the data were collected"),
    ],
    glance=("species", "sites", "method"),
    section="Study",
    lead="species",
    kinds={"survey": {"label": "Survey", "means": "counts or presence data from the field"}},
)
"""

# A plugin of its own form: a `sites` section, a vocabulary, a check, a tag, what its articles share and a command.
CUSTOM_PLUGIN = """
import json

from glossator.check import in_vocab
from glossator.profiles import Profile
from glossator.records import S, todo, vocabularies
from glossator.render import articles_table, val, vword

KINDS = {"field": {"label": "Field study", "means": "data collected outdoors"}}
HABITATS = {"forest": {"label": "Forest", "means": "a wooded site"}, "lake": {"label": "Lake", "means": "fresh water"}}
V = vocabularies({"field_kind": KINDS, "habitat": HABITATS})


def skeleton(_biblio):
    return {"sites": [{"name": todo("the site's name"), "habitat": todo("habitat value"), "source": todo("pages")}]}


def view(rec, coll):
    tiles = [("Sites", [[s["name"], " · ", *vword(V["habitat"], s["habitat"])] for s in rec["sites"]])]
    table = ("table", ["Site", "Habitat"], [[val(s["name"]), vword(V["habitat"], s["habitat"])] for s in rec["sites"]])
    return tiles, [("sites", "Sites", [table])]


def hub(coll):
    return [("articles", "Articles", articles_table(coll, ["Article", "Sites"], lambda k, r: [[str(len(r["sites"]))]]))]


def check(rep, rec, coll, texts):
    for i, s in enumerate(rec["sites"]):
        in_vocab(rep, f"sites[{i}].habitat", s["habitat"], V["habitat"])


def collect(biblio):
    path = biblio.root / "gazetteer.json"
    return json.loads(path.read_text()) if path.exists() else {}


def cmd_sites(biblio, a):
    print(json.dumps(sorted(collect(biblio))))
    return 0


def commands(sub):
    s = sub.add_parser("sites", help="the gazetteer of the bibliography's sites")
    s.set_defaults(fn=cmd_sites)


PROFILE = Profile(
    name="fieldnotes",
    description="field notes: sites and habitats",
    folder="fieldnotes",
    title="Field notes",
    template="# {{name}} — {{title}}\\n\\n{{scope}}\\n",
    sections={"sites": [{"name": S, "habitat": S, "source": S}]},
    skeleton=skeleton,
    kind_vocab="field_kind",
    vocabularies={"field_kind": KINDS, "habitat": HABITATS},
    figure_roles={},
    view=view,
    hub_tables=hub,
    check=check,
    tags=lambda rec, coll: [V["habitat"][s["habitat"]]["label"] for s in rec["sites"] if s["habitat"] in V["habitat"]],
    collect=collect,
    commands=commands,
    order=-1,
)
"""


def library_with(tmp_path, name: str, source: str, profile: str | None = None, extra: dict | None = None):
    """A library holding the plugin `name` and one bibliography of profile `profile` (default: the plugin)."""
    lib = tmp_path / "library"
    plugin = lib / "profiles" / name
    plugin.mkdir(parents=True)
    (plugin / "profile.py").write_text(textwrap.dedent(source))
    (plugin / "PROFILE.md").write_text("# {{name}} — {{title}}\n\n{{scope}}\n")
    bib = lib / "notes"
    (bib / "articles").mkdir(parents=True)
    (bib / "biblio.json").write_text(json.dumps({"profile": profile or name, "title": "Notes", **(extra or {})}))
    return lib, bib


def article(bib, rec: dict) -> None:
    folder = bib.articles / rec["key"]
    folder.mkdir(parents=True)
    (folder / "record.json").write_text(json.dumps(rec))


BIB = {"title": "A study", "authors": ["Ann Example"], "year": 2020, "doi": "10.5555/x.1", "cite": "Example 2020"}


def filled(rec: dict) -> dict:
    """A skeleton made readable: every TODO a value, the bibliographic fields filled."""

    def fill(v):
        if isinstance(v, dict):
            return {k: fill(x) for k, x in v.items()}
        if isinstance(v, list):
            return [fill(x) for x in v]
        return "a value" if isinstance(v, str) and v.startswith("TODO") else v

    rec = fill(rec)
    rec["bib"] = {k: BIB.get(k, "not reported") for k in HEAD["bib"]} | {"authors": BIB["authors"], "year": 2020}
    rec["status"] = "complete"
    return rec


# ------------------------------------------------------------------------------------------------- built-ins


def test_the_builtins_are_available_with_their_templates():
    found = {p.name: p for p in profiles.available()}
    assert {"ml", "epidemio"} <= set(found)
    for p in found.values():
        assert p.description and "\n" not in p.description and p.folder and p.title
        assert all(m in p.template for m in ("{{name}}", "{{title}}", "{{scope}}"))
    assert profiles.template("ml") == found["ml"].template


def test_an_unknown_template_is_a_key_error():
    with pytest.raises(KeyError):
        profiles.template("nope")


def test_a_template_is_filled_with_the_bibliography():
    text = profiles.render_template("epidemio", folder="malaria", title="Malaria studies", scope="How often, where.")
    assert text.startswith("# malaria — Malaria studies\n\nHow often, where.\n") and "{{" not in text


@pytest.mark.parametrize("name", ["ml", "epidemio"])
def test_a_builtin_record_has_the_base_around_its_sections(name):
    p = profiles.get(name)
    model = p.model
    keys = list(model)
    assert keys[: len(HEAD)] == list(HEAD) and keys[-len(TAIL) :] == list(TAIL)
    assert keys[len(HEAD) : -len(TAIL)] == ["details", "results", "quotes", "related"]
    assert p.kind_vocab == f"{name}_kind" and p.figure_fields == {"main": "details"}
    assert list(p.vocab) == [f"{name}_kind", "paper_version", "supplementary_status", "figure_role"]


def test_a_builtin_view_and_its_tables():
    b = next(b for b in bibliographies() if b.plugin.name == "ml")
    coll = collection(b)
    rec = next(iter(coll.recs.values()))
    v = article_view(rec, coll)
    assert [s[0] for s in v["sections"]] == [
        "overview",
        "details",
        "results",
        "quotes",
        "related",
        "open-points",
        "provenance",
    ]
    assert [t[0] for t in v["glance"]] == ["Kind", "Problem", "Idea", "Cost", "Key results"]
    assert [t[0] for t in hub_tables(coll)] == ["articles", "kinds"]
    assert tags(rec, coll) == ["Architecture"]


def test_an_epidemiological_record_has_at_least_one_estimate(tmp_path):
    lib = tmp_path / "library"
    root = lib / "malaria"
    (root / "articles").mkdir(parents=True)
    (root / "biblio.json").write_text('{"profile": "epidemio", "title": "Malaria"}')
    b = Bibliography.at(root)
    rec = filled(skeleton(b, "example2020", {}))
    rec["results"] = []
    rep = Report("example2020")
    b.plugin.check(rep, rec, collection(b), lambda k, r=None: None)
    assert "results: at least one estimate" in rep.errors
    ml = profiles.get("ml")
    rep = Report("example2020")
    ml.check(rep, rec, collection(b), lambda k, r=None: None)
    assert "results: at least one estimate" not in rep.errors


# ------------------------------------------------------------------------------------------------- a library's plugins


def test_a_reference_plugin_of_the_library_is_loaded(tmp_path):
    lib, root = library_with(tmp_path, "ecology", REFERENCE_PLUGIN)
    assert [p.name for p in profiles.available(lib)] == ["ml", "epidemio", "ecology"]
    assert profiles.template("ecology", lib).startswith("# {{name}}")
    b = Bibliography.at(root)
    assert b.plugin.name == "ecology" and b.kind_vocab == "ecology_kind"
    rec = skeleton(b, "example2020", {k: "x" for k in HEAD["bib"]} | {"authors": [], "year": 0})
    assert set(rec["details"]) == {"species", "sites", "method", "figure", "source"}
    rep = Report("skeleton")
    shape("record", rec, b.format, rep)
    assert rep.errors == []


def test_a_plugin_of_its_own_form_draws_checks_tags_and_shares(tmp_path, capsys):
    lib, root = library_with(tmp_path, "fieldnotes", CUSTOM_PLUGIN)
    (root / "gazetteer.json").write_text('{"Black Forest": {}, "Lake Constance": {}}')
    b = Bibliography.at(root)
    rec = filled(skeleton(b, "example2020", {}))
    rec["kind"] = "field"
    rec["sites"] = [{"name": "Lake Constance", "habitat": "lake", "source": "p. 2"}]
    article(b, rec)
    coll = collection(b)
    assert coll.shared == {"Black Forest": {}, "Lake Constance": {}}
    v = article_view(rec, coll)
    assert [s[0] for s in v["sections"]] == ["overview", "sites", "open-points", "provenance"]
    assert "| Lake Constance | Lake |" in article_md(rec, coll)
    assert tags(rec, coll) == ["Field study", "Lake"]
    assert hub_tables(coll)[0][2][2][0][1] == ["1"]
    rec["sites"][0]["habitat"] = "desert"
    (b.articles / "example2020" / "record.json").write_text(json.dumps(rec))
    rep = check_article("example2020", collection(b), lambda k, r=None: None)
    assert any(e.startswith("sites[0].habitat: 'desert' is not a habitat value (forest, lake") for e in rep.errors)


def test_the_plugin_order_comes_before_the_name(tmp_path, monkeypatch):
    from glossator import bibliography

    lib, _ = library_with(tmp_path, "fieldnotes", CUSTOM_PLUGIN)
    (lib / "notes").rename(lib / "zeta")
    (lib / "alpha").mkdir()
    (lib / "alpha" / "biblio.json").write_text('{"profile": "ml", "title": "Alpha"}')
    monkeypatch.setattr(bibliography, "LIBRARY", lib)
    assert [b.name for b in bibliographies()] == ["zeta", "alpha"]  # fieldnotes has order -1


def test_a_plugin_command_runs_on_a_bibliography_of_its_profile(tmp_path, capsys):
    lib, root = library_with(tmp_path, "fieldnotes", CUSTOM_PLUGIN)
    (root / "gazetteer.json").write_text('{"Lake Constance": {}}')
    other = lib / "methods"
    (other / "articles").mkdir(parents=True)
    (other / "biblio.json").write_text('{"profile": "ml", "title": "Methods"}')
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=None)
    profiles.add_commands(sub, lib)
    assert "sites" in sub.choices
    assert profiles.run_command(p.parse_args(["list"]), Bibliography.at(root)) is None  # not a plugin's command
    assert profiles.run_command(p.parse_args(["sites"]), Bibliography.at(root)) == 0
    assert capsys.readouterr().out.strip() == '["Lake Constance"]'
    with pytest.raises(SystemExit):
        profiles.run_command(p.parse_args(["sites"]), Bibliography.at(other))
    assert "sites works on a bibliography of profile fieldnotes; methods is of profile ml" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        profiles.run_command(p.parse_args(["sites"]), None)
    assert "which bibliography?" in capsys.readouterr().err


def test_a_plugin_command_may_not_take_a_command_name(tmp_path, capsys):
    lib, _ = library_with(tmp_path, "fieldnotes", CUSTOM_PLUGIN)
    sub = argparse.ArgumentParser().add_subparsers(dest="cmd")
    sub.add_parser("sites")
    profiles.add_commands(sub, lib)
    assert "the commands of profile fieldnotes are not available" in capsys.readouterr().err


# ------------------------------------------------------------------------------------------------- what goes wrong


def test_a_missing_plugin_names_the_bibliography_and_the_plugin(tmp_path, capsys):
    _, root = library_with(tmp_path, "ecology", REFERENCE_PLUGIN, profile="birds")
    with pytest.raises(SystemExit):
        Bibliography.at(root)
    err = capsys.readouterr().err
    assert "bibliography notes" in err and "'birds'" in err and "profiles/birds/profile.py is missing" in err


def test_a_broken_plugin_names_the_bibliography_and_the_plugin(tmp_path, capsys):
    _, root = library_with(tmp_path, "broken", "PROFILE = (\n")
    with pytest.raises(SystemExit):
        Bibliography.at(root)
    err = capsys.readouterr().err
    assert "bibliography notes" in err and "profiles/broken/profile.py does not load (SyntaxError" in err


def test_a_broken_plugin_is_left_out_of_the_list_with_a_warning(tmp_path, capsys):
    lib, _ = library_with(tmp_path, "failing", "raise RuntimeError('no luck')\n")
    assert [p.name for p in profiles.available(lib)] == ["ml", "epidemio"]
    assert "profiles/failing/profile.py does not load (RuntimeError: no luck)" in capsys.readouterr().err
    with pytest.raises(ProfileError):
        profiles.template("failing", lib)


@pytest.mark.parametrize(
    ("source", "says"),
    [
        ("X = 1\n", "defines no PROFILE"),
        (REFERENCE_PLUGIN, "PROFILE.name is 'ecology', not its folder's name 'wrongname'"),
    ],
)
def test_a_plugin_must_define_its_profile_under_its_name(tmp_path, source, says):
    lib, _ = library_with(tmp_path, "wrongname", source)
    with pytest.raises(ProfileError, match=says):
        profiles.get("wrongname", lib)


def test_a_plugin_may_not_take_a_builtin_name(tmp_path):
    lib, _ = library_with(tmp_path, "ml", REFERENCE_PLUGIN)
    assert profiles.get("ml", lib) is profiles.get("ml")  # the built-in
    with pytest.raises(ProfileError, match="is a built-in profile"):
        profiles.load_plugin(lib / "profiles" / "ml" / "profile.py")


def test_a_profile_keeps_out_of_the_base():
    ml = profiles.get("ml")
    with pytest.raises(ProfileError, match="curation belong to the base"):
        Profile(**{**ml.__dict__, "sections": {**ml.sections, "curation": {}}})
    with pytest.raises(ProfileError, match="kind_vocab"):
        Profile(**{**ml.__dict__, "kind_vocab": "nope"})
    with pytest.raises(ProfileError, match="figure role main"):
        Profile(**{**ml.__dict__, "figure_roles": {"main": {"section": "nope", "label": "", "means": ""}}})
    with pytest.raises(ProfileError, match="figure role main"):
        Profile(**{**ml.__dict__, "figure_roles": {"main": {"section": "quotes", "label": "", "means": ""}}})


# ------------------------------------------------------------------------------------------------- the base


def test_the_base_wraps_any_sections():
    model = record_model({"notes": [""]})
    assert list(model) == [*HEAD, "notes", *TAIL]


def test_a_new_record_starts_with_the_base_and_its_profile_words(tmp_path):
    lib, root = library_with(tmp_path, "fieldnotes", CUSTOM_PLUGIN)
    b = Bibliography.at(root)
    rec = skeleton(b, "example2020", {})
    assert rec["status"] == "draft" and rec["kind"] == "TODO: field" and rec["figures"] == []
    assert rec["paper"]["file"] == "paper.pdf" and rec["open_points"] == []
    assert rec["overview"]["one_line"].startswith("TODO: the paper in one sentence")
    assert list(rec) == list(b.format)


@pytest.mark.skipif(shutil.which("pdftotext") is None, reason="poppler-utils not installed")
def test_check_counts_what_it_proved():
    b = next(b for b in bibliographies() if b.name == "methods")
    coll = collection(b)
    rep = check_article("doe2024", coll, lambda k, r=None: corpus(b.articles / k, r or coll.recs[k]))
    assert rep.errors == [] and (rep.quotes, rep.numbers) == (1, 1)
