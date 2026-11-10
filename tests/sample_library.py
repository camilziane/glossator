"""A small library the tests make in a temporary folder: one method bibliography holding one made-up article, its
PDF written here (no binary file in the repository). The tests never need anyone's own bibliographies."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

TITLE = "A Toy Convolutional Filter for Testing Bibliographies"
DOI = "10.5555/sample.2024.001"  # Crossref's prefix for examples
QUOTE = "The filter reaches an accuracy of 91.5% on the example dataset, against 80.2% for the baseline."
PAGES = [
    [
        TITLE,
        "Jane Doe and John Roe",
        "Journal of Examples, 2024",
        "Abstract. We describe a toy convolutional filter that smooths a signal with a kernel of five samples.",
        QUOTE,
    ],
    [
        "Methods. The kernel has five taps and the input is sampled at 100 Hz.",
        "Results. The filter runs in 2 ms per second of signal on one processor core.",
    ],
]


def pdf_bytes(pages: list[list[str]]) -> bytes:
    """A minimal PDF, one text line per string (Helvetica 9 pt): enough for pdfinfo and pdftotext."""

    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    n = len(pages)
    page_ids = [4 + 2 * i for i in range(n)]
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in page_ids)}] /Count {n} >>".encode(),
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    for pid, lines in zip(page_ids, pages, strict=True):
        text = "BT /F1 9 Tf 12 TL 60 740 Td " + " T* ".join(f"({esc(line)}) Tj" for line in lines) + " ET"
        stream = text.encode("latin-1")
        objects[pid] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {pid + 1} 0 R >>"
        ).encode()
        objects[pid + 1] = b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for oid in sorted(objects):
        offsets[oid] = len(out)
        out += b"%d 0 obj\n" % oid + objects[oid] + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for oid in sorted(objects):
        out += b"%010d 00000 n \n" % offsets[oid]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def record(sha: str) -> dict:
    """The made-up article's record: every field of a method record, every fact from its two pages."""
    return {
        "schema": 1,
        "key": "doe2024",
        "status": "complete",
        "kind": "architecture",
        "bib": {
            "title": TITLE,
            "authors": ["Jane Doe", "John Roe"],
            "year": 2024,
            "date": "2024-03-01",
            "venue": "Journal of Examples",
            "venue_short": "J. Examples",
            "volume": "1",
            "issue": "1",
            "pages": "1–2",
            "doi": DOI,
            "pmid": "none",
            "pmcid": "none",
            "openalex": "none",
            "type": "journal-article",
            "cite": "Doe et al. 2024, J. Examples",
            "place": "not reported",
            "lab": "not reported",
        },
        "paper": {
            "file": "paper.pdf",
            "version": "publishedVersion",
            "source_url": "https://example.org/doe2024.pdf",
            "host": "Journal of Examples",
            "license": "cc-by",
            "pages": len(PAGES),
            "sha256": sha,
            "retrieved": "2024-03-02",
            "note": "none",
        },
        "supplementary": {
            "status": "none-published",
            "note": "The paper lists no supplementary material.",
            "files": [],
        },
        "figures": [],
        "overview": {
            "one_line": "A five-tap convolutional filter smooths a signal; 91.5% accuracy on the example dataset against "
            "80.2% for the baseline.",
            "abstract": [
                "The authors describe a toy convolutional filter with a kernel of five samples and test it on an "
                "example dataset, where it is more accurate than the baseline and fast on one processor core."
            ],
        },
        "details": {
            "problem": "Smoothing a signal for a test.",
            "idea": "Convolve the signal with a kernel of five samples.",
            "architecture": "One convolution with five taps (p. 2).",
            "input": "A signal sampled at 100 Hz (p. 2).",
            "training": "not applicable",
            "datasets": "the example dataset (p. 1)",
            "cost": "2 ms per second of signal on one processor core (p. 2)",
            "code": "not reported",
            "figure": "none in the paper",
            "source": "pp. 1-2",
        },
        "results": [
            {
                "name": "accuracy",
                "value": "91.5%",
                "condition": "example dataset",
                "baseline": "80.2%",
                "headline": True,
                "source": "p. 1",
            }
        ],
        "quotes": [{"text": QUOTE, "where": "p. 1, Abstract", "in": "this paper"}],
        "related": {"same_topic": [], "search": "none: a made-up article"},
        "open_points": ["The example dataset is not described."],
        "curation": {"date": "2024-03-02", "read": "pp. 1-2", "checks": []},
    }


def make(library: Path) -> Path:
    """Write the sample library into `library` (made if missing); return it."""
    root = library / "methods"
    folder = root / "articles" / "doe2024"
    for sub in ("figures", "supplementary"):
        (folder / sub).mkdir(parents=True, exist_ok=True)
    (root / "biblio.json").write_text(
        json.dumps(
            {
                "profile": "ml",
                "title": "Methods bibliography",
                "short": "Methods",
                "scope": "Signal-processing and machine-learning methods.",
            },
            indent=2,
        )
        + "\n"
    )
    (root / "PROFILE.md").write_text("# methods\n\nMethods for smoothing signals.\n")
    pdf = pdf_bytes(PAGES)
    (folder / "paper.pdf").write_bytes(pdf)
    (folder / "record.json").write_text(
        json.dumps(record(hashlib.sha256(pdf).hexdigest()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return library
