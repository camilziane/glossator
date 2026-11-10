# Getting started

This tutorial takes you from a fresh clone to your own library with one curated paper. It takes about 15 minutes,
plus the agent's run.

## Before you start

- Linux or macOS, with git.
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- poppler: `brew install poppler` on macOS, `sudo apt install poppler-utils` on Debian or Ubuntu.
- [Claude Code](https://claude.com/claude-code), signed in, to curate papers. The rest needs no Claude account.
- Optional: [Node.js](https://nodejs.org/) 20.19 or later, to build the reading room.
- Optional: [Git LFS](https://git-lfs.com/) 3.0 or later, to keep PDFs out of git's history.

## 1. Install Glossator

Glossator installs from a clone of its repository.

```sh
git clone https://github.com/camilziane/glossator
cd glossator
uv sync
```

`uv sync` installs Python 3.11 or later and every dependency into `.venv/`, about 1.3 GB on Linux. It installs the
CPU build of PyTorch, which is enough for most libraries.

On a computer with an NVIDIA GPU and its driver 525 or later, a large first build runs faster with the CUDA build
of PyTorch (about 6 GB more). Ask for it on the command that needs it:

```sh
uv run --extra gpu --no-group cpu glossator build
```

`uv run` installs what its command line asks for, so a plain `uv run glossator …` afterwards returns to the CPU
build. To stay on CUDA, run `uv sync --extra gpu --no-group cpu` once and `export UV_NO_SYNC=1` in that shell.

Check that everything is in place:

```sh
uv run glossator doctor
```

It lists each requirement and setting, and how to fix what is missing.

## 2. Look at the demo

```sh
uv run glossator demo
```

The demo library holds one paper, AlphaFold (Nature, 2021), already curated and checked. `glossator demo` builds
its search index, builds the reading room if Node.js is installed, and opens it. Press `Ctrl+C` to stop it.

`--home demo` runs any other command on the demo instead of your own library:

```sh
uv run glossator --home demo search "median backbone accuracy"
uv run glossator --home demo check --all
```

## 3. Create your library

```sh
uv run glossator init
```

`glossator init` asks, in this order:

1. Whether to keep PDFs and figures in Git LFS. Say yes if you will use several computers.
2. The language of the inbox's summaries.
3. Your first bibliography's profile: `ml` for machine-learning and computational methods, `epidemio` for studies
   with populations and rates.
4. Its folder name, title and scope. This tutorial uses `methods`. The scope says what goes in the bibliography, in
   a sentence or two, and the inbox triage reads it.
5. Optionally, the inbox's first queries, one per line, and then a daily time for the inbox.
6. Your name and email address for commits, only if git does not know them yet.
7. Whether to build the search index now.

It then shows a numbered plan and asks before it does anything. It creates `library/` as a git repository, with
`library/methods/biblio.json` and `library/methods/PROFILE.md`. If `library/` already holds bibliographies outside
git, `init` adopts them: it makes the repository and commits everything in one commit. Each question also has a flag, for scripts:
see the [CLI reference](reference/cli.md#init).

## 4. Tell the curator what you want

Open `library/methods/PROFILE.md`. It is this bibliography's part of the curator's instructions: which sections a
record has and how to fill them.

The template works as it is. Add your own rules in plain English, for example "Report the hardware used for every
timing."

The scope lives in `library/methods/biblio.json`:

```json
{"profile": "ml", "title": "Methods", "short": "Methods",
 "scope": "Numerical methods and scientific software: algorithms, libraries, benchmarks."}
```

## 5. Add your first paper

Curation runs a Claude agent. Look at its brief first, which costs nothing:

```sh
uv run glossator curate 10.1038/s41586-020-2649-2 --bib methods --dry-run
```

Then run it. The agent downloads the open PDF, reads the paper, writes the record and runs `check` until it passes.

```sh
uv run glossator curate 10.1038/s41586-020-2649-2 --bib methods
uv run glossator curate --status
```

`--status` shows where the batch is and what it cost, usually about half a dollar.
In Claude Code, opened in this folder, `/glossator-add 10.1038/s41586-020-2649-2` does the same.

The article lands in `library/methods/articles/harris2020/`.

## 6. Build and browse

```sh
uv run glossator build
uv run glossator web
uv run glossator serve --open
```

`build` writes the search index and the reading room's data into `build/`. `web` builds the reading room's web app
once per computer, with Node.js. `serve` opens the reading room at <http://127.0.0.1:8765/>.

Search from the terminal too:

```sh
uv run glossator search "vectorized operations on arrays"
```

## 7. Commit the article

Glossator never commits your articles. Review the new folder, then commit it:

```sh
git -C library add methods
git -C library commit -m "Add harris2020"
```

## Next

- [Get new papers every day](guides/inbox.md)
- [Sync with Zotero](guides/zotero.md)
- [Use several computers](guides/computers.md)
