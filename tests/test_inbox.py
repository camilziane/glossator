"""The paper inbox without the network: merging, ids, Haiku's answers, decisions, the cron line, the page."""

import json
import shutil
import subprocess

import pytest
import sample_library

from glossator import commands, inbox, scout, triage


@pytest.fixture
def box(tmp_path, monkeypatch):
    """An empty inbox in a temporary folder, knowing nothing yet."""
    for name, rel in (
        ("INBOX", ""),
        ("ITEMS", "items"),
        ("STATE", "state.json"),
        ("WATCH", "watch.toml"),
        ("PDFS", "pdfs"),
    ):
        monkeypatch.setattr(inbox, name, tmp_path / rel if rel else tmp_path)
    monkeypatch.setattr(inbox, "known", lambda: ({"10.1/known"}, {scout.title_key("A Known Title")}))
    return tmp_path


def cand(**kw):
    base = {
        "doi": "10.1/x",
        "title": "Coral bleaching under marine heatwaves",
        "authors": ["Ada Lovelace"],
        "date": "2026-11-01",
        "source": "openalex",
        "bib": "methods",
        "query": "coral bleaching",
    }
    return scout.candidate(**{**base, **kw})


def test_candidates_are_normalised():
    c = cand(doi="https://doi.org/10.1038/ABC", title="  A <i>title</i> ")
    assert c["doi"] == "10.1038/abc" and c["title"] == "A title"


def test_openalex_abstracts_are_rebuilt():
    assert scout.openalex_abstract({"coral": [1], "Bleaching": [0], "spreads": [2]}) == "Bleaching coral spreads"


def test_rxiv_filter_needs_every_word():
    c = cand(title="Reef bleaching surveys with eDNA", abstract="")
    assert scout.matches(c, "reef bleaching") and scout.matches(c, '"bleaching surveys" edna')
    assert not scout.matches(c, "reef bleaching recovery")


def test_new_papers_are_merged_and_known_ones_dropped(box):
    new = inbox.merge_new(
        [
            cand(),
            cand(source="pubmed", abstract="longer abstract"),
            cand(doi="10.1/known"),
            cand(doi="", title="A known title"),
            cand(doi="10.1/y", title="Another paper"),
        ]
    )
    assert len(new) == 2
    first = next(c for c in new if c["doi"] == "10.1/x")
    assert first["sources"] == ["openalex", "pubmed"] and first["abstract"] == "longer abstract"
    assert first["id"] == "lovelace2026coral"


def test_haiku_answers_are_checked():
    answer = (
        'Here: [{"id": "a", "bib": "methods", "relevance": 5, "summary": "S", "why": "W"},'
        ' {"id": "b", "bib": "astro", "relevance": "x"}, {"id": "zz", "relevance": 1}]'
    )
    out = triage.parse(answer, ["a", "b"])
    assert out == {"a": {"bib": "methods", "relevance": 3, "summary": "S", "why": "W", "kind": "", "by": "haiku"}}


def test_a_failed_triage_is_reported_not_fatal(monkeypatch):
    def boom(_text):
        raise RuntimeError("no claude")

    monkeypatch.setattr(triage, "call", boom)
    done, errors = triage.triage([{**cand(), "id": "a"}])
    assert done == {} and "1 not triaged" in errors[0]


def test_decisions_and_lists(box):
    for c in inbox.merge_new([cand(), cand(doi="10.1/y", title="Another paper on reefs")]):
        c.update({"status": "new", "triage": {"bib": "methods", "relevance": 2, "summary": "R", "why": "W"}})
        inbox.save_item(c)
    ids = [it["id"] for it in inbox.items("new", show_from=0)]
    assert len(ids) == 2
    assert inbox.decide([ids[0], "nope"], "rejected") == [f"{ids[0]}: rejected", "nope: no such item"]
    assert [it["id"] for it in inbox.items("new", show_from=0)] == ids[1:]
    assert "R" in inbox.line(inbox.items("new", show_from=0)[0])
    assert 'id="v-inbox"' in inbox.inbox_html(inbox.items("new", show_from=0))
    with pytest.raises(ValueError):
        inbox.decide(ids, "maybe")


