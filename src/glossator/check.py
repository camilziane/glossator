"""What `check` enforces: the folder, the record's shape and vocabularies, the PDFs, the quotes and the numbers.

On a clone that has not downloaded a file (a Git LFS placeholder in its place), only the file's checksum is compared
(the placeholder holds it); the quotes and numbers the file should hold are not checked, and the report says so."""

from __future__ import annotations

import re
from pathlib import Path

from .bibliography import article_dirs, collection
from .pdf import file_text, pdf_page_texts, pdf_pages, printed_offset, text_sources
from .records import (
    DATE_RE,
    DOI_RE,
    FOLDER,
    KEY_RE,
    NO_FIGURE,
    SENTINELS,
    SUPP_EXT,
    THIS_PAPER,
    TMP_RE,
    VOCAB,
    is_sentinel,
    pending,
)
from .render import article_html, article_md
from .util import NUMBER, alnum, die, lfs_oid, load_json, number_text, numbers_in, percents_in, sha256, title_score


def count(n: int, word: str) -> str:
    """'no errors', '1 error', '2 errors'."""
    return f"no {word}s" if n == 0 else f"{n} {word}" + ("s" if n > 1 else "")


class Report:
    """What `check` found in an article (or across a bibliography, `counts=False`): its errors and warnings, the
    files it could not read here, and what it proved: the quotes found in the paper's text and the numbers of its
    results found printed there."""

    def __init__(self, name: str, counts: bool = True):
        self.name, self.errors, self.warnings, self.unread = name, [], [], []
        self.counts, self.quotes, self.numbers = counts, 0, 0

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def not_here(self, what: str) -> None:
        """A file not downloaded on this clone: what it should hold is not checked."""
        if what not in self.unread:
            self.unread.append(what)

    def print(self) -> None:
        """One line ("doe2024: no errors, 1 warning. Found in the paper's text: 2 quotes, 5 numbers."), then each
        error and warning on its own line."""
        line = f"{self.name}: {count(len(self.errors), 'error')}, {count(len(self.warnings), 'warning')}."
        if self.counts:
            line += f" Found in the paper's text: {count(self.quotes, 'quote')}, {count(self.numbers, 'number')}."
        if self.unread:
            line += f" Not downloaded here, so not read: {', '.join(self.unread)}."
        print(line)
        for m in self.errors:
            print(f"  error: {m}")
        for m in self.warnings:
            print(f"  warning: {m}")


def shape(path: str, value, model, rep: Report) -> None:
    if isinstance(model, dict):
        if not isinstance(value, dict):
            rep.err(f"{path}: should be an object")
            return
        for k in model:
            if k not in value:
                rep.err(f"{path}.{k}: missing")
        for k in value:
            if k not in model:
                rep.err(f"{path}.{k}: not part of the record format")
        for k in model:
            if k in value:
                shape(f"{path}.{k}", value[k], model[k], rep)
    elif isinstance(model, list):
        if not isinstance(value, list):
            rep.err(f"{path}: should be a list")
            return
        for i, item in enumerate(value):
            shape(f"{path}[{i}]", item, model[0], rep)
    elif isinstance(model, bool):
        if not isinstance(value, bool):
            rep.err(f"{path}: true or false")
    elif isinstance(model, int):
        if not isinstance(value, int) or isinstance(value, bool):
            rep.err(f"{path}: a whole number")
    elif not isinstance(value, str):
        rep.err(f"{path}: should be text")


