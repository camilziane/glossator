"""The reference form: a profile whose records describe a paper by a few `details` fields of their own, its
`results` (the numbers it leads with) and its `quotes`, and relate it to the works of the same topic. The built-in
profiles are made with it, and most domains can be: name the details, the three a tile shows, the kinds of paper.

    record.json: bib, paper, supplementary, figures, overview,
                 details {<fields>, figure, source}, results [...], quotes [...], related {same_topic, search},
                 open_points, curation
    its view:    overview, <section>, key results, in the paper's words, related articles, open points, provenance
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..check import check_metric_value, check_quote
from ..records import DOI_RE, NO_FIGURE, QUOTE, RESULT, S, is_sentinel, quote_skeleton, result_skeleton, todo
from ..render import (
    articles_table,
    as_text,
    figure_block,
    headline_lines,
    joined,
    kind_table,
    quotes_blocks,
    related_item,
    results_blocks,
    val,
    vword,
)
from . import Profile

FIGURE_HINT = (
    f"the figure that shows the method, the resource or the main result (e.g. 'Fig. 1, p. 3'), or '{NO_FIGURE}'"
)


def reference_profile(
    *,
    name: str,
    description: str,
    folder: str,
    title: str,
    template: str,
    details: Sequence[tuple[str, str, str]],
    glance: Sequence[str],
    section: str,
    lead: str,
    kinds: Mapping[str, Mapping[str, str]],
    results_required: bool = False,
    result_name: str = "what is measured (e.g. 'top-1 accuracy, ImageNet', 'incidence of malaria')",
    result_condition: str = "what the number holds for: dataset, model size, population, year",
    figure: Mapping[str, str] | None = None,
    order: int = 0,
) -> Profile:
    """A profile of the reference form.

    details: (field, label, what goes there) of each field of `details`, in order;
    glance: the fields the tiles of the view show (with the kind and the headline results);
    section: the title of the details' section in the view (e.g. 'Method');
    lead: the field the table of the bibliography's articles shows;
    kinds: the vocabulary of `kind` ({value: {"label", "means"}}), named `<name>_kind`;
    results_required: a record has at least one result (a study measures something);
    figure: the label and meaning of its one figure role, `main`."""
    labels = {f: label for f, label, _ in details}
    for f in (*glance, lead):
        if f not in labels:
            raise ValueError(f"profile {name}: {f} is not one of its details")
    kind_vocab = f"{name}_kind"
    figure = figure or {
        "label": "Main figure",
        "means": "the panel that shows the method, the resource or the main result",
    }

    def skeleton(_biblio) -> dict:
        return {
            "details": {
                **{f: todo(hint) for f, _, hint in details},
                "figure": todo(FIGURE_HINT),
                "source": todo("pages and sections"),
            },
            "results": [result_skeleton(result_name, result_condition)],
            "quotes": [quote_skeleton()],
            "related": {
                "same_topic": [],
                "search": todo("where you looked: the paper's own statements, the searches run"),
            },
        }

    def view(rec: dict, coll) -> tuple[list, list]:
        key, d = rec["key"], rec["details"]
        kinds_vocab = coll.biblio.vocab[kind_vocab]
        figs = {f["role"]: f for f in rec["figures"]}
        tiles = [
            ("Kind", [vword(kinds_vocab, rec["kind"])]),
            *[(labels[f], [val(d[f])]) for f in glance],
            ("Key results", headline_lines(rec["results"]) or [[("muted", "none")]]),
        ]
        blocks = [("fields", [(labels[f], val(d[f])) for f in labels] + [("Figure", val(d["figure"]))])]
        if "main" in figs:
            blocks.append(figure_block(figs["main"], section))
        blocks.append(("source", ["Source: ", *val(d["source"])]))
        same = [
            [("art", k, r["bib"]["cite"])] for k, r in coll.recs.items() if k != key and r.get("kind") == rec["kind"]
        ]
        kind = as_text(vword(kinds_vocab, rec["kind"]))
        items = [[f"In this collection, {kind}: ", *(joined(same) if same else [("muted", "no other article yet")])]]
        items += [related_item(r, coll) for r in rec["related"]["same_topic"]]
        sections = [
            ("details", section, blocks),
            ("results", "Key results", results_blocks(rec["results"])),
            ("quotes", "In the paper's words", quotes_blocks(rec["quotes"], coll)),
            (
                "related",
                "Related articles",
                [("bullets", items), ("source", ["Searched: ", *val(rec["related"]["search"])])],
            ),
        ]
        return tiles, sections

    def hub_tables(coll) -> list:
        kinds_vocab = coll.biblio.vocab[kind_vocab]

        def row(_k, r) -> list:
            return [
                vword(kinds_vocab, r["kind"]),
                val(r["details"][lead]),
                joined([[("b", m["value"]), " ", m["name"]] for m in r["results"] if m.get("headline")], "; ")
                or [("muted", "none")],
            ]

        articles = articles_table(coll, ["Article", "Kind", labels[lead], "Key results"], row)
        return [("articles", "Articles", articles), ("kinds", "Kinds", kind_table(coll))]

    def check(rep, rec: dict, coll, texts) -> None:
        """The results, quotes and related articles."""
        key = rec["key"]
        res = rec["results"]
        if results_required and not res:
            rep.err("results: at least one estimate")
        heads = sum(1 for m in res if m["headline"])
        if res and not 1 <= heads <= 3:
            rep.err(f"results: {heads} headline result(s); mark 1 to 3")
        if not [x for x in rec["quotes"] if not is_sentinel(x["text"])]:
            rep.err("quotes: at least one sentence of the paper")
        seen = set()
        for i, r in enumerate(rec["related"]["same_topic"]):
            path, link = f"related.same_topic[{i}]", r["link"]
            if not (DOI_RE.match(link) or link.startswith("http")):
                rep.err(f"{path}.link: a DOI (10.xxxx/...) or a URL")
            if link.lower() == rec["bib"]["doi"].lower():
                rep.err(f"{path}: this article itself")
            if link.lower() in seen:
                rep.err(f"{path}: listed twice")
            seen.add(link.lower())
        if (coll.biblio.articles / key / "paper.pdf").is_file():
            for i, qt in enumerate(rec["quotes"]):
                check_quote(rep, f"quotes[{i}]", qt, key, coll, texts)
            for i, m in enumerate(res):
                check_metric_value(rep, f"results[{i}].value", m["value"], texts(key), m["source"])

    return Profile(
        name=name,
        description=description,
        folder=folder,
        title=title,
        template=template,
        sections={
            "details": {**{f: S for f, _, _ in details}, "figure": S, "source": S},
            "results": [RESULT],
            "quotes": [QUOTE],
            "related": {"same_topic": [{"link": S, "cite": S, "title": S, "why": S}], "search": S},
        },
        skeleton=skeleton,
        kind_vocab=kind_vocab,
        vocabularies={kind_vocab: kinds},
        figure_roles={"main": {"section": "details", **figure}},
        view=view,
        hub_tables=hub_tables,
        check=check,
        order=order,
    )
