# Profile plugins

A profile is a record format. Glossator has two built-in profiles, `ml` and `epidemio`, and a library adds its own
as plugins. A profile sets:

- The sections a record holds beyond the base every record shares, and their vocabularies.
- The article's view.
- What `check` verifies.
- The `PROFILE.md` a new bibliography starts from.

> [!WARNING]
> A plugin is Python code. Glossator imports a library's plugins with your rights, on every command. Keep plugins
> only in libraries you own, and read the plugins of a library you did not write before you join it.

## Where a plugin lives

```text
library/profiles/<name>/
├── profile.py      defines PROFILE
├── PROFILE.md      the template a new bibliography starts from (optional)
└── vocabulary.json its vocabularies (optional)
```

The folder's name is the profile's name, the one `biblio.json` gives. The plugin travels with the library, so every
computer that joins the library gets it.

## A plugin of the reference form

Most domains fit the form the built-in profiles use: a few `details` fields, `results` and `quotes`. Build the
profile with `reference_profile`:

```python
# library/profiles/ecology/profile.py
from pathlib import Path

from glossator.profiles.reference import reference_profile

PROFILE = reference_profile(
    name="ecology",
    description="field studies: species, sites, methods and estimates",
    folder="ecology",
    title="Field ecology",
    template=(Path(__file__).parent / "PROFILE.md").read_text(encoding="utf-8"),
    details=[
        ("species", "Species", "the species studied, with their authority"),
        ("sites", "Sites", "where and when: region, habitat, period"),
        ("method", "Method", "how the data were collected: transects, traps, cameras, eDNA"),
    ],
    glance=("species", "sites", "method"),
    section="Study",
    lead="species",
    kinds={"survey": {"label": "Survey", "means": "counts or presence data from the field"}},
)
```

| Argument | What it sets |
|---|---|
| `name`, `folder`, `title` | The profile's name, and a new bibliography's default folder and title |
| `description` | One line, shown by `glossator init` and `glossator bibs add` |
| `template` | The `PROFILE.md` text, with the markers `{{name}}`, `{{title}}` and `{{scope}}` |
| `details` | Each `details` field: its key, its label, and what goes there |
| `glance` | The three fields the article's view shows first |
| `section` | The title of the `details` section in the view |
| `lead` | The field the bibliography's table of articles shows |
| `kinds` | The values of the record's `kind` |
| `results_required` | Optional. Every record needs at least one result, as `epidemio` requires. |
| `result_name`, `result_condition` | Optional. The hints a new result's TODOs give |
| `figure` | Optional. The label and meaning of the profile's one figure role, `main` |
| `order` | Optional. Bibliographies are listed by their profile's order, then by name. Default 0. |

The template's text is the curator's instructions for that bibliography. Start from a built-in one:
`src/glossator/profiles/templates/ml.md`.

## A plugin of its own form

A profile can define its own sections, views, checks, Zotero tags and commands. It then defines
`PROFILE = Profile(...)` directly. The fields of `Profile`, and the building blocks in `glossator.render` and
`glossator.check`, are described in the `glossator.profiles` package.

## Check a plugin

```sh
uv run glossator bibs add --dry-run
```

It asks its questions, the profile among them, then shows its plan and changes nothing. Your plugin should be in the
list of profiles. If it fails to load, the list skips it with a warning.

A bibliography whose plugin is missing or broken stops every command that reads it, with an error naming the
bibliography and the plugin.

## Next

- [Bibliographies and profiles](../guides/bibliographies.md)
- [Record format](record-format.md)
