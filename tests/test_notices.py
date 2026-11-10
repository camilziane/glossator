"""Notices on the articles: what Crossref says updates their DOIs (retractions first among them)."""

from glossator import notices
from glossator.bibliography import bibliographies, collection


def crossref(updates):
    return {"message": {"items": updates}}


def test_the_notices_of_a_doi(monkeypatch):
    asked = []
    item = {
        "DOI": "10.9/retraction",
        "title": ["Retraction of: a paper"],
        "update-to": [
            {"DOI": "10.1/A", "type": "retraction", "label": "Retraction", "updated": {"date-parts": [[2025, 3, 7]]}},
            {"DOI": "10.1/other", "type": "correction", "label": "Correction"},
        ],
    }
    monkeypatch.setattr(notices, "get_json", lambda url: asked.append(url) or crossref([item]))
    got = notices.notices_of("10.1/a")
    assert got == [
        {
            "type": "retraction",
            "label": "Retraction",
            "doi": "10.9/retraction",
            "date": "2025-03-07",
            "title": "Retraction of: a paper",
        }
    ]
    assert "filter=updates%3A10.1%2Fa" in asked[0]


def test_only_the_serious_ones_fail(monkeypatch):
    monkeypatch.setattr(
        notices,
        "notices_of",
        lambda doi: [{"type": "correction", "label": "Correction", "doi": "10.9/c", "date": "2024", "title": ""}],
    )
    colls = [collection(b) for b in bibliographies()]
    found = notices.library_notices(colls)
    assert found and notices.serious(found) == {}
    assert "Correction (2024)" in notices.format_notices(found)
    assert notices.format_notices({}).startswith("No notice")
