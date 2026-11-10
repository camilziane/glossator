"""Nothing personal or private in the published tree.

Every text file git tracks, and every new one it does not ignore, is read as words: runs of letters and digits,
camelCase split too (`SomeWordIcon` also gives some, word, icon). The test fails on:

- a blocked word, or pair of words: a private list kept here as hashes (the first 12 hex digits of the SHA-256 of the
  lowercase word), so that this file names none of them; a failure shows the word as the file has it;
- the tool's former names: in Python, as a whole string, a command or a path (elsewhere the word may name a
  variable); everywhere else, any use but an attribute (`x.name`) and the file name `biblio.json`;
- an absolute home folder other than an example's (`/home/me`, `/Users/me`, `/home/someone`);
- French quotation marks;
- "the user" in what people read: Markdown, the agents and skills, and the strings of the code (not its docstrings).

ALLOWED lists the files where a word is legitimate.
"""

from __future__ import annotations

import ast
import hashlib
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

WORDS = frozenset(
    {
        "05824d0df98c", "05fb617ad543", "0741532c8897", "0b135e8de8f4", "0ba7bc229319", "1045162186f0", "130363291a75",
        "14831aec4cee", "148fe52d27fd", "1800ae105ca1", "1a473be23606", "1b4aa9b2fafc", "1bf0ede8943e", "1ee11af4ed5d",
        "24f102db6da0", "260e2416fc8a", "3121ef76cd46", "35cd2a634364", "364bb3603509", "372a40a5ed8f", "3edf2b2ad997",
        "42e0313d8f0b", "44de9b7b036b", "457f4ade6cf0", "45cfeb278194", "472f6b4f2ecf", "48bd7c5faf5b", "4ef6d5161614",
        "5072ee5d40f4", "5178a8b5d07e", "58e710a686ab", "5b75e572c3d1", "5d8c80c09ab0", "60dc2d5aede9", "625f82be8b47",
        "638a53a83c43", "64cc85c348a6", "66678c188ea7", "68ec054126c9", "6be80d0678cc", "6cf4a2f299e8", "6d6127360249",
        "6e7fdf319c03", "6f88924a89dd", "77f6fe60fdec", "7aa2bdf0829a", "7dd1aeff3475", "80ba6be04d96", "82b1926bc965",
        "83e51d7e9ccc", "8712a171cf64", "89f5a8b15240", "9018100db843", "9355a4e73cd3", "93643857b87c", "943e91ae2f7f",
        "9c55bb1ea579", "a1d18be15744", "a20dded364d4", "a6e6e6f19418", "a96b5cac90bf", "aa0204611ca0", "aa2f27e353bb",
        "ab4f21d8f349", "ac26848592f3", "acac51d53dc4", "b378c272ee3a", "b6e24705ee3e", "b85b1c399f49", "bbbf7a6412d6",
        "bc02fbaae739", "be1d3ee9a3bd", "bef7942178cd", "c3863ec1e58a", "cb7e06ec8992", "d0142028b326", "d805b360623b",
        "d9975c30cabc", "da887b4f8d16", "dd8d418795d2", "e6984aa7cc13", "e927fa95cb07", "e9f7b5b69666", "ee7637bd419d",
        "ee8909936b5d", "eed28849d8ce", "f98da860316d", "fb39fe7c1f32", "fe85ae3cdef4", "ff525a3103ae",
    }
)  # fmt: skip
PAIRS = frozenset({"16bea7740235", "29c5a55ef585", "6927ff5e35ec"})
NAME = frozenset({"960ae9d0fe66", "f8471ece5749"})  # the author's name: blocked but where the project names its author
OLD = frozenset({"1ae85ad204dc", "a1e851388781"})  # the tool's former names

# path (a folder ends with "/") -> the hashes allowed there, or "*" for every check
ALLOWED: dict[str, frozenset[str] | str] = {
    "tests/test_no_private_traces.py": "*",
    "LICENSE": NAME,
    "pyproject.toml": NAME,
    "CITATION.cff": NAME,
    "src/glossator/net.py": OLD,
    "src/glossator/zotero.py": OLD,
}

BINARY = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".otf", ".xlsx"}
WORD = re.compile(r"[^\W_]+")
CAMEL = re.compile(r"(?<=[a-zß-ÿ])(?=[A-ZÀ-Þ])")
HOME = re.compile(r"/(?:home|Users)/(?!(?:me|user|you|someone|runner)\b)[\w.-]+")
QUOTES = re.compile("[«»]")
THE_USER = re.compile(r"\bthe users?\b", re.I)


def digest(word: str) -> str:
    return hashlib.sha256(word.lower().encode("utf-8")).hexdigest()[:12]


def published_files() -> list[str]:
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            capture_output=True,
            check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("not a git checkout")
    return sorted({p for p in out.decode().split("\0") if p and (ROOT / p).is_file()})


def allowed(path: str) -> frozenset[str] | str:
    hashes: set[str] = set()
    for where, what in ALLOWED.items():
        if path == where or (where.endswith("/") and path.startswith(where)):
            if what == "*":
                return "*"
            hashes |= what
    return frozenset(hashes)


def text_of(path: str) -> str | None:
    if Path(path).suffix.lower() in BINARY:
        return None
    try:
        data = (ROOT / path).read_bytes()
    except FileNotFoundError:  # gone since git listed it
        return None
    if b"\0" in data[:8192]:
        return None
    return data.decode("utf-8", errors="replace")


