# Configuration

Glossator reads three kinds of settings files, all in your library and versioned with it, plus a few environment
variables. Every setting has a default.

## library.toml

`library/library.toml` holds the library's settings. The file is optional.

| Key | Default | What it does |
|---|---|---|
| `language` | `"English"` | The language of the inbox's summaries and the triage's reasons |
| `refs_bibs` | `[]` | BibTeX files, relative to `library/`, whose citation keys `glossator new` reuses |
| `zotero_collection` | `"glossator"` | The Zotero collection Glossator keeps in step. A name without `/`. |
| `zotero_tag` | `"glossator"` | The tag on the Zotero notes and files Glossator manages |

```toml
language = "English"
refs_bibs = ["../manuscript/references.bib"]
```

## biblio.json

Each bibliography's folder has a `biblio.json`.

| Key | What it is |
|---|---|
| `profile` | The record format: `ml`, `epidemio`, or a plugin's name |
| `title` | The bibliography's full title |
| `short` | A short name for menus and Zotero |
| `scope` | One or two sentences on what belongs in it. The inbox triage reads it. |

```json
{"profile": "ml", "title": "Machine-learning methods", "short": "ML methods",
 "scope": "Machine-learning methods and their scientific applications."}
```

`PROFILE.md`, beside it, holds the curator's rules for this bibliography: [bibliographies](../guides/bibliographies.md).

## watch.toml

`library/inbox/watch.toml` sets what the daily inbox watches. Its keys: [the daily inbox](../guides/inbox.md#settings).

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `GLOSSATOR_HOME` | The repository | The folder that holds `library/` and `build/`, like `--home` |
| `GLOSSATOR_LIBRARY` | `$GLOSSATOR_HOME/library` | The library's folder |
| `GLOSSATOR_ROOT` | none | A bibliography's folder, like `--bib` |
| `GLOSSATOR_DEVICE` | Automatic | Where builds compute vectors, such as `cuda:0`, `mps` or `cpu` |
| `GLOSSATOR_WEB` | `web/out` | The built reading room that `glossator serve` shows |
| `GLOSSATOR_ZOTERO_KEY` | `~/.config/glossator/zotero-key` | The file holding your Zotero API key |
| `GLOSSATOR_NO_INPUT` | unset | `1`, `true` or `yes`: the setup commands never ask. See [scripts](#run-the-setup-commands-from-a-script). |

## Picking a bibliography

Most commands work on one bibliography. Glossator picks it in this order:

1. `--bib <name>`, anywhere on the command line.
2. `GLOSSATOR_ROOT`.
3. The bibliography the current folder is in.

`build`, `search`, `list` and `check --all` work on every bibliography when none is given. `check <key>` finds the
article in any bibliography.

## Run the setup commands from a script

The setup commands ask questions: `init`, `join`, `follow`, `promote`, `bibs add`, `zotero setup` and
`inbox start`. Each question also has a flag. With `--no-input`, or `GLOSSATOR_NO_INPUT=1`, they read nothing from
the terminal:

- Each answer comes from its flag, else its default.
- A missing answer stops the command with exit code 2, naming the flag it needs.
- The plan runs only with `--yes`. Without it, the command prints the plan and exits with code 2.

The same applies when standard input is not a terminal.

```sh
uv run glossator init --no-input --yes --name methods --profile ml --title "Methods" \
  --scope "Numerical methods and scientific software."
```

## Next

- [Files and folders](files.md)
- [CLI reference](cli.md)
