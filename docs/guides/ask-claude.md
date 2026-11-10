# Ask Claude about your papers

Claude can search your library and answer with the article and the page. It reads only the passages it needs, and
it can verify a quote before citing it.

## Before you start

- [Claude Code](https://claude.com/claude-code), signed in.
- A built index: run `uv run glossator build` after adding articles.

## In Claude Code

Open Claude Code in the repository folder:

```sh
claude
```

The repository's `.mcp.json` declares the `glossator` MCP server. The first time, Claude Code asks you to approve
it. Then ask your question, for example:

> How accurate is AlphaFold in CASP14? Cite the pages.

Claude answers with sources such as `(jumper2021, p. 2)`. For longer research questions, ask for the librarian
agent: "Use the librarian to compare the methods in my library."

To try it on the demo, start Claude Code with the demo library:

```sh
GLOSSATOR_HOME=demo claude
```

## What Claude can do

| Tool | What it does |
|---|---|
| `search` | Finds the passages that answer a query, best first |
| `read` | Returns one passage, or its whole page |
| `verify` | Tells whether a text is on a given page: verbatim, close, elsewhere or absent |
| `article` | Returns an article's summary or sections of its record |
| `list_articles` | Lists the articles, optionally of one bibliography |
| `status` | Says when the index was built and what it holds |
| `inbox` | Lists the inbox's papers |
| `inbox_decide` | Accepts or rejects inbox papers, only when you ask |
| `inbox_fetch` | Fetches inbox papers' open PDFs, only when you ask |

Arguments and answers: [MCP tools](../reference/mcp-tools.md).

The server reopens the index after each build. You never need to restart it.

## Find and add papers

| Command | What it does |
|---|---|
| `/glossator-search <question>` | Finds candidate papers for a bibliography and lists them |
| `/glossator-add <dois>` | Curates the papers you pick. See [Add papers](add-papers.md). |

## Other MCP clients

Any MCP client that runs a local command can use the server.

<details>
<summary>Claude Desktop</summary>

Add this to Claude Desktop's configuration file, with the full path of your repository folder:

```json
{"mcpServers": {"glossator": {
  "command": "uv",
  "args": ["run", "--directory", "/full/path/to/glossator", "--quiet", "glossator", "mcp"]}}}
```

Restart Claude Desktop. The `glossator` tools appear in the tools menu.

</details>

## What Claude sees

When you ask a question, the passages Claude reads go to Anthropic, like the rest of the conversation. The index
stays on your computer. Every outbound flow is listed in [privacy](../privacy.md).

## Next

- [Add papers](add-papers.md)
- [How it works](../how-it-works.md#the-search-index)
