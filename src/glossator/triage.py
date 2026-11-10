"""The triage of new papers by Haiku agents: `claude -p --agent scout --model haiku`, a batch of candidates per
call, several calls at once. Each candidate gets the bibliography it belongs to, a relevance (0–3), a short
summary written from its abstract (in library.toml's `language`), and why. The bibliographies and what goes in each
(biblio.json's `scope`) come with every batch."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .bibliography import bibliographies
from .paths import CHECKOUT, LIBRARY, ROOT
from .settings import language

AGENT = "scout"
MODEL = "haiku"
BATCH = 10  # candidates per Haiku call
WORKERS = 4  # Haiku calls at once
RETRIAGE = 100  # papers left untriaged by earlier runs, triaged again at most per run
# Where Claude Code's installers put the `claude` command: a daily run started by cron has a short PATH.
CLAUDE_PLACES = ("~/.local/bin", "~/.claude/local", "~/.npm-global/bin", "/opt/homebrew/bin", "/usr/local/bin")


def find_claude() -> str | None:
    """The `claude` command: on the PATH, else where its installers put it."""
    found = shutil.which("claude")
    if found:
        return found
    for place in CLAUDE_PLACES:
        exe = Path(place).expanduser() / "claude"
        if exe.is_file() and os.access(exe, os.X_OK):
            return str(exe)
    return None


def claude_dir() -> str | None:
    """The folder of the `claude` command, for the daily run's PATH (None: not found on this computer)."""
    exe = find_claude()
    return str(Path(exe).parent) if exe else None


# --------------------------------------------------------------------------- where a headless agent runs


def agent_cwd() -> Path:
    """The folder a headless agent (`claude -p --agent …`) runs in: the checkout, which holds the agents
    (.claude/agents/), CLAUDE.md, .mcp.json and the uv project that `uv run glossator` needs, wherever the home
    (GLOSSATOR_HOME) is; the home itself when glossator runs from an installed package."""
    return CHECKOUT if CHECKOUT is not None else ROOT


def library_ref(cwd: Path | None = None) -> str:
    """The library as an agent running in `cwd` names it: relative when it is inside (`library`, `demo/library`),
    else its absolute path."""
    cwd = (cwd or agent_cwd()).resolve()
    lib = LIBRARY.resolve()
    return lib.relative_to(cwd).as_posix() if lib.is_relative_to(cwd) else str(lib)


def agent_dirs(cwd: Path | None = None) -> list[str]:
    """The folders an agent must reach beyond its working directory (`--add-dir`): the library, when it is
    elsewhere. Nothing else: not the home's build/, not the rest of the computer."""
    cwd = (cwd or agent_cwd()).resolve()
    return [] if LIBRARY.resolve().is_relative_to(cwd) else [str(LIBRARY.resolve())]


def agent_env(**extra: str) -> dict[str, str]:
    """The agent's environment: this one, with the home and the library named, so that every `uv run glossator …`
    it runs from the checkout works on this library."""
    return {**os.environ, "GLOSSATOR_HOME": str(ROOT), "GLOSSATOR_LIBRARY": str(LIBRARY), **extra}


def untriaged(items: list[dict], limit: int = RETRIAGE) -> list[dict]:
    """The papers still waiting for a decision that no triage has rated yet (Claude Code missing, failing or out of
    quota on an earlier run), the oldest first: the next run triages them."""
    waiting = [it for it in items if it.get("status") in ("new", "accepted") and not it.get("triage")]
    return sorted(waiting, key=lambda it: (it.get("found", ""), it.get("id", "")))[:limit]


def targets() -> list[dict]:
    """The bibliographies a paper may go to, and what goes in each."""
    return [{"bib": b.name, "title": b.title, "scope": b.scope} for b in bibliographies()]


def prompt(batch: list[dict], shots: list[dict] | None = None) -> str:
    items = [
        {
            "id": c["id"],
            "title": c["title"],
            "venue": c.get("venue", ""),
            "date": c.get("date", ""),
            "abstract": (c.get("abstract") or "")[:3000] or "(no abstract)",
            "found_for": c.get("bib", ""),
            "query": c.get("query") or "; ".join(c.get("queries") or []),
        }
        for c in batch
    ]
    return (
        "The bibliographies (`bib`: what goes in it):\n"
        + json.dumps(targets(), ensure_ascii=False, indent=1)
        + (
            "\n\nPast decisions on papers close to these (kept: accepted for that bibliography; "
            "dropped: rejected), to rate as they were rated:\n" + json.dumps(shots, ensure_ascii=False, indent=1)
            if shots
            else ""
        )
        + f"\n\nWrite `summary` and `why` in {language()}.\n\n"
        "Triage these candidate papers. Answer with the JSON array only, one object per candidate, in the same "
        "order.\n\n" + json.dumps(items, ensure_ascii=False, indent=1)
    )


def call(text: str, timeout: int = 900) -> str:
    """One Haiku agent's answer to a prompt (its final text)."""
    claude = find_claude()
    if not claude:
        raise RuntimeError("the claude command is not on PATH (Claude Code: https://claude.com/claude-code)")
    # The scout reads nothing on disk (the prompt holds the papers): no --add-dir.
    run = subprocess.run(
        [claude, "-p", "--agent", AGENT, "--model", MODEL, "--output-format", "json"],
        input=text,
        cwd=agent_cwd(),
        env=agent_env(),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if run.returncode != 0:
        raise RuntimeError(f"claude exited {run.returncode}: {(run.stderr or run.stdout)[-300:]}")
    return json.loads(run.stdout).get("result", "")


def parse(answer: str, ids: list[str]) -> dict[str, dict]:
    """The triage of each id in an answer; ids it misses or gets wrong are left out, an unknown bibliography is
    'none'."""
    bibs = {t["bib"] for t in targets()} | {"none"}
    m = re.search(r"\[.*\]", answer, re.S)
    if not m:
        return {}
    try:
        rows = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    out = {}
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or r.get("id") not in ids:
            continue
        try:
            relevance = int(r.get("relevance"))
        except (TypeError, ValueError):
            continue
        bib = r.get("bib") if r.get("bib") in bibs else "none"
        out[r["id"]] = {
            "bib": bib,
            "relevance": max(0, min(3, relevance)),
            "summary": str(r.get("summary", "")).strip(),
            "why": str(r.get("why", "")).strip(),
            "kind": str(r.get("kind", "")).strip(),
            "by": MODEL,
        }
    return out


def triage_batch(batch: list[dict], shots=None) -> tuple[dict[str, dict], str]:
    """Triage one batch, asking a second time for the candidates the first answer missed. `shots`: a function of a
    batch giving your nearest past decisions, shown to Haiku as examples."""
    ids = [c["id"] for c in batch]
    examples = shots(batch) if shots else None
    done: dict[str, dict] = {}
    error = ""
    for _ in range(2):
        todo = [c for c in batch if c["id"] not in done]
        if not todo:
            break
        try:
            done |= parse(call(prompt(todo, examples)), [c["id"] for c in todo])
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            error = f"{e.__class__.__name__}: {e}"
    missing = [i for i in ids if i not in done]
    return done, (f"{len(missing)} not triaged ({error or 'no usable answer'})" if missing else "")


def triage(cands: list[dict], shots=None) -> tuple[dict[str, dict], list[str]]:
    """The triage of every candidate (by id), and the errors met."""
    batches = [cands[i : i + BATCH] for i in range(0, len(cands), BATCH)]
    results, errors = {}, []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for done, error in pool.map(lambda b: triage_batch(b, shots), batches):
            results |= done
            if error:
                errors.append(error)
    return results, errors
