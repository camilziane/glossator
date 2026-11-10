"""The commands that make and fill an article's folder: new, fetch-pdf, supp, text, page, crop, cite, vocab; and
bibs and list. A profile may add its own (glossator.profiles)."""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

from .bibliography import (
    bibliographies,
    collection,
    locked,
    open_article,
    resolve_pdf,
    save_record,
    workdir,
)
from .net import (
    BLOCKING_HOSTS,
    BROWSER_UA,
    NET_ERRORS,
    PREPRINT_SERVERS,
    aws_listing,
    cite_label,
    get_json,
    http_get,
    is_main_or_image,
    make_bib,
    metadata,
    q,
)
from .paths import LIBRARY
from .pdf import draw_grid, file_text, page_size_pts, pdf_page_texts, pdf_pages, png_size, text_sources
from .records import DOI_RE, KEY_RE, SUPP_EXT, VOCAB, skeleton, vlabel
from .settings import refs_bibs
from .util import die, fold, norm_doi, run, sha256, title_score, title_words, today


def bib_keys_by_doi() -> dict[str, str]:
    keys = {}
    for path in refs_bibs():
        if not path.exists():
            continue
        for entry in re.split(r"\n(?=@)", path.read_text(encoding="utf-8", errors="replace")):
            km = re.match(r"\s*@\w+\s*\{\s*([^,\s]+)\s*,", entry)
            dm = re.search(r"\bdoi\s*=\s*[{\"]([^}\"]+)[}\"]", entry, re.I)
            if km and dm:
                keys[norm_doi(dm.group(1)).lower()] = km.group(1)
    return keys


def derive_key(biblio, m: dict) -> tuple[str, str]:
    bibkey = bib_keys_by_doi().get(m["doi"].lower())
    if bibkey and KEY_RE.match(bibkey) and not (biblio.articles / bibkey).exists():
        return bibkey, "the key a manuscript of library.toml's refs_bibs cites it under"
    base = fold(m["families"][0] if m["families"] else "anonymous") + str(m["year"])
    missing = [p.name for p in refs_bibs() if not p.exists()]
    if missing and not (biblio.articles / base).exists():  # the manuscripts' keys could not be looked up here
        return base, f"first author + year; {', '.join(missing)} (library.toml's refs_bibs) is not on this computer"
    if not (biblio.articles / base).exists():
        return base, "first author + year"
    for word in title_words(m["title"]):
        if not (biblio.articles / (base + word)).exists():
            return base + word, f"first author + year + first title word ({base} is taken)"
    die(f"no free key for {m['doi']}: pass --key")
    raise AssertionError


def cmd_new(biblio, a) -> int:
    doi = norm_doi(a.doi)
    if not DOI_RE.match(doi):
        die(f"'{a.doi}' is not a DOI")
    if a.key and not KEY_RE.match(a.key):
        die(f"--key {a.key}: lowercase family name + year (+ a title word), e.g. jumper2021, ioannidis2005false")
    m = metadata(doi)
    if m is None:
        die(f"{doi} is not in Crossref, OpenAlex or DataCite: check the DOI")
    with locked(biblio):
        for k, rec in collection(biblio).recs.items():
            if str((rec.get("bib") or {}).get("doi", "")).lower() == doi.lower():
                die(f"{doi} is already in the collection: articles/{k}/")
        if a.key:
            if (biblio.articles / a.key).exists():
                die(f"articles/{a.key}/ exists")
            key, why = a.key, "given with --key"
        else:
            key, why = derive_key(biblio, m)
        folder = biblio.articles / key
        folder.mkdir(parents=True)
        (folder / "figures").mkdir()
        (folder / "supplementary").mkdir()
        save_record(folder, skeleton(biblio, key, make_bib(m)))
    print(f"articles/{key}/  ({why})")
    print(
        f"  {m['title']}\n  {cite_label(m['families'], m['year'], m['venue_short'])} · doi:{doi}"
        f" · PMID {m['pmid']} · {m['pmcid']}"
    )
    locs = [loc for loc in (m["oa"] or {}).get("locations") or [] if loc.get("pdf_url")]
    print(
        f"  open PDF locations known to OpenAlex: {len(locs)}"
        + (" (next: fetch-pdf)" if locs else " (next: fetch-pdf; it also tries PubMed Central's open data)")
    )
    return 0


