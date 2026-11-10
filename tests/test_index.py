"""The search index: built from a bibliography, searched, read; and the MCP server's answers on it."""

import asyncio
import json

import pytest

from glossator import server
from glossator.bibliography import bibliographies, collection
from glossator.index import Index, build_index, excerpt, format_article, fts_queries, fuse, parse_ref, split


@pytest.fixture(scope="module")
def idx(tmp_path_factory):
    """An index of the smallest bibliography (its PDFs' text is extracted: poppler-utils)."""
    smallest = min(bibliographies(), key=lambda b: len(list(b.articles.iterdir())))
    path = tmp_path_factory.mktemp("build") / "index.sqlite"
    stats = build_index(path, [collection(smallest)])  # with vectors: the model is downloaded the first time
    assert stats["articles"] >= 1 and stats["record_passages"] > 0
    assert stats.get("vectors"), stats.get("vector_error")
    return Index(path)


def first(idx):
    return idx.articles()[0]


def test_queries_quote_codes_and_keep_phrases():
    assert fts_queries('CASP14 "backbone accuracy" Cα-RMSD r.m.s.d.95') == [
        '"backbone accuracy" AND "CASP14" AND "Cα-RMSD" AND "r.m.s.d.95"',
        '"backbone accuracy" OR "CASP14" OR "Cα-RMSD" OR "r.m.s.d.95"',
    ]
    with pytest.raises(ValueError):
        fts_queries('  "" ')


def test_split_keeps_passages_short():
    page = ("A sentence of the paper. " * 200) + "\n\n" + "Another paragraph."
    parts = split(page)
    assert all(len(p) <= 1500 for p in parts) and parts[-1].endswith("Another paragraph.")


def test_refs_round_trip():
    assert parse_ref("methods/jumper2021/paper.pdf#5.2") == ("methods", "jumper2021", "paper.pdf", 5, 2)
    assert parse_ref("ml/zhang2019/record:details") == ("ml", "zhang2019", "record:details", None, None)


def test_the_title_finds_its_article(idx):
    a = first(idx)
    hits = idx.search(a["title"], limit=3)
    assert hits and hits[0]["ref"].startswith(f"{a['bib']}/{a['key']}/")


def test_records_and_text_are_both_searchable(idx):
    a = first(idx)
    word = max(a["title"].split(), key=len)  # a real word, not "A"
    assert all(h["ref"].split("/")[2].startswith("record:") for h in idx.search(word, scope="records"))
    text_hits = idx.search(word, scope="text")
    assert all(not h["ref"].split("/")[2].startswith("record:") for h in text_hits)
    if text_hits:
        assert idx.read(text_hits[0]["ref"])


def test_article_view_and_sections(idx):
    a = first(idx)
    view = format_article(idx, a["key"])
    assert a["title"] in view and "Record sections" in view
    overview = format_article(idx, a["key"], sections=["overview"])
    assert json.loads(idx.article(a["key"])["record"])["overview"]["one_line"][:40] in overview


def test_server_tools_answer_from_the_index(idx, monkeypatch):
    monkeypatch.setattr(server, "index", lambda: idx)
    a = first(idx)
    assert a["key"] in server.list_articles()
    assert server.search(a["title"], limit=2).startswith("1. ")
    assert "Index of" in server.status()
    assert a["title"] in server.article(a["key"])


def test_fusion_rewards_agreement():
    order = fuse([[1, 2, 3], [3, 2, 9]])
    assert set(order[:2]) == {2, 3} and order.index(1) < order.index(9)


def test_excerpt_is_the_sentence_with_the_query_words():
    text = "The samples were collected in March. Fitting used a recurrent network. Results were stable."
    assert excerpt(text, "recurrent network fitting") == "Fitting used a recurrent network."


def test_a_query_has_the_vector_the_build_model_gives():
    """Queries run on ONNX Runtime, passages on PyTorch: the two must agree, or the semantic ranking is wrong."""
    from glossator.vectors import QUERY_PREFIX, embed_query, model

    q = "a recurrent network forecasts river discharge"
    ref = model().encode([QUERY_PREFIX + q], normalize_embeddings=True, convert_to_numpy=True)[0]
    assert float(embed_query(q) @ ref) > 0.9999


def test_every_mode_finds_passages(idx):
    a = first(idx)
    question = json.loads(idx.article(a["key"])["record"])["overview"]["one_line"]
    for mode in ("hybrid", "keyword", "semantic"):
        hits = idx.search(question, mode=mode, limit=3)
        assert hits and all(h["snippet"] for h in hits), mode


def test_a_build_skips_a_gpu_too_old_for_pytorch(monkeypatch):
    """The GPU with the most free memory is taken, unless PyTorch's build has no architecture old enough for it."""
    import sys
    from types import SimpleNamespace

    from glossator import vectors

    gpus = {0: ((6, 1), 30), 1: ((8, 6), 20), 2: ((8, 6), 25)}  # index: (capability, free memory)
    cuda = SimpleNamespace(
        is_available=lambda: True,
        get_arch_list=lambda: ["sm_70", "sm_86", "sm_90a", "compute_120"],
        device_count=lambda: len(gpus),
        get_device_capability=lambda i: gpus[i][0],
        mem_get_info=lambda i: (gpus[i][1], 99),
    )
    torch = SimpleNamespace(cuda=cuda, backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: False)))
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.delenv("GLOSSATOR_DEVICE", raising=False)
    assert vectors.device() == "cuda:2"
    gpus.pop(1), gpus.pop(2)
    assert vectors.device() == "cpu"


