# Add papers

A curator agent turns a DOI into a checked article: its folder, its open PDF and its record. You can run curators
from Claude Code or from the terminal.

## Before you start

- A library with at least one bibliography: [Getting started](../getting-started.md).
- [Claude Code](https://claude.com/claude-code), signed in. Without it, see [Without Claude](#without-claude).
- Read [Cost](#cost) and [SECURITY.md](../../SECURITY.md).

## From Claude Code

Open Claude Code in the repository folder, then use the two slash commands:

| Command | What it does |
|---|---|
| `/glossator-search <question>` | Finds candidate papers and lists them. It adds nothing. |
| `/glossator-add <dois>` | Runs one curator per paper, then builds and checks once |

`/glossator-add` also takes the numbers of the last `/glossator-search` list, or `inbox` for the papers you
accepted. If your Claude session has scholarly connectors, such as PubMed, `/glossator-search` uses them too.

## From the terminal

Look at the briefs first. A dry run prints them and spends nothing.

```sh
uv run glossator curate 10.1038/s41586-021-03819-2 --bib methods --dry-run
```

Then run the curators:

```sh
uv run glossator curate 10.1038/s41586-021-03819-2 --bib methods
```

| Command | What it curates |
|---|---|
| `glossator curate <doi>... --bib <name>` | The DOIs you name, into that bibliography |
| `glossator curate --inbox` | Every inbox paper you accepted |
| `glossator curate --resume` | What the last batch did not finish |
| `glossator curate --status` | Nothing: it shows the last batch and its cost |

Tell the curator what another document says about a paper. It checks the claim in the paper and reports the page.

```sh
uv run glossator curate 10.1038/s41586-021-03819-2 --bib methods \
  --cited-for "a median backbone accuracy of 0.96 Å in CASP14"
```

Every option: [CLI reference](../reference/cli.md#curate).

## What a run does

1. Creates the article's folder and a record skeleton from Crossref and OpenAlex metadata.
2. Downloads the open PDF and the supplementary files.
3. Reads the whole paper, supplementary material first.
4. Crops the figures the profile asks for.
5. Fills `record.json`: every fact with its page, the key sentences word for word.
6. Runs `glossator check`. If the article fails, the run is resumed with the errors, at most twice.

After the batch, Glossator builds once. With a Zotero key on this computer, it also syncs Zotero. Each curator's
report is in `build/curate/`.

Glossator never commits articles. Review them, then commit:

```sh
git -C library add -A
git -C library commit -m "Add jumper2021"
```

## Cost

A paper costs about half a dollar on Claude Sonnet in our runs, more for a long paper. These limits cap the cost:

| Setting | Default | What it limits |
|---|---|---|
| `--budget` | $5 | The most one run may spend |
| Runs per article | 3 | The first run and up to two resumes after `check` fails |
| `--parallel` | 4 (at most 10) | Curators running at once |

The worst case is $15 per article. Start with `--dry-run`, then a single paper.

## Permissions

Curators run unattended and read PDFs from the internet, so nobody approves their tool calls. A curator may run
`glossator` commands, read and write files, and search and fetch the web.

Inside a curation, Glossator itself refuses the commands a curator never needs, such as `sync`, `zotero` or
`curate`.

`--permission-mode` sets how Claude Code treats the curators' tool calls:

| Mode | Meaning |
|---|---|
| `auto` (default) | Claude Code's classifier reviews each call. It may allow calls beyond the allowed list. |
| `dontAsk` | Only the allowed list runs. The strictest mode. |
| `acceptEdits` | The allowed list and file edits run without review |
| `bypassPermissions` | Every call runs. Use it only in a sandbox. |

The layers that protect you, and how to harden a setup: [SECURITY.md](../../SECURITY.md#the-curator-agents).

## When there is no open PDF

Curators fetch PDFs only from legitimate open sources: publishers' open access, PubMed Central, arXiv, bioRxiv,
medRxiv and institutional repositories. They never use a shadow library or get past a paywall.

If a paper has no open copy, the curator stops and says so. If you have a copy you may use, save it under
`library/<bibliography>/.work/manual/`, then attach it and curate again:

```sh
uv run glossator fetch-pdf <key> --file library/methods/.work/manual/<file>.pdf --url <source> --bib methods
```

`--file` takes only a file inside `library/`. `--url` records where the copy came from.

## Without Claude

You can fill a library by hand. Glossator then searches the full text, and you write the record yourself.

```sh
uv run glossator new --doi 10.1038/s41586-021-03819-2 --bib methods
uv run glossator fetch-pdf jumper2021 --bib methods
uv run glossator build
```

`new` writes a record with a TODO in each field, saying what goes there. `check` fails until every TODO is filled.
The full text is searchable as soon as you build.

## Next

- [The daily inbox](inbox.md)
- [Record format](../reference/record-format.md)
- [Troubleshooting](../troubleshooting.md)
