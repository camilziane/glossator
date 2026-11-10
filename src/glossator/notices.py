"""Notices on the library's articles: retractions, expressions of concern, corrections, as Crossref records them
(with Retraction Watch's data since 2025). `glossator notices` asks for every article; the daily inbox run asks once a
week and keeps the answer in the inbox's state, which the page shows on the article."""

from __future__ import annotations

import urllib.parse

from .net import get_json

SERIOUS = ("retraction", "withdrawal", "removal", "expression_of_concern")  # the rest: corrections, errata, addenda


def notices_of(doi: str) -> list[dict]:
    """The notices Crossref knows that update this DOI: {type, label, doi (of the notice), date, title}."""
    params = {"filter": f"updates:{doi}", "rows": "20", "select": "DOI,update-to,title"}
    data = get_json("https://api.crossref.org/works?" + urllib.parse.urlencode(params)) or {}
    out, seen = [], set()
    for it in (data.get("message") or {}).get("items", []):
        for u in it.get("update-to") or []:
            if (u.get("DOI") or "").lower() != doi.lower() or (it.get("DOI"), u.get("type")) in seen:
                continue
            seen.add((it.get("DOI"), u.get("type")))
            parts = ((u.get("updated") or {}).get("date-parts") or [[None]])[0]
            out.append(
                {
                    "type": (u.get("type") or "").lower().replace("-", "_"),
                    "label": u.get("label") or u.get("type") or "",
                    "doi": it.get("DOI", ""),
                    "date": "-".join(f"{x:02d}" if i else str(x) for i, x in enumerate(parts) if x),
                    "title": (it.get("title") or [""])[0],
                }
            )
    return sorted(out, key=lambda n: n["date"])


def library_notices(colls) -> dict[str, list[dict]]:
    """Every article's notices, keyed `<bibliography>/<key>`; articles without one are left out."""
    out = {}
    for coll in colls:
        for key, rec in coll.recs.items():
            doi = ((rec.get("bib") or {}).get("doi") or "").strip()
            if doi.startswith("10."):
                found = notices_of(doi)
                if found:
                    out[f"{coll.biblio.name}/{key}"] = found
    return out


def serious(found: dict[str, list[dict]]) -> dict[str, list[dict]]:
    return {k: [n for n in v if n["type"] in SERIOUS] for k, v in found.items() if any(n["type"] in SERIOUS for n in v)}


def format_notices(found: dict[str, list[dict]]) -> str:
    if not found:
        return "No notice: no article of the library is retracted, corrected or under an expression of concern."
    lines = []
    for where, ns in sorted(found.items()):
        for n in ns:
            flag = "!" if n["type"] in SERIOUS else " "
            lines.append(f"{flag} {where}: {n['label']} ({n['date']}), doi {n['doi']}")
    return "\n".join(lines)
