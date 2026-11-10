"""The paper inbox: every day the scout looks for new papers (scout.py), Haiku agents triage them (triage.py), and
they wait in library/inbox/ until you accept or reject each. An accepted paper is then added by `/glossator-add
inbox`. Started, stopped and followed with `glossator inbox start | stop | status` (a line of your crontab)."""

from __future__ import annotations

import collections
import contextlib
import datetime as dt
import fcntl
import html
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tomllib
import urllib.parse
from pathlib import Path

from .bibliography import bibliographies, collection
from .paths import BUILD, LIBRARY, ROOT
from .remote import CRON_TAG
from .scout import SOURCES
from .util import fold, load_json, write_atomic

INBOX = LIBRARY / "inbox"
ITEMS = INBOX / "items"
PDFS = INBOX / "pdfs"  # <id>.pdf: the open PDFs fetched for papers not decided yet (Git LFS)
WATCH = INBOX / "watch.toml"
STATE = INBOX / "state.json"
LOG = INBOX / "inbox.log"
LOCK = INBOX / ".lock"
STATUSES = ("new", "accepted", "rejected", "added")

# --------------------------------------------------------------------------- the watch


def papers(n: int) -> str:
    return f"{n} paper{'' if n == 1 else 's'}"


def shown(path: Path) -> str:
    """A path as a message shows it, from the tool's folder."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


WATCH_HEADER = [
    "# The daily paper inbox: what the scout watches, for which bibliography. Edit freely: `glossator inbox run`",
    "# reads it each time. Queries go to public services (OpenAlex, PubMed, arXiv, bioRxiv/medRxiv): name",
    "# topics, methods and authors, never unpublished work.",
    "",
    "first_days = 14      # how far back the first run looks; later runs look back to the previous run",
    "per_query = 20       # at most this many results per query and source",
    "show_from = 1        # `inbox list` and the page show the papers Haiku rates at least this (0–3)",
    "fetch_from = 2       # the daily run fetches the open PDF of the papers rated at least this (none: never)",
    "citations = true     # also the papers of the last citations_days (30) citing the articles (OpenAlex)",
    "# prior_gate = 0.65  # papers the library's prior scores below this (0–1) are not sent to Haiku (unset: all)",
    "",
]


def watch_block(bib: str, queries: list[str] | tuple = (), authors: list[str] | tuple = ()) -> list[str]:
    """The [[watch]] lines of one bibliography (TOML strings written as JSON writes them: the same escapes)."""
    lines = ["[[watch]]", f"bib = {json.dumps(bib)}", 'queries = [  # topic words, e.g. "coral bleaching"']
    lines += [f"  {json.dumps(q, ensure_ascii=False)}," for q in queries] + ["]"]
    lines += ["authors = ["] + [f"  {json.dumps(a, ensure_ascii=False)}," for a in authors] + ["]"]
    lines.append(f"sources = {json.dumps(list(SOURCES))}")
    lines += ['# biorxiv_categories = ["ecology"]   # bioRxiv/medRxiv: only these categories', ""]
    return lines


def init(force: bool = False, queries: dict[str, list[str]] | None = None) -> str:
    """Write inbox/watch.toml: one watch per bibliography, with the senior authors (last authors) who sign at least
    two of its articles, and the queries given (none by default: they are written afterwards)."""
    refuse("init")
    if WATCH.exists() and not force:
        return f"{shown(WATCH)} exists (--force rewrites it)"
    INBOX.mkdir(parents=True, exist_ok=True)
    lines = list(WATCH_HEADER)
    for b in bibliographies():
        last = collections.Counter(r["bib"]["authors"][-1] for r in collection(b).recs.values() if r["bib"]["authors"])
        authors = [a for a, n in last.most_common(12) if n >= 2]
        lines += watch_block(b.name, (queries or {}).get(b.name, []), authors)
    WATCH.write_text("\n".join(lines), encoding="utf-8")
    return f"{shown(WATCH)} written: write its queries, check its authors"


def load_watch() -> dict:
    if not WATCH.exists():
        init()
    return tomllib.loads(WATCH.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- the items


def load_items() -> list[dict]:
    return [load_json(p) for p in sorted(ITEMS.glob("*.json"))] if ITEMS.exists() else []


ID_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,150}")  # what item_id makes: never a path


def is_id(i: str) -> bool:
    return isinstance(i, str) and ID_RE.fullmatch(i) is not None


def update_item(item_id: str, **fields) -> dict:
    """Set these fields of an item as it is on disk now, keeping what changed meanwhile (a decision taken while
    a run fetched its PDF), and return it."""
    it = load_json(ITEMS / f"{item_id}.json")
    for k, v in fields.items():
        if v is None:
            it.pop(k, None)
        else:
            it[k] = v
    save_item(it)
    return it


def save_item(item: dict) -> None:
    ITEMS.mkdir(parents=True, exist_ok=True)
    write_atomic(ITEMS / f"{item['id']}.json", json.dumps(item, ensure_ascii=False, indent=1) + "\n")


def known() -> tuple[set[str], set[str]]:
    """The DOIs and title keys the bibliographies and the inbox already hold: never proposed again."""
    from .scout import norm_doi, title_key

    dois, titles = set(), set()
    for b in bibliographies():
        for rec in collection(b).recs.values():
            dois.add(norm_doi((rec.get("bib") or {}).get("doi", "")))
            titles.add(title_key((rec.get("bib") or {}).get("title", "")))
    for it in load_items():
        dois.add(it.get("doi", ""))
        titles.add(title_key(it.get("title", "")))
    dois.discard("")
    titles.discard("")
    return dois, titles


def item_id(c: dict, taken: set[str]) -> str:
    """Like a bibliography key: first author's family name, year, first title word (then -2, -3…)."""
    family = fold((c["authors"][0].split() or ["anon"])[-1]) if c["authors"] else "anon"
    words = [w for w in (fold(x) for x in re.findall(r"[^\W\d_]+", c["title"])) if len(w) > 3]
    base = f"{family or 'anon'}{(c['date'] or '0000')[:4]}{words[0] if words else ''}"
    out, n = base, 2
    while out in taken:
        out, n = f"{base}-{n}", n + 1
    taken.add(out)
    return out


