# glossator

A tool that keeps scientific bibliographies: the uv project here (package `src/glossator/`, command `glossator`);
`T` = `uv run glossator` from here, `--bib <name>` picks the bibliography. The record format and what `check`
enforces are in `docs/reference/record-format.md`; the library's files and what `build` writes, in
`docs/reference/files.md`. The bibliographies are in `library/`, a git repository of its own (`GLOSSATOR_HOME=demo`
points the tool at the demo instead); each has a `biblio.json` (profile, title, scope) and a `PROFILE.md` (what goes
in it, how its records are filled); `T bibs` lists them. The profiles `ml` and `epidemio` are built in; a library
may add its own in `library/profiles/`.

**`library/CLAUDE.md`, when there is one, holds that library's own rules (what stays private, the language to
answer in): read it before working on the bibliographies. It comes before this file.**

- `/glossator-search <question>` finds candidates through the claude.ai connectors the session has (Consensus,
  PubMed, alphaXiv, bioRxiv/medRxiv…) and OpenAlex, and adds nothing; `/glossator-add <DOIs | numbers | inbox |
  alphaxiv:folder>` adds them (`.claude/skills/`).
- An article is built by one `curator` launch (`.claude/agents/curator.md`), on Sonnet, in parallel for a list.
  Brief it with the bibliography, the DOI (or authors, year, title) and the claims other documents make about the
  article, so it checks them.
- Nothing goes to a connector but public references: never a record, a PDF, a page, or the owner's unpublished
  work. Saving to a connector's library (alphaXiv) only when the owner asks.
- Without a chat: `T curate <DOI>... --bib X` or `T curate --inbox` runs the same curators headless (`claude -p`, a
  few at once), sends each back with `check`'s errors until its article passes, then builds; `T curate --status`
  says where the batch is. `T curate --dry-run` prints the briefs and spends nothing.
- After a batch, run once: `T build --zotero`, then `T check --all`. What `check --all` leaves to a person (two
  entries of a shared file that may be the same) is listed for the owner, never merged by hand.
- Any computer can add articles; each builds its own `build/`. On a clone (`library/` has a git origin: the
  original), `T sync` before a batch, and after the owner's commit to send the articles: it is git only, for
  `library/`, and it never builds. A light clone may hold PDF placeholders (`check` says "not downloaded here": no
  error). The inbox searches on one computer (the original's crontab); its papers and decisions are in git: each run
  and each decision commits `inbox/` (papers, state, PDFs) alone, the only commits the tool makes by itself. The run
  fetches the open PDFs of the papers rated `fetch_from` (watch.toml) or more; others when the owner asks:
  `T inbox fetch`. The owner decides with `T inbox accept|reject`, through Claude, in Zotero (tags `accept` and
  `reject`, keys 1 and 2, applied by `T zotero pull` or the next daily run), or on the page (`T serve`).
  `docs/how-it-works.md` tells a paper's life. `T inbox purge` (the PDFs the inbox let go, and its papers in Zotero's
  trash) only when the owner asks: it is never automatic.
- Several computers: `T init` makes a new library here (this computer is then its original); `T join <address>`
  clones an existing one onto this computer (the address is the one `T doctor` prints on the original) and builds
  this computer's own index, copying nothing built elsewhere; `T promote`, on a clone, makes it the original (the
  old original's daily run stops; the other clones' next `T sync` says to run `T follow <address>`). `T doctor`
  says what this computer has and lacks, each problem with the command that fixes it.
- Nothing generated is kept: `T build` writes `build/` (the search index `index.sqlite`, the page and its data, the
  Zotero library `zotero.rdf`, the manifest), ignored by git. Questions about the articles: the `librarian` agent, or
  the `glossator` MCP tools (`.mcp.json`): search, then read only the passages needed.
- The Zotero library carries each article's summary as a note, the checked claims included; they may quote documents
  the owner has not published, and Zotero syncs notes to zotero.org. The files stay linked, never stored in Zotero.
  On a computer with a Zotero key (`T zotero setup`), `T zotero sync` (or `T build --zotero`) sends the references and
  notes to the owner's Zotero library through the web API, the inbox's papers included, after applying the inbox
  decisions tagged there (`T zotero pull` alone: seconds); `T build` never reaches Zotero. The collection and tag are
  `library.toml`'s `zotero_collection` and `zotero_tag` (`glossator` by default). Never touch `zotero.sqlite`.
- A change to the tool (once: `uv sync --group dev`): `uv run pytest -q && uv run ruff check && uv run ruff format --check` (the tests make their
  own sample library), then on a real library: every article's view and export unchanged unless that is its point,
  and `T check --all` clean.
- The daily inbox (`library/inbox/`, `T inbox status|list|accept|reject`) files new papers triaged by Haiku
  (`scout`); nothing enters a bibliography without the owner's "accept", and `/glossator-add inbox` adds the accepted
  ones.
- Two repositories: the tool is committed here, the records in `library/` (`git -C library …`). Each
  bibliography's `.work/` (extracted text, page renders, pending drafts, hand-downloaded files) stays out of git.
- Public text in this repository (docs, help, errors, prompts, examples, tests) uses invented or neutral examples
  (protein structure, ecology, materials, meta-science), never anything from a real library:
  `tests/test_no_private_traces.py` guards it.
