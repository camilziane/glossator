"""The page of every bibliography: one tab and one table per bibliography, one view per article, one search."""

from __future__ import annotations

import datetime as dt
import html
import json
import sys

from . import zotero_web
from .bibliography import bibliographies, collection
from .inbox import INBOX, inbox_html
from .inbox import items as inbox_items
from .index import DB_NAME, build_index
from .paths import BUILD, LIBRARY, SITE_NAME, shown
from .render import GENERATED, article_html, html_doc, hub_html, hub_order
from .sitedata import DATA, library_data
from .util import dump_json, git_head, sha256, write_atomic
from .zotero import ZOTERO_NAME, library

SITE_JS = """
const views = [...document.querySelectorAll('.view')];
const hubs = views.filter(v => v.classList.contains('hub'));
const box = document.getElementById('q');
const none = document.getElementById('noresult');
const rows = () => document.querySelectorAll('table.articles tbody tr');
function show() {
  document.body.classList.remove('searching');
  none.hidden = true;
  const h = decodeURIComponent(location.hash.slice(1));
  const parts = h.split('/');
  const id = 'v-' + (parts.length >= 2 ? parts[0] + '/' + parts[1] : (parts[0] || hubs[0].dataset.bib));
  const view = document.getElementById(id) || hubs[0];
  views.forEach(v => { v.hidden = v !== view; });
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.bib === view.dataset.bib));
  document.title = view.querySelector('h1').textContent;
  const target = parts.length === 3 ? document.getElementById(h) : null;
  if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
}
function search() {
  const q = box.value.trim().toLowerCase();
  if (!q) { rows().forEach(tr => { tr.hidden = false; }); show(); return; }
  document.body.classList.add('searching');
  let any = false;
  views.forEach(v => { if (!v.classList.contains('hub')) v.hidden = true; });
  hubs.forEach(v => {
    let hits = 0;
    v.querySelectorAll('table.articles tbody tr').forEach(tr => {
      const ok = tr.textContent.toLowerCase().includes(q);
      tr.hidden = !ok;
      hits += ok;
    });
    v.hidden = hits === 0;
    any = any || hits > 0;
  });
  none.hidden = any;
}
box.addEventListener('input', search);
window.addEventListener('hashchange', () => {
  if (box.value) { box.value = ''; rows().forEach(tr => { tr.hidden = false; }); }
  show();
});
show();
"""


def site_html(tabs: list[tuple[str, str, int]], views: list[str]) -> str:
    """The page of every bibliography: one tab and one table per bibliography, one view per article, and a
    search over every bibliography's articles."""
    e = html.escape
    nav = "".join(
        f'<a href="#{e(name)}" data-bib="{e(name)}">{e(short)} <span class="count">{n}</span></a>'
        for name, short, n in tabs
    )
    body = (
        f'<header class="topbar"><nav class="tabs" aria-label="Bibliographies">{nav}</nav>'
        '<input type="search" id="q" placeholder="Search every bibliography: author, title, '
        'method, kind…" aria-label="Search every bibliography"></header>\n'
        + "\n".join(views)
        + '\n<p id="noresult" class="muted" hidden>No article matches.</p>\n'
        f"<footer>{e(GENERATED)}</footer>\n<script>{SITE_JS}</script>"
    )
    return html_doc("Bibliographies", body)


def write_page(colls: list | None = None) -> int:
    """Write the page of every bibliography (build/index.html) and its data for the web app (build/data/), from the
    records and the inbox as they are now: a fraction of a second. 1 when a record does not follow its format."""
    colls = [collection(b) for b in bibliographies()] if colls is None else colls
    status, tabs, views = 0, [], []
    for coll in colls:
        biblio = coll.biblio
        views.append(hub_html(coll))
        for key in hub_order(coll.recs):
            try:
                views.append(article_html(coll.recs[key], coll))
            except (KeyError, TypeError, AttributeError) as e:
                print(
                    f"{biblio.name}/{key}: the record does not follow the format ({e.__class__.__name__}: {e}); "
                    f"run: check {key} --bib {biblio.name}",
                    file=sys.stderr,
                )
                status = 1
        tabs.append((biblio.name, biblio.short, len(coll.recs)))
    if INBOX.exists():  # the papers waiting for a decision
        waiting = inbox_items("new") + inbox_items("accepted")
        views.append(inbox_html(waiting))
        tabs.append(("inbox", "Inbox", len(waiting)))
    BUILD.mkdir(exist_ok=True)
    write_atomic(BUILD / SITE_NAME, site_html(tabs, views))
    (BUILD / DATA).parent.mkdir(exist_ok=True)
    built = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    write_atomic(BUILD / DATA, json.dumps(library_data(colls, built), ensure_ascii=False, separators=(",", ":")))
    return status