def merge_new(cands: list[dict]) -> list[dict]:
    """The candidates not yet known, one per paper (by DOI, else title): the richest record, every source and
    query that found it."""
    from .scout import title_key

    dois, titles = known()
    by: dict[str, dict] = {}
    for c in cands:
        if not c["title"] or c["doi"] in dois or title_key(c["title"]) in titles:
            continue
        k = c["doi"] or title_key(c["title"])
        if k in by:
            old = by[k]
            old["sources"] = sorted(set(old["sources"]) | {c["source"]})
            old["queries"] = sorted(set(old["queries"]) | {f"{c['bib']}: {c['query']}"})
            for f in ("abstract", "pdf", "venue", "doi"):
                if len(c[f]) > len(old[f]):
                    old[f] = c[f]
        else:
            by[k] = {**c, "sources": [c["source"]], "queries": [f"{c['bib']}: {c['query']}"]}
    taken = {p.stem for p in ITEMS.glob("*.json")} if ITEMS.exists() else set()
    out = list(by.values())
    for c in out:
        c["id"] = item_id(c, taken)
    return out


def items(status: str | None = "new", bib: str | None = None, show_from: int | None = None) -> list[dict]:
    """Inbox items, the most relevant and the newest first."""
    if show_from is None:
        show_from = int(load_watch().get("show_from", 1)) if WATCH.exists() else 1
    out = []
    for it in load_items():
        t = it.get("triage") or {}
        if status and it.get("status") != status:
            continue
        if bib and t.get("bib", it.get("bib")) != bib:
            continue
        if status == "new" and t.get("relevance") is not None and t["relevance"] < show_from:
            continue
        out.append(it)
    out.sort(key=lambda it: it.get("date", ""), reverse=True)  # the newest first, then (stable) the closest, then
    out.sort(key=lambda it: -((it.get("prior") or {}).get("score") or 0))  # the most relevant
    return sorted(out, key=lambda it: -((it.get("triage") or {}).get("relevance") or 0))


