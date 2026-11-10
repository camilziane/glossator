"""How close a new paper is to what the library keeps: a prior drawn from the library itself, before any LLM reads it.

Each bibliography's positives are its articles and the inbox papers accepted (or added) for it; its negatives, the
inbox papers rejected for it. A paper's text (title and abstract) is embedded with the index's model (on the CPU,
the ONNX export: no PyTorch) and scored, for each bibliography, by the mean cosine of its K nearest positives
(as zotero-arxiv-daily ranks arXiv by a Zotero library). Once a bibliography has enough decisions both ways, a
small logistic regression on the same vectors learns the library's taste beyond the written scope, and its
probability is the score instead.

The prior orders the inbox (after Haiku's relevance), gives the triage the nearest past decisions as
examples, and, when watch.toml sets `prior_gate`, spares Haiku the papers far from every bibliography."""

from __future__ import annotations

import numpy as np

K = 3  # nearest positives averaged
MIN_DECISIONS = 8  # of each kind, before a bibliography's model replaces the similarity


def paper_text(title: str, abstract: str = "") -> str:
    return f"{title.strip()}. {abstract.strip()[:1500]}".strip(" .")


def record_text(rec: dict) -> str:
    """An article's text for the prior: its title, its one line and the start of its abstract."""
    b, ov = rec.get("bib") or {}, rec.get("overview") or {}
    abstract = ov.get("abstract") or ""
    if isinstance(abstract, list):
        abstract = " ".join(str(x) for x in abstract)
    return paper_text(b.get("title", ""), f"{ov.get('one_line', '')} {abstract}")


def embed(texts: list[str]) -> np.ndarray:
    """Unit vectors of texts, with the index's model on the CPU (as a passage: no query instruction)."""
    from .vectors import DIM, query_model

    if not texts:
        return np.zeros((0, DIM), np.float32)
    m = query_model()
    return np.stack([m.encode(t) for t in texts]).astype(np.float32)


def fit(pos: np.ndarray, neg: np.ndarray, l2: float = 1.0, steps: int = 300, lr: float = 0.5) -> np.ndarray:
    """A logistic regression (weights then bias) by gradient descent, the two classes weighted alike."""
    x = np.vstack([pos, neg])
    x = np.hstack([x, np.ones((len(x), 1), np.float32)])
    y = np.concatenate([np.ones(len(pos)), np.zeros(len(neg))])
    w_class = np.where(y == 1, 0.5 / len(pos), 0.5 / len(neg))
    w = np.zeros(x.shape[1])
    for _ in range(steps):
        p = 1 / (1 + np.exp(-(x @ w)))
        grad = x.T @ ((p - y) * w_class) + l2 * np.r_[w[:-1], 0] / len(x)
        w -= lr * grad
    return w


class Prior:
    """The library's taste, per bibliography: `score(text) -> {bib: score in [0, 1]}`."""

    def __init__(self, positives: dict[str, list[str]], negatives: dict[str, list[str]] | None = None):
        negatives = negatives or {}
        self.pos = {b: embed(t) for b, t in positives.items() if t}
        self.models: dict[str, np.ndarray] = {}
        for b, vecs in self.pos.items():
            neg = negatives.get(b) or []
            if len(vecs) >= MIN_DECISIONS and len(neg) >= MIN_DECISIONS:
                self.models[b] = fit(vecs, embed(neg))

    def vectors(self, texts: list[str]) -> np.ndarray:
        return embed(texts)

    def scores(self, vecs: np.ndarray) -> list[dict[str, float]]:
        """For each vector, its score for each bibliography."""
        out: list[dict[str, float]] = [{} for _ in range(len(vecs))]
        for b, pos in self.pos.items():
            if b in self.models:
                w = self.models[b]
                s = 1 / (1 + np.exp(-(vecs @ w[:-1] + w[-1])))
            else:
                sims = vecs @ pos.T
                k = min(K, pos.shape[0])
                s = np.sort(sims, axis=1)[:, -k:].mean(axis=1)
            for i, v in enumerate(s):
                out[i][b] = round(min(1.0, max(0.0, float(v))), 3)  # a cosine can fall below 0
        return out

    def best(self, vecs: np.ndarray) -> list[dict]:
        """For each vector: the closest bibliography, its score, and how it was scored."""
        return [
            {"bib": b, "score": s[b], "by": "model" if b in self.models else "similarity"} if s else None
            for s in self.scores(vecs)
            for b in [max(s, key=s.get) if s else None]
        ]


def library_prior() -> Prior:
    """The prior of this library: its bibliographies' articles and the inbox's decisions."""
    from . import inbox
    from .bibliography import bibliographies, collection

    pos: dict[str, list[str]] = {}
    neg: dict[str, list[str]] = {}
    for b in bibliographies():
        pos[b.name] = [record_text(r) for r in collection(b).recs.values()]
    for it in inbox.load_items() if inbox.ITEMS.exists() else []:
        b = (it.get("triage") or {}).get("bib") or it.get("bib")
        if b not in pos:
            continue
        if it.get("status") in ("accepted", "added"):
            pos[b].append(paper_text(it.get("title", ""), it.get("abstract", "")))
        elif it.get("status") == "rejected":
            neg.setdefault(b, []).append(paper_text(it.get("title", ""), it.get("abstract", "")))
    return Prior(pos, neg)


def examples(prior_vecs: np.ndarray, decided: list[dict], decided_vecs: np.ndarray, n: int = 3) -> list[dict]:
    """The past decisions nearest to a batch of papers: n kept and n dropped, as the triage's examples."""
    if not len(decided) or not len(prior_vecs):
        return []
    sims = (decided_vecs @ prior_vecs.T).max(axis=1)
    order = np.argsort(-sims)
    kept = [decided[i] for i in order if decided[i]["decision"] == "kept"][:n]
    dropped = [decided[i] for i in order if decided[i]["decision"] == "dropped"][:n]
    return kept + dropped