def zotero_sync(colls: list | None = None, dry_run: bool = False, pull: bool = True, push: bool = True) -> int:
    """The user's Zotero library and this one in step, through Zotero's web API (a key on this computer). `pull`: the
    inbox's decisions tagged in Zotero (`accept`, `reject`), applied and committed; the page follows. `push`: the
    references, summary notes and links of `colls` (every bibliography by default, then with the inbox's papers).
    1 when Zotero could not be reached or refused."""
    if not zotero_web.configured():
        print(f"Zotero: no key on this computer ({zotero_web.KEY_FILE})", file=sys.stderr)
        return 1
    whole = colls is None
    try:
        if pull:
            decided = zotero_web.take_decisions(dry_run)
            for line in decided:
                print(f"Zotero: {line}")
            if not decided:
                print("Zotero: no new decision")
            elif not dry_run:
                write_page()
        if push:
            colls = [collection(b) for b in bibliographies()] if whole else colls
            plan = zotero_web.push(colls, dry_run, inbox=zotero_web.inbox_papers() if whole else None)
            print(zotero_web.report(plan, dry_run))
    except (zotero_web.ZoteroError, OSError) as e:
        print(f"Zotero: not reached ({e})", file=sys.stderr)
        return 1
    return 0


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def build(zotero: bool = False) -> int:
    """Write build/ from the records as they are now: the page and its data, the search index, the Zotero library
    file and the manifest. Nothing leaves this computer; with `zotero`, the user's Zotero library follows
    (`zotero_sync`)."""
    colls = [collection(b) for b in bibliographies()]
    status = write_page(colls)
    db = BUILD / DB_NAME
    stats = build_index(db, colls, previous=db)
    digest = sha256(db)
    rdf = library(colls, BUILD / ZOTERO_NAME)
    write_atomic(
        BUILD / "manifest.json",
        dump_json(
            {
                "page": SITE_NAME,
                "index": DB_NAME,
                "zotero": ZOTERO_NAME,
                "sqlite_sha256": digest,
                "sqlite_bytes": db.stat().st_size,
                "library_head": git_head(LIBRARY),  # the library's commit this build reflects (None: not in git)
                **stats,
            }
        ),
    )
    out = shown(BUILD)
    if not colls:
        print(
            f"no bibliography in {shown(LIBRARY)}: glossator init (a new library), glossator join HOST:PATH (an "
            "existing one), or glossator demo (the demo's)",
            file=sys.stderr,
        )
    per_bib = f" ({', '.join(f'{c.biblio.name} {len(c.recs)}' for c in colls)})" if colls else ""
    passages = stats["text_passages"] + stats["record_passages"]
    print(
        f"{out}/: {SITE_NAME} and {DB_NAME} ({db.stat().st_size / 1e6:.1f} MB): {plural(stats['articles'], 'article')}"
        f"{per_bib}, {plural(stats['files'], 'file')}, {plural(stats['pages'], 'page')}, "
        f"{plural(passages, 'passage')}; text extracted from {plural(stats['extracted'], 'file')}, reused for "
        f"{stats['reused']}; vectors: {stats.get('embedded', 0)} new of {stats.get('vectors', 0)}"
    )
    if stats.get("vector_error"):
        print(
            f"warning: the semantic search's vectors were not built ({stats['vector_error']}): the keyword search "
            "works; glossator build again once the search model can be loaded (online, the first time)",
            file=sys.stderr,
        )
    print(f"{out}/{ZOTERO_NAME}: {plural(rdf['items'], 'Zotero item')}, {plural(rdf['files'], 'linked file')}")
    if zotero:
        status |= zotero_sync()
    elif zotero_web.configured():
        print("Zotero: not touched (glossator zotero sync, or build --zotero)")
    return status
