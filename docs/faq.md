# FAQ

## Why the name?

Medieval glossators wrote notes in the margins of texts, line by line, with references to other passages. Glossator
writes such notes for your papers, each tied to its page.

## Which papers can it add?

Papers with a legitimate open-access PDF: publishers' open access, PubMed Central, arXiv, bioRxiv, medRxiv and
institutional repositories. Glossator never uses a shadow library or gets past a paywall. For another paper, you can
[add a copy you may use](guides/add-papers.md#when-there-is-no-open-pdf).

## How much does it cost?

Curating a paper costs about half a dollar on Claude Sonnet in our runs, more for a long paper. With the default
limits, one article costs at most $15: see [cost](guides/add-papers.md#cost). The inbox triage runs on Claude Haiku,
a smaller and cheaper model.

Search, `check`, builds and the reading room cost nothing.

## Can I use it without Claude?

Yes, partly. The demo, search, `check`, builds and the reading room need no Claude account. You can
[add papers by hand](guides/add-papers.md#without-claude) and run the inbox with `glossator inbox run --no-triage`.

## Which Claude account do I need?

Any account that runs Claude Code: a Claude subscription or an Anthropic API key. Curators use Sonnet, the scout
uses Haiku.

## Does it work offline?

Search, `check`, builds and the reading room work offline once the search model is downloaded. Curation, the inbox,
`notices` and Zotero sync need the network.

## Does it work with papers in other languages?

The search model is trained on English, so search by meaning works best in English. Search by words works in any
language. Inbox summaries follow `language` in `library.toml`.

## Does it replace Zotero?

No. Zotero manages references and citations in your writing. Glossator keeps checked reading notes and can feed them
to Zotero: see [Zotero](guides/zotero.md).

## Can a team share a library?

Yes, through git. Give your colleagues ssh access to the original, and each one joins it with `glossator join`.
Glossator does not manage permissions: git and ssh do.

## How do I remove an article?

Delete its folder in `library/<bibliography>/articles/`, commit, and build. Its Zotero item stays, and the next
sync lists it.

## How do I update Glossator?

In the repository folder:

```sh
git pull
uv sync
```

Then run `uv run glossator build`. The [changelog](../CHANGELOG.md) lists what changed.

## Does it run on Windows?

Not yet. Glossator is tested on Linux and on macOS with Apple silicon. Intel Macs are not supported, because
current PyTorch versions have no build for them.

## Next

- [Troubleshooting](troubleshooting.md)
- [Privacy](privacy.md)
