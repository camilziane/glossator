"""The built-in profile `ml`: machine-learning methods (problem, idea, architecture, input, training, datasets, cost,
code), their results and the paper's own sentences."""

from __future__ import annotations

from pathlib import Path

from .reference import reference_profile

PROFILE = reference_profile(
    name="ml",
    description="machine-learning methods: problem, idea, architecture, training, datasets, cost, code and results",
    folder="methods",
    title="Machine-learning methods",
    template=(Path(__file__).parent / "templates" / "ml.md").read_text(encoding="utf-8"),
    details=[
        ("problem", "Problem", "the problem the paper addresses, in one sentence"),
        ("idea", "Idea", "the method's key idea in plain words, 1 to 3 sentences"),
        ("architecture", "Architecture or algorithm", "layers, sizes and operations, as the paper gives them"),
        (
            "input",
            "Input",
            "what the method takes (protein sequences, image patches, tabular features…), its rate and size",
        ),
        ("training", "Training", "objective, data and schedule as given, or 'not applicable'"),
        ("datasets", "Datasets", "the data it is evaluated on"),
        ("cost", "Cost", "parameters, compute and latency as the paper defines them, or 'not reported'"),
        ("code", "Code", "code URL and licence, or 'not reported'"),
    ],
    glance=("problem", "idea", "cost"),
    section="Method",
    lead="idea",
    kinds={
        "architecture": {"label": "Architecture", "means": "a network, layer or operation design"},
        "training": {"label": "Training", "means": "an objective, a data augmentation or a training procedure"},
        "evaluation": {"label": "Evaluation", "means": "a metric, a benchmark or an evaluation protocol"},
        "application": {
            "label": "Application",
            "means": "a system for one task (protein design, weather forecasting, …) with its own evaluation",
        },
        "review": {"label": "Review", "means": "reviews or compares other methods; no new method"},
    },
)
