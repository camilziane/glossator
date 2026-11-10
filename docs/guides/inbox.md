# The daily inbox

Each day the inbox finds new papers for your bibliographies, ranks them and waits for your decision. Nothing enters a
bibliography until you accept it and a curator adds it.

## Before you start

- A library with at least one bibliography, each with a `scope` in its `biblio.json`.
- Claude Code, signed in, for the triage. Without it, use `glossator inbox run --no-triage`.
- The daily run is scheduled on one computer only, the original. See [several computers](computers.md).

## Set it up

`glossator init` can write the inbox's settings for you. To write them later:

```sh
uv run glossator inbox init
```

It writes `library/inbox/watch.toml`, with one `[[watch]]` block per bibliography. Each block lists the senior
authors who sign at least two of its articles. Add your queries:

```toml
[[watch]]
bib = "methods"
queries = ["protein structure prediction", "molecular dynamics"]
authors = ["John Jumper"]
```

Run it once, then schedule it every day:

```sh
uv run glossator inbox run
uv run glossator inbox start --at 07:30
```

`inbox start` shows the line it will add to your crontab and asks before it writes it. The line runs Glossator with
this repository's Python and this library's folders, so cron needs neither uv nor your shell settings. Each library
has its own line. `inbox stop` removes this library's line, and `inbox status` shows the schedule, the last run and
the counts.

`inbox start` refuses to run on a clone, on the demo, or before `library/inbox/watch.toml` exists. Cron skips a run
when the computer is asleep or off at that time, so pick an hour when it is awake. The next run catches up: it
looks back to the previous run.

## What a run does

1. Asks OpenAlex, PubMed, arXiv, bioRxiv and medRxiv for papers since the last run. It also asks OpenAlex for recent
   papers citing your articles.
2. Keeps the papers it has never seen and merges duplicates across sources.
3. Scores how close each paper is to each of your bibliographies, on your computer. See
   [How papers are ranked](#how-papers-are-ranked).
4. Has Claude Haiku rate each paper from 0 to 3 against the scopes, with a short summary and the reason.
5. Fetches the open PDFs of the best papers into `library/inbox/pdfs/`.
6. Commits `library/inbox/` in the library's git, so `glossator sync` carries it to your other computers.
7. With a Zotero key on this computer, syncs Zotero.

Once a week, the run also asks Crossref for retractions and corrections of your articles.

## How papers are ranked

Before Claude Haiku reads a new paper, Glossator scores how close it is to each bibliography. This runs on your
computer: nothing is sent anywhere for it.

The score is computed in one of two ways, depending on how many decisions the bibliography has.

1. **At first, by similarity.** The paper's title and abstract become a vector, with the model the search uses. The
   vector is compared with the papers you kept for this bibliography: its articles, and the inbox papers you
   accepted for it. The score is the mean similarity to the three closest ones.
2. **Then, by a model of your decisions.** Once the bibliography has at least 8 kept papers and 8 rejected ones, a
   small classifier is trained on those decisions. Its probability replaces the similarity. It learns what you keep
   beyond the scope written in `biblio.json`.

The score is used three ways:

- It orders the inbox, after Haiku's rating.
- It gives Haiku your past decisions on the closest papers, as examples.
- With `prior_gate` set, papers that score below it are not sent to Haiku at all.

In the reading room it reads "closest to Methods · 0.86": the bibliography the paper is closest to, and its score
from 0 to 1.

## Cost

The triage is a paid Claude Haiku run, every day. It sends Haiku 10 papers per call: their titles and abstracts,
your scopes, and a few of your past decisions as examples.

For 100 new papers, a run reads about 70,000 to 230,000 input tokens and writes about 15,000. Multiply by the price
of the Haiku model your Claude Code uses, on [Anthropic's pricing page](https://www.anthropic.com/pricing). On a
Claude subscription, the runs count against your usage limits instead.

The estimate comes from the prompt's size, not from a bill:

| Part | Tokens |
|---|---|
| A paper: title, abstract (at most 3,000 characters), venue, query | 400 to 800 |
| Haiku's answer for a paper: rating, summary, reason | About 150 |
| Claude Code's own instructions, per call of 10 papers | 3,000 to 15,000, not measured |

To spend less, write narrower queries, lower `per_query`, or set `prior_gate` so that papers far from your library
skip Haiku. `uv run glossator inbox run --no-triage` files new papers without Haiku.

## Accept or reject papers

Do it on any computer. Each decision is committed with the inbox.

| Where | How |
|---|---|
| Reading room | `uv run glossator serve --open`, then the Inbox page |
| Terminal | `uv run glossator inbox accept <id>` or `uv run glossator inbox reject <id>` |
| Claude Code | Ask, for example "Show my inbox" then "Accept 2 and 5" |
| Zotero | Tag the paper `accept` or `reject`. See [Zotero](zotero.md#accept-or-reject-in-zotero). |

`uv run glossator inbox list` shows the waiting papers, the most relevant first. A rejected paper is never proposed
again.

Then curate what you accepted:

```sh
uv run glossator curate --inbox
```

## Settings

`library/inbox/watch.toml` starts with these keys:

| Key | Default | What it does |
|---|---|---|
| `first_days` | 14 | How far back the first run looks. Later runs start from the previous run. |
| `per_query` | 20 | The most results per query and source |
| `show_from` | 1 | The lowest rating that `inbox list` and the reading room show (0 to 3) |
| `fetch_from` | 2 | The lowest rating whose open PDF the run fetches. Remove the key to never fetch. |
| `citations` | `true` | Also look for recent papers citing your articles |
| `citations_days` | 30 | How recent those citing papers must be |
| `prior_gate` | unset | Papers scored below this (0 to 1) are not sent to Haiku |

Each `[[watch]]` block takes these keys:

| Key | What it does |
|---|---|
| `bib` | The bibliography this block feeds |
| `queries` | Topic words, sent to each source |
| `authors` | Author names, looked up in OpenAlex |
| `sources` | Any of `openalex`, `pubmed`, `arxiv`, `biorxiv`, `medrxiv`. All by default. |
| `biorxiv_categories` | Only these bioRxiv and medRxiv categories, such as `["bioinformatics"]` |

Queries go to public services. Write topics, methods and authors, never unpublished work.

## PDFs and clean-up

| Command | What it does |
|---|---|
| `glossator inbox fetch <id>...` | Fetches the open PDFs of the papers you name |
| `glossator inbox fetch --from <n>` | Fetches the open PDFs of every waiting paper rated at least `n` |
| `glossator inbox purge --dry-run` | Lists the PDFs that left the inbox |
| `glossator inbox purge` | Deletes them from this computer's Git LFS store |

A rejected or curated paper's PDF leaves the inbox at once. `purge` frees the disk space it took. With a Zotero key,
`purge` also empties the inbox papers from Zotero's trash.

## Next

- [Add papers](add-papers.md)
- [Zotero](zotero.md)
- [CLI reference](../reference/cli.md#inbox)
