"""`glossator serve`: the page of every bibliography on this computer, at http://127.0.0.1:<port>/.

One small HTTP server (the standard library's), for this computer only:

- `/` the web app (`web/`, built once into `web/out/` by `glossator web`), any path without a file of its own
  answered by its `index.html` or `404.html`; without the web app, `/` is the static page `build/index.html`;
- `/data/library.json` what `build` wrote for the page (`build/data/`);
- `/library/...` the files the page links to, and nothing else: an article's `paper.pdf`, `record.json`, `figures/*`
  and `supplementary/*` (`library/<bibliography>/articles/<key>/...`) and the inbox's PDFs (`library/inbox/pdfs/*`);
- `/api/search`, `/api/read`, `/api/status`: the search index, as `glossator search` and `glossator read` give it;
- `POST /api/inbox/decide` `{"ids": [...], "decision": "accept" | "reject"}`: a decision on inbox papers,
  committed as `glossator inbox accept|reject` commits it.

It answers only on the loopback address and only to a request naming it (`Host: 127.0.0.1` or `localhost`), so
another site the browser opens cannot read it through a rebound domain name; a decision also needs the header
`X-Glossator: 1`, which a page of another origin cannot send without the server's consent, never given. Every answer
forbids framing and use by another origin (`Cross-Origin-Resource-Policy: same-origin`). It has no password: any
account of this computer can reach the loopback address, so do not run it on a computer shared with others."""

from __future__ import annotations

import json
import mimetypes
import os
import signal
import threading
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .paths import BUILD, LIBRARY, PACKAGE, ROOT, SITE_NAME
from .sitedata import DATA

PORT = 8765
LOCAL_HOSTS = ("127.0.0.1", "localhost", "[::1]")
# what a library file may be opened as, in the browser, on the app's origin; anything else (a supplementary .html,
# an .svg) is downloaded, sandboxed: a file from a publisher never runs as the app
INLINE_TYPES = ("application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv")
# the files of an article's folder the page links to (`<bibliography>/articles/<key>/<entry>`)
ARTICLE_FILES = ("paper.pdf", "record.json")
ARTICLE_FOLDERS = ("figures", "supplementary")
MAX_BODY = 64 * 1024  # a decision is a few ids: anything larger is refused unread


def web_root() -> Path | None:
    """The built web app: GLOSSATOR_WEB, else web/out/ beside the library (or of this checkout, for GLOSSATOR_HOME=demo),
    else the copy a package carries."""
    for p in (
        os.environ.get("GLOSSATOR_WEB"),
        ROOT / "web" / "out",
        PACKAGE.parents[1] / "web" / "out",
        PACKAGE / "web",
    ):
        if p and (Path(p) / "index.html").is_file():
            return Path(p)
    return None


def inside(root: Path, rel: str) -> Path | None:
    """The file `rel` names under `root`: none for a path that leaves it or passes through a hidden folder."""
    parts = [p for p in rel.split("/") if p]
    if "\x00" in rel or any(p.startswith(".") for p in parts):
        return None
    path = (root / "/".join(parts)).resolve()
    return path if path.is_relative_to(root.resolve()) else None


def library_file(rel: str) -> Path | None:
    """The library file `rel` names, when it is one the page links to: an article's paper.pdf, record.json, a file of
    its figures/ or supplementary/, or a PDF of the inbox. Anything else of library/ (its settings, the inbox's state,
    a folder the library keeps private) is not served."""
    parts = [p for p in rel.split("/") if p]
    shaped = (
        len(parts) == 4
        and parts[1] == "articles"
        and parts[3] in ARTICLE_FILES
        or len(parts) == 5
        and parts[1] == "articles"
        and parts[3] in ARTICLE_FOLDERS
        or len(parts) == 3
        and parts[:2] == ["inbox", "pdfs"]
        and parts[2].endswith(".pdf")
    )
    if not shaped:
        return None
    path = inside(LIBRARY, "/".join(parts))
    return path if path and path.is_file() else None


