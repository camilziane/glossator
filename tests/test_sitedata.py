"""The page's data (build/data/library.json) and `glossator serve`, which serves it with the web app and the index."""

import http.client
import json
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from glossator import serve, sitedata
from glossator.bibliography import bibliographies, collection
from glossator.index import DB_NAME, build_index
from glossator.paths import BUILD

BLOCKS = {"p", "source", "h3", "fields", "bullets", "table", "quote", "figure"}
INLINE = {"a", "art", "em", "b", "muted", "todo", "badge", "sub"}


def walk_inline(parts):
    for p in parts:
        assert isinstance(p, str) or p["t"] in INLINE, p
        if isinstance(p, dict) and p["t"] == "a":
            assert p["href"].startswith(("http", "library/", "#")), p


def walk_blocks(blocks):
    for b in blocks:
        assert b["t"] in BLOCKS, b
        for key in ("c", "cite", "caption"):
            if key in b:
                walk_inline(b[key])
        for item in b.get("items", []):
            walk_inline(item["c"] if isinstance(item, dict) else item)
        for row in b.get("rows", []):
            for cell in row:
                walk_inline(cell)
        if b["t"] == "figure":
            assert b["src"].startswith("library/")


def test_the_data_holds_every_article_as_blocks():
    colls = [collection(b) for b in bibliographies()]
    data = sitedata.library_data(colls, "2026-11-10T00:00:00+01:00")
    json.dumps(data)  # it is JSON
    assert data["version"] == sitedata.VERSION and data["built"].startswith("2026")
    assert [b["name"] for b in data["bibliographies"]] == [c.biblio.name for c in colls]
    for bib, coll in zip(data["bibliographies"], colls, strict=True):
        assert {a["key"] for a in bib["articles"]} == set(coll.recs)
        for table in bib["tables"]:
            for row in table["rows"]:
                assert len(row) == len(table["head"])
                for cell in row:
                    walk_inline(cell)
        for a in bib["articles"]:
            assert "error" not in a, a.get("error")
            v = a["view"]
            assert v["files"][0]["href"] == f"library/{bib['name']}/articles/{a['key']}/paper.pdf"
            assert v["sections"] and all(s["id"] and s["title"] for s in v["sections"])
            for s in v["sections"]:
                walk_blocks(s["blocks"])


