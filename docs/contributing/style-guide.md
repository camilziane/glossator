# Documentation style guide

How to write Glossator's README and documentation. Follow it for any page in `docs/`, the README and `demo/README.md`.

## Where things go

The documentation follows four kinds of pages. Keep each kind on its own pages.

| Kind | Purpose | Pages |
|---|---|---|
| Tutorial | Learning by doing, start to finish | `getting-started.md` |
| How-to guide | Reaching one goal | `guides/*.md` |
| Reference | Facts to look up | `reference/*.md` |
| Explanation | Understanding why and how | `how-it-works.md`, `privacy.md`, `faq.md` |

The README is a landing page. It says what Glossator is, shows the demo, and links to the rest. It holds no
procedure longer than three steps.

Each fact lives in one place. Options live in the CLI reference, settings in the configuration reference. Guides
link to them instead of repeating them.

## Voice

- Write to "you", in the present tense and the active voice. Steps use the imperative: "Run", "Open".
- Keep sentences under 20 words on average, 30 at most. One idea per sentence.
- At most one colon per sentence. No semicolons.
- At most three sentences per paragraph. Longer content becomes a list, a table or its own page.
- Use plain words. Never write "simply", "just", "easy", "seamless" or "powerful".
- Make claims you can measure, and give their conditions: "about half a dollar per paper on Sonnet, in our runs".
- Write **Glossator** in prose and titles, and `glossator` for the command and the package.

## Terms

Use one term per concept, as the [glossary](../how-it-works.md#glossary) defines it. Never use a synonym.

- Library, bibliography, scope, profile, paper (the publication, or an inbox candidate), article (once curated),
  record, inbox, triage.
- Reading room, not "the page" or "the site".
- Original and clone, not "server" or "main computer".
- Curator, scout and librarian for the agents.

## Headings

- The README and the getting-started tutorial number their sections: `## 1. Try the demo`. Other pages do not.
- Sentence case, five words or fewer.
- Tasks are verb phrases, such as "Make another computer the original". Concepts are nouns.
- Never refer to a section by its number. Link to the file and the heading.

## Commands and code blocks

- Mark commands as `sh`, without a `$` prompt, so they copy cleanly. Show output in a separate `console` block.
- Keep each command block to six lines or fewer, for one task. A file example in a reference page may be longer.
- Put explanations in the sentence before the block, never as comments inside it.
- Every block runs as written from the repository folder on a fresh clone. If it runs elsewhere, say where first:
  "On the original:".
- Code blocks use `uv run glossator …`. Tables and prose may name a command as `glossator <command>`.
- Write placeholders as `<lowercase-words>`. Avoid them in the quickstart.
- Set an environment variable once with `export`, not on every line.
- Show output only when it teaches something. Paste it from a real run on the demo, at most six lines.
- For an interactive command, show the command and list what it asks. Never transcribe its prompts.

## Procedures

1. Title the page or section with the goal.
2. Start with "Before you start": what is needed, and on which computer.
3. Number the steps, one action each, each starting with a verb. Seven steps at most.
4. Say which computer a step runs on when it matters.
5. End with how to check it worked, then link to troubleshooting.

## Tables, callouts and collapsible sections

- Use tables for options, settings, comparisons and "who does what". Two to four columns, short cells, the key in the
  first column.
- Settings tables have the columns Key, Default and What it does.
- Use GitHub alerts (`> [!NOTE]`, `> [!IMPORTANT]`, `> [!WARNING]`), at most one per section. Keep `[!WARNING]` for
  data loss, cost and privacy.
- Use `<details>` only for optional material, such as manual setup without a wizard. Never hide a required step.

## Links

- Link with relative paths and descriptive text: "see the [Zotero guide](../guides/zotero.md)". Never "click here".
- End each page with a "Next" section of one to three links.
- Link outside only to official pages.

## Images

- Take screenshots of the demo library only, never of a real library.
- Screenshots: 1440 × 900 at 2×, cropped to the subject, PNG under 400 KB.
- Alt text says what the image shows.

## Examples

- Papers: the demo's AlphaFold article (`jumper2021`), or another open-access paper in a neutral field such as
  protein structure, ecology, materials or meta-science.
- Bibliographies: `methods`. Queries: "protein structure prediction", "coral bleaching".
- Hosts: `<host>` or `lab.example.org`. Paths: relative to the repository, or under `~/.config/glossator/`.

## Never write

- Anyone's private research topics, or anything that hints at them.
- People's names, except the authors of the papers used as examples.
- A computer's real name, user name or file system. No absolute paths to anyone's home folder.
- Dates of decisions, project history, or words like "now", "new", "no longer" and "since". History goes in the
  [changelog](../../CHANGELOG.md).
- The reader in the third person. Agent instructions in `.claude/` are the only exception.
- French guillemets. Use straight double quotes.
- Promises that are not literally true, such as "never leaves your computer".
- "Checked against its page". `check` proves that quotes and numbers are in the paper. `verify` checks a page.

## Before you publish a page

- Run every code block on a fresh clone with the demo.
- Read each paragraph aloud. Split any sentence over 30 words.
- Check that no README section is longer than 25 lines.
- Run `uv run pytest tests/test_no_private_traces.py`, which scans every tracked file. Install the test tools once
  with `uv sync --group dev`.