def pdf_candidates(rec: dict) -> list[tuple[int, str, str, str, str]]:
    """(rank, url, version, license, host), best first: published > accepted > preprint, blocking hosts last."""
    b = rec["bib"]
    rank = {"publishedVersion": 0, "acceptedVersion": 10, "submittedVersion": 20}
    out, seen = [], set()

    def add(r, url, version, lic, host):
        if url and url not in seen:
            seen.add(url)
            out.append((r, url, version, lic or "not reported", host))

    oa = get_json(f"https://api.openalex.org/works/doi:{q(b['doi'])}") or {}
    pmc_license = None
    for loc in oa.get("locations") or []:
        url, version = loc.get("pdf_url"), loc.get("version") or "submittedVersion"
        host = (loc.get("source") or {}).get("display_name") or urllib.parse.urlsplit(url or "").netloc
        if any(s in f"{host} {url}".lower() for s in PREPRINT_SERVERS):
            version = "submittedVersion"  # OpenAlex sometimes calls a medRxiv or bioRxiv copy 'accepted'
        if "pubmed central" in host.lower() and loc.get("license"):
            pmc_license = loc["license"]
        if url:
            add(
                rank.get(version, 20) + (5 if any(h in url for h in BLOCKING_HOSTS) else 0),
                url,
                version,
                loc.get("license"),
                host,
            )
    pmcid = b.get("pmcid")
    if isinstance(pmcid, str) and pmcid.startswith("PMC"):
        for url, _ in aws_listing(pmcid):
            if re.search(rf"/{pmcid}\.\d+\.pdf$", url):
                meta = get_json(url[: -len(".pdf")] + ".json") or {}
                # An NIH author manuscript is the accepted version, not the publisher's.
                version = "acceptedVersion" if meta.get("is_manuscript") else "publishedVersion"
                lic = (meta.get("license_code") or "").lower().replace(" ", "-") or pmc_license
                add(1 if version == "publishedVersion" else 11, url, version, lic, "PubMed Central open data (AWS)")
    if b["doi"].lower().startswith("10.48550/arxiv."):
        add(20, "https://arxiv.org/pdf/" + b["doi"].split(".", 2)[2], "submittedVersion", None, "arXiv")
    return sorted(out, key=lambda c: c[0])


def hand_file(biblio, given: str | None) -> Path | None:
    """The file `--file` names, which must be in the bibliography's library (a hand download goes to
    library/<bibliography>/.work/manual/): anything else of this computer stays out of the records."""
    if not given:
        return None
    path = Path(given).expanduser().resolve()
    if not path.is_relative_to(biblio.root.parent.resolve()):
        die(f"--file: a file under {biblio.root.parent} (e.g. {biblio.root / '.work' / 'manual'}/)")
    return path


def try_pdf(url: str, dest: Path, title: str, title_check: bool, local: Path | None = None) -> tuple[bool, str]:
    if local:
        data, ctype = local.read_bytes(), "local file"
    else:
        try:
            data, ctype = http_get(url, ua=BROWSER_UA, timeout=180)
        except NET_ERRORS as e:
            return False, f"download failed ({e.__class__.__name__}: {e})"
    if not data.startswith(b"%PDF-"):
        return False, f"not a PDF ({ctype}, {len(data)} bytes)"
    dest.write_bytes(data)
    pages = pdf_pages(dest)
    if not pages:
        return False, "pdfinfo cannot read it"
    score = title_score(title, "\n".join(pdf_page_texts(dest, last=2)))
    if title_check and score < 0.7:
        return False, f"the title is not on its first two pages (match {score:.0%}): another paper or another title"
    return True, f"{pages} pages, title match {score:.0%}"


def cmd_fetch_pdf(biblio, a) -> int:
    folder, rec = open_article(biblio, a.key)
    local = hand_file(biblio, a.file)
    if local and not (local.is_file() and a.url):
        die("--file needs an existing PDF and --url with the open page it was downloaded from")
    if a.url:
        if not a.version:
            die("--url needs --version publishedVersion | acceptedVersion | submittedVersion")
        cands = [(0, a.url, a.version, a.license or "not reported", urllib.parse.urlsplit(a.url).netloc)]
    else:
        cands = pdf_candidates(rec)
    if not cands:
        die("no open PDF location known: find one (see the agent's rules) and pass --url URL --version V")
    tmp = workdir(biblio, a.key) / "candidate.pdf"
    for _, url, version, lic, host in cands:
        ok, msg = try_pdf(url, tmp, rec["bib"]["title"], not a.no_title_check, local)
        print(f"{'OK  ' if ok else 'FAIL'} {version:17} {host}: {msg}\n     {url}")
        if ok:
            pdf = folder / "paper.pdf"
            os.replace(tmp, pdf)
            rec["paper"].update(
                file="paper.pdf",
                version=version,
                source_url=url,
                host=host,
                license=lic,
                pages=pdf_pages(pdf),
                sha256=sha256(pdf),
                retrieved=today(),
            )
            save_record(folder, rec)
            print(f"articles/{a.key}/paper.pdf: {vlabel(VOCAB['paper_version'], version)} from {host}")
            return 0
    die("no candidate gave the paper: look for another open copy and pass --url URL --version V")
    return 2