@pytest.fixture(scope="module")
def server():
    colls = [collection(b) for b in bibliographies()]
    BUILD.mkdir(exist_ok=True)
    build_index(BUILD / DB_NAME, colls, vectors=False)
    (BUILD / sitedata.DATA).parent.mkdir(exist_ok=True)
    (BUILD / sitedata.DATA).write_text(json.dumps(sitedata.library_data(colls, "now")))
    httpd = serve.Server(("127.0.0.1", 0), serve.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield httpd.server_address[1], colls
    httpd.shutdown()


def get(port, path, method="GET", body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request(method, path, body=body, headers={"Host": f"127.0.0.1:{port}", **(headers or {})})
    r = c.getresponse()
    return r.status, r.read()


def head(port, path):
    """The headers of an answer."""
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request("GET", path, headers={"Host": f"127.0.0.1:{port}"})
    r = c.getresponse()
    r.read()
    return r


def test_the_server_gives_the_data_the_files_and_the_index(server):
    port, colls = server
    status, body = get(port, "/data/library.json")
    assert status == 200 and json.loads(body)["version"] == sitedata.VERSION
    coll = colls[0]
    key = next(iter(coll.recs))
    status, body = get(port, f"/library/{coll.biblio.name}/articles/{key}/paper.pdf")
    assert status == 200 and body.startswith(b"%PDF")
    status, body = get(port, "/api/search?q=filter%20accuracy&mode=keyword&limit=3")
    hits = json.loads(body)["hits"]
    assert status == 200 and hits and {"ref", "cite", "snippet", "bib", "key", "source", "page"} <= set(hits[0])
    status, body = get(port, "/api/read?ref=" + hits[0]["ref"])
    assert status == 200 and json.loads(body)["text"]
    assert get(port, "/api/read?ref=nowhere/none/paper.pdf%231")[0] == 404


def test_searches_at_the_same_time_all_get_their_answer(server):
    """One SQLite connection serves every thread: the queries take turns, none fails."""
    port, _ = server
    paths = [f"/api/search?q=filter%20accuracy&mode=keyword&limit=5&n={i}" for i in range(48)]
    paths += [f"/api/read?ref=x/none/paper.pdf%23{i}" for i in range(16)]
    with ThreadPoolExecutor(max_workers=16) as pool:
        statuses = list(pool.map(lambda p: get(port, p)[0], paths))
    assert statuses.count(200) == 48 and statuses.count(404) == 16


def test_the_server_keeps_to_this_computer(server):
    port, _ = server
    assert get(port, "/library/.git/config")[0] == 404  # never a hidden folder
    assert get(port, "/library/../build/index.sqlite")[0] == 404  # nor out of library/
    assert get(port, "/data/library.json", headers={"Host": "attacker.example"})[0] == 403  # a rebound name
    body = json.dumps({"ids": ["x"], "decision": "accept"})
    assert get(port, "/api/inbox/decide", "POST", body)[0] == 403  # no X-Glossator header: another site's form
    assert get(port, "/api/inbox/decide", "POST", "{}", {"X-Glossator": "1"})[0] == 400


def test_a_decision_names_inbox_papers_never_paths(server, tmp_path):
    """An id is what the inbox makes (letters, digits, dashes): a path in a decision deletes nothing."""
    port, _ = server
    victim = tmp_path / "doc.pdf"
    victim.write_bytes(b"%PDF")
    (tmp_path / "doc.json").write_text('{"id": "x"}')
    for bad in (str(tmp_path / "doc"), "../../doc", "a/b", "", "UPPER"):
        body = json.dumps({"ids": [bad], "decision": "reject"})
        assert get(port, "/api/inbox/decide", "POST", body, {"X-Glossator": "1"})[0] == 400, bad
    assert get(port, "/api/inbox/decide", "POST", "[1, 2]", {"X-Glossator": "1"})[0] == 400
    assert victim.exists()
    from glossator import inbox

    assert inbox.decide([str(tmp_path / "doc")], "rejected") == [f"{tmp_path / 'doc'}: no such item"]
    assert victim.exists()


def test_a_decision_that_changes_nothing_leaves_the_data(server):
    """Unknown papers: the page's data is not rewritten (from a library that may hold none of what it shows)."""
    from glossator.paths import BUILD
    from glossator.sitedata import DATA

    port, _ = server
    data = BUILD / DATA
    data.parent.mkdir(parents=True, exist_ok=True)
    data.write_text('{"version": 1, "kept": true}')
    body = json.dumps({"ids": ["nobody-2026"], "decision": "accept"})
    status, got = get(port, "/api/inbox/decide", "POST", body, {"X-Glossator": "1"})
    assert status == 200 and json.loads(got)["done"] == ["nobody-2026: no such item"]
    assert json.loads(data.read_text())["kept"] is True


def test_a_library_file_never_runs_as_the_page(server):
    """A supplementary .html is downloaded, sandboxed; a PDF opens; no page of the server can be framed."""
    from glossator.paths import LIBRARY

    port, colls = server
    coll = colls[0]
    key = next(iter(coll.recs))
    folder = LIBRARY / coll.biblio.name / "articles" / key / "supplementary"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "notes.html").write_text("<script>fetch('/data/library.json')</script>")
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request(
        "GET",
        f"/library/{coll.biblio.name}/articles/{key}/supplementary/notes.html",
        headers={"Host": f"127.0.0.1:{port}"},
    )
    r = c.getresponse()
    r.read()
    assert r.status == 200 and r.getheader("Content-Disposition", "").startswith("attachment")
    assert "sandbox" in r.getheader("Content-Security-Policy") and r.getheader("X-Frame-Options") == "DENY"
    (folder / "notes.html").unlink()
    c.request("GET", f"/library/{coll.biblio.name}/articles/{key}/paper.pdf", headers={"Host": f"127.0.0.1:{port}"})
    r = c.getresponse()
    r.read()
    assert r.getheader("Content-Disposition") is None and r.getheader("X-Content-Type-Options") == "nosniff"
    assert get(port, "/library/x%00y")[0] == 404


def test_only_the_files_the_page_links_to_are_served(server):
    """An article's files and the inbox's PDFs; never the library's settings, the inbox's state or another folder."""
    from glossator.paths import LIBRARY

    port, colls = server
    coll = colls[0]
    key = next(iter(coll.recs))
    art = f"/library/{coll.biblio.name}/articles/{key}"
    folder = LIBRARY / coll.biblio.name / "articles" / key
    (folder / "figures").mkdir(exist_ok=True)
    (folder / "figures" / "main.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    pdfs = LIBRARY / "inbox" / "pdfs"
    pdfs.mkdir(parents=True, exist_ok=True)
    (pdfs / "doe2026coral.pdf").write_bytes(b"%PDF-1.4")
    (LIBRARY / "inbox" / "state.json").write_text("{}")
    (LIBRARY / "library.toml").write_text('language = "English"\n')
    (LIBRARY / "private").mkdir(exist_ok=True)
    (LIBRARY / "private" / "draft.pdf").write_bytes(b"%PDF-1.4")
    try:
        for ok in (
            f"{art}/paper.pdf",
            f"{art}/record.json",
            f"{art}/figures/main.png",
            "/library/inbox/pdfs/doe2026coral.pdf",
        ):
            assert get(port, ok)[0] == 200, ok
        for refused in (
            "/library/library.toml",
            "/library/inbox/state.json",
            "/library/private/draft.pdf",
            f"/library/{coll.biblio.name}/biblio.json",
            f"/library/{coll.biblio.name}/PROFILE.md",
            f"{art}/paper.pdf/x",
            f"{art}/figures",
            f"{art}/other.pdf",
            f"{art}/figures/../record.json",
            "/library/inbox/pdfs/doe2026coral.pdf/../../state.json",
        ):
            assert get(port, refused)[0] == 404, refused
    finally:
        (folder / "figures" / "main.png").unlink()
        (pdfs / "doe2026coral.pdf").unlink()
        (LIBRARY / "inbox" / "state.json").unlink()
        (LIBRARY / "library.toml").unlink()
        (LIBRARY / "private" / "draft.pdf").unlink()


def test_every_answer_stays_on_its_origin(server):
    port, colls = server
    coll = colls[0]
    key = next(iter(coll.recs))
    for path in ("/data/library.json", f"/library/{coll.biblio.name}/articles/{key}/paper.pdf", "/api/status"):
        r = head(port, path)
        assert r.getheader("Cross-Origin-Resource-Policy") == "same-origin", path
        assert r.getheader("Referrer-Policy") == "no-referrer", path


def test_a_decision_too_large_or_malformed_is_refused_unread(server):
    port, _ = server
    big = json.dumps({"ids": ["a"] * 20000, "decision": "accept"})
    assert len(big) > serve.MAX_BODY
    assert get(port, "/api/inbox/decide", "POST", big, {"X-Glossator": "1"})[0] == 413
    for length in ("-1", "many"):
        c = http.client.HTTPConnection("127.0.0.1", port)
        c.putrequest("POST", "/api/inbox/decide", skip_host=True)
        for k, v in (("Host", f"127.0.0.1:{port}"), ("X-Glossator", "1"), ("Content-Length", length)):
            c.putheader(k, v)
        c.endheaders()
        assert c.getresponse().status == 400, length
    assert get(port, "/api/inbox/decide", "POST", b"\xff\xfe", {"X-Glossator": "1"})[0] == 400


def test_a_failure_says_so_without_its_details(server, monkeypatch):
    """A 500 tells the page that the server failed; what failed (paths, messages) stays in the server's terminal."""
    from glossator.index import Index

    port, _ = server

    def broken(self, *a, **k):
        raise RuntimeError("/home/someone/secret.sqlite is locked")

    monkeypatch.setattr(Index, "search", broken)
    status, body = get(port, "/api/search?q=filter&mode=keyword")
    assert status == 500 and b"secret" not in body and b"RuntimeError" not in body
    assert "terminal" in json.loads(body)["error"]


def test_without_the_web_app_the_static_page_is_served(server, monkeypatch):
    from glossator.paths import BUILD, SITE_NAME

    port, _ = server
    monkeypatch.setattr(serve, "web_root", lambda: None)
    page = BUILD / SITE_NAME
    page.write_text("<!doctype html><title>Bibliographies</title>")
    try:
        status, body = get(port, "/")
        assert status == 200 and b"Bibliographies" in body
        status, body = get(port, "/bib/")
        assert status == 404 and "glossator web" in json.loads(body)["error"]
    finally:
        page.unlink()
    status, body = get(port, "/")
    assert status == 404 and "glossator web" in json.loads(body)["error"]