def test_the_cron_line_runs_the_inbox_and_is_tagged():
    line = inbox.cron_line("07:05")
    assert line.startswith("5 7 * * * cd ") and "glossator inbox run" in line and line.endswith(inbox.CRON_TAG)
    with pytest.raises(ValueError):
        inbox.start("25:00")


def test_init_writes_a_readable_watch(box):
    inbox.init()
    w = inbox.load_watch()
    assert [x["bib"] for x in w["watch"]] == ["methods"] and w["watch"][0]["queries"] == []
    assert json.loads(json.dumps(w))["per_query"] > 0


@pytest.fixture
def library_git(tmp_path, monkeypatch):
    """An inbox in a library under git; returns git(*args) -> its output."""
    for var, value in (("NAME", "Test"), ("EMAIL", "test@example.org")):
        monkeypatch.setenv(f"GIT_AUTHOR_{var}", value)
        monkeypatch.setenv(f"GIT_COMMITTER_{var}", value)
    lib = tmp_path / "library"
    for name, rel in (
        ("INBOX", "inbox"),
        ("ITEMS", "inbox/items"),
        ("STATE", "inbox/state.json"),
        ("WATCH", "inbox/watch.toml"),
        ("LOCK", "inbox/.lock"),
        ("PDFS", "inbox/pdfs"),
    ):
        monkeypatch.setattr(inbox, name, lib / rel)
    monkeypatch.setattr(inbox, "known", lambda: (set(), set()))

    def git(*args):
        return subprocess.run(["git", "-C", str(lib), *args], capture_output=True, text=True, check=True).stdout

    lib.mkdir()
    git("init", "-q")
    return git


def test_a_run_is_committed(library_git, monkeypatch):
    monkeypatch.setattr(scout, "fetch", lambda w, since, n: ([cand(pdf="https://example.org/x.pdf")], []))
    monkeypatch.setattr(scout, "citing_library", lambda since, n: [])  # no network in tests
    monkeypatch.setattr(
        triage, "triage", lambda new, shots=None: ({c["id"]: {"bib": "methods", "relevance": 2} for c in new}, [])
    )
    monkeypatch.setattr("glossator.site.build", lambda: 0)
    online(monkeypatch, cand()["title"])
    (inbox.INBOX).mkdir()
    inbox.WATCH.write_text('fetch_from = 2\n[[watch]]\nbib = "methods"\nqueries = ["coral bleaching"]\n')
    state = inbox.run(log=lambda *_: None)
    assert state["new"] == 1 and state["pdfs"] == 1
    assert library_git("log", "--format=%s") == f"inbox: {state['last_run_date']}, 1 new, 1 PDFs\n"
    committed = library_git("show", "--name-only", "--format=", "HEAD").split()
    assert committed == [  # not watch.toml, not .lock
        "inbox/items/lovelace2026coral.json",
        "inbox/pdfs/lovelace2026coral.pdf",
        "inbox/state.json",
    ]
    inbox.decide(["lovelace2026coral"], "rejected")  # its PDF goes, in the same commit as the decision
    assert library_git("show", "--name-status", "--format=", "HEAD").split() == [
        "M",
        "inbox/items/lovelace2026coral.json",
        "D",
        "inbox/pdfs/lovelace2026coral.pdf",
    ]


def test_a_decision_is_committed_and_nothing_else(library_git):
    """In a library under git, a decision is committed at once (the papers and the state only), so that a sync
    carries it and the original never refuses a push for it."""
    git, lib = library_git, inbox.INBOX.parent
    c = cand()
    c.update({"id": "lovelace2026", "status": "new"})
    inbox.save_item(c)
    (lib / "inbox" / "watch.toml").write_text("per_query = 5\n")  # being edited by hand
    (lib / "notes.md").write_text("a curation going on\n")
    git("add", "notes.md")
    assert inbox.decide(["lovelace2026"], "rejected") == ["lovelace2026: rejected"]
    assert git("log", "--format=%s") == "inbox: rejected lovelace2026\n"
    assert git("show", "--name-only", "--format=", "HEAD") == "inbox/items/lovelace2026.json\n"
    assert git("status", "--porcelain") == "A  notes.md\n?? inbox/watch.toml\n"  # left as they were
    assert inbox.decide(["lovelace2026"], "rejected") == ["lovelace2026: rejected"]  # nothing new: no commit
    assert len(git("log", "--format=%s").splitlines()) == 1


