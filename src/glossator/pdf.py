"""PDFs and office files: page counts, text, page renders with a coordinate grid (poppler-utils, Pillow)."""

from __future__ import annotations

import html
import re
import struct
import zipfile
from collections import Counter
from pathlib import Path

from .util import die, run


def pdf_pages(pdf: Path) -> int:
    m = re.search(r"^Pages:\s+(\d+)", run(["pdfinfo", str(pdf)]).stdout, re.M)
    return int(m.group(1)) if m else 0


def pdf_page_texts(pdf: Path, layout: bool = False, last: int | None = None) -> list[str]:
    cmd = [
        "pdftotext",
        "-enc",
        "UTF-8",
        *(["-layout"] if layout else []),
        *(["-l", str(last)] if last else []),
        str(pdf),
        "-",
    ]
    pages = run(cmd).stdout.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def edge_numbers(text: str) -> set[int]:
    """The numbers a page prints alone on one of its first or last three lines: where a journal prints its page
    number."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return {int(line) for line in lines[:3] + lines[-3:] if re.fullmatch(r"\d{1,5}", line) and int(line) >= 1}


def page_number_votes(pages: list[str]) -> Counter:
    """For each offset k, how many pages print the number (their own number + k) where a page number goes."""
    return Counter(n - i for i, text in enumerate(pages, 1) for n in edge_numbers(text))


def printed_offset(pages: list[str]) -> int:
    """How far a PDF's printed page numbers are from its own (a journal's pages 583–589 in a 7-page PDF: 582;
    numbering that starts after a cover page: -1), when enough pages print one; 0 otherwise. Lenient: `check`
    tries it beside the PDF's own count."""
    votes = page_number_votes(pages)
    if not votes:
        return 0
    k, n = votes.most_common(1)[0]
    return k if n >= max(2, len(pages) * 0.4) else 0


def journal_range(pages: str) -> tuple[int, int] | None:
    """The first and last page of a bibliographic `pages` ("583–589", "10-21"); None for an article number
    ("e8218", "116241") or a one-page range that stands for one ("217–217")."""
    m = re.fullmatch(r"\s*(\d+)\s*[–—-]\s*(\d+)\s*", pages or "")
    if not m or int(m.group(2)) <= int(m.group(1)):
        return None
    return int(m.group(1)), int(m.group(2))


def journal_offset(pages: list[str], journal_pages: str = "") -> int | None:
    """The journal's page of each PDF page, as an offset (journal page = PDF page + offset), when the PDF prints its
    page numbers consistently: at least three pages agree, they are half of the PDF's pages or more (or the whole
    journal range), no other offset comes close (a third of their votes), and with a journal range
    (`journal_pages`, e.g. "583–589") every page that agrees falls in it. None when unsure: a wrong journal page
    is worse than none."""
    votes = page_number_votes(pages)
    if not votes:
        return None
    (k, n), *rest = votes.most_common(2)
    if n < 3 or (rest and rest[0][1] * 3 > n):
        return None
    span = journal_range(journal_pages)
    if span is None:
        return k if n >= len(pages) / 2 else None
    agreeing = [i + k for i, text in enumerate(pages, 1) if i + k in edge_numbers(text)]
    if not all(span[0] <= page <= span[1] for page in agreeing):
        return None
    return k if n >= len(pages) / 2 or n >= span[1] - span[0] + 1 else None


def office_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as z:
            names = sorted(
                n
                for n in z.namelist()
                if n.endswith(".xml") and n.startswith(("word/document", "xl/sharedStrings", "xl/worksheets/sheet"))
            )
            return html.unescape(" ".join(re.sub(r"<[^>]+>", " ", z.read(n).decode("utf-8", "replace")) for n in names))
    except (zipfile.BadZipFile, OSError):
        return ""


def file_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return "\n".join(pdf_page_texts(path))
    if ext in (".docx", ".xlsx"):
        return office_text(path)
    return path.read_text(encoding="utf-8", errors="replace")


def text_sources(folder: Path, rec: dict) -> list[Path]:
    paths = [folder / "paper.pdf"] + [folder / f["file"] for f in rec.get("supplementary", {}).get("files", [])]
    return [p for p in paths if p.is_file()]


def page_size_pts(pdf: Path, page: int) -> tuple[float, float]:
    out = run(["pdfinfo", "-f", str(page), "-l", str(page), str(pdf)]).stdout
    m = re.search(rf"^Page\s+{page} size:\s+([\d.]+) x ([\d.]+)", out, re.M)
    if not m:
        die(f"{pdf.name} has no page {page}")
    w, h = float(m.group(1)), float(m.group(2))
    rot = re.search(rf"^Page\s+{page} rot:\s+(\d+)", out, re.M)
    return (h, w) if rot and int(rot.group(1)) % 180 == 90 else (w, h)


def png_size(png: Path) -> tuple[int, int]:
    with png.open("rb") as fh:
        head = fh.read(24)
    return struct.unpack(">II", head[16:24])


def draw_grid(png: Path) -> bool:
    """Red lines every 0.05 of the page, labelled every 0.1, so a crop box can be read off the image."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return False
    im = Image.open(png).convert("RGB")
    draw = ImageDraw.Draw(im)
    w, h = im.size
    try:
        font = ImageFont.load_default(size=max(12, w // 60))
    except TypeError:
        font = ImageFont.load_default()
    for i in range(1, 20):
        f, strong = i / 20, i % 2 == 0
        colour = (220, 30, 30) if strong else (245, 160, 160)
        x, y = round(f * w), round(f * h)
        draw.line([(x, 0), (x, h)], fill=colour, width=1)
        draw.line([(0, y), (w, y)], fill=colour, width=1)
        if strong:
            draw.text((x + 3, 3), f"{f:.1f}", fill=(200, 0, 0), font=font)
            draw.text((3, y + 3), f"{f:.1f}", fill=(200, 0, 0), font=font)
    im.save(png)
    return True
