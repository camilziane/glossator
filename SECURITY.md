# Security

## Report a vulnerability

Report it privately through GitHub: **Security → Report a vulnerability** on the repository, or
[this form](https://github.com/camilziane/glossator/security/advisories/new). Never open a public issue for it.

Say what an attacker can do, and how to reproduce it, on the demo library if you can. Leave out keys and the content
of your own library. You get an answer within 7 days. A fix comes out as a new release, with an advisory that credits
you if you wish.

Only the latest release is supported while Glossator is at 0.x.

| In scope | Out of scope |
|---|---|
| The `glossator` command, the reading room server (`glossator serve`), the MCP server, the web app in `web/` | Claude Code itself, Zotero, the scholarly APIs |
| The agents and skills in `.claude/`, and how `glossator curate` runs them | A library's own content |

## What Glossator protects, and from what

Glossator handles three kinds of sensitive things.

| Asset | Where |
|---|---|
| Your library: papers, records, inbox, decisions | `library/`, `build/` |
| Your Zotero key | `~/.config/glossator/zotero-key` |
| Your account's other secrets | `~/.ssh`, `~/.config`, cloud credentials… |

It reads untrusted input every day: PDFs, publishers' pages, metadata and abstracts from public APIs. The agents
read that text, and poppler and Pillow parse the files. [docs/privacy.md](docs/privacy.md) lists every outbound flow.

### The curator agents

`glossator curate` runs one Claude Code agent per paper, without a person watching. A paper or a web page could hold
instructions meant for the agent, a prompt injection. Glossator narrows what an agent may do.

| Layer | What it does |
|---|---|
| Allowed without asking | `uv run [--quiet] glossator …`, `date`, `git -C library lfs pull …`, and the Read, Edit, Write, Glob, Grep, WebFetch and WebSearch tools |
| Refused by the tool | Inside a curation (`GLOSSATOR_AGENT=curator`), `glossator` runs only a curator's commands: `new`, `fetch-pdf`, `supp`, `text`, `page`, `crop`, `cite`, `vocab`, `check`, `export`, `list`, `bibs`, `search`, `read`, `verify` and the profiles' own. `build`, `sync`, `zotero`, `inbox`, `curate` and `serve` are refused. |
| Denied, whatever the mode | Reading or editing `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config`, `~/.netrc`, `~/.git-credentials` and `.env`. Editing the tool's code, tests, agents, skills and settings. Running `curl`, `wget`, `ssh`, `scp`, `rsync`, `nc`, `git push`, `git remote`, `git config`, `crontab`, or Python and shells through `uv run`. |
| Fetches | `http` and `https` only, redirects included. No `file:` address. |
| Budget | `--max-budget-usd` per run (default $5), at most 3 runs per paper, a one-hour timeout |

The permission mode decides the rest. The default, `auto`, lets Claude Code's classifier allow actions beyond the
list. `--permission-mode dontAsk` allows the list only, which is the strictest choice. `bypassPermissions` lifts every
check but the deny rules. Glossator prints a warning when you use it: run it only in a sandbox.

These layers lower the risk. They do not remove it. An agent can still write wrong content into a record, and the web
tools can still send what it read to a site it visits.

### The reading room server

`glossator serve` answers on `127.0.0.1` (port 8765 by default) and only to requests that name `127.0.0.1`,
`localhost` or `[::1]`. That stops another site from reaching it through a rebound domain name.

| Protection | How |
|---|---|
| Files served | Only what the reading room links to: an article's `paper.pdf`, `record.json`, `figures/*` and `supplementary/*`, and the inbox's PDFs. Never a hidden folder, a path out of `library/`, or the library's settings. |
| Files from publishers | Anything but a PDF, an image or plain text is downloaded, sandboxed, never run as the page |
| Decisions | `POST /api/inbox/decide` only, with the header `X-Glossator: 1`. A page of another origin cannot send it. Ids are checked, the body is at most 64 KB. |
| Other origins | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, `nosniff` |
| Errors | A failure says so, and its details stay in the server's terminal |

It has **no password**. Any account on the same computer can read your library through it and record inbox
decisions. Do not run it on a computer shared with other people. The same holds for `npm run dev` in `web/`.

### Profile plugins

A library can hold its own profiles in `library/profiles/<name>/`. A plugin is Python code: Glossator imports it when
it opens a bibliography of that profile, with your account's rights. Use plugins only from a library you own or
trust. `glossator join` and `glossator follow` of another person's library run its plugins on your computer.

### The MCP server

`glossator mcp` talks over stdio only, to the client that started it. Two of its tools change things:
`inbox_decide` (a git commit) and `inbox_fetch` (downloads, then a git commit). `.mcp.json` declares the server for
Claude Code sessions opened in this folder. Claude Code asks you before it first uses a project's server.

### The Zotero key

| Fact | Details |
|---|---|
| Where | `~/.config/glossator/zotero-key`, or the file `GLOSSATOR_ZOTERO_KEY` names |
| Rights it needs | Library access, notes access, write access, on your personal library |
| Who reads it | `zotero_web.py` only. It is sent only to `api.zotero.org`, as a header and in the key check. |
| Exposure | Every message masks it. Glossator warns when the file can be read by other accounts. |

Create the file readable only by you (`chmod 600`). `glossator zotero setup` does this. To revoke the key, delete it
on [zotero.org/settings/keys](https://www.zotero.org/settings/keys).

### Supply chain

| Part | How it is pinned |
|---|---|
| Python | `uv.lock`, with hashes. CI runs `uv sync --locked` and `pip-audit`. |
| Web app | `web/package-lock.json`, `npm ci` |
| Search model | `BAAI/bge-small-en-v1.5` at a fixed Hub revision (`vectors.py`) |
| CI | Actions pinned by commit, read-only token. Dependabot proposes updates. |

## Harden a setup

- Run curations in a container or a virtual machine without your keys, or at least with `--permission-mode dontAsk`.
- Keep the Zotero key on the one computer that syncs with Zotero.
- Read `git -C library diff` before you commit a batch, and `git status` in the tool's folder after one.
- Make the repository readable by you only on a shared computer: `chmod 700`.
- After the first build, `HF_HUB_OFFLINE=1` keeps the search model from contacting the Hub.
- Set `DISABLE_TELEMETRY=1` for Claude Code if your institution requires it.

## Uninstall

1. Stop the daily inbox: `uv run glossator inbox stop`. It removes the crontab line that ends with `# glossator-inbox`.
2. Stop `glossator serve` if it runs.
3. Revoke the Zotero key on zotero.org, then delete `~/.config/glossator/`.
4. In Zotero, delete the collection named by `zotero_collection` (default `glossator`), with its `Inbox`. "Delete
   Collection and Items" also trashes items you merged into it. Remove the tags `glossator`, `glossator inbox`,
   `relevance N`, `accepted` and `not triaged`, and the colors of `accept` and `reject`. Reset the Linked Attachment
   Base Directory.
5. Delete the tool's caches: `.venv/`, `build/`, `web/node_modules/`, `web/out/`, `web/.next/` and
   `.claude/agent-memory/` in the repository, then `~/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5` and, if
   nothing else uses them, `~/.cache/uv` and `~/.cache/ms-playwright`.
6. Delete Claude Code's transcripts of the runs, in `~/.claude/projects/` under the repository's path.
7. Your library is yours: keep `library/` and its clones on your other computers, or delete them.
