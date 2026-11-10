import json

from glossator import cli, index


def test_verify_prints_a_line_in_a_terminal_and_json_otherwise(monkeypatch, capsys):
    got = {"found": "verbatim", "page": 2, "file": "paper.pdf"}

    class FakeIndex:
        def __init__(self, path):
            pass

        def verify(self, key, text, page, bib):
            return got

    monkeypatch.setattr(index, "Index", FakeIndex)
    monkeypatch.setattr("sys.stdout.isatty", lambda: True)
    assert cli.main(["verify", "somekey", "some text", "--page", "2"]) == 0
    assert capsys.readouterr().out.strip() == index.format_verify(got)
    assert cli.main(["verify", "somekey", "some text", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["found"] == "verbatim"
