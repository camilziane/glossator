# MCP tools

`glossator mcp` serves the search index to MCP clients over stdio. The repository's `.mcp.json` declares it for
Claude Code. Each tool answers in a few lines, so a client searches first and reads only what it needs.

The server reads `build/index.sqlite` and reopens it after each `glossator build`. It loads the search model in the
background at start. Until the model is ready, searches rank by words only and say so.

## Reading tools

These tools only read.

| Tool | Arguments | Returns |
|---|---|---|
| `search` | `query`; optional `bibliography`, `article`, `scope` (`all`, `records`, `text`), `limit` (default 8, at most 30), `mode` (`hybrid`, `keyword`, `semantic`) | The best passages, at most two per article: a reference, the article and a snippet |
| `read` | `ref` from `search`; optional `whole_page` | The passage's text, or its whole page |
| `verify` | `key`, `text`; optional `page`, `bibliography` | `verbatim`, `close`, `elsewhere` or `absent`, with the page, the share of words found and an excerpt |
| `article` | `key`; optional `bibliography`, `sections`, `summary` | The article's citation, one-line summary and section names; or the sections asked for; or its whole summary |
| `list_articles` | Optional `bibliography`, `contains` | One line per article: reference, citation, title |
| `status` | None | When the index was built, what it holds, and whether the search model is loaded |
| `inbox` | Optional `status` (`new`, `accepted`, `rejected`, `added`), `bibliography`, `include_low`, `limit` (at most 100) | The inbox's papers, with their rating, summary and reason |

A passage reference looks like `methods/jumper2021/paper.pdf#5.2` (page 5, passage 2) or
`methods/jumper2021/record:results`.

## Inbox actions

These tools change the inbox. Claude calls them only when you ask.

| Tool | Arguments | Does |
|---|---|---|
| `inbox_decide` | `ids`, `decision` (`accept` or `reject`); optional `note` | Records your decision and commits the inbox |
| `inbox_fetch` | Optional `ids`, `min_relevance` | Fetches the open PDFs of the papers named, or of every waiting paper rated at least `min_relevance` |

## Next

- [Ask Claude about your papers](../guides/ask-claude.md)
- [CLI reference](cli.md#mcp)
