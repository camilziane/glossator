"""Embeddings for semantic search: a small English model run on this machine, nothing sent anywhere.

A build embeds the passages with sentence-transformers on PyTorch: on a CUDA GPU (the one with the most free memory),
a Mac's GPU (Metal, `mps`) or the CPU. A query is embedded on the CPU by ONNX Runtime, from the ONNX export the
model's authors publish beside its weights: the same vector (to 1e-6), without loading PyTorch, so a search is
ready in about a second. The same weights everywhere, so an index built on one machine is searched on another. A
passage's vector is cached by the hash of its text, so a build embeds only new passages.

The model comes from the Hugging Face Hub once, at the revision pinned here (`REVISION`), into the Hugging Face cache
(`HF_HOME`, by default ~/.cache/huggingface); afterwards it is loaded from that cache without asking the Hub
(`HF_HUB_OFFLINE=1` forbids the network altogether). No text leaves this computer: the Hub sees only the download;
its telemetry is off."""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import warnings

import numpy as np

# Before any Hugging Face library is imported: no telemetry, no progress bars, errors only. huggingface_hub sets its
# logger's level from HF_HUB_VERBOSITY when it is imported, and logs the notices the Hub sends in its answers (an
# anonymous download: "You are sending unauthenticated requests…") as warnings.
for _name, _value in (
    ("HF_HUB_DISABLE_TELEMETRY", "1"),
    ("HF_HUB_DISABLE_PROGRESS_BARS", "1"),
    ("HF_HUB_VERBOSITY", "error"),
    ("TRANSFORMERS_VERBOSITY", "error"),
):
    os.environ.setdefault(_name, _value)

MODEL = "BAAI/bge-small-en-v1.5"  # 384 dimensions, 33 M parameters, MIT licence; the papers are in English
REVISION = "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"  # the model's commit on the Hub: the same weights everywhere
DIM = 384
# bge's instruction for a query searched against passages (the passages take none)
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
BATCH = 128
MAX_TOKENS = 512


def device() -> str:
    """Where a build embeds: GLOSSATOR_DEVICE if set, else the CUDA GPU with the most free memory among those this
    PyTorch build runs on (a GPU older than its oldest architecture is skipped), the Mac's GPU, or the CPU."""
    if os.environ.get("GLOSSATOR_DEVICE"):
        return os.environ["GLOSSATOR_DEVICE"]
    import torch

    if torch.cuda.is_available():
        oldest = min((arch_number(a) for a in torch.cuda.get_arch_list()), default=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)  # PyTorch's warning about such a GPU, skipped here
            caps = {i: torch.cuda.get_device_capability(i) for i in range(torch.cuda.device_count())}
            free = {
                i: torch.cuda.mem_get_info(i)[0] for i, (major, minor) in caps.items() if major * 10 + minor >= oldest
            }
        if free:
            return f"cuda:{max(free, key=free.get)}"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def arch_number(arch: str) -> int:
    """A CUDA architecture of `torch.cuda.get_arch_list()` as a number: sm_86 → 86, sm_90a → 90, compute_120 → 120."""
    return int("".join(c for c in arch.partition("_")[2] if c.isdigit()) or 0)


_models: dict[str, object] = {}
_query_model = None
_lock = threading.Lock()


def quiet() -> None:
    """The Hugging Face libraries' notices (an anonymous download, a slow tokenizer) stay out of the tool's output,
    whether huggingface_hub was imported before this module or after it."""
    import huggingface_hub.utils.logging  # noqa: F401  (configures its logger now, from HF_HUB_VERBOSITY)

    for name in ("huggingface_hub", "sentence_transformers", "transformers"):
        logging.getLogger(name).setLevel(logging.ERROR)
    warnings.filterwarnings("ignore", message=r".*(unauthenticated|HF_TOKEN|hf auth login).*")


def model():
    """The build's embedding model on its device, loaded once: from the local cache when it is there (no network),
    else downloaded into the Hugging Face cache."""
    dev = device()
    with _lock:
        if dev not in _models:
            quiet()
            from sentence_transformers import SentenceTransformer  # slow to import: only when a build embeds

            try:
                _models[dev] = SentenceTransformer(MODEL, device=dev, revision=REVISION, local_files_only=True)
            except OSError:  # not downloaded yet
                _models[dev] = SentenceTransformer(MODEL, device=dev, revision=REVISION)
        return _models[dev]


def hub_file(name: str) -> str:
    """One file of the model's repository: from the Hugging Face cache, else downloaded into it (once)."""
    quiet()
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import LocalEntryNotFoundError

    try:
        return hf_hub_download(MODEL, name, revision=REVISION, local_files_only=True)
    except LocalEntryNotFoundError:
        return hf_hub_download(MODEL, name, revision=REVISION)


class QueryModel:
    """The query encoder: bge's tokenizer, its ONNX export on ONNX Runtime, the [CLS] token's state normalized (the
    pooling of bge, as sentence-transformers does it)."""

    def __init__(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.tokenizer = Tokenizer.from_file(hub_file("tokenizer.json"))
        self.tokenizer.enable_truncation(MAX_TOKENS)
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = min(4, os.cpu_count() or 1)  # a shared server: a query needs few cores
        opts.log_severity_level = 3
        self.session = ort.InferenceSession(hub_file("onnx/model.onnx"), opts, providers=["CPUExecutionProvider"])
        self.inputs = {i.name for i in self.session.get_inputs()}

    def encode(self, text: str) -> np.ndarray:
        e = self.tokenizer.encode(text)
        feed = {
            "input_ids": np.array([e.ids], np.int64),
            "attention_mask": np.array([e.attention_mask], np.int64),
            "token_type_ids": np.array([e.type_ids], np.int64),
        }
        state = self.session.run(["last_hidden_state"], {k: v for k, v in feed.items() if k in self.inputs})[0]
        cls = state[0, 0].astype(np.float32)
        return cls / np.linalg.norm(cls)


def query_model() -> QueryModel:
    global _query_model
    with _lock:
        if _query_model is None:
            _query_model = QueryModel()
        return _query_model


def ready_for_queries() -> bool:
    return _query_model is not None


def text_hash(text: str) -> str:
    return hashlib.sha1(f"{MODEL}\0{text}".encode()).hexdigest()


def embed_passages(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.zeros((0, DIM), np.float32)
    m = model().encode(
        texts, batch_size=BATCH, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=len(texts) > 1000
    )
    return np.asarray(m, dtype=np.float32)


def embed_query(text: str) -> np.ndarray:
    return query_model().encode(QUERY_PREFIX + text)


def to_blob(v: np.ndarray) -> bytes:
    return np.asarray(v, dtype=np.float32).tobytes()


def from_blobs(blobs: list[bytes]) -> np.ndarray:
    return (
        np.frombuffer(b"".join(blobs), dtype=np.float32).reshape(-1, DIM) if blobs else np.zeros((0, DIM), np.float32)
    )
