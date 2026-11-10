"""The small helpers the checks rely on: how numbers, titles and DOIs are read."""

from glossator.records import DOI_RE, KEY_RE, is_sentinel, pending
from glossator.util import fold, norm_doi, numbers_in, percents_in, title_score


def test_norm_doi_strips_resolvers():
    assert norm_doi("https://doi.org/10.1038/s41586-021-03819-2") == "10.1038/s41586-021-03819-2"
    assert norm_doi(" doi: 10.1038/X ") == "10.1038/X"
    assert DOI_RE.match(norm_doi("http://dx.doi.org/10.48550/arXiv.1904.11486"))


def test_keys():
    assert KEY_RE.match("jumper2021") and KEY_RE.match("ioannidis2005false")
    assert not KEY_RE.match("Jumper2021") and not KEY_RE.match("jumper")


def test_fold():
    assert fold("de la Cruz") == "delacruz"
    assert fold("Müller 2021", digits=True) == "muller2021"


def test_numbers_are_read_as_printed():
    assert numbers_in("a 125,000-sample training set") == {"125000"}
    assert "0.89" in numbers_in("r = .89")
    assert percents_in("9.1% top-1 error, 23.8 %") == {"9.1", "23.8"}


def test_title_score():
    title = "Highly accurate protein structure prediction with AlphaFold"
    assert title_score(title, "HIGHLY ACCURATE PROTEIN STRUCTURE PREDICTION WITH ALPHAFOLD. Jumper et al.") == 1.0
    assert title_score(title, "Something else entirely") == 0.0


def test_sentinels_and_todos():
    assert is_sentinel("not reported") and is_sentinel(" none ")
    assert not is_sentinel("nothing")
    assert pending("TODO: the task") and not pending("done")
