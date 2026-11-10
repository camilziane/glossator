# Files and folders

Where Glossator keeps things: the repository, your library, what `build` writes and the few files outside them.

## The repository

```text
glossator/
├── src/glossator/   the command `glossator`
├── .claude/         the agents (curator, scout, librarian) and the skills (/glossator-search, /glossator-add)
├── .mcp.json        declares the MCP server for Claude Code
├── web/             the reading room's source code
├── demo/            the demo library
├── library/         your library: a git repository of its own, ignored by this one
└── build/           written by `glossator build`, ignored by git
```

`--home <folder>`, before the command, names another folder that holds `library/` and `build/`, such as
`--home demo`. It wins over an exported `GLOSSATOR_LIBRARY`. `GLOSSATOR_HOME` does the same for every command.
`GLOSSATOR_LIBRARY` names a library folder directly.

## The library

```text
library/
├── library.toml          the library's settings
├── profiles/<name>/      profile plugins, if any
├── <bibliography>/
│   ├── biblio.json       its profile, title and scope
│   ├── PROFILE.md        the curator's rules for this bibliography
│   ├── articles/<key>/   one folder per article
│   └── .work/            extracted text and page renders, ignored by git
└── inbox/
    ├── watch.toml        what the daily inbox watches
    ├── items/            one file per paper found
    ├── pdfs/             the open PDFs of waiting papers
    └── state.json        the last run
```

An article's folder: [record format](record-format.md#an-articles-folder). The settings files:
[configuration](configuration.md).

With Git LFS, the library keeps its PDFs, images and office files there: `*.pdf`, `*.png`, `*.xlsx` and `*.docx`.
Glossator commits `inbox/` after each inbox run and decision, and the setup commands commit what they write. You
commit your articles.

## build/

`glossator build` writes `build/` from the records as they are. Each computer builds its own, and git ignores it.

| File | What it is |
|---|---|
| `index.sqlite` | The search index: records and full text in passages, with their vectors |
| `data/library.json` | What the reading room shows |
| `index.html` | A single-file page of every bibliography, for browsers without the reading room |
| `zotero.rdf` | Your library as a Zotero import file, with files linked |
| `manifest.json` | When it was built, the counts, and the PDFs without a text layer |
| `curate.json` | The last curation batch, for `curate --status` and `--resume` |
| `journal-pages.json` | How each published PDF's pages map to the journal's, read from its printed page numbers (safe to delete) |
| `curate/` | Each curator's report |

A build re-reads only new files and re-embeds only new passages. Deleting `build/` is safe: the next build makes it
again.

## Outside the repository

| Path | What it is |
|---|---|
| `~/.config/glossator/zotero-key` | Your Zotero API key, readable only by you. `GLOSSATOR_ZOTERO_KEY` names another path. |
| Your crontab | One line tagged `# glossator-inbox`, written by `glossator inbox start` |
| The Hugging Face cache | The search model, downloaded once |

## Next

- [Configuration](configuration.md)
- [Record format](record-format.md)
