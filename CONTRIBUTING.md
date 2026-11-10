# Contributing to Glossator

Thanks for helping. Bug reports, fixes, new profiles and documentation are all welcome. Glossator is in alpha and has
one maintainer, so answers may take a few days.

- A bug or an idea: open an [issue](https://github.com/camilziane/glossator/issues/new/choose).
- A security problem: never in public. Follow [SECURITY.md](SECURITY.md).
- Everyone who takes part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need [uv](https://docs.astral.sh/uv/) and poppler-utils (`pdfinfo`, `pdftotext`, `pdftoppm`). The web app needs
Node.js 20.19 or later. `uv sync --group dev` installs Python 3.11 or later, PyTorch's CPU build and the dev tools
(pytest, ruff). A plain `uv sync` leaves the dev tools out, as for anyone who only uses Glossator.

```sh
git clone https://github.com/camilziane/glossator
cd glossator
uv sync --group dev
```

`uv sync --group dev --extra gpu --no-group cpu` installs PyTorch with CUDA instead, for faster builds on an NVIDIA
GPU; `uv run` returns to the default environment unless it gets the same options (or `UV_NO_SYNC=1` is set).

## Before you open a pull request

Run every test, lint and format checks, and check that the demo still passes:

```sh
uv run pytest -q
uv run ruff check
uv run ruff format --check
GLOSSATOR_HOME=demo uv run glossator check --all
```

| If you change | Also run |
|---|---|
| A command or an option | `uv run python scripts/gen_cli_reference.py`, which rewrites `docs/reference/cli.md` |
| A record format or a view | `GLOSSATOR_HOME=demo uv run glossator build`, and compare the demo's page and `export` before and after |
| `web/` | `npm run check` and `npm run format:check` in `web/` |
| Dependencies | `uv lock`, and commit `uv.lock` |

CI runs the same checks on Linux (Python 3.11 to 3.13) and macOS, plus a dependency audit.

## Rules

- **Tests never touch a real library, a Zotero key, a crontab or a network service.** They build a synthetic library
  in a temporary folder (`tests/sample_library.py`). They fake Claude Code, Zotero's API, ssh and the crontab.
- **No private data in the repository.** No record, PDF, key, personal path or email address in code, tests, fixtures,
  examples or screenshots. Examples use neutral subjects: protein structure, ecology, materials.
- **A change keeps every article's view and export unchanged** unless that is its point.
- **Behavior that works stays working.** New behavior comes with its tests.
- Write help strings, errors and docs in English, to "you", as the
  [style guide](docs/contributing/style-guide.md) says.

## Where things are

[docs/contributing/architecture.md](docs/contributing/architecture.md) maps the code: what each module does and how
data flows from the APIs to the reading room. The agents and skills live in `.claude/`. The demo library is in
`demo/`.

## Changelog

Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for any change a user would notice.

## License

By contributing, you agree that your contribution is published under the [MIT license](LICENSE).