def commit(message: str) -> str | None:
    """Commit the inbox's papers and state in the library's git, and nothing else, so that `glossator sync` carries
    them; on the original, an uncommitted change would refuse the other computers' pushes. Returns the message, or
    why it was not committed; None when there is nothing to commit (or no git)."""
    repo = INBOX.parent
    paths = [p.relative_to(repo).as_posix() for p in (ITEMS, STATE, PDFS) if p.exists()]
    if not (repo / ".git").exists() or not paths:
        return None

    def git(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)

    git("add", "-A", "--", *paths)
    if git("diff", "--cached", "--quiet", "--", *paths).returncode == 0:
        return None
    r = git("commit", "-q", "-m", message, "--", *paths)  # only these paths, whatever else is staged
    return message if r.returncode == 0 else f"not committed ({(r.stderr or r.stdout).strip()[-200:]})"


def decide(ids: list[str], status: str, note: str = "", via: str = "") -> list[str]:
    """Set the status of items (accepted, rejected, added) and commit it; returns what was done, item by item.
    `via`: where the decision was taken ("zotero"), written instead of the date, so that two computers applying the
    same decision write the same file and their commits do not conflict."""
    if status not in STATUSES:
        raise ValueError(f"status: {' | '.join(STATUSES)}")
    out = []
    for i in ids:
        p = ITEMS / f"{i}.json"
        if not is_id(i) or not p.exists():
            out.append(f"{i}: no such item")
            continue
        it = load_json(p)
        it["status"] = status
        if via:
            it.pop("decided", None)
            it["decided_in"] = via
        else:
            it["decided"] = dt.date.today().isoformat()
            it.pop("decided_in", None)
        if note:
            it["note"] = note
        if status in ("rejected", "added"):  # its PDF is no longer needed here: an article has its own
            (PDFS / f"{i}.pdf").unlink(missing_ok=True)
            it.pop("pdf_file", None)
        save_item(it)
        out.append(f"{i}: {status}")
    done = [i for i, line in zip(ids, out, strict=True) if line.endswith(f": {status}")]
    if done:
        more = f" and {len(done) - 3} more" if len(done) > 3 else ""
        got = commit(f"inbox: {status} {', '.join(done[:3])}{more}" + (f" (in {via})" if via else ""))
        if got and got.startswith("not committed"):
            out.append(f"inbox: {got}")
    return out


# --------------------------------------------------------------------------- the PDFs


def purge(dry_run: bool = False) -> str:
    """Free this computer of the PDFs the inbox no longer holds (rejected or added papers): their Git LFS files, when
    no other file of the library is the same. Git keeps their pointers: its history is not rewritten, no computer has
    to clone again, an old commit only misses them. On a clone, only the PDFs the original has already let go, so
    that a push never lacks a file."""
    repo = INBOX.parent

    def git(*args: str) -> str:
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(f"git {args[0]}: {(r.stderr or r.stdout).strip()[-300:]}")
        return r.stdout

    def oids(*args: str) -> set[str]:  # the LFS objects the pointers of these commits name
        out = git("log", "--format=", "-p", "--no-textconv", "--no-renames", *args)
        return set(re.findall(r"^[+-]oid sha256:([0-9a-f]{64})$", out, re.M))

    if not (repo / ".git").exists():
        return "inbox purge: the library is not under git"
    try:
        base = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").strip()  # a clone: its origin's
    except RuntimeError:
        base = "HEAD"  # the original
    rel = PDFS.relative_to(repo).as_posix()
    keep = oids("--all", "--", ".", f":(exclude){rel}")  # an article's file may be the same PDF
    for ref in {"HEAD", base}:
        keep |= {ln.split()[0] for ln in git("lfs", "ls-files", "--long", ref).splitlines() if ln.strip()}
    store = repo / git("rev-parse", "--git-path", "lfs/objects").strip()
    files = [store / o[:2] / o[2:4] / o for o in sorted(oids(base, "--", rel) - keep)]
    files = [f for f in files if f.is_file()]
    size = sum(f.stat().st_size for f in files) / 1e6
    if not dry_run:
        for f in files:
            f.unlink()
    verb = "would free" if dry_run else "freed"
    return (
        f"inbox purge: {len(files)} PDFs no longer in the inbox, {size:.1f} MB {verb} here (git keeps their pointers)"
    )


def pdf_here(it: dict) -> Path | None:
    """The paper's PDF in inbox/pdfs/, when it was fetched (and, on a light clone, downloaded)."""
    p = PDFS / f"{it['id']}.pdf"
    return p if it.get("pdf_file") and p.exists() else None


