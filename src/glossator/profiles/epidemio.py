"""The built-in profile `epidemio`: epidemiological studies (condition, population, design, data sources, measures),
their estimates and the paper's own sentences."""

from __future__ import annotations

from pathlib import Path

from .reference import reference_profile

PROFILE = reference_profile(
    name="epidemio",
    description="epidemiological studies: condition, population, design, data sources, measures and estimates",
    folder="epidemiology",
    title="Epidemiology",
    template=(Path(__file__).parent / "templates" / "epidemio.md").read_text(encoding="utf-8"),
    details=[
        ("condition", "Condition", "the condition and how a case is defined"),
        ("population", "Population", "who, where and when: country or region, period, ages"),
        ("design", "Design", "how the numbers were obtained: registry, cohort, pooled studies, model"),
        ("data_source", "Data sources", "the registries, cohorts or studies the numbers come from"),
        ("measure", "Measures", "what is measured (prevalence, incidence, proportion) and over what"),
    ],
    glance=("condition", "population", "design"),
    section="Study",
    lead="population",
    kinds={
        "registry": {"label": "Registry study", "means": "counts cases from a population registry"},
        "cohort": {
            "label": "Cohort study",
            "means": "follows a group of patients and reports how often a condition occurs",
        },
        "meta-analysis": {"label": "Meta-analysis", "means": "pools the estimates of several studies"},
        "modelling": {"label": "Modelling", "means": "projects numbers forward or estimates them from a model"},
        "survey": {"label": "Survey", "means": "a questionnaire or a count across centres"},
        "review": {"label": "Review", "means": "a narrative review or a clinical overview; no new data"},
    },
    results_required=True,
)
