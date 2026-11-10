"""The page of every bibliography: every article has its view, every link leads somewhere."""

import html
import re

from glossator.bibliography import bibliographies, collection
from glossator.paths import BUILD
from glossator.render import article_html, article_md, hub_html, hub_order
from glossator.site import site_html


def page() -> str:
    tabs, views = [], []
    for b in bibliographies():
        coll = collection(b)
        views.append(hub_html(coll))
        views += [article_html(coll.recs[k], coll) for k in hub_order(coll.recs)]
        tabs.append((b.name, b.short, len(coll.recs)))
    return site_html(tabs, views)


def test_one_view_per_article_and_one_hub_per_bibliography():
    s = page()
    for b in bibliographies():
        assert f'id="v-{b.name}"' in s
        for key in collection(b).recs:
            assert f'id="v-{b.name}/{key}"' in s


def test_ids_are_unique_and_anchors_resolve():
    s = page()
    ids = re.findall(r'id="([^"]+)"', s)
    assert len(ids) == len(set(ids))
    known = set(ids)
    for a in set(re.findall(r'href="#([^"]+)"', s)):
        parts = a.split("/")
        view = "v-" + "/".join(parts[:2])
        assert view in known or a in known, a


def test_every_file_link_exists():
    s = page()
    for url in set(re.findall(r'(?:href|src)="([^"#][^"]*)"', s)):
        if not url.startswith("http"):
            assert (BUILD / html.unescape(url)).resolve().exists(), url  # the page is in build/


def test_export_is_markdown_with_the_title():
    b = bibliographies()[0]
    coll = collection(b)
    key = next(iter(coll.recs))
    md = article_md(coll.recs[key], coll)
    assert md.splitlines()[1] == f"# {coll.recs[key]['bib']['title']}"
