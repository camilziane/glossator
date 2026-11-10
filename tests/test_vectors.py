"""The embedding model's files: one pinned revision, the local cache first, the Hub only for a first download."""

import os

import huggingface_hub
import pytest
from huggingface_hub.errors import LocalEntryNotFoundError

from glossator import vectors


def test_the_hub_never_hears_more_than_a_download():
    assert os.environ.get("HF_HUB_DISABLE_TELEMETRY") == "1"
    assert len(vectors.REVISION) == 40 and int(vectors.REVISION, 16)  # a commit, not a branch that moves


def test_a_file_comes_from_the_cache_then_once_from_the_hub(monkeypatch):
    calls = []

    def download(repo, name, revision=None, local_files_only=False):
        calls.append((repo, name, revision, local_files_only))
        if local_files_only and name == "missing.json":
            raise LocalEntryNotFoundError("not in the cache")
        return f"/cache/{name}"

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", download)
    assert vectors.hub_file("tokenizer.json") == "/cache/tokenizer.json"
    assert calls == [(vectors.MODEL, "tokenizer.json", vectors.REVISION, True)]  # no request to the Hub
    calls.clear()
    assert vectors.hub_file("missing.json") == "/cache/missing.json"
    assert calls == [
        (vectors.MODEL, "missing.json", vectors.REVISION, True),
        (vectors.MODEL, "missing.json", vectors.REVISION, False),
    ]


def test_the_build_model_is_the_pinned_one(monkeypatch):
    import sentence_transformers

    made = []

    class Fake:
        def __init__(self, name, device=None, revision=None, local_files_only=False):
            made.append((name, revision, local_files_only))
            if local_files_only:
                raise OSError("not downloaded yet")

    monkeypatch.setattr(sentence_transformers, "SentenceTransformer", Fake)
    monkeypatch.setattr(vectors, "_models", {})
    monkeypatch.setenv("GLOSSATOR_DEVICE", "cpu")
    assert isinstance(vectors.model(), Fake)
    assert made == [(vectors.MODEL, vectors.REVISION, True), (vectors.MODEL, vectors.REVISION, False)]


@pytest.mark.parametrize("text", ["You are sending unauthenticated requests to the HF Hub", "Set a HF_TOKEN"])
def test_the_hubs_notices_stay_quiet(text, recwarn):
    import warnings

    vectors.quiet()
    warnings.warn(text, UserWarning, stacklevel=1)
    assert not [w for w in recwarn if text in str(w.message)]


NOTICE = "Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN"
HUB_ANSWER = f"""
import httpx
from huggingface_hub.utils import _http
answer = httpx.Response(200, headers={{"X-HF-Warning": "auth; {NOTICE}"}})
"""


@pytest.mark.parametrize(
    "script",
    [
        # glossator first (the command line's order): the Hub's logger is set from the environment it leaves
        "from glossator import vectors\n" + HUB_ANSWER + "vectors.quiet()\n_http._warn_on_warning_headers(answer)\n",
        # huggingface_hub first: quiet() lowers its logger afterwards
        HUB_ANSWER + "from glossator import vectors\nvectors.quiet()\n_http._warn_on_warning_headers(answer)\n",
    ],
)
def test_a_first_download_prints_no_notice_of_the_hub(script, tmp_path):
    """The Hub answers an anonymous download with a notice (the header X-HF-Warning), which huggingface_hub logs as a
    warning: a first build or search prints none of it. A fresh interpreter, as the command line is."""
    import subprocess
    import sys

    env = {k: v for k, v in os.environ.items() if not k.startswith(("HF_", "HUGGING_FACE"))}
    env["HF_HOME"] = str(tmp_path / "hf")
    run = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env, timeout=120)
    assert run.returncode == 0, run.stderr
    assert "unauthenticated" not in run.stderr + run.stdout and "HF_TOKEN" not in run.stderr + run.stdout


def test_without_quieting_the_notice_would_show(tmp_path):
    """The check above is not vacuous: huggingface_hub alone prints the Hub's notice."""
    import subprocess
    import sys

    env = {k: v for k, v in os.environ.items() if not k.startswith(("HF_", "HUGGING_FACE"))}
    env["HF_HOME"] = str(tmp_path / "hf")
    script = HUB_ANSWER + "_http._warn_on_warning_headers(answer)\n"
    run = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env, timeout=120)
    assert "unauthenticated" in run.stderr