def online(monkeypatch, title):
    """The web as the fetch sees it: every link gives a PDF bearing `title`; OpenAlex knows no other copy."""
    pdf = sample_library.pdf_bytes([[title, "Ada Lovelace", "Abstract. A paper."]])
    monkeypatch.setattr(commands, "http_get", lambda url, **kw: (pdf, "application/pdf"))
    monkeypatch.setattr(commands, "pdf_candidates", lambda rec: [])


TITLES = [
    "Graph networks for crystal property prediction",
    "Seed dispersal by birds in fragmented forests",
    "Soil carbon after wildfire in boreal forests",
    "Cohort study of hearing loss in older adults",
]


def rated(relevances):
    for i, rel in enumerate(relevances):
        c = cand(doi=f"10.1/p{i}", title=TITLES[i], pdf=f"https://example.org/{i}.pdf")
        c.update({"id": f"p{i}", "status": "new", "triage": {"bib": "methods", "relevance": rel}})
        inbox.save_item(c)


def test_the_pdfs_follow_the_relevance(box, monkeypatch):
    rated([3, 1, 2, 0])
    assert [it["id"] for it in inbox.to_fetch(2)] == ["p0", "p2"]  # the most relevant first
    pdf = sample_library.pdf_bytes([[TITLES[0], "Ada Lovelace"]])
    monkeypatch.setattr(commands, "http_get", lambda url, **kw: (pdf, "application/pdf"))
    monkeypatch.setattr(commands, "pdf_candidates", lambda rec: [])
    assert inbox.fetch(min_relevance=2, log=lambda *_: None) == 1  # p2's link gives another paper: refused
    assert inbox.pdf_here(load("p0")) and (box / "pdfs" / "p0.pdf").exists()
    assert not inbox.pdf_here(load("p2")) and "title" in load("p2")["pdf_error"]
    assert inbox.to_fetch(2) == []  # tried: the daily run does not try again
    assert [it["id"] for it in inbox.to_fetch(2, retry=True)] == ["p2"]  # `glossator inbox fetch` does
    assert "PDF here" in inbox.line(load("p0")) and "PDF here" not in inbox.line(load("p2"))
    assert inbox.fetch(["p1"], log=lambda *_: None) == 0  # by its id, whatever its rating
    page = inbox.inbox_html([load("p0"), load("p2")])
    assert "pdfs/p0.pdf" in page and "https://example.org/2.pdf" in page  # this computer's copy, else the link


def load(i):
    return json.loads((inbox.ITEMS / f"{i}.json").read_text())


