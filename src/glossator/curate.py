"""`glossator curate`: the curator agents without a chat. One headless Claude Code run per article
(`claude -p --agent curator --model sonnet`), a few at once; each article's `check` decides whether the run is
done, and a run whose article fails it is resumed with the errors (twice at most), as a person would send them back.

The runs are listed in build/curate.json (written after every step), so an interrupted batch resumes where it was
(`--resume`), and each curator's report is kept in build/curate/<job>.md. After the batch: one build and, on a
computer with a Zotero key, its sync; the inbox's papers whose article passes `check` are marked added.

Nothing here decides for you: the inbox papers taken are those you accepted, the others those you named.

A curator reads untrusted text (PDFs, publishers' pages), so what it may do is narrow: the glossator commands of
a curation (`CURATOR_COMMANDS`, enforced by the tool itself through `GLOSSATOR_AGENT=curator`), `date`, Git LFS's
pull of a quoted article's PDF, the file tools and the web tools (`TOOLS`); never your keys, the tool's code or its
agents (`DENY`), whatever the permission mode. `bypassPermissions` lifts every check but `DENY`: only in a sandbox."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .bibliography import Bibliography, bibliographies, collection
from .check import check_article, corpus
from .paths import BUILD
from .records import DOI_RE
from .triage import agent_cwd, agent_dirs, agent_env, find_claude, library_ref
from .util import fold, load_json, write_atomic

AGENT = "curator"
MODEL = "sonnet"
STATE = BUILD / "curate.json"
REPORTS = BUILD / "curate"
REPAIRS = 2  # resumes of a run whose article still fails check
TIMEOUT = 60 * 60  # seconds for one run
# A curator runs in the checkout (`triage.agent_cwd()`: its agents, CLAUDE.md and the uv project are there), with the
# library added to its folders when it lives elsewhere (`--add-dir`), and GLOSSATOR_HOME and GLOSSATOR_LIBRARY in its
# environment, so that its `uv run glossator …` work on this library. The brief names the library when it is not the
# checkout's `library/`.


def tools(library: str = "library") -> list[str]:
    """What a curator does without asking (.claude/agents/curator.md): the tool's own commands (`T` = `uv run --quiet
    glossator --bib <name>`), `date`, Git LFS's pull of a quoted article's PDF on a clone (`library`: the library as
    the brief names it), the files, the web's open sources. In the permission mode `auto`, Claude Code's classifier
    may allow more; `dontAsk` allows only these."""
    return [
        "Bash(uv run --quiet glossator *)",
        "Bash(uv run glossator *)",
        "Bash(date)",
        "Bash(date *)",
        f"Bash(git -C {library} lfs pull *)",
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
    ]


TOOLS = tools()
# What a curator never does, whatever the permission mode (deny rules come before every allow): read your keys and
# credentials, change the tool's code, its agents, skills and settings, run another program that reaches the network.
SECRETS = ["~/.ssh/**", "~/.gnupg/**", "~/.aws/**", "~/.config/**", "~/.netrc", "~/.git-credentials", "./.env"]
TOOL_FILES = [
    "./src/**",
    "./tests/**",
    "./web/**",
    "./scripts/**",
    "./.github/**",
    "./.claude/agents/**",
    "./.claude/skills/**",
    "./.claude/settings.json",
    "./.claude/settings.local.json",
    "./.mcp.json",
    "./CLAUDE.md",
    "./pyproject.toml",
    "./uv.lock",
]
DENY = (
    [f"Read({p})" for p in SECRETS]
    + [f"Edit({p})" for p in SECRETS + TOOL_FILES]
    + [
        f"Bash({c})"
        for c in ("curl *", "wget *", "ssh *", "scp *", "sftp *", "rsync *", "nc *", "git push *", "git push")
        + ("git remote *", "git config *", "crontab *", "uv run python *", "uv run sh *", "uv run bash *")
    ]
)
# The glossator commands a curation runs (the agent's procedure); within a curation the tool refuses the others
# (build, sync, zotero, inbox, curate, serve…: the orchestrator's, after the batch).
AGENT_ENV = "GLOSSATOR_AGENT"
CURATOR_COMMANDS = frozenset(
    {"new", "fetch-pdf", "supp", "text", "page", "crop", "cite", "vocab", "check", "export", "list", "bibs"}
    | {"search", "read", "verify"}
)
PERMISSION_MODES = ("auto", "dontAsk", "acceptEdits", "bypassPermissions")
BYPASS_WARNING = (
    "warning: --permission-mode bypassPermissions lets each curator run any command and read any file but those "
    "the deny rules name, on text from the web: use it only in a sandbox (a container or a virtual machine without "
    "your keys)."
)


def refusal(command: str | None, extra: frozenset[str] | set[str] = frozenset()) -> str | None:
    """Why a curator may not run `glossator <command>`, or None. Only inside a curation (the environment variable
    GLOSSATOR_AGENT=curator, which `claude_run` sets): a person at the terminal runs anything. `extra`: the commands
    plugin profiles add for their curators."""
    if os.environ.get(AGENT_ENV) != AGENT or command is None or command in CURATOR_COMMANDS | set(extra):
        return None
    return (
        f"glossator {command}: not a curator's command; a curator runs "
        f"{', '.join(sorted(CURATOR_COMMANDS | set(extra)))} (the batch runs build and the rest afterwards)"
    )


@dataclass
class Job:
    id: str  # the DOI, or the inbox paper's id
    bib: str
    brief: str
    inbox: str = ""  # the inbox paper it comes from
    doi: str = ""
    title: str = ""
    key: str = ""
    status: str = "pending"  # pending, running, done, failed, blocked
    session: str = ""
    cost: float = 0.0
    runs: int = 0
    errors: list[str] = field(default_factory=list)
    note: str = ""


def brief(
    bib: Bibliography,
    doi: str = "",
    authors: list[str] | None = None,
    year: str = "",
    venue: str = "",
    title: str = "",
    key: str = "",
    claims: list[str] | None = None,
) -> str:
    """The curator's brief, as /glossator-add writes it."""
    who = ", ".join((authors or [])[:3]) + (" et al." if len(authors or []) > 3 else "")
    ref = " ".join(x for x in (f"{who} {year}".strip() + ("," if venue else ""), venue) if x)
    line = ", ".join(x for x in (ref, f"'{title}'" if title else "", f"doi {doi}" if doi else "") if x) + "."
    if key:
        line += f" Key: {key}."
    cited = "; ".join(claims) if claims else "none given"
    lib = library_ref()
    where = f"\nLibrary: {lib} (the bibliography's folder: {lib}/{bib.name})." if lib != "library" else ""
    return f"Bibliography: {bib.name}.{where}\n{line}\nCited for: {cited}."


def from_inbox() -> list[Job]:
    """The inbox papers you accepted, each for the bibliography Haiku proposed."""
    from . import inbox

    bibs = {b.name: b for b in bibliographies()}
    jobs = []
    for it in inbox.items("accepted"):
        t = it.get("triage") or {}
        b = bibs.get(t.get("bib") or it.get("bib") or "")
        if b is None:
            print(
                f"{it['id']}: no bibliography named for it ({t.get('bib')!r}); add it by DOI with --bib",
                file=sys.stderr,
            )
            continue
        doi = (it.get("doi") or "").removeprefix("https://doi.org/")
        jobs.append(
            Job(
                id=it["id"],
                bib=b.name,
                inbox=it["id"],
                doi=doi,
                title=it.get("title", ""),
                brief=brief(
                    b, doi, it.get("authors"), (it.get("date") or "")[:4], it.get("venue", ""), it.get("title", "")
                ),
            )
        )
    return jobs


def from_dois(dois: list[str], bib: Bibliography, claims: list[str] | None = None) -> list[Job]:
    jobs = []
    for d in dois:
        doi = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:)", "", d.strip(), flags=re.I)
        if not DOI_RE.match(doi):
            raise ValueError(f"{d}: not a DOI")
        jobs.append(Job(id=doi, bib=bib.name, doi=doi, brief=brief(bib, doi, claims=claims)))
    return jobs


class Batch:
    """The jobs of a batch and their state file, written after every change (one writer at a time)."""

    def __init__(self, jobs: list[Job]):
        self.jobs, self.lock = jobs, threading.Lock()

    @classmethod
    def load(cls) -> Batch:
        return cls([Job(**j) for j in load_json(STATE)["jobs"]]) if STATE.exists() else cls([])

    def save(self) -> None:
        with self.lock:
            BUILD.mkdir(exist_ok=True)
            write_atomic(STATE, json.dumps({"jobs": [asdict(j) for j in self.jobs]}, ensure_ascii=False, indent=1))


def deny(library: str = "library") -> list[str]:
    """The deny rules of a run; when the library is not the checkout's `library/`, that folder too: a curator of
    another library (the demo, a home elsewhere) never writes in it."""
    return DENY + ([] if library == "library" else ["Edit(./library/**)"])


def claude_command(
    exe: str,
    session: str = "",
    budget: float = 0.0,
    permission_mode: str = "auto",
    library: str = "library",
    add_dirs: list[str] | tuple[str, ...] = (),
) -> list[str]:
    """The command line of one headless curator run. `library`: the library as the agent names it (relative to its
    working directory, or absolute); `add_dirs`: the folders it may reach beyond its working directory."""
    if permission_mode not in PERMISSION_MODES:
        raise ValueError(f"--permission-mode: {' | '.join(PERMISSION_MODES)}")
    cmd = [
        exe,
        "-p",
        "--agent",
        AGENT,
        "--model",
        MODEL,
        "--output-format",
        "json",
        "--permission-mode",
        permission_mode,
        "--permission-prompts",
        "none",
        "--settings",
        json.dumps({"permissions": {"deny": deny(library)}}),
    ]
    if add_dirs:
        cmd += ["--add-dir", *add_dirs]
    cmd += ["--allowedTools", *tools(library)]
    if budget:
        cmd += ["--max-budget-usd", f"{budget:g}"]
    if session:
        cmd += ["--resume", session]
    return cmd


def claude_run(prompt: str, session: str = "", budget: float = 0.0, permission_mode: str = "auto") -> dict:
    """One headless run of the curator (or the resume of one): its JSON result."""
    exe = find_claude()
    if not exe:
        raise RuntimeError("the claude command is not on PATH (Claude Code: https://claude.com/claude-code)")
    cwd = agent_cwd()
    cmd = claude_command(exe, session, budget, permission_mode, library_ref(cwd), agent_dirs(cwd))
    env = agent_env(**{AGENT_ENV: AGENT})
    run = subprocess.run(cmd, input=prompt, capture_output=True, text=True, cwd=cwd, env=env, timeout=TIMEOUT)
    try:
        out = json.loads(run.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"claude exited {run.returncode}: {(run.stderr or run.stdout)[-400:]}") from None
    return out if isinstance(out, dict) else {"result": str(out)}


def find_key(job: Job) -> str:
    """The article the run made: by its DOI, else by its title."""
    b = next(b for b in bibliographies() if b.name == job.bib)
    coll = collection(b)
    if job.doi and job.doi.lower() in coll.doi2key:
        return coll.doi2key[job.doi.lower()]
    if job.title:
        want = fold(job.title, True)
        for key, rec in coll.recs.items():
            if fold((rec.get("bib") or {}).get("title", ""), True) == want:
                return key
    return job.key


def check_errors(job: Job) -> list[str]:
    """What `check` says against the article (its errors only), or why there is no article."""
    if not job.key:
        return ["no article folder holds this DOI or title"]
    b = next(b for b in bibliographies() if b.name == job.bib)
    coll = collection(b)
    if job.key not in coll.recs:
        return [f"articles/{job.key}/record.json is missing or not readable"]
    rep = check_article(job.key, coll, lambda k, rec=None: corpus(b.articles / k, rec or coll.recs[k]))
    return rep.errors


BLOCKED = re.compile(r"no open (pdf|copy)|paywall|cannot (find|download)|blocked", re.I)


def run_job(job: Job, batch: Batch, budget: float, permission_mode: str, log) -> None:
    """Run one curator, then resume it with `check`'s errors until its article passes (REPAIRS times at most)."""
    job.status = "running"
    batch.save()
    prompt = job.brief
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = report_path(job)
    for attempt in range(REPAIRS + 1):
        try:
            out = claude_run(prompt, job.session if attempt else "", budget, permission_mode)
        except (RuntimeError, subprocess.TimeoutExpired, OSError) as e:
            job.status, job.note = "failed", str(e)[:400]
            batch.save()
            log(f"{job.id}: failed ({job.note})")
            return
        job.runs += 1
        job.session = out.get("session_id") or job.session
        job.cost += float(out.get("total_cost_usd") or 0)
        text = str(out.get("result") or "")
        with report.open("a", encoding="utf-8") as f:
            f.write(f"## Run {job.runs}\n\n{text}\n\n")
        job.key = find_key(job)
        job.errors = check_errors(job)
        batch.save()
        if not job.errors:
            job.status = "done"
            break
        if not job.key and (out.get("is_error") or BLOCKED.search(text)):
            job.status, job.note = "blocked", text.strip().splitlines()[-1][:300] if text.strip() else "no report"
            break
        if attempt < REPAIRS:
            log(f"{job.id}: check still fails ({len(job.errors)} errors), sent back to its curator")
            prompt = (
                f"`glossator check {job.key or '<key>'} --bib {job.bib}` still reports:\n- "
                + "\n- ".join(job.errors[:30])
                + "\nFix only these in the article's folder, run check again until it is clean, then report."
            )
    else:
        job.status = "failed"
        job.note = f"check still fails after {REPAIRS} repairs"
    batch.save()
    log(f"{job.id}: {job.status}{' → ' + job.key if job.key else ''} (${job.cost:.2f}, {job.runs} runs)")


def curate(
    jobs: list[Job], parallel: int = 4, budget: float = 5.0, permission_mode: str = "auto", after: bool = True
) -> int:
    """Run the curators of `jobs`, `parallel` at a time; then one build (and Zotero sync) and the inbox marked."""
    if permission_mode == "bypassPermissions":
        print(BYPASS_WARNING, file=sys.stderr, flush=True)
    batch = Batch(jobs)
    batch.save()
    lock = threading.Lock()

    def log(msg: str) -> None:
        with lock:
            print(msg, flush=True)

    todo = [j for j in jobs if j.status in ("pending", "running", "failed")]
    print(f"{len(todo)} curators, {parallel} at a time, on {MODEL} (reports in {REPORTS})", flush=True)
    with ThreadPoolExecutor(max_workers=max(1, min(parallel, 10))) as pool:
        for job in todo:
            pool.submit(run_job, job, batch, budget, permission_mode, log)
    done = [j for j in jobs if j.status == "done"]
    if done and after:
        from . import inbox
        from .site import build, zotero_sync
        from .zotero_web import configured

        added = [j.inbox for j in done if j.inbox]
        if added:
            print("\n".join(inbox.decide(added, "added")))
        build()
        if configured():
            zotero_sync()
    print(summary(jobs))
    return 0 if len(done) == len(jobs) else 1


def summary(jobs: list[Job]) -> str:
    lines = [
        f"{j.status:8} {j.bib}/{j.key or '-':24} ${j.cost:5.2f}  {j.id}" + (f"  — {j.note}" if j.note else "")
        for j in jobs
    ]
    total = sum(j.cost for j in jobs)
    counts = {s: sum(1 for j in jobs if j.status == s) for s in ("done", "failed", "blocked", "pending", "running")}
    lines.append(
        f"{len(jobs)} article{'' if len(jobs) == 1 else 's'}: "
        + ", ".join(f"{n} {s}" for s, n in counts.items() if n)
        + f"; ${total:.2f} in all"
    )
    return "\n".join(lines)


def report_path(job: Job) -> Path:
    return REPORTS / f"{re.sub(r'[^A-Za-z0-9._-]+', '_', job.id)}.md"
