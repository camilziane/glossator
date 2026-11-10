# {{name}} — {{title}}

{{scope}}

Each record says the condition or question, the population, the design, the data sources and what is measured, the
key results and the paper's own sentences, each fact with its page. Profile `epidemio` (`biblio.json`).

This file is this bibliography's part of the curator's rules (`.claude/agents/curator.md`); the record format every
bibliography shares is in glossator's documentation (`docs/reference/record-format.md`).

## The record

`record.json` has, in this order: `bib`, `paper`, `supplementary`, `figures`, `overview`, `details` (condition,
population, design, data_source, measure, `figure`, `source`), `results`, `quotes`, `related`, `open_points`,
`curation`. Its page has seven sections: overview, study, key results, in the paper's words, related articles, open
points, sources and provenance. Figure: `main.png`, the panel that shows the study or the main result (or nothing).
`kind` takes one `epidemio_kind` value (registry, cohort, meta-analysis, modelling, survey, review).

## For the curator

**Supplementary material and appendices.** Download the text files that hold what the record needs (the cohort
tables, the per-region or per-year estimates).

**Figure.** `--role main`: the panel that shows the study or the main result. `details.figure` names the figure, or
says 'none in the paper' (then no crop).

**quotes** — at least one; one for each claim of the brief the paper supports, plus the sentence that defines the
measure.

**details** — `condition`: the condition and how a case is defined. `population`: who, where and when: country or
region, period, ages. `design`: how the numbers were obtained: registry, cohort, pooled studies, model.
`data_source`: the registries, cohorts or studies the numbers come from. `measure`: what is measured (point or period
prevalence, incidence, proportion of cases) and over what.

**results** — the numbers the abstract and main tables lead with, plus every number the brief asks about; at most
about ten. `name` (what is measured), `value`, `condition` (what the number holds for: population, region, period, age
band), `baseline` (the comparison reported with it, or 'not reported'), `headline` true for the 1 to 3 the paper leads
with, `source`. An epidemiological record has at least one estimate.

**related** — `same_topic`: up to 5 works the paper itself presents as its predecessors, versions or companions (the
earlier estimate a new one updates, the cohort or registry paper its numbers come from). Each entry: `link`, `cite`
and `title` from `T cite <DOI>`, then `why` (one line). Only relations the paper states or that you verified in the
other work. `search`: what you searched, and where. The page adds the bibliography's own articles of the same kind by
itself.

**Report lines** (added to the curator's):
- what it is, in one sentence;
- headline results;
- `kind` values proposed, if none fits.
