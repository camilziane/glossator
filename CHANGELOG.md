# Changelog

Notable changes to Glossator. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may change the record formats or the
commands: its notes say how to move.

## [Unreleased]

## [0.1.0] - 2026-11-10

The first public release.

### Added

- Bibliographies as plain files in a git repository: one folder per article, with its open PDF, its supplementary
  files, its figures and a structured `record.json`. Two built-in profiles, `ml` (methods) and `epidemio` (studies),
  and plugin profiles kept in a library.
- `glossator curate`: one Claude Code curator per paper, run headless and sent back with `check`'s errors until its
  article passes.
- `glossator check`: the record's format and vocabularies, every quote found in the PDFs, every result's number
  printed in the paper.
- A local search index (SQLite FTS5 and a small embedding model run on your computer), `glossator search`, `read`
  and `verify`, and an MCP server for Claude.
- The reading room: a web app served on 127.0.0.1 by `glossator serve`, with full-text search and the inbox.
- The daily inbox: new papers from OpenAlex, PubMed, arXiv, bioRxiv and medRxiv, triaged by Haiku, decided by you.
- Zotero kept in step through its web API: references, summary notes, linked files, inbox decisions.
- Several computers kept in step by git, with Git LFS for the PDFs.
- Guided setup: `glossator init`, `bibs add`, `join`, `follow`, `promote`, `zotero setup`, `doctor`, `web` and `demo`.
- A demo library with one open-access article.

[Unreleased]: https://github.com/camilziane/glossator/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/camilziane/glossator/releases/tag/v0.1.0
