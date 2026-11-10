# Privacy: what leaves your computer

Glossator keeps your library on your computers. Three things send data out: the Claude Code agents, the public
scholarly APIs, and Zotero if you set it up. This page lists every outbound flow, what it carries and when.

The threats, and how to harden a setup: [SECURITY.md](../SECURITY.md).

## In short

| Destination | What it receives | When |
|---|---|---|
| Anthropic, through Claude Code | The text and page images of the papers being curated, your records, the inbox's titles and abstracts, your questions | Curation, the daily triage, questions to Claude |
| Public scholarly APIs | DOIs, your watch queries and author names, the DOIs of your library | Adding a paper, the daily inbox, notice checks |
| Publishers and repositories | Requests for open PDFs and supplementary files | Adding a paper, the daily inbox |
| Hugging Face | One download of the search model | The first build or search |
| zotero.org | References, summary notes, inbox papers, file links (never the files) | Only with a Zotero key |
| Your own git remotes | Records, PDFs, inbox decisions | `glossator sync`, and the commands for several computers |

Glossator has no telemetry and no analytics. The reading room loads nothing from other sites.

## What stays on your computer

| Data | Where |
|---|---|
| Papers (PDFs), records, inbox | `library/`, a git repository of its own |
| Extracted text and page renders | `library/<bibliography>/.work/` |
| The search index, with the full text of every PDF | `build/index.sqlite` |
| The reading room's data, the Zotero file, curation reports | `build/` |
| The search model | The Hugging Face cache (`~/.cache/huggingface` by default) |
| The curator's memory of sources and the tool | `.claude/agent-memory/` |
| Transcripts of every Claude Code run, including the text the agents read | `~/.claude/projects/` (Claude Code's own) |

Files take your umask's permissions. On a computer shared with other people, make the repository readable by you
only: `chmod 700` on its folder.

## Anthropic, through Claude Code

The agents run in Claude Code, so what they read goes to Anthropic's API. Retention and training follow the terms of
your Anthropic plan. For institutional data, use a plan whose terms your institution accepts.

| Agent | Runs when |
|---|---|
| Curator (Sonnet) | `glossator curate`, or `/glossator-add` in Claude Code |
| Scout (Haiku) | Each daily inbox run |
| Librarian, and the MCP server | When you ask Claude about your papers |

The curator sends:

- Its brief: the bibliography, the reference, the DOI and the claims you pass with `--cited-for`.
- Its instructions: `CLAUDE.md`, `library/CLAUDE.md`, the bibliography's `PROFILE.md` and the tool's reference.
- The full extracted text of the paper and its supplementary files.
- Page renders and figure crops, as images.
- Other records it reads, and the output of the commands it runs.
- The pages it fetches with WebFetch, which pass through Anthropic. Anthropic runs its WebSearch queries.

The scout sends, for each new paper, its title, abstract (at most 3,000 characters), venue, date and the query that
found it. It also sends every bibliography's name, title and scope, the summary language, and the titles of your
nearest past decisions, kept or dropped.

The librarian sends your question, and the passages, records, summaries and inbox entries the tools return. The MCP
server's instructions list every bibliography's name and title.

Claude Code's own telemetry and error reports follow Claude Code's settings. Glossator does not change them. Set
`DISABLE_TELEMETRY=1` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` to turn them off.

The `/glossator-search` and `/glossator-add` skills can also use the claude.ai connectors your session has, such as
Consensus, PubMed, alphaXiv or bioRxiv. These receive search queries. The agents' instructions say to send only
public references, but no code enforces it.

## Public scholarly APIs

No account and no key. Requests name the tool: `glossator/<version> (+https://github.com/camilziane/glossator)`.

| Service | What it receives | When |
|---|---|---|
| `api.openalex.org` | A new article's DOI | `new`, `fetch-pdf`, `supp --list` |
| | Your watch queries and author names | Each daily inbox run |
| | Every DOI of your library, 50 per request | Each daily inbox run, for the papers citing yours (`citations = false` in `watch.toml` stops it) |
| `api.crossref.org` | A new article's DOI | `new` |
| | Every DOI of your library | `glossator notices`, and weekly in the inbox run |
| `eutils.ncbi.nlm.nih.gov` (PubMed) | Your watch queries | Each daily inbox run |
| `export.arxiv.org` | Your watch queries | Each daily inbox run |
| `api.biorxiv.org` | Date ranges only | Each daily inbox run. Your queries never leave: they filter the new preprints on your computer. |
| `api.datacite.org` | A DOI that Crossref and OpenAlex do not know | `new` |
| `www.ebi.ac.uk` (Europe PMC) | A new article's DOI | `new` |
| `pmc-oa-opendata.s3.amazonaws.com` | A PubMed Central id | `fetch-pdf`, `supp`, the inbox's PDFs |

## Publishers and repositories

`fetch-pdf`, `supp` and the inbox download open PDFs and supplementary files. They use the addresses OpenAlex and
PubMed Central list, or an address the curator found. These requests use a browser's user agent, because some
publishers refuse other clients:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36
```

Only `http` and `https` addresses are fetched, redirects included. Glossator sends no login and no cookie.

## Hugging Face

The first build or search downloads the model `BAAI/bge-small-en-v1.5` (about 260 MB, MIT license) at a pinned
revision. Later runs load it from the local cache without contacting the Hub, and `HF_HUB_OFFLINE=1` forbids the
network altogether.

Hugging Face's telemetry is off. The embeddings are computed on your computer: no text is sent.

## Zotero

Nothing goes to Zotero without a key in `~/.config/glossator/zotero-key` (or the file `GLOSSATOR_ZOTERO_KEY` names).

| When | What |
|---|---|
| `glossator zotero pull`, `push`, `sync` | Reads your inbox decisions, then sends the changes |
| `glossator build --zotero` | Builds, then syncs |
| After `glossator curate` | Syncs by itself |
| After each daily inbox run | Syncs by itself |
| `glossator inbox purge` | Deletes, from Zotero's trash, the inbox papers the tool put there |

| What is uploaded | Details |
|---|---|
| Each article's item | Bibliographic fields, tags from the record, its collection |
| One note per article | The summary `glossator export` prints, including the checked claims. These claims may quote your own unpublished text if you passed it with `--cited-for`. |
| Linked files | Paths relative to Zotero's linked attachment base directory. The files themselves are never uploaded. |
| Inbox papers | Fields, abstract, Haiku's note, tags (`glossator inbox`, `relevance N`), a link to the PDF fetched on your computer |
| Colored tags | `accept` and `reject`, added to your library's tag settings |

Zotero's own sync then copies the notes to zotero.org and your other Zotero installs. The collection and tag names
come from `library.toml` (`zotero_collection`, `zotero_tag`). See [Configuration](reference/configuration.md).

## Your own git remotes

`glossator sync` and the commands for several computers push and pull `library/` with your original, over ssh. The
records, the PDFs (through Git LFS) and the inbox's commits go there. Each run and each decision of the daily inbox
commits `library/inbox/` by itself.

## Installing

`uv sync` downloads Python packages from PyPI, and PyTorch's CPU build from `download.pytorch.org` on Linux.
`glossator web` downloads npm packages from the npm registry. Next.js telemetry is off in every script.