def to_fetch(min_relevance: int, retry: bool = False) -> list[dict]:
    """The papers waiting for a decision (new or accepted) that Haiku rates at least `min_relevance`, without their
    PDF; with `retry`, also those whose PDF was not found before. The most relevant first."""
    out = []
    for it in load_items():
        rel = (it.get("triage") or {}).get("relevance")
        if it.get("status") not in ("new", "accepted") or rel is None or rel < min_relevance or pdf_here(it):
            continue
        if retry or not it.get("pdf_tried"):
            out.append(it)
    return sorted(out, key=lambda it: -it["triage"]["relevance"])


def fetch_pdf(it: dict, log=print) -> bool:
    """Download the paper's open PDF into inbox/pdfs/<id>.pdf, as the curators do: the link the scout found, then
    the open copies OpenAlex and PubMed Central know; a file counts only if it is a PDF that bears the paper's title.
    The item keeps where it came from, or why none was found."""
    from .commands import pdf_candidates, try_pdf
    from .net import NET_ERRORS

    urls = [it["pdf"]] if it.get("pdf") else []
    if it.get("doi"):
        try:
            urls += [url for _, url, *_ in pdf_candidates({"bib": {"doi": it["doi"]}})]
        except NET_ERRORS as e:
            log(f"  {it['id']}: OpenAlex not reached ({e.__class__.__name__})")
    PDFS.mkdir(parents=True, exist_ok=True)
    tmp = INBOX / f".{it['id']}.part"  # outside pdfs/: a run cut short leaves nothing to commit
    why, today = "no open PDF known", dt.date.today().isoformat()
    for url in dict.fromkeys(urls):
        ok, why = try_pdf(url, tmp, it["title"], True)
        if ok:
            os.replace(tmp, PDFS / f"{it['id']}.pdf")
            it.update(
                update_item(it["id"], pdf_file=f"pdfs/{it['id']}.pdf", pdf_from=url, pdf_tried=today, pdf_error=None)
            )
            log(f"  {it['id']}: PDF, {why}")
            return True
    tmp.unlink(missing_ok=True)
    it.update(update_item(it["id"], pdf_tried=today, pdf_error=why))
    log(f"  {it['id']}: no PDF ({why})")
    return False


def fetch(ids: list[str] | None = None, min_relevance: int | None = None, log=print) -> int:
    """Fetch the PDFs of these papers, or of every paper rated at least `min_relevance` (by default the watch's
    `fetch_from`) that has none, retrying those not found before; commit them. Returns how many came."""
    if ids:
        chosen = []
        for i in ids:
            if is_id(i) and (ITEMS / f"{i}.json").exists():
                chosen.append(load_json(ITEMS / f"{i}.json"))
            else:
                log(f"  {i}: no such item")
    else:
        if min_relevance is None:
            min_relevance = int(load_watch().get("fetch_from", 2)) if WATCH.exists() else 2
        chosen = to_fetch(min_relevance, retry=True)
    got = sum(fetch_pdf(it, log) for it in chosen)
    log(f"{got} PDF{'' if got == 1 else 's'} of {papers(len(chosen))}")
    done = commit(f"inbox: {got} PDFs") if chosen else None
    if done and done.startswith("not committed"):
        log(f"inbox: {done}")
    return got


# --------------------------------------------------------------------------- the daily run


