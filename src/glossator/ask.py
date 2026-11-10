"""Questions, plans and progress lines for the commands that set things up (`init`, `join`, `promote`, `follow`,
`zotero setup`, `bibs add`).

Every such command runs the same way: questions, then read-only checks (one line each), then the plan (`This
will:`), then one confirmation, then the steps (one line each), then `Done:` and the commands to run next. Each
question also has a flag, so a script answers everything on the command line:

- `--no-input` (or no terminal on stdin, or GLOSSATOR_NO_INPUT=1): never read stdin; a question takes its flag, else
  its default, else the command stops (exit 2) naming the flag it needs;
- `-y/--yes`: answer yes to the plan and to a replacement; it never invents a value a question needs;
- `--dry-run`: print the plan and change nothing.

Each step checks before it acts, so a command run twice does nothing the second time, and a command stopped
half-way continues where it stopped when it is run again."""

from __future__ import annotations

import getpass
import os
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TextIO

MARKS = {"ok": "✓", "same": "·", "warn": "!", "fail": "✗", "fix": "→"}
ASCII = {"ok": "ok", "same": "--", "warn": "!!", "fail": "xx", "fix": "->"}


class NeedsInput(Exception):
    """A question without an answer, in a run that reads nothing: the flag that answers it."""

    def __init__(self, flag: str):
        super().__init__(flag)
        self.flag = flag


class Stop(Exception):
    """The command ends here: `code` 0 (nothing to do), 1 (a check or a step failed), 2 (usage), 130 (interrupted)."""

    def __init__(self, message: str = "", code: int = 1):
        super().__init__(message)
        self.message = message
        self.code = code


class DryRun(Exception):
    """The plan was printed for --dry-run: nothing changed."""


def marks_for(stream) -> dict[str, str]:
    """The marks a stream can print: ✓ · ! ✗ →, else their ASCII stand-ins (a terminal that is not UTF-8)."""
    try:
        "✓·✗→".encode(getattr(stream, "encoding", None) or "utf-8")
    except (UnicodeEncodeError, LookupError):
        return ASCII
    return MARKS


def safe_text(text: str, stream) -> str:
    """Text a stream can print: the characters it cannot encode replaced by '?'."""
    enc = getattr(stream, "encoding", None) or "utf-8"
    try:
        text.encode(enc)
        return text
    except (UnicodeEncodeError, LookupError):
        return text.encode(enc, "replace").decode(enc, "replace") if enc else text


def interactive_default() -> bool:
    return sys.stdin.isatty() and os.environ.get("GLOSSATOR_NO_INPUT", "") not in ("1", "true", "yes")


