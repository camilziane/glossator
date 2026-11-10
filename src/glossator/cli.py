"""The command line: `glossator COMMAND`, the commands grouped as `glossator --help` lists them.

A bibliography is a folder of library/ with a biblio.json (its profile, title and scope) and a PROFILE.md. Every
command that works on one bibliography takes `--bib NAME` anywhere on the line, else GLOSSATOR_ROOT, else the
bibliography the current folder is in. A profile is the record format: the built-ins `ml` (methods) and `epidemio`
(studies), and a library's own plugins (library/profiles/<name>/profile.py, see glossator.profiles), which may add
their own commands."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import signal
import subprocess
import sys
from pathlib import Path

from . import __version__
from .util import die

# Set by load(), once --home is read: the paths are computed when glossator.paths is first imported.
LIBRARY: Path
BUILD: Path
bibliographies = collection = pick_bibliography = None


def load() -> None:
    global LIBRARY, BUILD, bibliographies, collection, pick_bibliography
    from . import bibliography, paths

    LIBRARY, BUILD = paths.LIBRARY, paths.BUILD
    bibliographies, collection = bibliography.bibliographies, bibliography.collection
    pick_bibliography = bibliography.pick_bibliography


def take_home(argv: list[str]) -> tuple[str | None, list[str]]:
    """`--home PATH` among the options before the command (as GLOSSATOR_HOME): the folder that holds library/ and
    build/. After the command, `--home` is left to the command (it may be another option's value)."""
    rest, home, i = [], None, 0
    while i < len(argv) and argv[i].startswith("-"):
        if argv[i] == "--home" and i + 1 < len(argv):
            home, i = argv[i + 1], i + 2
            continue
        if argv[i].startswith("--home="):
            home = argv[i].split("=", 1)[1]
        elif argv[i] == "--bib" and i + 1 < len(argv):  # its value is not an option
            rest.append(argv[i])
            i += 1
            rest.append(argv[i])
        else:
            rest.append(argv[i])
        i += 1
    return home, rest + argv[i:]


def set_home(folder: Path) -> None:
    """`--home` wins over the variables that would point glossator elsewhere: a library or a bibliography outside
    this home is not mixed with its build/ (nor written so into a crontab line)."""
    os.environ["GLOSSATOR_HOME"] = str(folder)
    for var in ("GLOSSATOR_LIBRARY", "GLOSSATOR_ROOT"):
        value = os.environ.get(var)
        if value and not Path(value).expanduser().resolve().is_relative_to(folder / "library"):
            print(f"note: --home {folder}: {var}={value} is set aside for this command", file=sys.stderr)
            os.environ.pop(var)


SUMMARY = (
    "Scientific bibliographies kept in git by Claude agents: every fact with its page, every quote and number "
    "proven to be in the paper."
)

# The groups of `glossator --help`, in order, and each command's one line.
GROUPS: list[tuple[str, list[tuple[str, str]]]] = [
    (
        "Get started",
        [
            ("demo", "the demo library in the reading room, in your browser (built the first time)"),
            ("init", "a new library on this computer, step by step"),
            ("join", "an existing library on this computer, cloned from its original"),
            ("doctor", "what this computer has and lacks, where its library stands"),
            ("web", "build the reading room once on this computer (Node)"),
        ],
    ),
    (
        "Add papers",
        [
            ("curate", "curator agents add articles by DOI, or the inbox's accepted papers, then build"),
            ("bibs", "the bibliographies: list them, or add one"),
        ],
    ),
    (
        "Inbox",
        [
            ("inbox", "the daily inbox of new papers: run, list, accept, reject, start, stop, status…"),
        ],
    ),
    (
        "Read and search",
        [
            ("serve", "the reading room of every bibliography at http://127.0.0.1:8765/"),
            ("search", "the passages that answer a question, with their pages"),
            ("read", "the text of a passage a search returned, or its whole page"),
            ("verify", "is a quote on that page of that article? (verbatim, close, elsewhere, absent)"),
            ("export", "an article's summary in Markdown"),
            ("list", "one line per article"),
            ("mcp", "the search index for Claude and other MCP clients (stdio)"),
        ],
    ),
    (
        "Keep it right",
        [
            ("check", "formats, vocabularies, and every quote and number against the PDFs"),
            ("notices", "retractions, expressions of concern and corrections (Crossref)"),
            ("build", "write this computer's build/: the reading room's data, the search index, the Zotero file"),
            ("evaluate", "how well the search finds the claims the records checked"),
        ],
    ),
    (
        "Computers",
        [
            ("sync", "the library both ways with its original (git only, never a build)"),
            ("follow", "point this computer's library at another original"),
            ("promote", "make this computer the original"),
        ],
    ),
    (
        "Zotero",
        [
            ("zotero", "your Zotero library in step: setup, sync, pull, push; or the Zotero file"),
        ],
    ),
    (
        "Curator tools",
        [
            ("new", "create an article's folder and its record from a DOI"),
            ("fetch-pdf", "download an article's open-access PDF"),
            ("supp", "list or download an article's supplementary files"),
            ("text", "write the text of an article's PDFs, page by page, into .work/"),
            ("page", "render one page of a PDF with a coordinate grid"),
            ("crop", "crop a figure panel into the article's figures/"),
            ("cite", "a related-article entry for each DOI"),
            ("vocab", "the controlled vocabularies of a bibliography's records"),
        ],
    ),
]

EXAMPLES = """\
Examples:
  glossator demo                                    the demo in the reading room, in your browser
  glossator init                                    a library of your own, step by step
  glossator --bib methods curate 10.1038/s41586-021-03819-2
  glossator search "protein structure from sequence"
  glossator check --all
  glossator doctor

`glossator COMMAND --help` tells more about a command; docs/reference/cli.md lists every command and flag."""

SETUP_FLAGS = argparse.ArgumentParser(add_help=False)
SETUP_FLAGS.add_argument("-y", "--yes", action="store_true", help="answer yes to the plan (and to a replacement)")
SETUP_FLAGS.add_argument(
    "--no-input", action="store_true", help="never ask: take each answer from its flag or its default (scripts, CI)"
)
SETUP_FLAGS.add_argument("--dry-run", action="store_true", help="show the plan, change nothing")


def summary_of(name: str) -> str:
    return next((line for _, cmds in GROUPS for n, line in cmds if n == name), "")


def grouped_commands(sub) -> str:
    """The commands by group, for `glossator --help`; a plugin's commands under their own heading."""
    known = {n for _, cmds in GROUPS for n, _ in cmds}
    width = max(len(n) for n in sub.choices) + 2
    out = []
    for title, cmds in GROUPS:
        out.append(f"{title}:")
        out += [f"  {n.ljust(width)}{line}" for n, line in cmds if n in sub.choices]
        out.append("")
    extra = sorted(set(sub.choices) - known)
    if extra:
        helps = {a.dest: a.help or "" for a in sub._choices_actions}
        out.append("Commands of this library's profiles:")
        out += [f"  {n.ljust(width)}{helps.get(n, '')}" for n in extra]
        out.append("")
    return "\n".join(out).rstrip()


class Parser(argparse.ArgumentParser):
    """`glossator --help` with the commands grouped (the default list would be one long block)."""

    sub = None

    def format_help(self) -> str:
        text = super().format_help()
        return text.replace("{GROUPED}", grouped_commands(self.sub)) if self.sub is not None else text


# --------------------------------------------------------------------------- the commands' functions


def cmd_inbox(a, bib: str | None) -> int:
    from . import inbox

    try:
        if a.action == "init":
            print(inbox.init(a.force))
        elif a.action == "run":
            inbox.run(do_triage=not a.no_triage)
        elif a.action == "list":
            rows = inbox.items(None if a.status == "all" else a.status, bib, show_from=0 if a.all else None)
            print(
                json.dumps(rows, ensure_ascii=False, indent=1)
                if a.json
                else ("\n".join(inbox.line(it) for it in rows) or "Nothing here.")
            )
        elif a.action in ("accept", "reject", "done"):
            if not a.ids:
                die(f"inbox {a.action} ID [ID ...]")
            status = {"accept": "accepted", "reject": "rejected", "done": "added"}[a.action]
            print("\n".join(inbox.decide(a.ids, status, a.note)))
            from .site import write_page

            write_page()
        elif a.action == "fetch":
            inbox.fetch(a.ids, getattr(a, "from"))
            from .site import write_page

            write_page()
        elif a.action == "purge":
            print(inbox.purge(a.dry_run))
            from . import zotero_web

            if zotero_web.configured():
                n = zotero_web.purge_trash(a.dry_run)
                print(f"Zotero: {n} inbox papers {'would be ' if a.dry_run else ''}deleted for good from the trash")
        elif a.action == "score":
            n = inbox.rescore()
            print(f"{n} paper{'' if n == 1 else 's'} scored by the library's prior")
            from .site import write_page

            write_page()
        elif a.action == "start":
            return inbox_start(a)
        elif a.action == "stop":
            print(inbox.stop())
        else:
            print(inbox.status())
    except (RuntimeError, ValueError, OSError) as e:
        die(str(e))
    return 0


def cmd_export(biblio, a) -> int:
    from .render import article_md

    coll = collection(biblio)
    rec = coll.recs.get(a.key)
    if rec is None:
        die(f"articles/{a.key}/record.json missing or not readable")
    sys.stdout.write(article_md(rec, coll))
    return 0


def cmd_zotero(a, biblio) -> int:
    if a.action == "setup":
        from .ask import Asker, guarded
        from .site import zotero_sync
        from .zotero_setup import setup

        asker = Asker.from_args(a)
        return guarded(lambda: setup(asker, LIBRARY, a, dry_run=lambda: zotero_sync(dry_run=True)))
    if a.action in ("pull", "push", "sync"):
        from .site import zotero_sync

        if a.action == "pull" and biblio:
            die("zotero pull: the inbox's decisions belong to no bibliography: without --bib")
        colls = [collection(biblio)] if biblio else None  # one bibliography: its articles, not the inbox
        return zotero_sync(colls, a.dry_run, pull=a.action != "push" and not biblio, push=a.action != "pull")
    from .zotero import ZOTERO_NAME, library

    if a.since:
        try:
            dt.date.fromisoformat(a.since)
        except ValueError:
            die(f"--since {a.since}: a date, YYYY-MM-DD")
    out = Path(a.out) if a.out else BUILD / (f"zotero-since-{a.since}.rdf" if a.since else ZOTERO_NAME)
    colls = [collection(b) for b in ([biblio] if biblio else bibliographies())]
    got = library(colls, out, a.since)
    where = ", ".join(f"{name} {n}" for name, n in got["collections"].items()) or "no article"
    items, files = got["items"], got["files"]
    print(f"{out}: {items} item{'' if items == 1 else 's'} ({where}), {files} linked file{'' if files == 1 else 's'}")
    return 0


def cmd_curate(a, biblio) -> int:
    from . import curate

    if a.status or a.resume:
        batch = curate.Batch.load()
        if not batch.jobs:
            die("no batch yet (glossator curate --inbox, or DOIs with --bib)")
        if a.status:
            print(curate.summary(batch.jobs))
            return 0
        jobs = batch.jobs
    elif a.inbox:
        jobs = curate.from_inbox()
    elif a.dois:
        if biblio is None:
            die("which bibliography? curate DOI... --bib NAME")
        try:
            jobs = curate.from_dois(a.dois, biblio, a.cited_for)
        except ValueError as e:
            die(str(e))
    else:
        die("curate DOI... --bib NAME | --inbox | --resume | --status")
    known = {j.id for j in curate.Batch.load().jobs if j.status == "done"} if not a.resume else set()
    jobs = [j for j in jobs if j.id not in known]
    if not jobs:
        print("Nothing to curate.")
        return 0
    if a.dry_run:
        print("\n\n".join(f"[{j.id}]\n{j.brief}" for j in jobs))
        return 0
    return curate.curate(jobs, a.parallel, a.budget, a.permission_mode)


def inbox_start(a) -> int:
    """`inbox start`: the crontab line shown first, then added (another library's daily line is left alone)."""
    from . import inbox, remote
    from .ask import Asker, Step, Stop, guarded, run_plan

    asker = Asker.from_args(a)

    def go() -> int:
        try:
            inbox.check_start(a.at)
        except ValueError as e:
            raise Stop(str(e), 1) from None
        now = remote.cron_time(inbox.scheduled())
        if now == a.at:
            asker.mark("same", f"this library's daily run is at {a.at} already: nothing to do")
            return 0
        instead = f" (in place of the one at {now})" if now else ""
        short = f"add this library's daily inbox run at {a.at} to your crontab{instead}"
        text = f"{short}:\n       {inbox.cron_line(a.at)}"
        run_plan(asker, [Step(text, lambda: inbox.start(a.at), short=short)])
        return 0

    return guarded(go)


def cmd_bibs(a) -> int:
    if a.action == "add":
        from .ask import Asker, guarded
        from .start import bibs_add

        return guarded(lambda: bibs_add(Asker.from_args(a), LIBRARY, a))
    from .commands import cmd_bibs as listing

    if bibliographies():
        print("name\tprofile\tarticles\ttitle\tscope")
    return listing(a)


def setup_command(a) -> int:
    """init, join, promote, follow: questions, a plan, then the steps."""
    from .ask import Asker, guarded

    asker = Asker.from_args(a)

    def build() -> int:
        from .site import build as site_build

        return site_build()

    def start_inbox(at: str) -> str:
        from .inbox import start

        return start(at)

    def stop_inbox() -> str:
        from .inbox import stop

        return stop()

    if a.cmd == "init":
        from .start import init

        return guarded(lambda: init(asker, LIBRARY, a, start_inbox=start_inbox, build=build))
    if a.cmd == "join":
        from . import webapp
        from .join import join

        return guarded(
            lambda: join(
                asker,
                LIBRARY,
                BUILD,
                a,
                build=build,
                web=webapp.build_web,
                web_current=lambda: webapp.web_dir() is None or webapp.current(),
                stop_inbox=stop_inbox,
            )
        )
    from . import original

    if a.cmd == "promote":
        return guarded(lambda: original.promote(asker, LIBRARY, a, start_inbox=start_inbox))
    return guarded(lambda: original.follow(asker, LIBRARY, a, stop_inbox=stop_inbox))


# --------------------------------------------------------------------------- the parser


def add(sub, name: str, description: str = "", parents=()) -> argparse.ArgumentParser:
    """A command: its one line (GROUPS) heads its own --help, `description` follows."""
    line = summary_of(name)
    text = (line[:1].upper() + line[1:] + "." if line else "") + (f"\n\n{description}" if description else "")
    return sub.add_parser(
        name, description=text, parents=list(parents), formatter_class=argparse.RawDescriptionHelpFormatter
    )


def build_parser(biblio=None) -> tuple[Parser, argparse._SubParsersAction]:
    from .curate import PERMISSION_MODES
    from .records import VOCAB

    p = Parser(
        prog="glossator",
        usage="glossator [--home PATH] [--bib NAME] COMMAND [ARGS]",
        description=f"{SUMMARY}\n\n{{GROUPED}}",
        epilog=EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--bib",
        metavar="NAME",
        help="the bibliography a command works on, anywhere on the line (else the one the current folder is in)",
    )
    p.add_argument(
        "--home",
        metavar="PATH",
        help="the folder that holds library/ and build/, before the command (as GLOSSATOR_HOME, and over "
        "GLOSSATOR_LIBRARY; default: the tool's folder)",
    )
    p.add_argument("--version", action="version", version=f"glossator {__version__}", help="print the version")
    sub = p.add_subparsers(dest="cmd", metavar="COMMAND", help=argparse.SUPPRESS, prog="glossator")
    p.sub = sub

    # -------------------------------------------------------------- get started
    s = add(
        sub,
        "demo",
        "Builds the demo library's index and data the first time (demo/build/), the reading room when Node is here and it\n"
        "is not built, then serves the demo until Ctrl+C. It comes with the repository.",
    )
    s.add_argument("--port", type=int, default=8765, help="the port (default 8765)")
    s.add_argument("--no-open", action="store_true", help="do not open the browser")
    s.add_argument("--rebuild", action="store_true", help="build the demo's index and data again")

    s = add(
        sub,
        "init",
        "On this computer, which becomes the original (the computer the others clone from, where the daily inbox\n"
        "runs): the library's git repository, Git LFS, its first bibliography (profile, folder, title, scope), the\n"
        "inbox's first queries and its daily time. It asks, shows the plan, then does it; every question is also a\n"
        "flag. On an existing library it only adds what is missing.",
        [SETUP_FLAGS],
    )
    s.add_argument(
        "--lfs", action=argparse.BooleanOptionalAction, default=None, help="keep PDFs and figures in Git LFS"
    )
    s.add_argument("--language", help="the language of the inbox's summaries (default English)")
    s.add_argument("--name", help="the first bibliography's folder name, e.g. methods")
    s.add_argument("--profile", help="its profile (the record format), e.g. ml")
    s.add_argument("--title", help="its title")
    s.add_argument("--short", help="its tab name in the reading room (24 characters at most; default the title)")
    s.add_argument("--scope", help="what goes in it, a sentence or two (the inbox's triage reads it)")
    s.add_argument("--query", action="append", help="a query of the daily inbox (repeatable)")
    s.add_argument("--inbox-at", metavar="HH:MM", help="run the inbox every day at this time (your crontab)")
    s.add_argument("--git-name", help="the name commits are signed with, when git has none")
    s.add_argument("--git-email", help="the email address commits are signed with, when git has none")
    s.add_argument(
        "--build",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="build the search index and the reading room's data at the end",
    )

    s = add(
        sub,
        "join",
        "ADDRESS is the original's library: an ssh name and a path (lab.example.org:/srv/glossator/library),\n"
        "ssh://host/path, or a local path. It checks ssh and Git LFS on both sides, clones the library (records\n"
        "first, then the files), turns Git LFS's hooks on and builds this computer's own index and data. Run again,\n"
        "it resumes.",
        [SETUP_FLAGS],
    )
    s.add_argument(
        "address",
        nargs="?",
        metavar="ADDRESS",
        help="the original's library (on a clone: its origin when left out; else asked)",
    )
    weight = s.add_mutually_exclusive_group()
    weight.add_argument("--light", action="store_true", help="the records only: the PDFs stay placeholders")
    weight.add_argument(
        "--full", action="store_true", help="on a light clone: download every file in Git LFS, and from now on"
    )
    s.add_argument(
        "--build",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="build this computer's search index and the reading room's data",
    )
    s.add_argument(
        "--web",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="build the reading room when Node is here (glossator web)",
    )
    s.add_argument("--git-name", help="the name commits are signed with, when git has none")
    s.add_argument("--git-email", help="the email address commits are signed with, when git has none")

    s = add(
        sub,
        "doctor",
        "Reads only: tools, the library's state, the original, the daily run, build/, Zotero. Each problem comes with\n"
        "the command that fixes it. Exit 1 when a check fails.",
    )
    s.add_argument("--offline", action="store_true", help="skip what needs the network (ssh, Zotero's web API)")
    s.add_argument("--json", action="store_true", help="the checks as JSON")

    s = add(
        sub,
        "web",
        "npm ci (when the lock changed), then next build: web/out/, which glossator serve shows. Nothing to do when\n"
        "web/out/ is built from web/ as it is. Needs Node 20.19 or later and the repository's web/.",
    )
    s.add_argument("--force", action="store_true", help="build even when web/out/ is current")
    s.add_argument("--verbose", action="store_true", help="show npm's output")

    # -------------------------------------------------------------- add papers
    s = add(
        sub,
        "curate",
        "Curator agents without a chat: one headless Claude Code run per article, a few at once; each article is\n"
        "sent back to its curator with check's errors until it passes; then one build.",
    )
    s.add_argument("dois", nargs="*", metavar="DOI", help="DOIs to add to --bib")
    s.add_argument("--inbox", action="store_true", help="the inbox papers you accepted")
    s.add_argument("--resume", action="store_true", help="the last batch's articles not done yet")
    s.add_argument("--status", action="store_true", help="where the last batch is, and its cost")
    s.add_argument("--cited-for", action="append", default=[], help="a claim the curators check (with DOIs)")
    s.add_argument("--parallel", type=int, default=4, help="curators at once (at most 10; default 4)")
    s.add_argument("--budget", type=float, default=5.0, help="dollars at most per curator run (default 5)")
    s.add_argument(
        "--permission-mode",
        default="auto",
        choices=list(PERMISSION_MODES),
        help="how the curators' tool calls are allowed: auto (default), Claude Code's classifier, may allow more "
        "than the allow-list; dontAsk, the allow-list only; acceptEdits; bypassPermissions, only in a sandbox",
    )
    s.add_argument("--dry-run", action="store_true", help="print the briefs, run nothing")

    s = add(
        sub,
        "bibs",
        "Without an action: one line per bibliography (name, profile, articles, title, scope). `bibs add` asks for a\n"
        "new bibliography's profile, folder, title, scope and inbox queries, writes its biblio.json and PROFILE.md,\n"
        "and commits them.",
        [SETUP_FLAGS],
    )
    s.add_argument("action", nargs="?", default="list", choices=["list", "add"], help="list (default) or add")
    s.add_argument("name", nargs="?", metavar="NAME", help="add: the new bibliography's folder name")
    s.add_argument("--profile", help="add: its profile (the record format)")
    s.add_argument("--title", help="add: its title")
    s.add_argument("--short", help="add: its tab name in the reading room")
    s.add_argument("--scope", help="add: what goes in it (the inbox's triage reads it)")
    s.add_argument("--query", action="append", help="add: a query of the daily inbox (repeatable)")
    s.add_argument("--no-commit", action="store_true", help="add: write the files, commit nothing")

    # -------------------------------------------------------------- inbox
    s = add(
        sub,
        "inbox",
        "init: write library/inbox/watch.toml; run: look for new papers now; list: those waiting; accept, reject,\n"
        "done ID...: decide; fetch: download their open PDFs; score: rescore by the library's prior; purge: free the\n"
        "PDFs of papers that left the inbox; start, stop: the daily run (a line of your crontab, on the original only);\n"
        "status: the daily run and the counts.",
    )
    s.add_argument(
        "action",
        choices=[
            "init",
            "run",
            "list",
            "accept",
            "reject",
            "done",
            "fetch",
            "score",
            "purge",
            "start",
            "stop",
            "status",
        ],
        help="what to do",
    )
    s.add_argument("ids", nargs="*", metavar="ID", help="item ids (accept, reject, done, fetch)")
    s.add_argument("--from", type=int, help="fetch: the PDFs of the papers rated at least this (default: fetch_from)")
    s.add_argument("--at", default="07:30", help="start: the daily time, HH:MM")
    s.add_argument(
        "--status",
        default="new",
        choices=["new", "accepted", "rejected", "added", "all"],
        help="list: the papers of this status (default new)",
    )
    s.add_argument("--all", action="store_true", help="list: also the papers rated below show_from")
    s.add_argument("--json", action="store_true", help="list: the items as JSON")
    s.add_argument("--note", default="", help="accept, reject: a note kept with the decision")
    s.add_argument("--force", action="store_true", help="init: rewrite watch.toml")
    s.add_argument("--no-triage", action="store_true", help="run: file the papers without Haiku's triage")
    s.add_argument("--dry-run", action="store_true", help="purge, start: say what would change, change nothing")
    s.add_argument("-y", "--yes", action="store_true", help="start: add the crontab line without asking")
    s.add_argument("--no-input", action="store_true", help="start: never ask (scripts)")

    # -------------------------------------------------------------- read and search
    s = add(sub, "serve", "On the loopback address only; Ctrl+C stops it.")
    s.add_argument("--port", type=int, default=8765, help="the port (default 8765)")
    s.add_argument("--open", action="store_true", help="open it in the browser")

    s = add(sub, "search", "From build/index.sqlite (glossator build writes it), records and PDFs' text together.")
    s.add_argument("query", metavar="QUERY", help="words or a question, in quotes")
    s.add_argument("--article", metavar="KEY", help="one article's key")
    s.add_argument("--scope", choices=["all", "records", "text"], default="all", help="what to search (default all)")
    s.add_argument("-n", "--limit", type=int, default=8, help="how many passages (default 8)")
    s.add_argument(
        "--mode", choices=["hybrid", "keyword", "semantic"], default="hybrid", help="how to rank (default hybrid)"
    )

    s = add(sub, "read")
    s.add_argument("ref", metavar="REF", help="a passage's reference, as search prints it")
    s.add_argument("--page", action="store_true", help="the whole page")

    s = add(sub, "verify", "Exit 0 when the text is found verbatim or close, 1 otherwise.")
    s.add_argument("key", metavar="KEY", help="the article's key")
    s.add_argument("text", metavar="TEXT", help="the quote, in quotes")
    s.add_argument("--page", type=int, help="the page it should be on")
    s.add_argument(
        "--json", action="store_true", help="the full answer as JSON (also when the output is not a terminal)"
    )

    s = add(sub, "export")
    s.add_argument("key", metavar="KEY", help="the article's key")

    s = add(
        sub,
        "list",
        "Tab-separated: bibliography, key, DOI, year, citation, title (every bibliography without --bib).",
    )

    add(sub, "mcp", "What Claude Code starts through .mcp.json; not for a terminal.")

    # -------------------------------------------------------------- keep it right
    s = add(
        sub,
        "check",
        "KEY...: those articles of --bib; --all: every article (of --bib, else of every bibliography); a bibliography's\n"
        "name instead of keys: all its articles.",
    )
    s.add_argument("keys", nargs="*", metavar="KEY", help="article keys (or a bibliography's name)")
    s.add_argument("--all", action="store_true", help="every article")

    add(sub, "notices", "Exit 1 when an article was retracted or has an expression of concern.")

    s = add(
        sub,
        "build",
        "Nothing leaves this computer; each computer builds its own. With --zotero, your Zotero library follows.",
    )
    s.add_argument("keys", nargs="*", help=argparse.SUPPRESS)  # build always writes every bibliography
    s.add_argument("--all", action="store_true", help=argparse.SUPPRESS)
    s.add_argument("--zotero", action="store_true", help="then bring your Zotero library in step (zotero sync)")

    add(sub, "evaluate", "Recall at 5 and 10 of the claims the records checked.")

    # -------------------------------------------------------------- computers
    add(
        sub,
        "sync",
        "Pull, then push library/ (its PDFs through Git LFS); stops with nothing changed on a conflict, and when the\n"
        "original moved (then: glossator follow ADDRESS). On the original there is nothing to sync.",
    )

    s = add(
        sub,
        "follow",
        "After a glossator promote elsewhere: this computer's library follows ADDRESS, its new original (it must hold the\n"
        "same library), stops accepting pushes if it was the original, and stops its daily inbox run if it has one.",
        [SETUP_FLAGS],
    )
    s.add_argument("address", metavar="ADDRESS", help="the new original's library (ssh-name:path)")

    s = add(
        sub,
        "promote",
        "Run it on a clone. It checks that both computers are in step and clean, stops the old original's daily run,\n"
        "makes this computer accept pushes, records the move in library.toml, turns the old original into a clone of\n"
        "this one (over ssh), stops following the old original and starts the daily run here. The others learn it at\n"
        "their next glossator sync and run glossator follow ADDRESS.",
        [SETUP_FLAGS],
    )
    s.add_argument("--address", help="how the other computers reach this one (ssh-name:path)")
    s.add_argument("--address-from-old", help="how the old original reaches this one (default: --address)")
    s.add_argument("--inbox-at", metavar="HH:MM", help="the daily run's time here (default: the old original's)")
    s.add_argument("--no-inbox", action="store_true", help="do not start the daily run here")
    s.add_argument(
        "--old-gone", action="store_true", help="the old original is gone for good: do nothing there (its commits lost)"
    )

    # -------------------------------------------------------------- zotero
    s = add(
        sub,
        "zotero",
        "setup: the key (checked, kept out of git), Zotero's base directory, a dry run; sync: the decisions tagged\n"
        "in Zotero, then the references, notes and links; pull: only the decisions; push: only the references, notes,\n"
        "links and the inbox's papers;\n"
        "rdf (default): write the Zotero RDF file.",
        [SETUP_FLAGS],
    )
    s.add_argument(
        "action", nargs="?", default="rdf", choices=["rdf", "setup", "pull", "push", "sync"], help="what to do"
    )
    s.add_argument("--since", help="rdf: only the articles added to git on or after this date, YYYY-MM-DD")
    s.add_argument("-o", "--out", help="rdf: the file (default build/zotero.rdf, or build/zotero-since-DATE.rdf)")
    s.add_argument("--key-stdin", action="store_true", help="setup: read the key from stdin (never from the line)")
    s.add_argument("--no-browser", action="store_true", help="setup: do not open zotero.org's key page in a browser")
    s.add_argument("--check", action="store_true", help="setup: check the key and the base directory, change nothing")

    # -------------------------------------------------------------- curator tools
    s = add(sub, "new", "record.json prefilled from Crossref and OpenAlex, each field's TODO saying what goes there.")
    s.add_argument("--doi", required=True, help="the article's DOI")
    s.add_argument("--key", help="only to keep a key another document already uses")

    s = add(sub, "fetch-pdf")
    s.add_argument("key", metavar="KEY", help="the article's key")
    s.add_argument("--url", help="a PDF found elsewhere (open source only)")
    s.add_argument("--file", help="a PDF you downloaded by hand (a site that refuses scripts); --url says from where")
    s.add_argument("--version", choices=list(VOCAB["paper_version"]), help="which version of the paper it is")
    s.add_argument("--license", help="its licence, e.g. CC BY 4.0")
    s.add_argument("--no-title-check", action="store_true", help="the preprint's title differs from the article's")

    s = add(sub, "supp")
    s.add_argument("key", metavar="KEY", help="the article's key")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", action="store_true", help="list the supplementary files of the open sources")
    g.add_argument("--url", help="download this one into supplementary/")
    s.add_argument("--label", help="what it is, e.g. 'Supplementary Methods'")
    s.add_argument("--name", help="its file name in supplementary/")
    s.add_argument("--file", help="a file you downloaded by hand (a site that refuses scripts); --url says from where")

    s = add(sub, "text")
    s.add_argument("key", metavar="KEY", help="the article's key")

    s = add(sub, "page")
    s.add_argument("key", metavar="KEY", help="the article's key")
    s.add_argument("--page", type=int, required=True, help="the page number")
    s.add_argument("--pdf", help="supplementary/<name>.pdf instead of paper.pdf")
    s.add_argument("--dpi", type=int, default=110, help="resolution (default 110)")

    s = add(sub, "crop")
    s.add_argument("key", metavar="KEY", help="the article's key")
    roles = list(biblio.figure_fields) if biblio else None
    s.add_argument("--role", required=True, choices=roles, help="the figure's role in the profile, e.g. main")
    s.add_argument("--page", type=int, required=True, help="the page number")
    s.add_argument("--box", required=True, help="X0,Y0,X1,Y1 as fractions of the page from its top-left corner")
    s.add_argument("--from", dest="from_", required=True, help="where it is, e.g. 'Fig. 1a, p. 2'")
    s.add_argument("--caption", required=True, help="what the panel shows, in your words")
    s.add_argument("--pdf", help="supplementary/<name>.pdf instead of paper.pdf")
    s.add_argument("--dpi", type=int, default=300, help="resolution (default 300)")

    s = add(sub, "cite")
    s.add_argument("dois", nargs="+", metavar="DOI", help="one or more DOIs")

    add(sub, "vocab")
    return p, sub


def run_check(biblio, a) -> int:
    from .check import cmd_check

    if biblio is None and a.keys:
        named = {b.name: b for b in bibliographies()}
        if all(k in named for k in a.keys):  # `check methods`: every article of that bibliography
            chosen = [named[k] for k in dict.fromkeys(a.keys)]
            a.keys, a.all = [], True
            status = 0
            for b in chosen:
                print(f"== {b.name}")
                status |= cmd_check(b, a)
            return status
        groups: dict[str, list[str]] = {}  # `check KEY`: the bibliography that holds that article
        for key in a.keys:
            where = [n for n, b in named.items() if (b.articles / key / "record.json").is_file()]
            if not where:
                die(f"no article {key} in any bibliography ({' | '.join(named)}); glossator list shows them")
            if len(where) > 1:
                die(f"{key} is in several bibliographies ({', '.join(where)}): --bib NAME says which")
            groups.setdefault(where[0], []).append(key)
        status = 0
        for name, keys in groups.items():
            a.keys = keys
            if len(groups) > 1:
                print(f"== {name}")
            status |= cmd_check(named[name], a)
        return status
    if biblio is None:
        if a.all:
            status = 0
            for b in bibliographies():
                print(f"== {b.name}")
                status |= cmd_check(b, a)
            return status
        die(f"which bibliography? --bib {' | '.join(b.name for b in bibliographies())}, or run from inside one")
    return cmd_check(biblio, a)


def main(argv: list[str] | None = None) -> int:
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)  # `glossator inbox list | head` ends quietly
    argv = sys.argv[1:] if argv is None else argv
    home, argv = take_home(argv)
    if home is not None:
        folder = Path(home).expanduser().resolve()
        if not folder.is_dir():
            die(f"--home {home}: no such folder")
        set_home(folder)
        paths = sys.modules.get("glossator.paths")
        if paths is not None and (paths.ROOT != folder or paths.LIBRARY != folder / "library"):  # a fresh process
            return subprocess.call([sys.executable, "-m", "glossator", *argv])
    load()
    biblio, argv = pick_bibliography(argv)
    p, sub = build_parser(biblio)
    from . import profiles

    profiles.add_commands(sub)  # the commands a library's profiles bring
    if not argv:
        p.print_help()
        return 0
    a = p.parse_args(argv)
    from .curate import refusal

    plugin_commands = {name for name, sp in sub.choices.items() if sp.get_default("_profile")}
    command = "bibs add" if a.cmd == "bibs" and a.action == "add" else a.cmd  # listing is read-only, adding is not
    if why := refusal(command, plugin_commands):  # inside a headless curation, only the curator's commands
        die(why)
    rv = profiles.run_command(a, biblio)
    if rv is not None:
        return rv
    cmd = a.cmd
    if cmd in ("init", "join", "promote", "follow"):
        return setup_command(a)
    if cmd == "doctor":
        from .doctor import doctor

        return doctor(LIBRARY, BUILD, a.offline, a.json)
    if cmd == "web":
        from .webapp import build_web

        return build_web(a.force, a.verbose)
    if cmd == "demo":
        from .webapp import demo

        return demo(a.port, not a.no_open, a.rebuild)
    if cmd == "bibs":
        return cmd_bibs(a)
    if cmd == "build":
        from .site import build

        return build(zotero=a.zotero)
    if cmd in ("search", "read", "verify", "evaluate"):
        from .index import DB_NAME, Index, evaluate, format_hits, format_verify

        try:
            idx = Index(BUILD / DB_NAME)
            if cmd == "search":
                hits = idx.search(a.query, biblio.name if biblio else None, a.article, a.scope, a.limit, mode=a.mode)
                print(format_hits(hits))
            elif cmd == "read":
                print(idx.read(a.ref, a.page))
            elif cmd == "verify":
                got = idx.verify(a.key, a.text, a.page, biblio.name if biblio else None)
                if a.json or not sys.stdout.isatty():
                    print(json.dumps(got, ensure_ascii=False, indent=1))
                else:
                    print(format_verify(got))
                return 0 if got["found"] in ("verbatim", "close") else 1
            else:
                evaluate(idx, [collection(b) for b in ([biblio] if biblio else bibliographies())])
        except (FileNotFoundError, KeyError, ValueError) as e:
            die(str(e).strip("'\""))
        return 0
    if cmd == "sync":
        from .sync import sync

        try:
            print(sync())
        except (RuntimeError, OSError, ValueError) as e:
            die(str(e))
        return 0
    if cmd == "inbox":
        return cmd_inbox(a, biblio.name if biblio else None)
    if cmd == "zotero":
        return cmd_zotero(a, biblio)
    if cmd == "notices":
        from .notices import format_notices, library_notices, serious

        found = library_notices([collection(b) for b in ([biblio] if biblio else bibliographies())])
        print(format_notices(found))
        return 1 if serious(found) else 0
    if cmd == "curate":
        return cmd_curate(a, biblio)
    if cmd == "serve":
        from .serve import serve

        try:
            serve(a.port, a.open)
        except OSError as e:
            die(f"port {a.port}: {e.strerror} (another: --port N)")
        return 0
    if cmd == "mcp":
        from .server import main as serve  # imported here: the MCP SDK is slow to load

        serve()
        return 0
    if cmd == "check":
        return run_check(biblio, a)
    from . import commands

    if cmd == "list":
        for b in [biblio] if biblio else bibliographies():
            commands.cmd_list(b, a)
        return 0
    if cmd == "export":
        fn = cmd_export
    else:
        fn = {
            "new": commands.cmd_new,
            "fetch-pdf": commands.cmd_fetch_pdf,
            "supp": commands.cmd_supp,
            "text": commands.cmd_text,
            "page": commands.cmd_page,
            "crop": commands.cmd_crop,
            "cite": commands.cmd_cite,
            "vocab": commands.cmd_vocab,
        }[cmd]
    if biblio is None:
        die(f"which bibliography? --bib {' | '.join(b.name for b in bibliographies())}, or run from inside one")
    return fn(biblio, a)