@pytest.mark.skipif(not shutil.which("git-lfs"), reason="needs Git LFS")
def test_purge_frees_the_pdfs_the_inbox_let_go(library_git, tmp_path, monkeypatch):
    """A rejected paper's PDF leaves this computer's LFS store, unless an article's file is the same PDF; git's
    history keeps its pointer. A clone keeps what it has not sent."""
    git, lib = library_git, inbox.INBOX.parent
    git("lfs", "install", "--local")
    (lib / ".gitattributes").write_text("*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    for i, data in (("a1", b"%PDF-1.4 a"), ("b2", b"%PDF-1.4 b"), ("c3", b"%PDF-1.4 c")):
        inbox.save_item({"id": i, "title": i, "status": "new"})
        inbox.PDFS.mkdir(parents=True, exist_ok=True)
        (inbox.PDFS / f"{i}.pdf").write_bytes(data)
    (lib / "methods" / "articles" / "x").mkdir(parents=True)
    (lib / "methods" / "articles" / "x" / "paper.pdf").write_bytes(b"%PDF-1.4 b")  # the same file as b2's
    git("add", "-A")
    git("commit", "-q", "-m", "first")
    inbox.decide(["a1", "b2"], "rejected")
    store = lib / ".git" / "lfs" / "objects"
    count = lambda: sum(1 for f in store.rglob("*") if f.is_file())  # noqa: E731
    assert count() == 3
    assert "1 PDFs no longer in the inbox" in inbox.purge(dry_run=True) and count() == 3
    assert "1 PDFs" in inbox.purge() and count() == 2  # a1's; b2's is the article's
    assert "0 PDFs" in inbox.purge()
    assert git("lfs", "ls-files").count("inbox/pdfs/") == 1  # c3, still here
    # a clone: c3 rejected there, not yet sent: its PDF stays until the original has the decision
    clone = tmp_path / "clone"
    subprocess.run(["git", "clone", "-q", str(lib), str(clone)], check=True, capture_output=True)
    for name, rel in (
        ("INBOX", "inbox"),
        ("ITEMS", "inbox/items"),
        ("PDFS", "inbox/pdfs"),
        ("STATE", "inbox/state.json"),
    ):
        monkeypatch.setattr(inbox, name, clone / rel)
    inbox.decide(["c3"], "rejected")
    assert "0 PDFs" in inbox.purge()


def test_the_papers_citing_the_library_are_found_and_ranked(monkeypatch):
    """New works citing the library's articles, those citing the most first, each for its articles' bibliography."""
    seeds = {"W1": ("methods", "toy2024"), "W2": ("methods", "other2025"), "W3": ("ecology", "reef2023")}
    works = [
        {
            "id": "https://openalex.org/W10",
            "title": "Cites one",
            "doi": "https://doi.org/10.1/a",
            "publication_date": "2026-11-01",
            "referenced_works": ["https://openalex.org/W1", "https://openalex.org/W99"],
        },
        {
            "id": "https://openalex.org/W11",
            "title": "Cites two",
            "doi": "https://doi.org/10.1/b",
            "publication_date": "2026-10-20",
            "referenced_works": ["https://openalex.org/W1", "https://openalex.org/W2"],
        },
        {
            "id": "https://openalex.org/W12",
            "title": "Cites none of ours",
            "publication_date": "2026-11-02",
            "referenced_works": ["https://openalex.org/W99"],
        },
    ]
    asked = []
    monkeypatch.setattr(scout, "get_json", lambda url: asked.append(url) or {"results": works})
    got = scout.citing(seeds, "2026-10-01", 10)
    assert [c["title"] for c in got] == ["Cites two", "Cites one"]
    assert got[0]["links"] == 2 and got[0]["bib"] == "methods" and got[0]["query"] == "cites other2025, toy2024"
    assert got[0]["source"] == "citations" and got[0]["doi"] == "10.1/b"
    assert "cites%3AW1%7CW2%7CW3" in asked[0] and "from_publication_date%3A2026-10-01" in asked[0]


def test_a_decision_taken_during_a_run_is_kept(box, monkeypatch):
    """The run holds a paper while it fetches its PDF; a decision taken meanwhile survives the run's save."""
    monkeypatch.setattr(inbox, "commit", lambda message: None)
    it = {**cand(), "id": "doe2026coral", "status": "new"}
    inbox.save_item(it)
    held = inbox.load_json(box / "items" / "doe2026coral.json")  # what the run read before fetching
    inbox.decide(["doe2026coral"], "rejected")
    inbox.update_item(held["id"], pdf_tried="2026-11-10", pdf_error="no open PDF known")
    on_disk = inbox.load_json(box / "items" / "doe2026coral.json")
    assert on_disk["status"] == "rejected" and on_disk["pdf_error"] == "no open PDF known"
    assert inbox.decide(["../items/doe2026coral"], "accepted") == ["../items/doe2026coral: no such item"]