@contextlib.contextmanager
def run_lock():
    INBOX.mkdir(exist_ok=True)
    with LOCK.open("w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("a run is already going on") from None
        yield


def decided_examples() -> list[dict]:
    """The inbox papers already decided: kept (accepted, added) or dropped (rejected), for the triage's examples."""
    out = []
    for it in load_items():
        s = it.get("status")
        if s in ("accepted", "added", "rejected"):
            out.append(
                {
                    "title": it.get("title", ""),
                    "abstract": it.get("abstract", ""),
                    "bib": (it.get("triage") or {}).get("bib") or it.get("bib", ""),
                    "decision": "dropped" if s == "rejected" else "kept",
                }
            )
    return out


def score_new(new: list[dict], gate: float | None, log=print):
    """Score new papers by the library's prior (`prior.py`), in place (`prior`); return the triage's examples (a
    function of a batch: your nearest past decisions) and the triage of the papers the gate spares Haiku
    (scored below `prior_gate`). Without the model, nothing: the triage goes on as before."""
    from . import prior

    if not new:
        return None, {}
    try:
        p = prior.library_prior()
        vecs = p.vectors([prior.paper_text(c.get("title", ""), c.get("abstract", "")) for c in new])
        for c, best in zip(new, p.best(vecs), strict=True):
            c["prior"] = best
        decided = decided_examples()
        dvecs = p.vectors([prior.paper_text(d["title"], d["abstract"]) for d in decided])
    except Exception as e:  # no model on this computer, or no library: the triage alone
        log(f"  prior: not scored ({e.__class__.__name__}: {e})")
        return None, {}
    index = {c["id"]: i for i, c in enumerate(new)}

    def shots(batch: list[dict]) -> list[dict]:
        rows = [index[c["id"]] for c in batch if c["id"] in index]
        picked = prior.examples(vecs[rows], decided, dvecs) if rows else []
        return [{"title": d["title"], "bib": d["bib"], "decision": d["decision"]} for d in picked]

    gated = {}
    if gate is not None:
        for c in new:
            score = (c.get("prior") or {}).get("score")
            if score is not None and score < float(gate):
                gated[c["id"]] = {
                    "bib": c["prior"]["bib"],
                    "relevance": 0,
                    "summary": "",
                    "why": f"far from every bibliography (prior {score:.2f} < {float(gate):.2f}): not read by Haiku",
                    "kind": "",
                    "by": "prior",
                }
        if gated:
            log(f"  prior: {papers(len(gated))} below {gate}, not sent to Haiku")
    return shots, gated


def rescore(log=print) -> int:
    """Score every paper waiting for a decision by the library's prior, as the daily run scores the new ones."""
    from . import prior

    waiting = [it for it in load_items() if it.get("status") in ("new", "accepted")]
    if not waiting:
        return 0
    p = prior.library_prior()
    vecs = p.vectors([prior.paper_text(it.get("title", ""), it.get("abstract", "")) for it in waiting])
    for it, best in zip(waiting, p.best(vecs), strict=True):
        update_item(it["id"], prior=best)
    got = commit(f"inbox: {papers(len(waiting))} scored by the library's prior")
    if got:
        log(f"git: {got}")
    return len(waiting)


def run(log=print, do_triage: bool = True) -> dict:
    """Look for new papers since the last run, have them triaged (and the papers an earlier run could not
    triage), file them as `new`, rebuild the page. A run that fails says so in state.json (`failed`), which
    `inbox status` shows; the next run that succeeds clears it."""
    refuse("run")
    try:
        return run_once(log, do_triage)
    except Exception as e:
        try:
            state = load_json(STATE) if STATE.exists() else {}
            state["failed"] = {
                "at": dt.datetime.now().isoformat(timespec="seconds"),
                "error": f"{e.__class__.__name__}: {e}"[:500],
            }
            write_atomic(STATE, json.dumps(state, ensure_ascii=False, indent=1) + "\n")
        except OSError:
            pass
        raise


def run_once(log=print, do_triage: bool = True) -> dict:
    from .scout import citing_library, fetch
    from .triage import triage, untriaged

    with run_lock():
        watch = load_watch()
        state = load_json(STATE) if STATE.exists() else {}
        today = dt.date.today()
        if state.get("last_run_date"):
            since = (dt.date.fromisoformat(state["last_run_date"]) - dt.timedelta(days=1)).isoformat()
        else:
            since = (today - dt.timedelta(days=int(watch.get("first_days", 14)))).isoformat()
        log(f"{dt.datetime.now():%Y-%m-%d %H:%M} run: papers since {since}")
        cands, errors = [], []
        for w in watch.get("watch", []):
            found, errs = fetch(w, since, int(watch.get("per_query", 20)))
            log(f"  {w['bib']}: {len(found)} found" + (f", {len(errs)} source errors" if errs else ""))
            cands += found
            errors += errs
        if watch.get("citations", True):  # the new papers citing the bibliographies' articles
            days = int(watch.get("citations_days", 30))
            try:
                found = citing_library(min(since, (today - dt.timedelta(days=days)).isoformat()), 30)
                log(f"  citations: {len(found)} recent papers cite the bibliographies' articles")
                cands += found
            except Exception as e:  # OpenAlex down must not stop the run
                errors.append(f"citations: {e.__class__.__name__}: {e}")
        new = merge_new(cands)
        log(f"  {len(new)} new after removing what the bibliographies and the inbox already hold")
        shots, gated = score_new(new, watch.get("prior_gate"), log)
        old = untriaged(load_items()) if do_triage else []  # papers an earlier run could not triage
        if old:
            log(f"  {papers(len(old))} of earlier runs not triaged yet: triaged now")
        todo = [c for c in new if c["id"] not in gated] + old
        verdicts, terrs = triage(todo, shots) if (do_triage and todo) else ({}, [])
        verdicts |= gated
        errors += terrs
        found_on = today.isoformat()
        for c in new:
            c.update({"status": "new", "found": found_on, "triage": verdicts.get(c["id"])})
            c.pop("source", None)
            c.pop("query", None)
            save_item(c)
        for it in old:
            if verdicts.get(it["id"]):
                update_item(it["id"], triage=verdicts[it["id"]])
        pdfs = 0
        if watch.get("fetch_from") is not None:  # the papers rated high enough, new or left from the runs before
            todo = to_fetch(int(watch["fetch_from"]))
            if todo:
                log(f"  PDFs: {papers(len(todo))} rated {watch['fetch_from']} or more")
                pdfs = sum(fetch_pdf(it, log) for it in todo)
        notices, checked = state.get("notices", {}), state.get("notices_checked", "")
        if not checked or (today - dt.date.fromisoformat(checked)).days >= 7:  # once a week
            try:
                from .notices import format_notices, library_notices, serious

                notices, checked = library_notices([collection(b) for b in bibliographies()]), today.isoformat()
                if serious(notices):
                    log("  notices:\n" + format_notices(serious(notices)))
            except Exception as e:  # Crossref down: next run
                errors.append(f"notices: {e.__class__.__name__}: {e}")
        rated = collections.Counter((v or {}).get("relevance") for v in verdicts.values())
        state = {
            "last_run": dt.datetime.now().isoformat(timespec="seconds"),
            "last_run_date": today.isoformat(),
            "since": since,
            "found": len(cands),
            "new": len(new),
            "triaged": len(verdicts),
            "pdfs": pdfs,
            "relevance": {str(k): v for k, v in sorted(rated.items(), key=lambda x: str(x[0]))},
            "errors": errors,
            "notices": notices,
            "notices_checked": checked,
        }
        write_atomic(STATE, json.dumps(state, ensure_ascii=False, indent=1) + "\n")
        for e in errors:
            log(f"  ! {e}")
        log(f"  filed {len(new)} ({len(verdicts)} triaged by Haiku); relevance {state['relevance']}")
        got = commit(f"inbox: {found_on}, {len(new)} new, {pdfs} PDFs")
        if got:
            log(f"  git: {got}")
    from . import zotero_web
    from .site import write_page, zotero_sync

    write_page()
    if zotero_web.configured():  # the new papers into Zotero's Inbox, the decisions tagged there into the inbox
        zotero_sync()
    return state


# --------------------------------------------------------------------------- the cron job


def cron_line(at: str) -> str:
    """The crontab line of this library's daily run at HH:MM. It runs glossator with the Python that runs it now,
    on this library whatever the environment cron gives it (GLOSSATOR_HOME and GLOSSATOR_LIBRARY in the line, and
    GLOSSATOR_ZOTERO_KEY when it is set), with a PATH of absolute folders only (Claude Code's, git's, poppler's);
    every path quoted for the shell, `%` escaped for cron; GLOSSATOR_LIBRARY tells this library's line from
    another's."""
    from .triage import claude_dir

    hour, minute = (int(x) for x in at.split(":"))
    exe = sys.executable
    found = [shutil.which(t) for t in ("git", "git-lfs", "pdftotext")]
    dirs = [str(Path(exe).parent), claude_dir(), *(str(Path(f).parent) for f in found if f)]
    dirs += ["/usr/local/bin", "/usr/bin", "/bin"]
    path = ":".join(dict.fromkeys(d for d in dirs if d and os.path.isabs(d)))
    env = {"PATH": path, "GLOSSATOR_HOME": str(ROOT), "GLOSSATOR_LIBRARY": str(LIBRARY)}
    if os.environ.get("GLOSSATOR_ZOTERO_KEY"):
        env["GLOSSATOR_ZOTERO_KEY"] = str(Path(os.environ["GLOSSATOR_ZOTERO_KEY"]).expanduser().resolve())
    q = shlex.quote
    assigns = " ".join(f"{k}={q(v)}" for k, v in env.items())
    command = f"cd {q(str(ROOT))} && {assigns} {q(exe)} -m glossator inbox run >> {q(str(LOG))} 2>&1"
    escaped = command.replace("%", "\\%")  # cron reads a bare % as a new line
    return f"{minute} {hour} * * * {escaped} {CRON_TAG}"


def crontab() -> list[str]:
    r = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    return r.stdout.splitlines() if r.returncode == 0 else []


def write_crontab(lines: list[str]) -> None:
    """Replace your crontab with these lines; a refusal says why, nothing is lost (the table stays as it was)."""
    try:
        r = subprocess.run(["crontab", "-"], input="".join(f"{x}\n" for x in lines), text=True, capture_output=True)
    except FileNotFoundError:
        raise RuntimeError("no crontab command on this computer: the daily run needs cron") from None
    if r.returncode != 0:
        raise RuntimeError(f"crontab refused the change: {(r.stderr or r.stdout).strip() or r.returncode}")


def scheduled() -> str | None:
    """This library's daily line in your crontab (another library's is not this one's)."""
    from .remote import owns

    return next((x for x in crontab() if owns(x, LIBRARY)), None)


def refuse(action: str) -> None:
    """The inbox works on a library of your own, on its original: not on the repository's demo, not on a clone."""
    from .paths import is_demo
    from .repo import origin_url

    if is_demo(LIBRARY):
        raise ValueError(
            f"inbox {action}: this is the repository's demo (--home or GLOSSATOR_HOME points at it); its inbox never "
            "runs. Point --home (or GLOSSATOR_HOME) at the folder of your own library"
        )
    if action in ("run", "start") and origin_url(LIBRARY):
        raise ValueError(
            f"inbox {action}: this computer is a clone (its original is {origin_url(LIBRARY)}): the inbox runs on "
            "the original. To make this computer the original: glossator promote"
        )


def check_start(at: str) -> None:
    """Why the daily run cannot be scheduled here (ValueError), or nothing."""
    if not re.fullmatch(r"([01]?\d|2[0-3]):[0-5]\d", at):
        raise ValueError("--at HH:MM")
    refuse("start")
    if not WATCH.exists():
        raise ValueError(
            f"no {shown(WATCH)} yet: glossator inbox init writes it; write its queries, then glossator inbox start"
        )


def start(at: str = "07:30") -> str:
    """Schedule this library's daily run on this computer, which must be its original (a clone's runs would double
    its papers and its commits). Another library's daily line is left alone."""
    from .remote import owns
    from .triage import claude_dir

    check_start(at)
    lines = [x for x in crontab() if not owns(x, LIBRARY)] + [cron_line(at)]
    write_crontab(lines)
    said = f"scheduled every day at {at} (crontab -l shows it); log: {shown(LOG)}"
    if not claude_dir():
        said += (
            "\nwarning: Claude Code (claude) is not found on this computer: the daily runs file the new papers "
            "without triage until it is (claude.com/claude-code), then triage them"
        )
    return said


def stop() -> str:
    """Take this library's daily line out of your crontab (another library's stays)."""
    from .remote import owns

    before = crontab()
    lines = [x for x in before if not owns(x, LIBRARY)]
    if len(lines) == len(before):
        return "not scheduled"
    write_crontab(lines)
    return "stopped: this library's daily run is not scheduled any more"


def status() -> str:
    line = scheduled()
    when = "not scheduled (`glossator inbox start --at 07:30`)"
    if line:
        minute, hour = line.split()[:2]
        when = f"every day at {int(hour):02d}:{int(minute):02d}"
    state = load_json(STATE) if STATE.exists() else {}
    counts = collections.Counter(it.get("status") for it in load_items())
    out = [f"Daily run: {when}."]
    if state.get("failed"):
        out.append(f"Last run FAILED at {state['failed'].get('at')}: {state['failed'].get('error')}")
    from .triage import untriaged

    waiting = len(untriaged(load_items(), limit=1_000_000))
    if waiting:
        out.append(f"{papers(waiting)} not triaged (Claude Code not found or failing): the next run tries again.")
    if state.get("last_run"):
        out.append(
            f"Last run: {state['last_run']} (papers since {state['since']}): {state['found']} found, "
            f"{state['new']} new, {state['triaged']} triaged; relevance {state.get('relevance')}"
            + (f"; {state['pdfs']} PDFs" if state.get("pdfs") else "")
            + (f"; {len(state['errors'])} errors" if state.get("errors") else "")
            + "."
        )
    else:
        out.append("No run yet (`glossator inbox run` runs one now).")
    out.append("Inbox: " + ", ".join(f"{s} {counts.get(s, 0)}" for s in STATUSES) + ".")
    if LOG.exists():
        out.append("Log (last lines):\n" + "\n".join("  " + x for x in LOG.read_text().splitlines()[-6:]))
    return "\n".join(out)


# --------------------------------------------------------------------------- what you read


STARS = {None: "?", 0: "·", 1: "★", 2: "★★", 3: "★★★"}


def line(it: dict) -> str:
    t = it.get("triage") or {}
    first = (it["authors"][0].split() or [""])[-1] if it.get("authors") else ""
    more = " et al." if len(it.get("authors", [])) > 1 else ""
    head = (
        f"{it['id']} · {STARS.get(t.get('relevance'), '?')} {t.get('bib', it.get('bib', ''))} · {first}{more} "
        f"{it.get('date', '')[:4]}, {it.get('venue', '')} · {it['title']}" + (" · PDF here" if pdf_here(it) else "")
    ) + (f" · prior {it['prior']['score']:.2f}" if it.get("prior") else "")
    body = t.get("summary") or (it.get("abstract", "")[:280] + "…" if it.get("abstract") else "")
    return f"{head}\n   {body}" + (f"\n   → {t['why']}" if t.get("why") else "")


def inbox_html(rows: list[dict]) -> str:
    """The inbox's view in the page (`#inbox`): one card per new or accepted paper."""
    e = html.escape
    cards = []
    for it in rows:
        t = it.get("triage") or {}
        links = (
            [f'<a class="btn primary" href="{e(it["url"])}" target="_blank" rel="noopener">article</a>']
            if it.get("url")
            else []
        )
        here = pdf_here(it)
        if here:  # this computer's copy, beside the page
            rel = urllib.parse.quote(Path(os.path.relpath(here, BUILD)).as_posix())
            links.append(f'<a class="btn" href="{e(rel)}" target="_blank" rel="noopener">PDF</a>')
        elif it.get("pdf"):
            links.append(f'<a class="btn" href="{e(it["pdf"])}" target="_blank" rel="noopener">PDF (online)</a>')
        cards.append(
            f'<section class="card inbox-item" data-status="{e(it.get("status", ""))}"><p class="kicker">'
            f"{e(STARS.get(t.get('relevance'), '?'))} {e(t.get('bib', it.get('bib', '')))} · {e(it.get('venue', ''))} · "
            f'{e(it.get("date", ""))} · <span class="badge">{e(it.get("status", ""))}</span></p>'
            f'<h2>{e(it["title"])}</h2><p class="authors">{e(", ".join(it.get("authors", [])[:6]))}'
            f"{' …' if len(it.get('authors', [])) > 6 else ''}</p>"
            f"<p>{e(t.get('summary') or 'Not triaged yet.')}</p>"
            + (f'<p class="source">{e(t["why"])}</p>' if t.get("why") else "")
            + f'<div class="files">{"".join(links)}</div>'
            f'<p class="source">glossator inbox accept {e(it["id"])} · reject {e(it["id"])} · found {e(it.get("found", ""))} by '
            f"{e(', '.join(it.get('sources', [])))} for {e('; '.join(it.get('queries', [])))}</p></section>"
        )
    state = load_json(STATE) if STATE.exists() else {}
    intro = (
        f"{papers(len(rows))} to read. Last run {state.get('last_run', 'never')}. Decide with "
        "`glossator inbox accept|reject ID`, in Zotero (keys 1 and 2), or ask the librarian; `/glossator-add inbox` adds "
        "the accepted ones."
    )
    return (
        f'<section class="view hub" id="v-inbox" data-bib="inbox" hidden>\n<header class="hubhead"><div>'
        f"<h1>Inbox</h1><p>{e(intro)}</p></div></header>\n<main>\n" + "\n".join(cards) + "\n</main>\n</section>"
    )