@dataclass
class Asker:
    """How a command asks and says things: from a terminal, or only from its flags."""

    interactive: bool = True
    yes: bool = False
    dry_run: bool = False
    out: TextIO = field(default_factory=lambda: sys.stdout)
    read: Callable[[str], str] = input
    read_secret: Callable[[str], str] = getpass.getpass

    @classmethod
    def from_args(cls, a) -> Asker:
        no_input = bool(getattr(a, "no_input", False))
        return cls(
            interactive=not no_input and interactive_default(),
            yes=bool(getattr(a, "yes", False)),
            dry_run=bool(getattr(a, "dry_run", False)),
        )

    # ------------------------------------------------------------------ saying

    def say(self, text: str = "") -> None:
        print(safe_text(text, self.out), file=self.out, flush=True)

    def mark(self, kind: str, text: str, fix: str | None = None) -> None:
        marks = marks_for(self.out)
        self.say(f"  {marks[kind]} {text}")
        if fix:
            self.say(f"    {marks['fix']} {fix}")

    def next_steps(self, rows: list[tuple[str, str]], title: str = "Next:") -> None:
        """The commands to run next, each with what it does, in two columns."""
        if not rows:
            return
        width = max(len(cmd) for cmd, _ in rows)
        self.say(title)
        for cmd, why in rows:
            self.say(f"  {cmd.ljust(width)}   {why}".rstrip())

    # ------------------------------------------------------------------ asking

    def _line(self, prompt: str) -> str:
        try:
            return self.read(prompt)
        except EOFError:
            raise Stop("no answer (end of input): nothing changed", 130) from None

    def ask(
        self,
        question: str,
        default: str | None = None,
        *,
        flag: str,
        value: str | None = None,
        check: Callable[[str], str | None] | None = None,
    ) -> str:
        """An answer: the flag's value, else the terminal's (empty: the default), else the default. `check` returns
        what is wrong with an answer, or None."""
        if value is not None:
            value = value.strip()
            problem = check(value) if check else None
            if problem:
                raise Stop(f"{flag} {value}: {problem}", 2)
            return value
        if not self.interactive:
            if default is None:
                raise NeedsInput(flag)
            return default
        while True:
            shown = f" [{default}]" if default else ""
            got = self._line(f"{question}{shown}: ").strip() or (default or "")
            if not got:
                self.say("  an answer is needed")
                continue
            problem = check(got) if check else None
            if problem:
                self.say(f"  {problem}")
                continue
            return got

    def optional(
        self, question: str, *, flag: str, value: str | None = None, check: Callable[[str], str | None] | None = None
    ) -> str | None:
        """An answer that may stay empty (None): the flag's value, else the terminal's, else None."""
        if value is not None:
            return self.ask(question, flag=flag, value=value, check=check)
        if not self.interactive:
            return None
        while True:
            got = self._line(f"{question}: ").strip()
            problem = check(got) if got and check else None
            if not problem:
                return got or None
            self.say(f"  {problem}")

    def choose(
        self,
        question: str,
        options: list[tuple[str, str]],
        default: str,
        *,
        flag: str,
        value: str | None = None,
    ) -> str:
        """One of `options` (value, one-line description), by its number or its value."""
        names = [v for v, _ in options]

        def check(ans: str) -> str | None:
            if ans in names or (ans.isdigit() and 1 <= int(ans) <= len(names)):
                return None
            return f"one of {' | '.join(names)} (or its number)"

        if value is None and self.interactive:
            width = max(len(v) for v in names)
            for i, (v, desc) in enumerate(options, 1):
                self.say(f"  {i}  {v.ljust(width)}  {desc}")
        got = self.ask(question, str(names.index(default) + 1), flag=flag, value=value, check=check)
        return names[int(got) - 1] if got.isdigit() else got

    def confirm(self, question: str, default: bool, *, value: bool | None = None) -> bool:
        """A yes or no that changes no file by itself (the plan does): its flag, else the terminal, else the
        default."""
        if value is not None:
            return value
        if not self.interactive:
            return default
        while True:
            got = self._line(f"{question} {'[Y/n]' if default else '[y/N]'}: ").strip().lower()
            if not got:
                return default
            if got in ("y", "yes", "n", "no"):
                return got.startswith("y")
            self.say("  y or n")

    def replace(self, question: str) -> bool:
        """A yes that replaces something: --yes, else the terminal (default no); without a terminal, the command
        stops."""
        if self.yes:
            return True
        if not self.interactive:
            raise Stop(f"{question} Run again with --yes to do it.", 2)
        return self.confirm(question, False)

    def lines(self, question: str, *, values: list[str] | None = None, check=None) -> list[str]:
        """Several answers, one per line, an empty line to end (none: an empty list)."""
        if values:
            for v in values:
                problem = check(v) if check else None
                if problem:
                    raise Stop(f"{v!r}: {problem}", 2)
            return [v.strip() for v in values if v.strip()]
        if not self.interactive:
            return []
        self.say(question)
        out: list[str] = []
        while True:
            got = self._line("> ").strip()
            if not got:
                return out
            problem = check(got) if check else None
            if problem:
                self.say(f"  {problem}")
                continue
            out.append(got)

    def secret(self, question: str) -> str:
        """A secret, read without showing it, never from the command line."""
        if not self.interactive:
            raise NeedsInput("--key-stdin")
        try:
            return self.read_secret(f"{question}: ").strip()
        except EOFError:
            raise Stop("no answer (end of input): nothing changed", 130) from None

    def go(self, default: bool = True) -> bool:
        """The answer to the plan: --dry-run stops here, --yes goes, a terminal is asked, else the command stops."""
        if self.dry_run:
            raise DryRun
        if self.yes:
            return True
        if not self.interactive:
            raise Stop("this would change what is listed above: run again with --yes", 2)
        return self.confirm("Go ahead?", default)


@dataclass
class Step:
    """One line of a plan: what it does, said before (`text`), and done (`act`, which may return a shorter
    account)."""

    text: str
    act: Callable[[], str | None]
    where: str = ""
    short: str = ""  # how a failure names it, when `text` is long (a whole crontab line)


def run_plan(asker: Asker, steps: list[Step], *, default: bool = True, title: str = "This will:") -> bool:
    """Print the plan, ask once, run each step and say so. False when the plan was declined (nothing done)."""
    if not steps:
        return True
    asker.say()
    asker.say(title)
    width = max((len(s.where) for s in steps), default=0)
    for i, s in enumerate(steps, 1):
        where = f"{s.where.ljust(width)}  " if width else ""
        asker.say(f"  {where}{i}. {s.text}")
    if not asker.go(default):
        asker.say("Nothing changed.")
        return False
    done = 0
    try:
        for i, s in enumerate(steps, 1):
            try:
                got = s.act()
            except (Stop, NeedsInput, KeyboardInterrupt):
                raise
            except Exception as e:  # noqa: BLE001 - any failure of a step ends the run with its account
                asker.mark("fail", f"{i}. {s.short or s.text}: {e}")
                raise Stop(
                    f"{steps_done(done)}; step {i} did not finish. Fix this, then run the same command again: it "
                    "continues (each step checks what is done already)."
                ) from None
            done = i
            asker.mark("ok", f"{i}. {got or s.text}")
    except KeyboardInterrupt:
        raise Stop(
            f"interrupted. {steps_done(done)}; step {done + 1} may be half done. Run the same command again: it "
            "continues (each step checks what is done already).",
            130,
        ) from None
    return True


def steps_done(n: int) -> str:
    return "No step is done" if n == 0 else ("Step 1 is done" if n == 1 else f"Steps 1 to {n} are done")


def guarded(fn: Callable[[], int], err: TextIO | None = None) -> int:
    """Run a setup command and turn its endings into exit codes and messages."""
    err = err or sys.stderr
    try:
        return fn()
    except NeedsInput as e:
        print(f"error: {e.flag} is needed without a terminal (or run the command in one)", file=err)
        return 2
    except DryRun:
        print("Dry run: nothing changed.")
        return 0
    except Stop as e:
        if e.message:
            print(("" if e.code == 0 else "error: ") + e.message, file=sys.stdout if e.code == 0 else err)
        return e.code
    except KeyboardInterrupt:
        print("\nInterrupted: nothing changed.", file=err)
        return 130
