---
name: glossator-add
description: Add articles to one of the bibliographies (library/) - one curator agent per article in parallel, on Sonnet, then build the page and check every bibliography. Takes DOIs, references, the numbers of the last /glossator-search list, the papers accepted in the daily inbox, or a folder of your alphaXiv library (claude.ai connector). Use when asked to add, curate or file articles in the bibliography.
argument-hint: "<DOIs | references | numbers of /glossator-search | inbox | alphaxiv:<folder>> [--bib name] [cited for: claims]"
---

# /glossator-add

Turn a list of articles into complete folders: one `curator` per article (`.claude/agents/curator.md`), then
one build and one check. This session orchestrates; it never fills a record itself.
Read `library/CLAUDE.md` first when there is one: this library's own rules (what stays private).

It works the same on every computer, and builds on the one it runs on. On a clone (`git -C library remote get-url
origin` prints the original's address; the original has none), first bring it up to date, so the list and the keys
are current:

    uv run --quiet glossator sync      # from the repository's root

What to add: $ARGUMENTS

## 1. The list

The articles come from:
- DOIs or references in the message;
- the numbers of the last `/glossator-search` table in this conversation;
- `inbox`: the papers accepted in the daily inbox (`uv run --quiet glossator inbox list --status accepted --json`:
  DOI, title, and Haiku's bibliography in `triage.bib`). Once a paper's folder passes `check`, mark it:
  `glossator inbox done <id>` (it commits the inbox by itself). The inbox is in git, so a sync brings the latest
  papers and decisions: where the list is empty, say so and stop;
- `alphaxiv:<folder>`: a folder of your alphaXiv library, through the claude.ai connector (`list_library`
  with `include_papers`, the folder by its name). Each arXiv id gives `10.48550/arXiv.<id>`; look for the
  published version (OpenAlex, Consensus `search` on the title) and take it when there is one.

The connector tools' names depend on the client: find them with ToolSearch ("alphaxiv list_library", "pubmed
lookup_article_by_citation", "consensus search") if they are not loaded.

## 2. One DOI per article

Resolve each reference to the DOI of its version of record: PubMed `lookup_article_by_citation` or
`convert_article_ids` (biomedical), Consensus `search`, or OpenAlex
(`https://api.openalex.org/works?search=<title words>`). Two candidate papers for one reference, or none: ask
before launching anything. Then drop what is already there:

    uv run --quiet glossator list      # from the repository's root

and say which are already in (bibliography and key).

## 3. The briefs

The bibliography (`--bib`, or the one `/glossator-search` chose, or ask). One brief per article:

```
Bibliography: <name>.
<Authors> <year>, <venue>, '<title>', doi <DOI>. [Key: <key>, only if one was given.]
Cited for: <each claim another document makes about it, word for word, or "none given">.
```

A claim names what the article is cited for, never the unpublished work behind it.

## 4. Launch

One `curator` agent per article, `model: "sonnet"` (curators run on Sonnet: thorough enough and much cheaper
than the main model), all of a wave in one message, waves of at most 10. Wait for every report of a wave before the next.

## 5. Build and check, once

    uv run --quiet glossator build --zotero   # build/ (index, page), then the Zotero library, if one is set up
    uv run --quiet glossator check --all      # every bibliography (a few minutes)

A curator's error that `check` still shows: send it back to that curator (SendMessage) with the error, once. On a
clone, "not downloaded here" is no error: those articles' PDFs are placeholders, checked where they are.
What `check --all` leaves to a person (two entries of a shared file that may be the same) is listed in the report;
merging them is a person's decision (never edit a shared file by hand).

## 6. Report

In the library's language (`library/CLAUDE.md` says which; English otherwise), one line per article: key, citation,
done or blocked (why). For "no open PDF": the page where it can be downloaded by hand, and where to drop it on this
computer (`library/<bibliography>/.work/manual/<key>.pdf`); `/glossator-add <key>` with the file then resumes it (the
brief says `fetch-pdf <key> --file <path> --url <page>`). Then the claims checked (confirmed, absent, different), the
open points worth a reader's eye, and the state of `check`. A key a curator reports as "first author + year"
because refs_bibs is not on this computer: say so (the manuscript may cite the paper under another key).

Afterwards, only when asked:
- save the arXiv ones to a folder of your alphaXiv library (`save_papers_to_folder`, the folder named);
- commit in `library/` (`git -C library add -A && git -C library commit -m "add <keys>"`), then, on a clone,
  `uv run --quiet glossator sync`: it sends the articles, PDFs included, to the original (git only).
  Report what sync printed.
