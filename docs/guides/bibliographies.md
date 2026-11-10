# Bibliographies and profiles

A library holds one or more bibliographies. Each is a reading list with its own scope and its own record format,
called its profile.

## Add a bibliography

```sh
uv run glossator bibs add
```

It asks for a profile, a folder name, a title, a scope and the inbox's queries for it. It shows its plan, then
writes the folder and commits it:

```text
library/<name>/
├── biblio.json   the profile, title, short name and scope
├── PROFILE.md    the curator's rules for this bibliography
└── articles/     empty until you add papers
```

`uv run glossator bibs` lists your bibliographies with their profile, article count, title and scope.

## Write a good scope

The scope, in `biblio.json`, tells the inbox triage what belongs in the bibliography. Name the subject, the kinds of
papers you want, and what you do not want.

```json
"scope": "Protein structure prediction: methods, benchmarks and reviews. Not drug discovery applications."
```

## Write PROFILE.md

`PROFILE.md` is this bibliography's part of the curator's instructions. The template lists the record's sections and
how to fill them. Keep it, and add your own rules in plain English:

- Which facts matter most to you, such as "Report the hardware used for every timing."
- Which figure to crop.
- Which claims to check against other papers.

Curators read it before each article. A change applies to the next curation, not to existing records.

## Built-in profiles

| Profile | For | Its own fields |
|---|---|---|
| `ml` | Machine-learning and computational methods | Problem, idea, architecture or algorithm, input, training, datasets, cost, code |
| `epidemio` | Studies with populations and rates | Condition, population, design, data sources, measures |

Every profile also has an overview, results, quotes, related articles, open points and a curation log. Details:
[record format](../reference/record-format.md#profiles).

## Profile plugins

A library can bring its own profiles, for records with other fields, vocabularies or views. A plugin is a Python file,
`library/profiles/<name>/profile.py`, that travels with the library. Glossator lists it beside the built-in profiles
in `glossator init` and `glossator bibs add`.

> [!WARNING]
> A plugin is code that Glossator runs, on every command. Use plugins only from libraries you own or trust.
> Joining someone else's library runs its plugins.

How to write one, with an example: [profile plugins](../reference/profile-plugins.md). To share a profile with
everyone, propose it as a built-in: see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Next

- [Add papers](add-papers.md)
- [Configuration](../reference/configuration.md)
