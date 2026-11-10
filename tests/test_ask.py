"""The questions and plans every setup command shares: flags first, then the terminal, then the defaults; a run
without a terminal never waits; a plan runs only once answered yes, and says where it stopped."""

import io
from types import SimpleNamespace

import pytest
from fake_tools import quiet, scripted

from glossator.ask import Asker, DryRun, NeedsInput, Step, Stop, guarded, run_plan


def test_an_empty_answer_takes_the_default_and_a_wrong_one_is_asked_again():
    asker = scripted(["", "x", "12:30"])
    assert asker.ask("Language", "English", flag="--language") == "English"
    got = asker.ask("Time", None, flag="--at", check=lambda t: None if ":" in t else "HH:MM")
    assert got == "12:30" and "HH:MM" in asker.out.getvalue()


def test_a_flag_answers_without_asking_and_is_checked():
    asker = scripted([])
    assert asker.ask("Title", "T", flag="--title", value=" Mine ") == "Mine"
    with pytest.raises(Stop) as e:
        asker.ask("Name", None, flag="--name", value="Bad Name", check=lambda _: "lowercase")
    assert e.value.code == 2 and "--name" in e.value.message
    assert asker.prompts == []


def test_without_a_terminal_a_question_without_default_names_its_flag():
    asker = quiet()
    assert asker.ask("Language", "English", flag="--language") == "English"
    with pytest.raises(NeedsInput) as e:
        asker.ask("Scope", None, flag="--scope")
    assert e.value.flag == "--scope"
    assert guarded(lambda: asker.ask("Scope", None, flag="--scope") and 0, err=io.StringIO()) == 2


def test_yes_answers_the_plan_but_never_a_value():
    asker = quiet(yes=True)
    assert asker.go() is True
    with pytest.raises(NeedsInput):
        asker.ask("Scope", None, flag="--scope")


def test_without_yes_and_without_a_terminal_the_plan_is_not_run():
    done = []
    with pytest.raises(Stop) as e:
        run_plan(quiet(yes=False), [Step("write a file", lambda: done.append(1))])
    assert e.value.code == 2 and "--yes" in e.value.message and not done


def test_a_dry_run_prints_the_plan_and_does_nothing():
    asker, done = quiet(dry_run=True), []
    with pytest.raises(DryRun):
        run_plan(asker, [Step("write a file", lambda: done.append(1))])
    assert "1. write a file" in asker.out.getvalue() and not done


def test_a_failed_step_stops_the_plan_and_says_to_run_again():
    asker, done = quiet(), []

    def fail():
        raise RuntimeError("disk full")

    with pytest.raises(Stop) as e:
        run_plan(asker, [Step("one", lambda: done.append(1)), Step("two", fail), Step("three", lambda: done.append(3))])
    assert done == [1] and "it continues" in e.value.message and "Step 1 is done" in e.value.message
    assert "disk full" in asker.out.getvalue()


def test_a_declined_plan_changes_nothing():
    asker, done = scripted(["n"]), []
    assert run_plan(asker, [Step("one", lambda: done.append(1))]) is False
    assert not done and "Nothing changed." in asker.out.getvalue()


def test_choose_takes_a_number_or_a_name():
    options = [("ml", "methods"), ("epidemio", "studies")]
    assert scripted(["2"]).choose("Profile", options, "ml", flag="--profile") == "epidemio"
    assert scripted(["ml"]).choose("Profile", options, "ml", flag="--profile") == "ml"
    assert scripted(["", "x"]).choose("Profile", options, "ml", flag="--profile") == "ml"
    with pytest.raises(Stop):
        quiet().choose("Profile", options, "ml", flag="--profile", value="other")


def test_lines_end_at_an_empty_line_and_a_secret_never_comes_from_flags():
    asker = scripted(["one", "two", ""])
    assert asker.lines("Queries:") == ["one", "two"]
    assert quiet().lines("Queries:") == []
    assert quiet().lines("Queries:", values=["a b"]) == ["a b"]
    with pytest.raises(NeedsInput) as e:
        quiet().secret("Key")
    assert e.value.flag == "--key-stdin"


def test_replace_asks_no_by_default_and_stops_without_a_terminal():
    assert scripted([""]).replace("Replace it?") is False
    assert quiet(yes=True).replace("Replace it?") is True
    with pytest.raises(Stop) as e:
        quiet(yes=False).replace("Replace it?")
    assert e.value.code == 2


def test_from_args_reads_the_setup_flags(monkeypatch):
    monkeypatch.setattr("sys.stdin", SimpleNamespace(isatty=lambda: True))
    a = SimpleNamespace(yes=True, no_input=False, dry_run=False)
    assert Asker.from_args(a).interactive and Asker.from_args(a).yes
    a.no_input = True
    assert not Asker.from_args(a).interactive
    monkeypatch.setenv("GLOSSATOR_NO_INPUT", "1")
    a.no_input = False
    assert not Asker.from_args(a).interactive


def test_an_interruption_says_which_steps_are_done():
    def interrupt():
        raise KeyboardInterrupt

    with pytest.raises(Stop) as e:
        run_plan(quiet(), [Step("one", lambda: "1"), Step("two", lambda: "2"), Step("three", interrupt)])
    assert e.value.code == 130 and "Steps 1 to 2 are done" in e.value.message


def test_marks_fall_back_to_ascii_on_a_terminal_that_is_not_utf8():
    out = io.TextIOWrapper(io.BytesIO(), encoding="ascii")
    asker = Asker(interactive=False, out=out)
    asker.mark("ok", "fine → café")
    out.flush()
    assert out.buffer.getvalue().decode() == "  ok fine ? caf?\n"


def test_a_first_step_that_fails_is_not_called_nothing_changed():
    def fail():
        raise RuntimeError("half done")

    asker = quiet()
    with pytest.raises(Stop) as e:
        run_plan(asker, [Step("add a long crontab line:\n  0 7 * * * very long", fail, short="add the daily run")])
    assert "No step is done; step 1 did not finish" in e.value.message and "Nothing changed" not in e.value.message
    assert "very long" not in asker.out.getvalue().split("✗")[-1]  # the failure names the step shortly