def cmd_supp(biblio, a) -> int:
    folder, rec = open_article(biblio, a.key)
    b = rec["bib"]
    if a.list:
        pmcid = b.get("pmcid")
        if isinstance(pmcid, str) and pmcid.startswith("PMC"):
            files = [(u, s) for u, s in aws_listing(pmcid) if not is_main_or_image(u, pmcid)]
            print(f"PubMed Central open data ({pmcid}): {len(files)} supplementary file(s)")
            for url, size in files:
                ext = Path(url).suffix.lower()
                note = "" if ext in SUPP_EXT else "   (not a text format: not downloaded)"
                print(f"  {size / 1e6:7.1f} MB  {url}{note}")
        else:
            print("no PMCID: no PubMed Central copy")
        oa = get_json(f"https://api.openalex.org/works/doi:{q(b['doi'])}") or {}
        pages = {loc.get("landing_page_url") for loc in oa.get("locations") or [] if loc.get("landing_page_url")}
        print(
            "pages to look at by hand (the publisher's 'Supplementary' section; bioRxiv/medRxiv: "
            "<landing page>.supplementary-material):"
        )
        for url in sorted(pages | {f"https://doi.org/{b['doi']}"}):
            print(f"  {url}")
        print(f'download one: glossator --bib {biblio.name} supp {a.key} --url URL --label "Supplementary Information"')
        return 0
    if not a.label:
        die("--url needs --label (e.g. 'Supplementary Information', 'Supplementary Appendix')")
    local = hand_file(biblio, a.file)
    if local and not local.is_file():
        die("--file needs an existing file and --url with the page it was downloaded from")
    raw = a.name or (
        local.name if local else urllib.parse.unquote(urllib.parse.urlsplit(a.url).path.rsplit("/", 1)[-1])
    )
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("._")
    ext = Path(name).suffix.lower()
    if ext not in SUPP_EXT:
        die(f"'{name}': supplementary/ takes {', '.join(SUPP_EXT)} files (pass --name with the right extension)")
    if local:
        data, ctype = local.read_bytes(), "local file"
    else:
        try:
            data, ctype = http_get(a.url, ua=BROWSER_UA, timeout=300)
        except NET_ERRORS as e:
            die(f"download failed ({e.__class__.__name__}: {e})")
    if ext == ".pdf" and not data.startswith(b"%PDF-"):
        die(f"not a PDF ({ctype}, {len(data)} bytes)")
    if ext in (".docx", ".xlsx") and not data.startswith(b"PK"):
        die(f"not an Office file ({ctype})")
    if len(data) > 60_000_000:
        die(f"{len(data) / 1e6:.0f} MB: larger than 60 MB, leave it out and say so in supplementary.note")
    dest = folder / "supplementary" / name
    dest.parent.mkdir(exist_ok=True)  # a clone lacks it while empty: git keeps no empty folder
    dest.write_bytes(data)
    entry = {
        "file": f"supplementary/{name}",
        "label": a.label,
        "source_url": a.url,
        "sha256": sha256(dest),
        "bytes": len(data),
        "pages": pdf_pages(dest) if ext == ".pdf" else 0,
    }
    rec["supplementary"]["files"] = [f for f in rec["supplementary"]["files"] if f.get("file") != entry["file"]]
    rec["supplementary"]["files"].append(entry)
    save_record(folder, rec)
    print(
        f"articles/{a.key}/{entry['file']}  ({len(data) / 1e6:.1f} MB"
        + (f", {entry['pages']} pages" if entry["pages"] else "")
        + ")"
    )
    return 0


def cmd_text(biblio, a) -> int:
    folder, rec = open_article(biblio, a.key)
    work = workdir(biblio, a.key)
    sources = text_sources(folder, rec)
    if not sources:
        die("no paper.pdf yet (run fetch-pdf)")
    for path in sources:
        if path.suffix.lower() == ".pdf":
            for layout, suffix in ((False, ".txt"), (True, ".layout.txt")):
                pages = pdf_page_texts(path, layout)
                body = "".join(f"\n===== {path.name} · page {i} =====\n{p}" for i, p in enumerate(pages, 1))
                (work / f"{path.name}{suffix}").write_text(body, encoding="utf-8")
            print(
                f"{work / (path.name + '.txt')}  ({len(pages)} pages; tables keep their columns in "
                f"{path.name}.layout.txt)"
            )
        else:
            text = file_text(path)
            (work / f"{path.name}.txt").write_text(text, encoding="utf-8")
            print(f"{work / (path.name + '.txt')}  ({len(text)} characters)")
    return 0


