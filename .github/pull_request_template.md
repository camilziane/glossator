## What and why

<!-- What this changes, and the problem it solves (link the issue). -->

## Checks

- [ ] `uv run pytest -q`, `uv run ruff check` and `uv run ruff format --check` pass
- [ ] `GLOSSATOR_HOME=demo uv run glossator check --all` is clean, and the demo's views and exports are unchanged unless that is the point
- [ ] Tests cover the change (they use the synthetic library in `tests/`, never a real library, Zotero key or network service)
- [ ] The docs say what changed (`docs/`, `README.md`, `CHANGELOG.md`). For a command or an option, run `uv run python scripts/gen_cli_reference.py`.
- [ ] No private data: no record, PDF, key, personal path or e-mail in code, tests, fixtures or screenshots
- [ ] For `web/`: `npm run check` and `npm run format:check` in `web/`