def test_a_citation_is_verified_on_its_page(idx):
    """verify: word for word on the cited page; on the next page, close; on another page, elsewhere; else absent."""
    import sample_library

    a = first(idx)
    page = next(
        r["page"] for r in idx.db.execute("SELECT page, text FROM chunks ORDER BY page") if "91.5%" in r["text"]
    )
    v = idx.verify(a["key"], sample_library.QUOTE, page)
    assert v["found"] == "verbatim" and v["page"] == page and v["score"] == 1.0
    assert idx.verify(a["key"], sample_library.QUOTE)["found"] == "verbatim"  # no page: anywhere
    words = sample_library.QUOTE.split()
    assert idx.verify(a["key"], " ".join(words[:-3] + ["unrelated", "words", "here"]), page)["found"] == "close"
    far = idx.verify(a["key"], sample_library.QUOTE, page + 5)
    assert far["found"] == "elsewhere" and far["page"] == page
    assert idx.verify(a["key"], "quantum chromodynamics on a lattice of gauge fields", page)["found"] == "absent"
    with pytest.raises(KeyError):
        idx.verify("nobody1999", "x")


def test_the_fusion_weighs_the_words_more_than_the_meaning():
    assert fuse([[1, 2], [2, 1]]) in ([1, 2], [2, 1])  # even: a tie
    assert fuse([[1, 2], [2, 1]], [1.0, 0.25]) == [1, 2]


def test_the_evaluation_counts_what_the_records_checked(idx):
    from glossator.index import evaluate

    colls = [collection(b) for b in bibliographies()]
    got = evaluate(idx, colls, modes=("keyword",), log=lambda m: None)
    assert got["claims"] >= 0 and 0 <= got["keyword"]["article@10"] <= 1


def test_ligatures_read_as_letters_and_flags_are_not_text():
    from glossator.index import clean, flat_lines

    assert clean("classi\ufb01cation of e\ufb00ects") == "classification of effects"
    assert list(flat_lines({"value": 0.96, "headline": False, "note": None})) == ["value: 0.96"]


def test_a_query_unrelated_to_the_library_finds_nothing_by_its_meaning(idx):
    assert idx.search("zzqxv blorptang", mode="semantic") == []
    assert idx.last_mode == "semantic"  # searched by its meaning, found nothing: not a model still loading
    assert idx.search("zzqxv blorptang", mode="hybrid") == [] and idx.last_mode == "hybrid"
    a = first(idx)
    question = json.loads(idx.article(a["key"])["record"])["overview"]["one_line"]
    assert idx.search(question, mode="semantic", limit=3)


def test_without_an_index_every_tool_says_what_to_run(tmp_path, monkeypatch):
    """No build yet: a message naming `glossator build`, never a crash with a traceback in the server's log."""
    from mcp.server.mcpserver.exceptions import ToolError, UnexpectedToolError

    monkeypatch.setattr(server, "BUILD", tmp_path / "build")
    monkeypatch.setattr(server, "_index", None)
    assert "glossator build" in server.status()
    calls = [
        ("search", {"query": "protein structure"}),
        ("read", {"ref": "methods/doe2024/paper.pdf#1"}),
        ("verify", {"key": "doe2024", "text": "a quote"}),
        ("article", {"key": "doe2024"}),
        ("list_articles", {}),
    ]
    for name, args in calls:
        with pytest.raises(ToolError, match="glossator build") as e:
            asyncio.run(server.server.call_tool(name, args))
        assert not isinstance(e.value, UnexpectedToolError), name


def test_an_unknown_article_or_reference_is_a_message_not_a_crash(idx, monkeypatch):
    from mcp.server.mcpserver.exceptions import ToolError, UnexpectedToolError

    monkeypatch.setattr(server, "index", lambda: idx)
    for name, args, words in (
        ("article", {"key": "nobody1999"}, "no such article"),
        ("verify", {"key": "nobody1999", "text": "a quote"}, "no such article"),
        ("read", {"ref": "not-a-reference"}, "a reference is"),
        ("search", {"query": '  "" '}, "an empty query"),
    ):
        with pytest.raises(ToolError, match=words) as e:
            asyncio.run(server.server.call_tool(name, args))
        assert not isinstance(e.value, UnexpectedToolError), name


def test_claude_code_starts_the_server_on_the_library_glossator_home_names():
    """`.mcp.json` hands GLOSSATOR_HOME to the server (`GLOSSATOR_HOME=demo claude` searches the demo), else `.`."""
    from pathlib import Path

    config = json.loads((Path(__file__).parents[1] / ".mcp.json").read_text())["mcpServers"]["glossator"]
    assert config["args"][-1] == "mcp" and config["env"] == {"GLOSSATOR_HOME": "${GLOSSATOR_HOME:-.}"}
