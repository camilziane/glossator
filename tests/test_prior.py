"""The library's prior: new papers scored by their closeness to what the library keeps, before Haiku reads them."""

import numpy as np

from glossator import inbox, prior, triage


def unit(*xs):
    v = np.array(xs, np.float32)
    return v / np.linalg.norm(v)


def fake_embed(texts):
    """A toy embedding: 'filter' papers point one way, 'cooking' papers another."""
    return (
        np.stack(
            [unit(1, 0.1, 0) if "filter" in t else unit(0.1, 1, 0) if "cooking" in t else unit(0, 0, 1) for t in texts]
        )
        if texts
        else np.zeros((0, 3), np.float32)
    )


def test_the_closest_bibliography_scores_highest(monkeypatch):
    monkeypatch.setattr(prior, "embed", fake_embed)
    p = prior.Prior({"methods": ["a filter", "another filter"], "food": ["cooking pasta"]})
    best = p.best(p.vectors(["a new filter", "cooking rice", "astronomy"]))
    assert [b["bib"] for b in best[:2]] == ["methods", "food"]
    assert best[0]["score"] > 0.9 and best[2]["score"] < 0.2 and best[0]["by"] == "similarity"


def test_enough_decisions_train_a_model(monkeypatch):
    monkeypatch.setattr(prior, "embed", fake_embed)
    n = prior.MIN_DECISIONS
    p = prior.Prior({"methods": ["filter"] * n}, {"methods": ["cooking"] * n})
    s = p.scores(p.vectors(["filter paper", "cooking paper"]))
    assert "methods" in p.models and s[0]["methods"] > 0.5 > s[1]["methods"]


def test_the_nearest_decisions_are_the_triage_examples(monkeypatch):
    monkeypatch.setattr(prior, "embed", fake_embed)
    decided = [
        {"title": "filter kept", "bib": "methods", "decision": "kept"},
        {"title": "cooking dropped", "bib": "methods", "decision": "dropped"},
        {"title": "astronomy dropped", "bib": "methods", "decision": "dropped"},
    ]
    got = prior.examples(fake_embed(["filter batch"]), decided, fake_embed([d["title"] for d in decided]), n=1)
    assert [d["title"] for d in got] == ["filter kept", "cooking dropped"]
    text = triage.prompt(
        [{"id": "x", "title": "t", "venue": "", "date": "", "abstract": "", "bib": "", "query": ""}],
        [{"title": "filter kept", "bib": "methods", "decision": "kept"}],
    )
    assert "Past decisions on papers close to these" in text and "filter kept" in text


def test_the_gate_spares_haiku_the_far_papers(monkeypatch):
    monkeypatch.setattr(prior, "embed", fake_embed)
    monkeypatch.setattr(prior, "library_prior", lambda: prior.Prior({"methods": ["a filter"]}))
    monkeypatch.setattr(inbox, "decided_examples", lambda: [])
    new = [
        {"id": "near", "title": "filter design", "abstract": ""},
        {"id": "far", "title": "astronomy", "abstract": ""},
    ]
    shots, gated = inbox.score_new(new, 0.5, log=lambda m: None)
    assert set(gated) == {"far"} and gated["far"]["relevance"] == 0 and gated["far"]["by"] == "prior"
    assert new[0]["prior"]["bib"] == "methods" and shots(new) == []


def test_without_a_gate_every_paper_goes_to_haiku(monkeypatch):
    monkeypatch.setattr(prior, "embed", fake_embed)
    monkeypatch.setattr(prior, "library_prior", lambda: prior.Prior({"methods": ["a filter"]}))
    monkeypatch.setattr(inbox, "decided_examples", lambda: [])
    _, gated = inbox.score_new([{"id": "far", "title": "astronomy", "abstract": ""}], None, log=lambda m: None)
    assert gated == {}
