# Troubleshooting

Start here:

```sh
uv run glossator doctor
```

`glossator doctor` checks every requirement and setting on this computer and says how to fix what is wrong. If the
problem remains, find it below.

## Install and requirements

| Symptom | Cause | Fix |
|---|---|---|
| `pdftotext: command not found`, or `pdfinfo` | poppler is missing | `brew install poppler` on macOS, `sudo apt install poppler-utils` on Debian or Ubuntu |
| `the claude command is not on PATH` | Claude Code is missing | Install [Claude Code](https://claude.com/claude-code) and sign in |
| `uv sync` downloads about 7 GB | The CUDA build of PyTorch was installed | Run `uv sync`, which installs the CPU build again |
| ``Extra `gpu` and group `cpu` (enabled by default) are incompatible`` | `--extra gpu` alone | `uv sync --extra gpu --no-group cpu` |

## Building and searching

| Symptom | Cause | Fix |
|---|---|---|
| `no index yet (run: glossator build)` | This computer has not built yet | `uv run glossator build` |
| A new article is missing from search | The index is older than the article | `uv run glossator build` |
| "ranked by words only: the meaning model is still loading" | The MCP server loads its model in the background | Ask again a few seconds later |
| A build fails on the GPU | The GPU is too old for this PyTorch build | `GLOSSATOR_DEVICE=cpu uv run glossator build` |
| A PDF's text cannot be found | The PDF is scanned, without a text layer | Its record is still searchable. `build/manifest.json` lists such PDFs. |

## The reading room

| Symptom | Cause | Fix |
|---|---|---|
| `port 8765: Address already in use` | Another program uses the port | `uv run glossator serve --open --port 8766` |
| A plain page instead of the reading room | The web app is not built on this computer | `uv run glossator web` |
| Accept and Reject do nothing | The reading room was opened as a file, not through `serve` | Open it with `uv run glossator serve --open` |

## Curation

| Symptom | Cause | Fix |
|---|---|---|
| The curator reports no open PDF | The paper has no legitimate open copy | Add a copy you may use: see [Add papers](guides/add-papers.md#when-there-is-no-open-pdf) |
| A batch stopped halfway | An interruption or a failed run | `uv run glossator curate --resume` |
| An article still fails `check` after its runs | The curator could not fix every error | Read its report in `build/curate/`, fix the record by hand, run `glossator check <key>` |

## The daily inbox

| Symptom | Cause | Fix |
|---|---|---|
| `inbox status` shows "Last run FAILED at …" | The last daily run stopped on an error | Read the error, fix it, then `uv run glossator inbox run` |
| `inbox status` shows "papers not triaged" | The daily run did not find Claude Code, or Claude failed | Check with `uv run glossator doctor`. The next run triages them. |
| `this computer is a clone … the inbox runs on the original` | `inbox start` on a clone | Start it on the original, or make this computer the original with `glossator promote` |

## Several computers

| Symptom | Cause | Fix |
|---|---|---|
| `check` says "not downloaded here" | This clone holds Git LFS pointers, not the files | Nothing is wrong. `glossator join --full` makes a light clone full; on a full clone, `git -C library lfs pull` downloads the files. |
| `Git LFS's hooks are not installed here` | Git LFS was installed after the clone | `git -C library lfs install --local`, then sync again |
| `your commits conflict with the origin's` | Both computers changed the same file | Run `git -C library pull --rebase` and resolve the conflict with git |
| `the original moved to …` | The library's original changed | Run the `glossator follow` command the message gives |
| `uncommitted changes are in the way` | Changes not committed on this computer | Commit them in `library/`, then sync again |

## Zotero

| Symptom | Cause | Fix |
|---|---|---|
| Zotero refuses the key (403) | The key lacks notes or write access | Run `uv run glossator zotero setup` again with a new key |
| Linked files do not open in Zotero | This computer's base directory is not set | In Zotero, set the Linked Attachment Base Directory to `library/` |
| Inbox decisions in Zotero are not applied | They are applied on the next pull | `uv run glossator zotero pull` |

## Still stuck

Search the [issues](https://github.com/camilziane/glossator/issues), then open one with the output of
`uv run glossator --version` and `uv run glossator doctor`. Leave out unpublished work and PDFs you may not share.

## Next

- [FAQ](faq.md)
- [How it works](how-it-works.md)
