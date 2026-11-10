"""The network module without the network: only web addresses are fetched, the tool names itself."""

import urllib.request

import pytest

from glossator import __version__, net


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "FILE:///etc/hosts", "ftp://example.org/x.pdf", "data:,x", "x.pdf"]
)
def test_only_web_addresses_are_fetched(url, monkeypatch):
    opened = []
    monkeypatch.setattr(net.OPENER, "open", lambda *a, **k: opened.append(a))
    with pytest.raises(ValueError):
        net.http_get(url)
    assert not opened
    assert net.get_json(url) is None  # a command that asks gets nothing, as for an unreachable host


def test_a_redirect_leaves_the_web_never():
    handler = net.WebOnly()
    req = urllib.request.Request("https://example.org/paper.pdf")
    with pytest.raises(ValueError):
        handler.redirect_request(req, None, 302, "Found", {}, "file:///home/someone/.ssh/id_ed25519")
    assert handler.redirect_request(req, None, 302, "Found", {}, "https://example.org/v2.pdf") is not None


def test_the_tool_names_itself_with_its_address_and_no_one_else():
    assert net.API_UA == f"glossator/{__version__} (+{net.PROJECT_URL})"
    assert "@" not in net.API_UA and net.PROJECT_URL.startswith("https://")


def test_a_new_record_suggests_neutral_places_and_labs():
    meta = {
        "doi": "10.1/x",
        "title": "A title",
        "authors": ["Ada Doe"],
        "families": ["Doe"],
        "year": 2021,
        "date": "2021-07-15",
        "venue": "Nature",
        "venue_short": "Nature",
        "volume": "1",
        "issue": "1",
        "pages": "1",
        "type": "journal-article",
        "pmid": "none",
        "pmcid": "none",
        "openalex": "none",
        "last_inst": [],
    }
    bib = net.make_bib(meta)
    assert "DeepMind" in bib["place"] and "J. Doe" in bib["lab"]