class Handler(BaseHTTPRequestHandler):
    server_version = "glossator"
    index = None  # the search index, opened at the first search and reopened when build/ rewrites it
    _index_mtime = 0.0
    _lock = threading.Lock()
    # One SQLite connection serves every thread: its cursors are not safe to share, so one query at a time.
    _query = threading.Lock()

    def log_request(self, code="-", size="-"):  # quiet: the errors only
        if str(code).startswith(("4", "5")):
            super().log_request(code, size)

    # answers

    def guard(self, csp: str = "frame-ancestors 'none'") -> None:
        """Headers on every answer: no other site may frame the page (a click on Accept under a decoy), embed its
        files or learn which page linked out."""
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", csp)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Referrer-Policy", "no-referrer")

    def send_json(self, obj, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.guard()
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):  # the browser cancelled the request
            pass

    def send_file(self, path: Path, status: int = 200, cache: bool = False, library: bool = False) -> None:
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        attach = library and ctype not in INLINE_TYPES
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        size = path.stat().st_size
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if cache else "no-cache")
        if attach:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{urllib.parse.quote(path.name)}")
        self.guard("sandbox; frame-ancestors 'none'" if attach else "frame-ancestors 'none'")
        self.end_headers()
        if self.command != "HEAD":
            with path.open("rb") as f:
                while chunk := f.read(1 << 16):
                    self.wfile.write(chunk)

    def refuse(self, status: int, why: str) -> None:
        self.send_json({"error": why}, status)

    def local(self) -> bool:
        host = self.headers.get("Host") or ""
        name = host.split("]")[0] + "]" if host.startswith("[") else host.rsplit(":", 1)[0]
        return name in LOCAL_HOSTS

    # requests

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.local():
            return self.refuse(HTTPStatus.FORBIDDEN, "this server answers only to 127.0.0.1 or localhost")
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if path.startswith("/api/"):
                return self.api(path[5:], q)
            if path == "/" + DATA:
                f = BUILD / DATA
                return self.send_file(f) if f.is_file() else self.refuse(404, "no data yet: run glossator build")
            if path.startswith("/library/"):
                f = library_file(path[len("/library/") :])
                return self.send_file(f, library=True) if f else self.refuse(404, "no such file")
            return self.app(path)
        except (BrokenPipeError, ConnectionResetError):
            return None
        except Exception as e:  # an answer, never a dropped connection; the details stay in this terminal
            self.log_error("%s: %s: %s", path, e.__class__.__name__, e)
            return self.refuse(500, "the server failed on this request (its terminal says why)")

    def do_POST(self):
        if not self.local():
            return self.refuse(HTTPStatus.FORBIDDEN, "this server answers only to 127.0.0.1 or localhost")
        if self.headers.get("X-Glossator") != "1":
            return self.refuse(HTTPStatus.FORBIDDEN, "a decision needs the header X-Glossator: 1")
        if urllib.parse.urlsplit(self.path).path != "/api/inbox/decide":
            return self.refuse(404, "no such action")
        try:
            size = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self.refuse(400, "Content-Length: a number")
        if size < 0:
            return self.refuse(400, "Content-Length: a number")
        if size > MAX_BODY:
            self.close_connection = True  # the body is left unread
            return self.refuse(413, f"a decision is at most {MAX_BODY} bytes")
        from . import inbox

        try:
            body = json.loads(self.rfile.read(size) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("the body: a JSON object")
            ids, decision = body.get("ids"), body.get("decision")
            if not isinstance(ids, list) or not ids or not all(inbox.is_id(i) for i in ids):
                raise ValueError("ids: a list of inbox ids")
            if decision not in ("accept", "reject"):
                raise ValueError("decision: accept | reject")
        except ValueError as e:  # json.JSONDecodeError and UnicodeDecodeError included
            return self.refuse(400, str(e) if not isinstance(e, UnicodeDecodeError) else "the body: UTF-8 JSON")
        from .site import write_page

        try:
            with self._lock:  # one decision at a time: each commits the inbox; the page's data follows
                status = "accepted" if decision == "accept" else "rejected"
                lines = inbox.decide(ids, status)
                if any(line.endswith(f": {status}") for line in lines):  # else nothing changed: the data stays
                    write_page()
        except Exception as e:  # say so: some papers may be decided already, the page reloads to see which
            self.log_error("decide: %s: %s", e.__class__.__name__, e)
            return self.refuse(500, "the decision failed (its terminal says why); some may be saved: reload")
        self.send_json({"done": lines})

    def app(self, path: str) -> None:
        root = web_root()
        if root is None:
            page = BUILD / SITE_NAME
            if path in ("/", "/index.html") and page.is_file():  # the static page, until the web app is built
                return self.send_file(page)
            return self.refuse(404, "the web app is not built here: run glossator web")
        rel = path.lstrip("/")
        for cand in (rel, f"{rel}.html", f"{rel}/index.html") if rel else ("index.html",):
            f = inside(root, cand)
            if f and f.is_file():
                return self.send_file(f, cache=cand.startswith("_next/static/"))
        f = root / "404.html"
        return self.send_file(f, 404) if f.is_file() else self.refuse(404, "not found")

    def api(self, name: str, q: dict) -> None:
        from .index import DB_NAME, Index, parse_ref

        db = BUILD / DB_NAME
        if not db.exists():
            return self.refuse(404, "no index yet: run glossator build")
        with self._lock:
            mtime = db.stat().st_mtime
            if Handler.index is None or Handler._index_mtime != mtime:
                Handler.index, Handler._index_mtime = Index(db), mtime
            idx = Handler.index
        self._query.acquire()
        try:
            if name == "search":
                if not q.get("q", "").strip():
                    return self.refuse(400, "q: the words to search")
                hits = idx.search(
                    q["q"],
                    q.get("bib") or None,
                    q.get("article") or None,
                    q.get("scope", "all") if q.get("scope") in ("all", "records", "text") else "all",
                    max(1, min(int(q.get("limit", 20)), 50)),
                    mode=q.get("mode", "hybrid") if q.get("mode") in ("hybrid", "keyword", "semantic") else "hybrid",
                    wait=False,
                )
                for h in hits:
                    bib, key, source, page, n = parse_ref(h["ref"])
                    h.update(bib=bib, key=key, source=source, page=page, passage=n)
                return self.send_json({"query": q["q"], "mode": idx.last_mode, "hits": hits})
            if name == "read":
                return self.send_json(
                    {"ref": q.get("ref", ""), "text": idx.read(q.get("ref", ""), q.get("page") == "1")}
                )
            if name == "status":
                from .vectors import ready_for_queries

                return self.send_json({**idx.meta(), "semantic": idx.has_vectors() and ready_for_queries()})
        except KeyError as e:
            return self.refuse(404, str(e).strip("'\""))
        except ValueError as e:
            return self.refuse(400, str(e))
        finally:
            self._query.release()
        return self.refuse(404, "no such API")


def warm_up() -> None:
    """Load the query model in the background, as the MCP server does: the first searches go by words alone."""
    try:
        from .vectors import embed_query

        embed_query("warm up")
    except Exception:  # no model here: searches go by words
        pass


class Server(ThreadingHTTPServer):
    request_queue_size = 64  # a page asks for many files at once (the standard library's default is 5)
    daemon_threads = True


def serve(port: int = PORT, open_browser: bool = False) -> None:
    # The command line lets a closed pipe end it quietly (`glossator inbox list | head`); a server must outlive a
    # browser that cancels a request (a search typed on, a tab closed): the write then fails in that request alone.
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)
    httpd = Server(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    print(f"The page of every bibliography: {url}  (Ctrl+C stops it)")
    if web_root() is None:
        print("The web app is not built here: run glossator web. Meanwhile / shows build/index.html.")
    threading.Thread(target=warm_up, daemon=True).start()
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