def cmd_page(biblio, a) -> int:
    folder, _ = open_article(biblio, a.key)
    pdf = resolve_pdf(folder, a.pdf)
    prefix = workdir(biblio, a.key) / f"view-{pdf.stem}-p{a.page}"
    # -cropbox: render the page as pdfinfo sizes it (the crop box), so the grid's fractions are crop's fractions.
    proc = run(
        [
            "pdftoppm",
            "-f",
            str(a.page),
            "-l",
            str(a.page),
            "-r",
            str(a.dpi),
            "-cropbox",
            "-png",
            "-singlefile",
            str(pdf),
            str(prefix),
        ]
    )
    png = prefix.with_suffix(".png")
    if proc.returncode or not png.exists():
        die(f"pdftoppm failed: {proc.stderr.strip()}")
    gridded = draw_grid(png)
    w, h = png_size(png)
    print(f"{png}  ({w}x{h} px" + (", red grid every 0.05 of the page, labelled every 0.1" if gridded else "") + ")")
    return 0


def cmd_crop(biblio, a) -> int:
    folder, rec = open_article(biblio, a.key)
    pdf = resolve_pdf(folder, a.pdf)
    try:
        x0, y0, x1, y1 = (float(v) for v in a.box.split(","))
    except ValueError:
        die("--box X0,Y0,X1,Y1: fractions of the page from its top-left corner, e.g. 0.05,0.08,0.95,0.42")
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        die("--box: 0 <= X0 < X1 <= 1 and 0 <= Y0 < Y1 <= 1")
    wpt, hpt = page_size_pts(pdf, a.page)
    scale = a.dpi / 72
    x, y = round(x0 * wpt * scale), round(y0 * hpt * scale)
    w, h = round((x1 - x0) * wpt * scale), round((y1 - y0) * hpt * scale)
    prefix = folder / "figures" / a.role
    prefix.parent.mkdir(exist_ok=True)  # a clone lacks it while empty
    proc = run(
        [
            "pdftoppm",
            "-f",
            str(a.page),
            "-l",
            str(a.page),
            "-r",
            str(a.dpi),
            "-cropbox",
            "-x",
            str(x),
            "-y",
            str(y),
            "-W",
            str(w),
            "-H",
            str(h),
            "-png",
            "-singlefile",
            str(pdf),
            str(prefix),
        ]
    )
    if proc.returncode:
        die(f"pdftoppm failed: {proc.stderr.strip()}")
    entry = {"role": a.role, "file": f"figures/{a.role}.png", "from": a.from_, "caption": a.caption}
    order = list(biblio.figure_fields)
    rec["figures"] = sorted(
        [f for f in rec["figures"] if f.get("role") != a.role] + [entry],
        key=lambda f: order.index(f["role"]) if f.get("role") in order else len(order),
    )
    save_record(folder, rec)
    print(
        f"{prefix}.png  ({w}x{h} px at {a.dpi} dpi): look at it, and crop again with another --box if a panel "
        f"is cut or a neighbouring panel shows"
    )
    return 0


def cmd_cite(biblio, a) -> int:
    doi2key = collection(biblio).doi2key
    status = 0
    for raw in a.dois:
        doi = norm_doi(raw)
        m = metadata(doi) if DOI_RE.match(doi) else None
        if m is None:
            print(f"# {raw}: not found in Crossref, OpenAlex or DataCite")
            status = 1
            continue
        entry = {"link": doi, "cite": cite_label(m["families"], m["year"], m["venue_short"]), "title": m["title"]}
        local = doi2key.get(doi.lower())
        print(json.dumps(entry, ensure_ascii=False) + (f"   # in the collection: {local}" if local else ""))
    return status


def cmd_vocab(biblio, _a) -> int:
    for name, values in biblio.vocab.items():
        print(f"{name}:")
        for value, d in values.items():
            print(f"  {value:22} {d['label']}: {d['means']}")
    print(
        "\nA vocabulary field takes one of these values, or 'not reported' / 'not applicable'. A free-text field "
        "takes its value, 'not reported', 'not applicable', or 'none' where nothing exists (e.g. no code release)."
    )
    return 0


def cmd_bibs(_a) -> int:
    """One line per bibliography, tab-separated: name, profile, articles, title, scope."""
    for b in bibliographies():
        print("\t".join((b.name, b.profile, str(len(collection(b).recs)), b.title, b.scope)))
    if not bibliographies():
        print(f"no bibliography in {LIBRARY} (clone one there, or make a folder with a biblio.json)")
    return 0


def cmd_list(biblio, _a) -> int:
    """One line per article, tab-separated: bibliography, key, DOI, year, citation, title. What a search compares
    its candidates with before anything is added."""
    for key, rec in sorted(collection(biblio).recs.items()):
        b = rec.get("bib") or {}
        print(
            "\t".join(
                str(x)
                for x in (biblio.name, key, b.get("doi", ""), b.get("year", ""), b.get("cite", ""), b.get("title", ""))
            )
        )
    return 0
