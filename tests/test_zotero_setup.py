"""`glossator zotero setup`: the key read without showing it (or from stdin), checked by a fake of Zotero's API, kept
readable by its owner only, never printed; Zotero's base directory read from a prefs.js of the test's own. No
browser opens, no clipboard is touched, nothing goes to zotero.org."""

import io
import stat

import pytest
from fake_tools import args, quiet, scripted

from glossator import zotero_setup, zotero_web
from glossator.ask import Stop

KEY = "AbCdEfGhIjKlMnOpQrStUvWx"  # 24 letters and digits, made up
OTHER = "ZyXwVuTsRqPoNmLkJiHgFeDc"


@pytest.fixture
def zotero(tmp_path, monkeypatch):
    key_file = tmp_path / "config" / "glossator" / "zotero-key"
    monkeypatch.setattr(zotero_web, "KEY_FILE", key_file)
    calls, opened = [], []

    def verify_key(key, api=None):
        calls.append(key)
        if key == "Revoked0000000000000000x":
            raise zotero_web.ZoteroError("GET /keys/current: HTTP 403", 403)
        if key == "ReadOnly0000000000000000":
            return {"user_id": 7, "username": "reader", "library": True, "notes": True, "write": False}
        return {"user_id": 1234567, "username": "jdoe", "library": True, "notes": True, "write": True}

    monkeypatch.setattr(zotero_web, "verify_key", verify_key)
    monkeypatch.setattr(zotero_setup, "copy_to_clipboard", lambda text: False)
    monkeypatch.setattr(zotero_setup.webbrowser, "open", lambda url: opened.append(url) or True)
    library = tmp_path / "library"
    library.mkdir()
    return type(
        "Z",
        (),
        {"key_file": key_file, "calls": calls, "opened": opened, "library": library, "home": tmp_path / "zhome"},
    )


def setup(z, asker, *flags, dry_run=None, stdin=None, monkeypatch=None):
    if stdin is not None:
        monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    a = args("zotero", "setup", *flags)
    return zotero_setup.setup(asker, z.library, a, dry_run=dry_run, home=z.home)


def test_a_key_from_a_terminal_is_checked_and_kept_private(zotero):
    ran = []
    asker = scripted([KEY, "s", ""])
    assert setup(zotero, asker, dry_run=lambda: ran.append(1)) == 0
    assert zotero.key_file.read_text().strip() == KEY
    assert stat.S_IMODE(zotero.key_file.stat().st_mode) == 0o600
    assert stat.S_IMODE(zotero.key_file.parent.stat().st_mode) == 0o700
    out = asker.out.getvalue()
    assert KEY not in out and "user jdoe (1234567)" in out and str(zotero.library) in out
    assert zotero.opened == [zotero_setup.KEY_PAGE] or zotero.opened == []  # a display may be missing
    assert ran == [1]  # the dry run, after a new key


def test_a_key_from_stdin_for_scripts(zotero, monkeypatch, capsys):
    asker = quiet()
    assert setup(zotero, asker, "--key-stdin", "--no-input", "--yes", stdin=KEY + "\n", monkeypatch=monkeypatch) == 0
    assert zotero.key_file.read_text().strip() == KEY
    assert KEY not in asker.out.getvalue() + capsys.readouterr().out


def test_a_second_run_keeps_the_working_key(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)
    before = zotero.key_file.stat().st_mtime_ns
    asker = quiet()
    assert setup(zotero, asker) == 0
    assert zotero.key_file.stat().st_mtime_ns == before and "works" in asker.out.getvalue()


def test_another_key_replaces_only_on_yes(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)
    with pytest.raises(Stop) as e:
        setup(zotero, quiet(yes=False), "--key-stdin", stdin=OTHER, monkeypatch=monkeypatch)
    assert e.value.code == 2 and zotero.key_file.read_text().strip() == KEY
    assert setup(zotero, quiet(yes=True), "--key-stdin", stdin=OTHER, monkeypatch=monkeypatch) == 0
    assert zotero.key_file.read_text().strip() == OTHER


@pytest.mark.parametrize(
    ("key", "says"),
    [
        ("not-a-key", "24 letters and digits"),
        ("Revoked0000000000000000x", "refuses this key (revoked, or mistyped)"),
        ("ReadOnly0000000000000000", "lacks write access"),
    ],
)
def test_a_bad_key_is_refused_and_nothing_written(zotero, key, says):
    with pytest.raises(Stop) as e:
        setup(zotero, scripted([key]))
    assert says in e.value.message and not zotero.key_file.exists() and key not in e.value.message


