# Command-line reference

<!-- Written by scripts/gen_cli_reference.py from glossator's parser: do not edit by hand. -->

Scientific bibliographies kept in git by Claude agents: every fact with its page, every quote and number proven to be in the paper.

```
usage: glossator [--home PATH] [--bib NAME] COMMAND [ARGS]
```

| Option | Description |
|---|---|
| `--bib NAME` | the bibliography a command works on, anywhere on the line (else the one the current folder is in) |
| `--home PATH` | the folder that holds library/ and build/, before the command (as GLOSSATOR_HOME, and over GLOSSATOR_LIBRARY; default: the tool's folder) |
| `--version` | print the version |

Every command that works on one bibliography takes `--bib NAME` anywhere on the line, else the bibliography the current folder is in. The setup commands (`init`, `join`, `follow`, `promote`, `bibs add`, `zotero setup`) ask their questions in a terminal; each question also has a flag, and `--no-input --yes` runs them from a script.

```
Examples:
  glossator demo                                    the demo in the reading room, in your browser
  glossator init                                    a library of your own, step by step
  glossator --bib methods curate 10.1038/s41586-021-03819-2
  glossator search "protein structure from sequence"
  glossator check --all
  glossator doctor
```

## Get started

### demo

The demo library in the reading room, in your browser (built the first time).

Builds the demo library's index and data the first time (demo/build/), the reading room when Node is here and it is not built, then serves the demo until Ctrl+C. It comes with the repository.

```
glossator demo [OPTIONS]
```

| Argument | Description |
|---|---|
| `--port PORT` | the port (default 8765) |
| `--no-open` | do not open the browser |
| `--rebuild` | build the demo's index and data again |

### init

A new library on this computer, step by step.

On this computer, which becomes the original (the computer the others clone from, where the daily inbox runs): the library's git repository, Git LFS, its first bibliography (profile, folder, title, scope), the inbox's first queries and its daily time. It asks, shows the plan, then does it; every question is also a flag. On an existing library it only adds what is missing.

```
glossator init [OPTIONS]
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `--lfs`, `--no-lfs` | keep PDFs and figures in Git LFS |
| `--language LANGUAGE` | the language of the inbox's summaries (default English) |
| `--name NAME` | the first bibliography's folder name, e.g. methods |
| `--profile PROFILE` | its profile (the record format), e.g. ml |
| `--title TITLE` | its title |
| `--short SHORT` | its tab name in the reading room (24 characters at most; default the title) |
| `--scope SCOPE` | what goes in it, a sentence or two (the inbox's triage reads it) |
| `--query QUERY` | a query of the daily inbox (repeatable) |
| `--inbox-at HH:MM` | run the inbox every day at this time (your crontab) |
| `--git-name GIT_NAME` | the name commits are signed with, when git has none |
| `--git-email GIT_EMAIL` | the email address commits are signed with, when git has none |
| `--build`, `--no-build` | build the search index and the reading room's data at the end |

### join

An existing library on this computer, cloned from its original.

ADDRESS is the original's library: an ssh name and a path (lab.example.org:/srv/glossator/library), ssh://host/path, or a local path. It checks ssh and Git LFS on both sides, clones the library (records first, then the files), turns Git LFS's hooks on and builds this computer's own index and data. Run again, it resumes.

```
glossator join [OPTIONS] [ADDRESS]
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `ADDRESS` | the original's library (on a clone: its origin when left out; else asked) |
| `--light` | the records only: the PDFs stay placeholders |
| `--full` | on a light clone: download every file in Git LFS, and from now on |
| `--build`, `--no-build` | build this computer's search index and the reading room's data |
| `--web`, `--no-web` | build the reading room when Node is here (glossator web) |
| `--git-name GIT_NAME` | the name commits are signed with, when git has none |
| `--git-email GIT_EMAIL` | the email address commits are signed with, when git has none |

### doctor

What this computer has and lacks, where its library stands.

Reads only: tools, the library's state, the original, the daily run, build/, Zotero. Each problem comes with the command that fixes it. Exit 1 when a check fails.

```
glossator doctor [OPTIONS]
```

| Argument | Description |
|---|---|
| `--offline` | skip what needs the network (ssh, Zotero's web API) |
| `--json` | the checks as JSON |

### web

Build the reading room once on this computer (Node).

npm ci (when the lock changed), then next build: web/out/, which glossator serve shows. Nothing to do when web/out/ is built from web/ as it is. Needs Node 20.19 or later and the repository's web/.

```
glossator web [OPTIONS]
```

| Argument | Description |
|---|---|
| `--force` | build even when web/out/ is current |
| `--verbose` | show npm's output |

## Add papers

### curate

Curator agents add articles by DOI, or the inbox's accepted papers, then build.

Curator agents without a chat: one headless Claude Code run per article, a few at once; each article is sent back to its curator with check's errors until it passes; then one build.

```
glossator curate [OPTIONS] [DOI …]
```

| Argument | Description |
|---|---|
| `DOI` … | DOIs to add to --bib |
| `--inbox` | the inbox papers you accepted |
| `--resume` | the last batch's articles not done yet |
| `--status` | where the last batch is, and its cost |
| `--cited-for CITED_FOR` | a claim the curators check (with DOIs) |
| `--parallel PARALLEL` | curators at once (at most 10; default 4) |
| `--budget BUDGET` | dollars at most per curator run (default 5) |
| `--permission-mode {auto,dontAsk,acceptEdits,bypassPermissions}` | how the curators' tool calls are allowed: auto (default), Claude Code's classifier, may allow more than the allow-list; dontAsk, the allow-list only; acceptEdits; bypassPermissions, only in a sandbox |
| `--dry-run` | print the briefs, run nothing |

### bibs

The bibliographies: list them, or add one.

Without an action: one line per bibliography (name, profile, articles, title, scope). `bibs add` asks for a new bibliography's profile, folder, title, scope and inbox queries, writes its biblio.json and PROFILE.md, and commits them.

```
glossator bibs [OPTIONS] [ACTION] [NAME]
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `ACTION` | list (default) or add: `list`, `add` |
| `NAME` | add: the new bibliography's folder name |
| `--profile PROFILE` | add: its profile (the record format) |
| `--title TITLE` | add: its title |
| `--short SHORT` | add: its tab name in the reading room |
| `--scope SCOPE` | add: what goes in it (the inbox's triage reads it) |
| `--query QUERY` | add: a query of the daily inbox (repeatable) |
| `--no-commit` | add: write the files, commit nothing |

## Inbox

### inbox

The daily inbox of new papers: run, list, accept, reject, start, stop, status….

init: write library/inbox/watch.toml; run: look for new papers now; list: those waiting; accept, reject, done ID...: decide; fetch: download their open PDFs; score: rescore by the library's prior; purge: free the PDFs of papers that left the inbox; start, stop: the daily run (a line of your crontab, on the original only); status: the daily run and the counts.

```
glossator inbox [OPTIONS] ACTION [ID …]
```

| Argument | Description |
|---|---|
| `ACTION` | what to do: `init`, `run`, `list`, `accept`, `reject`, `done`, `fetch`, `score`, `purge`, `start`, `stop`, `status` |
| `ID` … | item ids (accept, reject, done, fetch) |
| `--from FROM` | fetch: the PDFs of the papers rated at least this (default: fetch_from) |
| `--at AT` | start: the daily time, HH:MM |
| `--status {new,accepted,rejected,added,all}` | list: the papers of this status (default new) |
| `--all` | list: also the papers rated below show_from |
| `--json` | list: the items as JSON |
| `--note NOTE` | accept, reject: a note kept with the decision |
| `--force` | init: rewrite watch.toml |
| `--no-triage` | run: file the papers without Haiku's triage |
| `--dry-run` | purge, start: say what would change, change nothing |
| `-y`, `--yes` | start: add the crontab line without asking |
| `--no-input` | start: never ask (scripts) |

## Read and search

### serve

The reading room of every bibliography at http://127.0.0.1:8765/.

On the loopback address only; Ctrl+C stops it.

```
glossator serve [OPTIONS]
```

| Argument | Description |
|---|---|
| `--port PORT` | the port (default 8765) |
| `--open` | open it in the browser |

### search

The passages that answer a question, with their pages.

From build/index.sqlite (glossator build writes it), records and PDFs' text together.

```
glossator search [OPTIONS] QUERY
```

| Argument | Description |
|---|---|
| `QUERY` | words or a question, in quotes |
| `--article KEY` | one article's key |
| `--scope {all,records,text}` | what to search (default all) |
| `-n`, `--limit LIMIT` | how many passages (default 8) |
| `--mode {hybrid,keyword,semantic}` | how to rank (default hybrid) |

### read

The text of a passage a search returned, or its whole page.

```
glossator read [OPTIONS] REF
```

| Argument | Description |
|---|---|
| `REF` | a passage's reference, as search prints it |
| `--page` | the whole page |

### verify

Is a quote on that page of that article? (verbatim, close, elsewhere, absent).

Exit 0 when the text is found verbatim or close, 1 otherwise.

```
glossator verify [OPTIONS] KEY TEXT
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |
| `TEXT` | the quote, in quotes |
| `--page PAGE` | the page it should be on |
| `--json` | the full answer as JSON (also when the output is not a terminal) |

### export

An article's summary in Markdown.

```
glossator export KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |

### list

One line per article.

Tab-separated: bibliography, key, DOI, year, citation, title (every bibliography without --bib).

```
glossator list
```

### mcp

The search index for Claude and other MCP clients (stdio).

What Claude Code starts through .mcp.json; not for a terminal.

```
glossator mcp
```

## Keep it right

### check

Formats, vocabularies, and every quote and number against the PDFs.

KEY...: those articles of --bib; --all: every article (of --bib, else of every bibliography); a bibliography's name instead of keys: all its articles.

```
glossator check [OPTIONS] [KEY …]
```

| Argument | Description |
|---|---|
| `KEY` … | article keys (or a bibliography's name) |
| `--all` | every article |

### notices

Retractions, expressions of concern and corrections (Crossref).

Exit 1 when an article was retracted or has an expression of concern.

```
glossator notices
```

### build

Write this computer's build/: the reading room's data, the search index, the Zotero file.

Nothing leaves this computer; each computer builds its own. With --zotero, your Zotero library follows.

```
glossator build [OPTIONS]
```

| Argument | Description |
|---|---|
| `--zotero` | then bring your Zotero library in step (zotero sync) |

### evaluate

How well the search finds the claims the records checked.

Recall at 5 and 10 of the claims the records checked.

```
glossator evaluate
```

## Computers

### sync

The library both ways with its original (git only, never a build).

Pull, then push library/ (its PDFs through Git LFS); stops with nothing changed on a conflict, and when the original moved (then: glossator follow ADDRESS). On the original there is nothing to sync.

```
glossator sync
```

### follow

Point this computer's library at another original.

After a glossator promote elsewhere: this computer's library follows ADDRESS, its new original (it must hold the same library), stops accepting pushes if it was the original, and stops its daily inbox run if it has one.

```
glossator follow [OPTIONS] ADDRESS
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `ADDRESS` | the new original's library (ssh-name:path) |

### promote

Make this computer the original.

Run it on a clone. It checks that both computers are in step and clean, stops the old original's daily run, makes this computer accept pushes, records the move in library.toml, turns the old original into a clone of this one (over ssh), stops following the old original and starts the daily run here. The others learn it at their next glossator sync and run glossator follow ADDRESS.

```
glossator promote [OPTIONS]
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `--address ADDRESS` | how the other computers reach this one (ssh-name:path) |
| `--address-from-old ADDRESS_FROM_OLD` | how the old original reaches this one (default: --address) |
| `--inbox-at HH:MM` | the daily run's time here (default: the old original's) |
| `--no-inbox` | do not start the daily run here |
| `--old-gone` | the old original is gone for good: do nothing there (its commits lost) |

## Zotero

### zotero

Your Zotero library in step: setup, sync, pull, push; or the Zotero file.

setup: the key (checked, kept out of git), Zotero's base directory, a dry run; sync: the decisions tagged in Zotero, then the references, notes and links; pull: only the decisions; push: only the references, notes, links and the inbox's papers; rdf (default): write the Zotero RDF file.

```
glossator zotero [OPTIONS] [ACTION]
```

| Argument | Description |
|---|---|
| `-y`, `--yes` | answer yes to the plan (and to a replacement) |
| `--no-input` | never ask: take each answer from its flag or its default (scripts, CI) |
| `--dry-run` | show the plan, change nothing |
| `ACTION` | what to do: `rdf`, `setup`, `pull`, `push`, `sync` |
| `--since SINCE` | rdf: only the articles added to git on or after this date, YYYY-MM-DD |
| `-o`, `--out OUT` | rdf: the file (default build/zotero.rdf, or build/zotero-since-DATE.rdf) |
| `--key-stdin` | setup: read the key from stdin (never from the line) |
| `--no-browser` | setup: do not open zotero.org's key page in a browser |
| `--check` | setup: check the key and the base directory, change nothing |

## Curator tools

### new

Create an article's folder and its record from a DOI.

record.json prefilled from Crossref and OpenAlex, each field's TODO saying what goes there.

```
glossator new [OPTIONS]
```

| Argument | Description |
|---|---|
| `--doi DOI` | the article's DOI (required) |
| `--key KEY` | only to keep a key another document already uses |

### fetch-pdf

Download an article's open-access PDF.

```
glossator fetch-pdf [OPTIONS] KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |
| `--url URL` | a PDF found elsewhere (open source only) |
| `--file FILE` | a PDF you downloaded by hand (a site that refuses scripts); --url says from where |
| `--version {publishedVersion,acceptedVersion,submittedVersion}` | which version of the paper it is |
| `--license LICENSE` | its licence, e.g. CC BY 4.0 |
| `--no-title-check` | the preprint's title differs from the article's |

### supp

List or download an article's supplementary files.

```
glossator supp [OPTIONS] KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |
| `--list` | list the supplementary files of the open sources |
| `--url URL` | download this one into supplementary/ |
| `--label LABEL` | what it is, e.g. 'Supplementary Methods' |
| `--name NAME` | its file name in supplementary/ |
| `--file FILE` | a file you downloaded by hand (a site that refuses scripts); --url says from where |

### text

Write the text of an article's PDFs, page by page, into .work/.

```
glossator text KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |

### page

Render one page of a PDF with a coordinate grid.

```
glossator page [OPTIONS] KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |
| `--page PAGE` | the page number (required) |
| `--pdf PDF` | supplementary/<name>.pdf instead of paper.pdf |
| `--dpi DPI` | resolution (default 110) |

### crop

Crop a figure panel into the article's figures/.

```
glossator crop [OPTIONS] KEY
```

| Argument | Description |
|---|---|
| `KEY` | the article's key |
| `--role ROLE` | the figure's role in the profile, e.g. main (required) |
| `--page PAGE` | the page number (required) |
| `--box BOX` | X0,Y0,X1,Y1 as fractions of the page from its top-left corner (required) |
| `--from FROM_` | where it is, e.g. 'Fig. 1a, p. 2' (required) |
| `--caption CAPTION` | what the panel shows, in your words (required) |
| `--pdf PDF` | supplementary/<name>.pdf instead of paper.pdf |
| `--dpi DPI` | resolution (default 300) |

### cite

A related-article entry for each DOI.

```
glossator cite DOI …
```

| Argument | Description |
|---|---|
| `DOI` … | one or more DOIs |

### vocab

The controlled vocabularies of a bibliography's records.

```
glossator vocab
```
