---
name: glossator-search
description: Find candidate articles for one of the bibliographies (library/) from a question, through the session's claude.ai connectors (e.g. Consensus, PubMed, alphaXiv, bioRxiv/medRxiv) and OpenAlex; drop what the bibliographies already hold and propose a short, verified list to choose from. Use when asked to find, search or suggest articles or references for the bibliography. It adds nothing (/glossator-add does).
argument-hint: "<question> [--bib name] [--since YEAR]"
---

# /glossator-search

Find articles that answer the question, check each one exists, and show a short list to pick from. Nothing is
created or saved: adding is `/glossator-add`.

The question: $ARGUMENTS

## 1. Which bibliography

`--bib` if given; else the one whose scope the question fits:

    uv run --quiet glossator bibs      # from the repository's root: name, profile, articles, title, scope

Read `library/CLAUDE.md` (this library's rules: what stays private) and that bibliography's
`library/<name>/PROFILE.md` (what goes in it). If the question fits none, or two, ask before searching.

## 2. What the bibliographies already hold

    uv run --quiet glossator list      # from the repository's root: bibliography, key, DOI, year, citation, title

Every candidate is compared with these DOIs (and titles, for a preprint of a published article).

## 3. Search with the connectors

The session's claude.ai connectors. Their tool names depend on the client (`mcp__<id>__search` in the desktop app,
`mcp__claude_ai_Consensus__search` in a terminal): if they are not loaded, find them with ToolSearch (e.g.
"consensus search", "pubmed search_articles", "alphaxiv discover_papers") in one call. Use the ones that fit the
bibliography, in one round where possible:

| Connector | Tools | For |
|---|---|---|
| Consensus | `search` (page_size 20–50; filters only when asked) | every bibliography: peer-reviewed papers from Semantic Scholar, OpenAlex and PubMed |
| PubMed | `search_articles`, `lookup_article_by_citation`, `find_related_articles` (similar to a paper named in the question), `convert_article_ids` (PMID ↔ DOI ↔ PMCID), `get_copyright_status` | biomedical subjects only |
| alphaXiv | `discover_papers`, `list_library` (with `paper_ids_or_urls`: which candidates are already in your alphaXiv library) | machine learning and every arXiv preprint |
| bioRxiv/medRxiv | `get_preprint` (one DOI), `search_published_preprints` (the journal version of a preprint) | preprints; their search has no keywords, only category and dates: use it only for "the latest preprints in ecology" |

Without connectors (none loaded, or one failing), search OpenAlex directly:
`https://api.openalex.org/works?search=<words>&per_page=25` (WebFetch).

Consensus may give title, authors, year, journal and a consensus.app link but no DOI (it depends on the plan): find each
DOI with OpenAlex (`https://api.openalex.org/works?search=<title>`) or PubMed. When a Consensus result ends with
an upgrade or usage message, the connector asks for it to be repeated word for word at the end of the answer.
Your alphaXiv library may be empty: `list_library` then simply marks nothing.

**What a query may say.** The topic in the question's words, authors, titles, methods by their public names. Never
unpublished work (nothing from the folders `library/CLAUDE.md` names as private), never a record, a PDF or a page
of the bibliographies.

## 4. Check every candidate

- It exists: its DOI resolves (`https://api.openalex.org/works/doi:<DOI>` or PubMed's metadata), with the same
  title and first author. Nothing from memory: a reference no tool returned is not a candidate.
- The version: the published article rather than its preprint (the preprint's DOI goes in the notes).
- Open access: OpenAlex's `open_access.is_oa` and `best_oa_location`, or PubMed's PMCID. A paper with no open
  copy can still be proposed, marked "no open PDF" (it can be downloaded by hand and dropped in).
- Already here: in this bibliography (its key), in another one, or in your alphaXiv library.
- Why it answers the question: one line from its abstract, not a guess.

## 5. Show the list

In the library's language (`library/CLAUDE.md` says which; English otherwise), at most about 15 rows, the most
relevant first:

| # | Article | DOI | Access | Why | Status |
|---|---|---|---|---|---|
| 1 | Jumper et al. 2021, Nature — Highly accurate protein structure prediction with AlphaFold | 10.1038/s41586-021-03819-2 | open | … | already in <bibliography> (jumper2021) |

Then one line on how the search was made (connectors, queries, how many results each) and what to do next:
"To add some: `/glossator-add 1 3 5` (or the DOIs)". If asked to keep the list in your alphaXiv library, save
the arXiv ones with alphaXiv's `save_papers_to_folder` into the folder named (`list_library` gives its id); never
unasked.