def test_zotero_not_reached_writes_nothing(zotero, monkeypatch):
    def offline(key, api=None):
        raise OSError("Network is unreachable")

    monkeypatch.setattr(zotero_web, "verify_key", offline)
    with pytest.raises(Stop, match="not reached"):
        setup(zotero, scripted([KEY]))
    assert not zotero.key_file.exists()


def test_without_a_terminal_the_key_must_come_from_stdin(zotero):
    from glossator.ask import NeedsInput

    with pytest.raises(NeedsInput) as e:
        setup(zotero, quiet())
    assert e.value.flag == "--key-stdin"


def prefs(home, base):
    p = home / ".zotero" / "zotero" / "abcd1234.default" / "prefs.js"
    p.parent.mkdir(parents=True)
    line = f'user_pref("extensions.zotero.baseAttachmentPath", "{base}");\n' if base else ""
    p.write_text('user_pref("extensions.zotero.dataDir", "/x");\n' + line)


def test_the_base_directory_is_read_from_zotero_settings(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)
    asker = quiet()
    assert zotero_setup.check(asker, zotero.library, zotero.key_file, home=zotero.home) == 0  # no Zotero here
    assert "no Zotero on this computer" in asker.out.getvalue()
    prefs(zotero.home, "/elsewhere")
    asker = quiet()
    assert zotero_setup.check(asker, zotero.library, zotero.key_file, home=zotero.home) == 1
    assert "not " + str(zotero.library) in asker.out.getvalue()


def test_the_base_directory_matches(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)
    prefs(zotero.home, str(zotero.library))
    asker = quiet()
    assert setup(zotero, asker, "--check") == 0
    assert "Zotero's base directory is" in asker.out.getvalue()


def test_a_key_file_open_to_others_is_closed(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)
    zotero.key_file.chmod(0o644)
    setup(zotero, quiet())
    assert stat.S_IMODE(zotero.key_file.stat().st_mode) == 0o600


def test_a_key_file_inside_git_is_refused(zotero, monkeypatch, tmp_path):
    import subprocess

    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    monkeypatch.setattr(zotero_web, "KEY_FILE", repo / "zotero-key")
    with pytest.raises(Stop, match="out of git"):
        setup(zotero, scripted([KEY]))


def test_a_revoked_stored_key_is_replaced_without_asking(zotero, monkeypatch):
    zotero.key_file.parent.mkdir(parents=True, mode=0o700)
    zotero.key_file.write_text("Revoked0000000000000000x\n")
    zotero.key_file.chmod(0o600)
    asker = scripted([KEY, ""])
    assert setup(zotero, asker) == 0
    assert zotero.key_file.read_text().strip() == KEY
    assert "does not work any more" in asker.out.getvalue()


def test_a_dry_run_stores_nothing_and_says_so(zotero, monkeypatch):
    from fake_tools import quiet

    asker = quiet(dry_run=True)
    a_stdin = KEY + "\n"
    assert setup(zotero, asker, "--key-stdin", "--dry-run", stdin=a_stdin, monkeypatch=monkeypatch) == 0
    assert not zotero.key_file.exists()
    assert "Dry run: the key was not stored. Run again without --dry-run." in asker.out.getvalue()


def test_check_says_offline_is_not_a_failure(zotero, monkeypatch):
    setup(zotero, quiet(), "--key-stdin", stdin=KEY, monkeypatch=monkeypatch)

    def offline(key, api=None):
        raise OSError("Network is unreachable")

    monkeypatch.setattr(zotero_web, "verify_key", offline)
    asker = quiet()
    assert zotero_setup.check(asker, zotero.library, zotero.key_file, home=zotero.home) == 0
    assert "Zotero not reached (offline?): the key was not checked" in asker.out.getvalue()


def test_interrupted_after_the_key_says_the_key_is_stored(zotero, monkeypatch):
    def interrupt(*_a, **_k):
        raise KeyboardInterrupt

    monkeypatch.setattr(zotero_setup, "copy_to_clipboard", interrupt)
    with pytest.raises(Stop) as e:
        setup(zotero, scripted([KEY]))
    assert (
        e.value.code == 130 and "the key is stored in" in e.value.message and "nothing changed" not in e.value.message
    )
    assert zotero.key_file.read_text().strip() == KEY
