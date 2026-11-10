# The demo library

A library with one bibliography, `methods` (profile `ml`), and one article: AlphaFold. A curator agent made it in
one `glossator curate` run, for about half a dollar on Claude Sonnet. `glossator check` passes: every quote is in
the PDFs and every reported number is printed in the paper.

## Try it

```sh
uv run glossator demo
```

Or run single commands on it. `--home demo` points a command at this folder instead of your own library.

```sh
uv run glossator --home demo build
uv run glossator --home demo search "median backbone accuracy"
uv run glossator --home demo check --all
```

`build` writes `demo/build/`, which git ignores.

## What is in it

| Path | What it is |
|---|---|
| `library/library.toml` | The library's settings |
| `library/methods/biblio.json` | The bibliography's profile, title and scope |
| `library/methods/PROFILE.md` | The curator's rules for this bibliography. Start your own from it. |
| `library/methods/articles/jumper2021/` | The article: its PDF, record, figure and supplementary files |

## The article and its license

| Article | License |
|---|---|
| Jumper J, Evans R, Pritzel A, et al. (2021). Highly accurate protein structure prediction with AlphaFold. *Nature* 596: 583–589. [doi:10.1038/s41586-021-03819-2](https://doi.org/10.1038/s41586-021-03819-2) | CC BY 4.0 |

The PDF, the supplementary files and the cropped figure are the publisher's open-access versions, from PubMed
Central. They are redistributed under their Creative Commons license. The record (`record.json`) is this project's,
under its MIT license.
