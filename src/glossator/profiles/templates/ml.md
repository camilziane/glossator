# {{name}} — {{title}}

{{scope}}

Each record says the problem, the idea, the architecture or algorithm, the input, the training, the datasets, the
cost and the code, the key results and the paper's own sentences, each fact with its page. Profile `ml`
(`biblio.json`).

This file is this bibliography's part of the curator's rules (`.claude/agents/curator.md`); the record format every
bibliography shares is in glossator's documentation (`docs/reference/record-format.md`).

## The record

`record.json` has, in this order: `bib`, `paper`, `supplementary`, `figures`, `overview`, `details` (problem, idea,
architecture, input, training, datasets, cost, code, `figure`, `source`), `results`, `quotes`, `related`,
`open_points`, `curation`. Its page has seven sections: overview, method, key results, in the paper's words, related
articles, open points, sources and provenance. Figure: `main.png`, the panel that shows the method or the main result
(or nothing). `kind` takes one `ml_kind` value (architecture, training, evaluation, application, review).

## For the curator

**Supplementary material and appendices.** Download the text files that hold what the record needs (an appendix with
the exact architecture, the hyper-parameters, a table of results).

**Figure.** `--role main`: the panel that shows the method or the main result. `details.figure` names the figure, or
says 'none in the paper' (then no crop).

**quotes** — at least one; one for each claim of the brief the paper supports, plus the sentence that defines the
method.

**details** — `problem`: the problem addressed, one sentence. `idea`: the key idea in plain words, 1 to 3
sentences. `architecture`: layers, sizes, operations, as given (equations named, not copied). `input`: what the
method takes (protein sequences, image patches, tabular features…), its rate and size. `training`: objective, data,
schedule, or 'not applicable'. `datasets`: the evaluation data. `cost`: parameters, compute, latency as the paper
defines them, or 'not reported'. `code`: URL and licence from the paper, or 'not reported'.

**Sources.** Conference papers are often open on OpenReview, PMLR, the CVF open-access site or ACL Anthology; a
conference paper without a DOI of its own is created from its arXiv DOI (the curator's step 1).

**results** — the numbers the abstract and main tables lead with, plus every number the brief asks about; at most
about ten. `name` (what is measured), `value`, `condition` (what the number holds for: dataset, model size, test
split), `baseline` (the comparison reported with it, or 'not reported'), `headline` true for the 1 to 3 the paper
leads with, `source`.

**related** — `same_topic`: up to 5 works the paper itself presents as its predecessors, versions or companions (the
method it extends, the earlier version a new one replaces, the dataset paper of its numbers). Each entry: `link`,
`cite` and `title` from `T cite <DOI>`, then `why` (one line). Only relations the paper states or that you verified in
the other work. `search`: what you searched, and where. The page adds the bibliography's own articles of the same
kind by itself.

**Report lines** (added to the curator's):
- what it is, in one sentence;
- headline results;
- `kind` values proposed, if none fits.
