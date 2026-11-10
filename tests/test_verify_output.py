"""What `verify` prints for a person: one line ("verbatim on p. 2"); its JSON stays for a pipe and --json."""

import pytest

from glossator.index import format_verify


@pytest.mark.parametrize(
    ("got", "line"),
    [
        ({"found": "verbatim", "page": 2, "file": "paper.pdf", "score": 1.0}, "verbatim on p. 2"),
        ({"found": "close", "page": 3, "file": "paper.pdf", "score": 0.92}, "close on p. 3 (92% of the words)"),
        ({"found": "elsewhere", "page": 5, "file": "paper.pdf", "score": 1.0}, "elsewhere: p. 5"),
        (
            {"found": "elsewhere", "page": 4, "file": "supplementary/si.pdf", "score": 0.85},
            "elsewhere: p. 4 of supplementary/si.pdf (85% of the words)",
        ),
        (
            {"found": "absent", "page": 7, "file": "paper.pdf", "score": 0.4},
            "absent (at most 40% of the words, on p. 7)",
        ),
        ({"found": "absent", "score": 0.0}, "absent"),
    ],
)
def test_verify_says_it_in_one_line(got, line):
    assert format_verify(got) == line