def blocked_words(text: str, allow: frozenset[str]) -> list[tuple[int, str]]:
    found = []
    for n, line in enumerate(text.splitlines(), 1):
        words = WORD.findall(line)
        for word in words:
            parts = {word, *CAMEL.sub(" ", word).split()}
            hit = next((p for p in parts if digest(p) in (WORDS | NAME) - allow), None)
            if hit:
                found.append((n, hit))
        for a, b in zip(words, words[1:], strict=False):
            if digest(f"{a} {b}") in PAIRS - allow:
                found.append((n, f"{a} {b}"))
    return found


COMMAND = re.compile(r" (?:build|sync|inbox|serve|search|check|curate|zotero|mcp|add|new|list|notices|verify)\b")


def old_names(text: str, allow: frozenset[str], strict: bool = True) -> list[tuple[int, str]]:
    """The former names in a text: every use when `strict`, else only as a command or a path (in Python, where the
    word may also name a variable). Never `<name>.json`, the file every bibliography keeps, nor an attribute
    (`x.name`, `name.attribute`)."""
    found = []
    for n, line in enumerate(text.splitlines(), 1):
        for m in WORD.finditer(line):
            if digest(m.group()) not in OLD - allow:
                continue
            before, after = line[: m.start()], line[m.end() :]
            if after.startswith(".json") or before.endswith(".") or re.match(r"\.[a-z_]", after):
                continue
            if strict or COMMAND.match(after) or before.endswith("/") or after.startswith(("/", " /")):
                found.append((n, m.group()))
    return found


def python_prose(text: str) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """A Python file's comments and docstrings (read by developers), and its other strings (what people read:
    values, help, messages, prompts), each with its first line."""
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))
        tree = ast.parse(text)
    except (SyntaxError, tokenize.TokenError):
        return [], [(1, text)]
    notes = [(t.start[0], t.string) for t in tokens if t.type == tokenize.COMMENT]
    docs = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                docs.add(id(first.value))
    shown = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            (notes if id(node) in docs else shown).append((node.lineno, node.value))
    return notes, shown


def traces(path: str) -> list[str]:
    allow = allowed(path)
    text = text_of(path)
    if allow == "*" or text is None:
        return []
    found = [(n, w, "blocked word") for n, w in blocked_words(text, allow)]
    found += [(n, m.group(), "home folder") for n, line in enumerate(text.splitlines(), 1) for m in HOME.finditer(line)]
    found += [
        (n, m.group(), "French quotation mark")
        for n, ln in enumerate(text.splitlines(), 1)
        for m in QUOTES.finditer(ln)
    ]
    if path.endswith(".py"):
        notes, shown = python_prose(text)
        for start, piece in notes:
            found += [(start + n - 1, w, "former name") for n, w in old_names(piece, allow, strict=False)]
        for start, piece in shown:
            found += [(start + n - 1, w, "former name") for n, w in old_names(piece, allow, strict=False)]
            if digest(piece.strip()) in OLD - allow:  # a value: a name, a tag, a folder
                found.append((start, piece.strip(), "former name"))
            found += [(start, m.group(), '"the user" in a message') for m in THE_USER.finditer(piece)]
    else:
        found += [(n, w, "former name") for n, w in old_names(text, allow)]
        if path.endswith(".md") or path.startswith(".claude/"):
            lines = text.splitlines()
            found += [(n, m.group(), '"the user"') for n, ln in enumerate(lines, 1) for m in THE_USER.finditer(ln)]
    return [f"{path}:{n}: {what}: {word}" for n, word, what in sorted(set(found))]


def test_the_published_tree_has_no_private_trace():
    found = [line for path in published_files() for line in traces(path)]
    assert not found, "\n".join(found)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Every quote is checked against its page.", []),
        ("A note in « quotes ».", ["French quotation mark", "French quotation mark"]),
        ("Copied from /home/jdoe/library.", ["home folder"]),
        ("Copied from /home/me/library or /Users/someone/library.", []),
        ("Ask the user first.", ['"the user"']),
    ],
)
def test_the_checks_find_what_they_should(tmp_path, monkeypatch, text, expected):
    monkeypatch.setattr(sys.modules[__name__], "ROOT", tmp_path)
    (tmp_path / "notes.md").write_text(text, encoding="utf-8")
    assert [line.split(": ")[1] for line in traces("notes.md")] == expected


def test_python_messages_are_checked_but_not_docstrings_or_identifiers(tmp_path, monkeypatch):
    monkeypatch.setattr(sys.modules[__name__], "ROOT", tmp_path)
    code = 'def f():\n    """Ask the user."""\n    return "ask the user"\n'
    (tmp_path / "m.py").write_text(code, encoding="utf-8")
    assert [line.split(": ")[1] for line in traces("m.py")] == ['"the user" in a message']


def test_a_former_name_counts_as_a_value_a_command_or_a_path_only():
    old = "bib" + "lio"  # spelt in two pieces: the list itself is kept as hashes
    assert old_names(f"{old}.json, coll.{old}, {old}.profile", frozenset()) == []
    assert [w for _, w in old_names(f"the collection {old}", frozenset())] == [old]
    assert old_names(f"# {old} (a variable)", frozenset(), strict=False) == []
    assert [w for _, w in old_names(f"# `{old} build` and ~/{old}/", frozenset(), strict=False)] == [old, old]
    assert old_names(f"def f({old}):\n    return {old}", frozenset(), strict=False) == []


def test_in_python_a_former_name_is_a_trace_as_a_value_not_as_a_variable(tmp_path, monkeypatch):
    monkeypatch.setattr(sys.modules[__name__], "ROOT", tmp_path)
    old = "bib" + "lio"
    code = f'def f({old}):\n    """Of `{old}`."""\n    return [\n{old},\n"{old}",\n"{old} inbox",\n"{old}/x"]\n'
    (tmp_path / "m.py").write_text(code, encoding="utf-8")
    assert [line.split(":")[1] for line in traces("m.py")] == ["5", "6", "7"]
