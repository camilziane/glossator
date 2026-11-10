"""Write docs/reference/cli.md from glossator's own command-line parser: every command, in the groups of
`glossator --help`, with its usage, its description and a table of its arguments.

    uv run python scripts/gen_cli_reference.py           # rewrite docs/reference/cli.md
    uv run python scripts/gen_cli_reference.py --check   # exit 1 when the file is not what the parser says (CI)

The commands a library's profile plugins add are not listed: they belong to that library."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
OUT = ROOT / "docs" / "reference" / "cli.md"


def cell(text: str) -> str:
    return " ".join(str(text).split()).replace("|", "\\|")


def argument(action: argparse.Action) -> str:
    if action.option_strings:
        opts = list(action.option_strings)
        if action.nargs != 0 and not isinstance(action, argparse.BooleanOptionalAction):
            metavar = action.metavar or (
                "{" + ",".join(map(str, action.choices)) + "}" if action.choices else action.dest.upper()
            )
            opts[-1] += f" {metavar}"
        return ", ".join(f"`{o}`" for o in opts)
    metavar = action.metavar or action.dest.upper()
    return f"`{metavar}`" + (" …" if action.nargs in ("*", "+") else "")


def describe(action: argparse.Action) -> str:
    text = action.help or ""
    if action.choices and not action.option_strings:
        text = f"{text}: {', '.join(f'`{c}`' for c in action.choices)}" if text else ", ".join(map(str, action.choices))
    if action.required and action.option_strings:
        text += " (required)"
    return cell(text)


def usage(name: str, parser: argparse.ArgumentParser) -> str:
    """`glossator NAME [OPTIONS] ARGS`, written here rather than by argparse, whose layout changes between Python
    versions."""
    words = [f"glossator {name}"]
    options = [a for a in parser._actions if a.option_strings and not isinstance(a, argparse._HelpAction)]
    if any(a.help != argparse.SUPPRESS for a in options):
        words.append("[OPTIONS]")
    for a in parser._actions:
        if a.option_strings or a.help == argparse.SUPPRESS:
            continue
        m = a.metavar or a.dest.upper()
        words.append({"?": f"[{m}]", "*": f"[{m} …]", "+": f"{m} …"}.get(a.nargs, m))
    return " ".join(words)


def rows(parser: argparse.ArgumentParser) -> list[str]:
    out = []
    for action in parser._actions:
        if isinstance(action, argparse._HelpAction) or action.help == argparse.SUPPRESS:
            continue
        out.append(f"| {argument(action)} | {describe(action)} |")
    return out


def render() -> str:
    from glossator.cli import EXAMPLES, GROUPS, SUMMARY, build_parser

    parser, sub = build_parser()
    lines = [
        "# Command-line reference",
        "",
        "<!-- Written by scripts/gen_cli_reference.py from glossator's parser: do not edit by hand. -->",
        "",
        SUMMARY,
        "",
        "```",
        f"usage: {parser.usage}",
        "```",
        "",
        "| Option | Description |",
        "|---|---|",
        *rows(parser),
        "",
        "Every command that works on one bibliography takes `--bib NAME` anywhere on the line, else the bibliography "
        "the current folder is in. The setup commands (`init`, `join`, `follow`, `promote`, `bibs add`, `zotero "
        "setup`) ask their questions in a terminal; each question also has a flag, and `--no-input --yes` runs them "
        "from a script.",
        "",
        "```",
        EXAMPLES.split("\n\n")[0],
        "```",
        "",
    ]
    for title, commands in GROUPS:
        lines += [f"## {title}", ""]
        for name, line in commands:
            sp = sub.choices[name]
            body = (sp.description or "").split("\n\n", 1)
            text = " ".join(body[1].split()) if len(body) > 1 else ""
            lines += [f"### {name}", "", line[:1].upper() + line[1:] + ".", ""]
            if text:
                lines += [text, ""]
            lines += ["```", usage(name, sp), "```", ""]
            table = rows(sp)
            if table:
                lines += ["| Argument | Description |", "|---|---|", *table, ""]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    check = "--check" in sys.argv[1:]
    text = render()
    if check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != text:
            print(
                f"{OUT.relative_to(ROOT)} is not up to date: uv run python scripts/gen_cli_reference.py",
                file=sys.stderr,
            )
            return 1
        print(f"{OUT.relative_to(ROOT)} is up to date")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
