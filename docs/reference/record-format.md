# Record format

Every article is a folder with one hand-written file, `record.json`. This page describes the folder, the record
and the rules `glossator check` enforces. The curator agent follows it, with the bibliography's `PROFILE.md`.

## An article's folder

```text
<bibliography>/articles/<key>/
├── paper.pdf       the article
├── record.json     every fact, with its source
├── figures/        panels cropped from the paper, one per figure role of the profile
└── supplementary/  the supplementary files: PDF, Word, spreadsheets, text
```

Nothing else goes in it. `paper.pdf` is the publisher's version when it is open, else the accepted manuscript,
else the preprint.

## The key

An article's key is its first author's family name and its year, such as `jumper2021`. If that key is taken, the
first significant word of the title is added, such as `jumper2021highly`.

A library can reuse the citation keys of its own manuscripts instead. List their BibTeX files in `library.toml`'s
`refs_bibs`, and `glossator new` takes the key of any paper they cite. See [configuration](configuration.md).

## The record

`record.json` has these sections, in this order. `check` refuses a missing or an extra key anywhere.

| Section | What it holds |
|---|---|
| `schema`, `key`, `status`, `kind` | The format version, the key, `complete` or a draft status, and the article's kind from the profile's vocabulary |
| `bib` | Bibliographic fields: title, authors, year, venue, DOI, PubMed and OpenAlex ids, citation |
| `paper` | The PDF: its version, source URL, host, license, page count, SHA-256 and retrieval date |
| `supplementary` | What the article publishes as supplementary material, and the files kept here |
| `figures` | Each cropped panel: its role, file, where it comes from and a caption |
| `overview` | A one-line summary and a short abstract in the curator's words |
| `details` | The profile's own fields. See [profiles](#profiles). |
| `results` | The reported numbers: name, value, condition, baseline and source |
| `quotes` | The paper's key sentences, word for word, each with its page |
| `related` | Related articles, each with a reason, and how they were searched |
| `open_points` | What the paper leaves unclear or does not report |
| `curation` | The date, what was read, and each claim from the brief with its verdict |

A gap is never left empty. It is written `not reported` or `not applicable`.

### A quote

```json
{"text": "AlphaFold structures had a median backbone accuracy of 0.96 Å r.m.s.d.95 …",
 "where": "p. 2 (journal p. 584), main text",
 "in": "this paper"}
```

`text` is copied from the PDF's text. `in` is `this paper`, or another article when the sentence comes from it.

### A result

```json
{"name": "Median backbone accuracy, Cα r.m.s.d.95, AlphaFold",
 "value": "0.96 Å (95% confidence interval = 0.85–1.16 Å)",
 "condition": "CASP14, 87 protein domains", "baseline": "next best method: 2.8 Å",
 "headline": true, "source": "p. 2 (journal p. 584), main text; Fig. 1a"}
```

Every number in `value` must be printed in the paper. A value read off a figure starts with `≈`.

## Profiles

A profile sets a record's `details` fields, its vocabularies and its figure roles. Glossator has two built-in
profiles. A library can add its own as plugins: see [profile plugins](profile-plugins.md).

| Profile | For | `details` fields |
|---|---|---|
| `ml` | Machine-learning and computational methods | problem, idea, architecture or algorithm, input, training, datasets, cost, code |
| `epidemio` | Studies with populations and rates | condition, population, design, data sources, measures |

Both add a `figure` and a `source` field to `details`. `uv run glossator vocab --bib <name>` prints a bibliography's
controlled values.

## What `check` enforces

Errors:

- The folder holds exactly its four entries. `figures/` and `supplementary/` hold exactly what the record lists.
- The record has every field of its profile and no other, no TODO and no empty value. It renders.
- Controlled fields take a value from the profile's vocabulary.
- `paper.pdf` matches its recorded SHA-256 and page count.
- Every quoted sentence is found in the article's PDFs, or in another article's when the quote names it.
- Every number of a result is printed in the paper, unless it starts with `≈`.
- With `--all`: no stray folder in the bibliography.

Warnings:

- When a result's `source` cites a page, its numbers are on that page or beside it.
- An estimate with its confidence interval appears in the paper with its bounds, together and in that order.

`uv run glossator check --all` without `--bib` checks every bibliography. `uv run glossator check <key>` checks one
article, in any bibliography.

On a clone that has not downloaded a file, `check` compares the checksum held by Git LFS's pointer file. It skips
that file's quotes and numbers and names the file in its report. An empty `figures/` or `supplementary/` may be
missing there, because git keeps no empty folder.

## Next

- [Files and folders](files.md)
- [Bibliographies and profiles](../guides/bibliographies.md)