def walk_strings(path: str, value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield from walk_strings(f"{path}.{k}", v)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk_strings(f"{path}[{i}]", v)
    elif isinstance(value, str):
        yield path, value


def in_vocab(rep: Report, path: str, value: str, vocab, sentinel: bool = True) -> None:
    """A value of the vocabulary `vocab` (records.Vocabulary), or with `sentinel` 'not reported' / 'not
    applicable'."""
    if value in vocab or (sentinel and value in SENTINELS[:2]) or pending(value):
        return
    extra = ", or 'not reported' / 'not applicable'" if sentinel else ""
    rep.err(f"{path}: '{value}' is not a {vocab.name} value ({', '.join(vocab)}{extra})")


# A page a source cites: "p. 4", "pp. 4–5", "pp. 4, 6 and 9", "page 4"; never a section number ("p. 11, 3.5").
PAGE_REF = re.compile(r"\b(?:pp?\.|pages?\b)\s*(\d+)((?:\s*(?:[–—-]|,|and)\s*\d+(?!\.\d|\d))*)", re.I)


def cited_pages(source: str) -> list[int]:
    """The pages a source names, in its order: every "p. N", each page of "pp. N–M", each of "pp. N, M"."""
    out: list[int] = []
    for m in PAGE_REF.finditer(source):
        first, rest = int(m.group(1)), m.group(2)
        out.append(first)
        prev = first
        for sep, n in re.findall(r"\s*([–—-]|,|and)\s*(\d+)", rest):
            n = int(n)
            if sep in "–—-" and prev < n <= prev + 30:
                out += range(prev + 1, n + 1)
            elif sep in "–—-":
                break
            else:
                out.append(n)
            prev = n
    return list(dict.fromkeys(out))


# A source that names the supplementary material: its pages may be those of a supplementary file.
SUPPLEMENTARY_RE = re.compile(r"suppl|supporting|appendix|\bSI\b|\bESM\b", re.I)
NEAR = 1  # a number may be this many pages from the one its source cites (a paragraph or a table running over)
GAP = 4  # at most this many other numbers between an estimate and its interval, where the paper prints them
# An estimate with its interval: "0.96 Å (95% confidence interval = 0.85–1.16 Å)", "9.1% (95% CI 7.2, 11.2)",
# "1.48% [1.11, 1.85]": the interval named, or its bounds alone in brackets.
INTERVAL_RE = re.compile(r"(?<![a-z])CI(?![a-z])|confidence|credible|(?<![a-z])IQR(?![a-z])|interquartile", re.I)
BOUNDS_RE = re.compile(r"[(\[]\s*[-−]?\d[\d.,]*\s*%?\s*\S{0,3}\s*(?:[–—,-]|to)\s*[-−]?\d[\d.,]*\s*%?\s*\S{0,3}\s*[)\]]")
LEVEL_RE = re.compile(r"\b\d+(?:\.\d+)?\s*%\s*(?=CI(?![a-z])|confidence|credible)", re.I)


def number_list(text: str) -> list[str]:
    """The numbers of a text in their order, '.89' as 0.89 and '12,500' as 12500 (as `numbers_in` reads them)."""
    return re.findall(NUMBER, number_text(text)[1])


def corpus(folder: Path, rec: dict) -> dict | None:
    """The text of an article's files, for its quotes and numbers, and the numbers of each page of its PDFs, in
    their order (with the offset of the page numbers the journal prints); None when one is not downloaded here."""
    paths = text_sources(folder, rec)
    if any(lfs_oid(p) for p in paths):
        return None
    texts, files = [], []
    for path in paths:
        if path.suffix.lower() == ".pdf":
            pages = pdf_page_texts(path)
            texts.append("\n".join(pages))
            files.append(
                {
                    "file": path.name,
                    "paper": path.name == "paper.pdf" and path.parent == folder,
                    "pages": [(numbers_in(t, both=True), number_list(t)) for t in pages],
                    "offset": printed_offset(pages),
                }
            )
        else:
            texts.append(file_text(path))
    raw = "\n".join(texts)
    flat = alnum(raw)
    return {
        "alnum": flat,
        "nodigits": re.sub(r"\d", "", flat),
        "numbers": numbers_in(raw, both=True),
        "percents": percents_in(raw),
        "files": files,
    }


def page_label(pages: list[int]) -> str:
    if len(pages) == 1:
        return f"p. {pages[0]}"
    if pages == list(range(pages[0], pages[-1] + 1)):
        return f"pp. {pages[0]}–{pages[-1]}"
    return "pp. " + ", ".join(map(str, pages))


def cited(source: str, c: dict) -> tuple[list[int], list[tuple[set, list]]]:
    """The pages a result's source cites that the article's PDFs have, and those pages with the ones beside them
    (NEAR): of the paper, or of every PDF when the source names the supplementary material; a page as the PDF counts
    it, or as the journal prints it. ([], []) when the source cites no page they have."""
    files = [f for f in c.get("files", []) if f["paper"] or SUPPLEMENTARY_RE.search(source)]
    pages, found = [], []
    for p in cited_pages(source):
        here = [(f, q) for f in files for q in dict.fromkeys((p, p - f["offset"])) if 1 <= q <= len(f["pages"])]
        if here:
            pages.append(p)
            found += [
                f["pages"][r - 1] for f, q in here for r in range(q - NEAR, q + NEAR + 1) if 1 <= r <= len(f["pages"])
            ]
    return pages, found


def together(numbers: list[str], pages: list[tuple[set, list]]) -> bool:
    """Whether the numbers are printed in this order on one of the pages, at most GAP other numbers apart."""

    def from_(seq: list[str], i: int, rest: list[str]) -> bool:
        if not rest:
            return True
        return any(seq[j] == rest[0] and from_(seq, j, rest[1:]) for j in range(i + 1, min(len(seq), i + GAP + 2)))

    return any(seq[i] == numbers[0] and from_(seq, i, numbers[1:]) for _, seq in pages for i in range(len(seq)))


def estimates(value: str) -> list[list[str]]:
    """The estimates with their interval a value gives ("0.96 Å (95% CI 0.85–1.16 Å); 1.48% [1.11, 1.85]"): the
    estimate and its bounds, for each part of the value that holds exactly one (named as an interval, or its bounds
    alone in brackets)."""
    out = []
    for part in value.split(";"):
        numbers = number_list(LEVEL_RE.sub("", part))
        if len(numbers) == 3 and (INTERVAL_RE.search(part) or BOUNDS_RE.search(part)):
            out.append(numbers)
    return out


def check_metric_value(rep: Report, path: str, value: str, c: dict | None, source: str = "") -> None:
    """Every number of a metric must be printed in the paper (an error otherwise); a percentage, printed as a
    percentage. When its `source` cites pages, each number (but a single digit) should be printed on one of them or
    beside it, and an estimate with its interval as the paper prints them, the estimate before its bounds (a warning
    otherwise: a number copied from another place of the paper)."""
    value = value.strip()
    if c is None or is_sentinel(value) or pending(value) or value.startswith(("≈", "~")):
        return
    percents = percents_in(value)
    found = []
    for n in sorted(numbers_in(value)):
        if n in percents and n in c["percents"] or n not in percents and n in c["numbers"]:
            rep.numbers += 1
            found.append(n)
            continue
        if n in c["numbers"]:
            rep.warn(f"{path}: {n}% is printed without its % sign in the paper; make sure it is this number")
        else:
            rep.err(
                f"{path}: {n} is not in the paper's text; copy the value as printed, or prefix '≈' if you "
                "read it from a figure"
            )
    pages, on = cited(source, c) if source and found else ([], [])
    if not pages:
        return
    where = f"{page_label(pages)}, the page{'s' if len(pages) > 1 else ''} its source cites"
    away = [n for n in found if len(n) > 1 and not any(n in numbers for numbers, _ in on)]
    for n in away:
        rep.warn(f"{path}: {n} is in the paper but not on {where} (nor beside it)")
    for est in estimates(value):
        if any(n in away or n not in found for n in est) or together(est, on):
            continue
        odd = [n for i, n in enumerate(est) if together(est[:i] + est[i + 1 :], on)]
        if len(odd) == 1:
            others = " and ".join(est[: est.index(odd[0])] + est[est.index(odd[0]) + 1 :])
            rep.warn(f"{path}: {odd[0]} is on {where}, but not with {others} as the paper prints them")
        else:
            rep.warn(f"{path}: {', '.join(est)} are on {where}, but not together, in this order")


def check_quote(rep: Report, path: str, qt: dict, key: str, coll: dict, texts) -> None:
    text, src = qt["text"], qt["in"]
    if pending(text):
        return
    if is_sentinel(text):
        rep.warn(f"{path}: no quote")
        return
    if src == THIS_PAPER:
        found_in, k = "the paper or its supplementary files", key
    elif DOI_RE.match(src):
        k = coll.doi2key.get(src.lower())
        if not k:
            rep.warn(f"{path}: cannot be verified, {src} is not in the collection")
            return
        found_in = k
    else:
        rep.err(f"{path}.in: '{THIS_PAPER}' or the DOI of the article quoted")
        return
    needle = alnum(text)
    if len(needle) < 20:
        rep.err(f"{path}: too short to verify; quote a whole clause")
        return
    c = texts(k)
    if c is None:  # not downloaded here
        if k != key:
            rep.not_here(f"the files of {k} (quoted)")
        return
    if needle in c["alnum"]:
        rep.quotes += 1
        return
    if re.sub(r"\d", "", needle) in c["nodigits"]:
        rep.warn(f"{path}: found only when digits are ignored (citation numbers?); copy it as extracted")
        return
    rep.err(
        f"{path}: not found in {found_in}. Copy the sentence exactly as the paper prints it: `glossator text {k}` "
        f"writes the paper's text to .work/{k}/*.txt"
    )


def check_article(key: str, coll: dict, texts) -> Report:
    rep = Report(key)
    folder = coll.biblio.articles / key
    try:
        rec = load_json(folder / "record.json")
    except FileNotFoundError:
        rep.err("record.json: missing")
        return rep
    except ValueError as e:
        rep.err(f"record.json: not valid JSON ({e})")
        return rep

    entries = {p.name for p in folder.iterdir() if not TMP_RE.match(p.name)}
    # git keeps no empty folder: a clone lacks figures/ or supplementary/ while the record lists nothing there
    supp = rec.get("supplementary") if isinstance(rec, dict) else None
    may_lack = {"figures"} if isinstance(rec, dict) and not rec.get("figures") else set()
    may_lack |= {"supplementary"} if not (isinstance(supp, dict) and supp.get("files")) else set()
    for name in FOLDER:
        if name not in entries and name not in may_lack:
            rep.err(f"{name}: missing")
    for name in sorted(entries - set(FOLDER)):
        rep.err(f"{name}: not part of an article folder (scratch files go in .work/{key}/)")

    before = len(rep.errors)
    shape("record", rec, coll.biblio.format, rep)
    if len(rep.errors) > before:
        return rep
    for path, s in walk_strings("record", rec):
        if not s.strip():
            rep.err(f"{path}: empty (write the value, 'not reported' or 'not applicable')")
        elif s.strip().upper().startswith("TODO"):
            rep.err(f"{path}: still TODO")

    b = rec["bib"]
    if rec["key"] != key:
        rep.err(f"record.key: '{rec['key']}' but the folder is '{key}'")
    if not KEY_RE.match(key):
        rep.err("key: lowercase family name + year (+ a title word)")
    if rec["schema"] != 1:
        rep.err("record.schema: 1")
    if rec["status"] == "draft":
        rep.err("record.status: still 'draft' (set 'complete' once every section is filled and checked)")
    elif rec["status"] != "complete":
        rep.err("record.status: draft | complete")
    in_vocab(rep, "record.kind", rec["kind"], coll.biblio.vocab[coll.biblio.kind_vocab], sentinel=False)

    if not DOI_RE.match(b["doi"]):
        rep.err("bib.doi: a DOI (10.xxxx/...)")
    if not 1900 <= b["year"] <= 2100:
        rep.err("bib.year: missing")
    if not DATE_RE.match(b["date"]):
        rep.err("bib.date: YYYY-MM-DD")
    if b["pmid"] != "none" and not b["pmid"].isdigit():
        rep.err("bib.pmid: digits, or 'none'")
    if b["pmcid"] != "none" and not re.fullmatch(r"PMC\d+", b["pmcid"]):
        rep.err("bib.pmcid: PMC + digits, or 'none'")
    if not b["authors"]:
        rep.err("bib.authors: empty")

    p, pdf = rec["paper"], folder / "paper.pdf"
    if p["file"] != "paper.pdf":
        rep.err("paper.file: paper.pdf")
    in_vocab(rep, "paper.version", p["version"], VOCAB["paper_version"], sentinel=False)
    if not p["source_url"].startswith("http") and not pending(p["source_url"]):
        rep.err("paper.source_url: the URL the PDF came from")
    if not DATE_RE.match(p["retrieved"]) and not pending(p["retrieved"]):
        rep.err("paper.retrieved: YYYY-MM-DD")
    if pdf.is_file() and lfs_oid(pdf):  # not downloaded here: the placeholder holds its checksum
        rep.not_here("paper.pdf")
        if p["sha256"] != lfs_oid(pdf):
            rep.err("paper.sha256: does not match paper.pdf (run fetch-pdf again)")
    elif pdf.is_file():
        if pdf.read_bytes()[:5] != b"%PDF-":
            rep.err("paper.pdf: not a PDF")
        else:
            if p["sha256"] != sha256(pdf):
                rep.err("paper.sha256: does not match paper.pdf (run fetch-pdf again)")
            if p["pages"] != pdf_pages(pdf):
                rep.err("paper.pages: does not match paper.pdf")
            if title_score(b["title"], "\n".join(pdf_page_texts(pdf, last=2))) < 0.6:
                rep.warn("paper.pdf: the title is not on its first two pages; is it the right paper?")

    sp = rec["supplementary"]
    in_vocab(rep, "supplementary.status", sp["status"], VOCAB["supplementary_status"], sentinel=False)
    listed = [f["file"] for f in sp["files"]]
    sdir = folder / "supplementary"
    on_disk = (
        {f"supplementary/{x.name}" for x in sdir.iterdir() if not TMP_RE.match(x.name)} if sdir.is_dir() else set()
    )
    for f in sorted(on_disk - set(listed)):
        rep.err(f"{f}: on disk but not in supplementary.files")
    for i, f in enumerate(sp["files"]):
        path = folder / f["file"]
        if not f["file"].startswith("supplementary/") or Path(f["file"]).suffix.lower() not in SUPP_EXT:
            rep.err(f"supplementary.files[{i}].file: supplementary/<name> with one of {', '.join(SUPP_EXT)}")
        elif not path.is_file():
            rep.err(f"{f['file']}: listed but missing")
        elif f["sha256"] != (lfs_oid(path) or sha256(path)):
            rep.err(f"supplementary.files[{i}].sha256: does not match the file")
        elif lfs_oid(path):
            rep.not_here(f["file"])
        if not f["source_url"].startswith("http"):
            rep.err(f"supplementary.files[{i}].source_url: the URL it came from")
    if sp["status"] in ("retrieved", "partial") and not listed:
        rep.err(f"supplementary.status: '{sp['status']}' but no file")
    if sp["status"] in ("none-published", "not-open") and listed:
        rep.err(f"supplementary.status: '{sp['status']}' but files are listed")

    roles = [f["role"] for f in rec["figures"]]
    for i, f in enumerate(rec["figures"]):
        if f["role"] not in coll.biblio.figure_fields:
            rep.err(
                f"figures[{i}].role: '{f['role']}' is not a figure role here ({', '.join(coll.biblio.figure_fields)})"
            )
        if f["file"] != f"figures/{f['role']}.png":
            rep.err(f"figures[{i}].file: figures/{f['role']}.png (made by crop)")
        elif not (folder / f["file"]).is_file():
            rep.err(f"{f['file']}: listed but missing")
    if len(set(roles)) != len(roles):
        rep.err("figures: one figure per role")
    fdir = folder / "figures"
    fig_disk = {f"figures/{x.name}" for x in fdir.iterdir() if not TMP_RE.match(x.name)} if fdir.is_dir() else set()
    for f in sorted(fig_disk - {f["file"] for f in rec["figures"]}):
        rep.err(f"{f}: on disk but not in figures")
    for role, section in coll.biblio.figure_fields.items():
        says = rec[section]["figure"]
        if says == NO_FIGURE and role in roles:
            rep.err(f"{section}.figure: says '{NO_FIGURE}' but figures/{role}.png exists")
        if says not in (NO_FIGURE, *SENTINELS) and not says.startswith("TODO") and role not in roles:
            rep.err(
                f"{section}.figure: names '{says}' but there is no figures/{role}.png (run: crop {key} "
                f"--role {role} ...)"
            )

    if not rec["overview"]["abstract"]:
        rep.err("overview.abstract: 1 to 3 paragraphs")
    if len(rec["overview"]["one_line"]) > 300:
        rep.warn("overview.one_line: longer than 300 characters")

    coll.biblio.plugin.check(rep, rec, coll, texts)
    if not DATE_RE.match(rec["curation"]["date"]):
        rep.err("curation.date: YYYY-MM-DD")

    if rec["key"] == key and key in coll.recs:
        try:
            article_html(rec, coll)
            article_md(rec, coll)
        except (KeyError, TypeError, AttributeError) as e:
            rep.err(f"record.json: does not render ({e.__class__.__name__}: {e})")
    return rep


def check_collection(coll: dict) -> Report:
    rep = Report("collection", counts=False)
    if coll.biblio.articles.exists():
        for p in coll.biblio.articles.iterdir():
            if not p.is_dir():
                rep.err(f"articles/{p.name}: only article folders go in articles/")
            elif p.name not in coll.recs:
                rep.err(f"articles/{p.name}: record.json missing, unreadable or with another key")
    if coll.biblio.plugin.check_collection:
        coll.biblio.plugin.check_collection(rep, coll)
    for name in ("index.html", "catalog.md"):
        if (coll.biblio.root / name).exists():
            rep.err(f"{name}: generated pages are no longer kept here (`build` writes build/index.html); delete it")
    return rep


def keys_of(biblio, a) -> list[str]:
    if a.all:
        return [d.name for d in article_dirs(biblio)]
    if not a.keys:
        die("give one or more keys, or --all")
    for k in a.keys:
        if not (biblio.articles / k).is_dir():
            die(f"articles/{k}/ does not exist")
    return a.keys


def cmd_check(biblio, a) -> int:
    keys, coll = keys_of(biblio, a), collection(biblio)
    cache: dict[str, dict] = {}

    def texts(k: str, rec: dict | None = None) -> dict:
        if k not in cache:
            cache[k] = corpus(biblio.articles / k, rec or coll.recs[k])
        return cache[k]

    errors, warnings, unread, quotes, numbers = 0, 0, 0, 0, 0
    for key in keys:
        rep = check_article(key, coll, texts)
        rep.print()
        errors, warnings = errors + len(rep.errors), warnings + len(rep.warnings)
        unread += bool(rep.unread)
        quotes, numbers = quotes + rep.quotes, numbers + rep.numbers
    if a.all:
        rep = check_collection(coll)
        rep.print()
        errors, warnings = errors + len(rep.errors), warnings + len(rep.warnings)
    print(
        f"{biblio.name}: {count(len(keys), 'article')}, {count(errors, 'error')}"
        + (f", {count(warnings, 'warning')}" if warnings else "")
        + f". Found in the papers' text: {count(quotes, 'quote')}, {count(numbers, 'number')}."
    )
    if unread:
        print(
            f"{count(unread, 'article')} checked without the files not downloaded on this clone: what those files "
            "hold is checked where they are (or after `glossator join --full` on a light clone, `git -C library lfs pull` on another)."
        )
    return 1 if errors else 0
