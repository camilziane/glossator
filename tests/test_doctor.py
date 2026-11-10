"""`glossator doctor`: each check on a library of the test's own, with a fake Claude Code, a fake crontab and a fake
ssh; what fails is said with its fix, and `--offline` reaches nothing."""

import json

import pytest
from fake_tools import args, git, make_tools, quiet

from glossator import doctor, remote, start, zotero_web
from glossator.remote import CRON_TAG

SCOPE = "Methods that predict protein structure from sequence: architectures, training and benchmarks."


@pytest.fixture
def tools(tmp_path, monkeypatch):
    return make_tools(tmp_path, monkeypatch)


@pytest.fixture
def lib(tools, monkeypatch):
    (tools.bin / "claude").write_text(
        '#!/bin/sh\ncase "$1" in --version) echo "2.1.0 (Claude Code)";; auth) echo \'{"loggedIn": true, "authMethod": "claude.ai"}\';; esac\n'
    )
    (tools.bin / "claude").chmod(0o755)
    monkeypatch.setattr(zotero_web, "KEY_FILE", tools.root / "no-key")
    library = tools.root / "myserver" / "library"
    a = args("init", "--no-input", "--yes", "--no-lfs", "--name", "methods", "--profile", "ml", "--scope", SCOPE)
    start.init(quiet(), library, a)
    return library


def by_id(checks):
    return {c.id: c for c in checks}


def test_an_original_without_daily_run_or_build_is_warned_not_failed(tools, lib, capsys):
    status = doctor.doctor(lib, tools.root / "build", offline=True)
    out = capsys.readouterr().out
    assert "the original: accepts the others' pushes" in out
    assert "→ glossator inbox start --at 07:30" in out and "→ glossator build" in out
    assert "others join with: glossator join" in out
    checks = by_id(doctor.run_checks(lib, tools.root / "build", offline=True))
    assert checks["claude"].status == "ok" and checks["library"].status == "ok"
    assert status == (1 if any(c.status == "fail" for c in checks.values()) else 0)


def test_json_lists_every_check(tools, lib, capsys):
    doctor.doctor(lib, tools.root / "build", offline=True, as_json=True)
    got = json.loads(capsys.readouterr().out)
    assert {"checks", "warnings", "problems"} <= set(got)
    assert {c["status"] for c in got["checks"]} <= {"ok", "warn", "fail", "skip"}
    assert {"git", "poppler", "claude", "library", "role", "build", "zotero-key"} <= {c["id"] for c in got["checks"]}


def own_line(library, command="cd / && GLOSSATOR_LIBRARY={lib} /bin/true -m glossator inbox run") -> str:
    return f"30 7 * * * {command.format(lib=library)} {CRON_TAG}\n"


def clone_of(tools, lib):
    clone = tools.root / "lab2" / "library"
    git(tools.root, "clone", "-q", f"myserver:{lib}", str(clone))
    return clone


def test_a_clone_running_its_daily_inbox_fails(tools, lib):
    clone = clone_of(tools, lib)
    tools.cron.write_text(own_line(lib))  # the original's own line, on this account: not the clone's
    assert by_id(doctor.library_checks(clone, tools.root / "build", offline=False))["inbox-cron"].status == "ok"
    tools.cron.write_text(own_line(clone))
    checks = by_id(doctor.library_checks(clone, tools.root / "build", offline=False))
    assert checks["inbox-cron"].status == "fail" and checks["inbox-cron"].fix == "glossator inbox stop"
    assert checks["reach"].status == "ok" and checks["step"].status == "ok"
    assert checks["role"].detail == f"a clone of myserver:{lib}"


def test_offline_reaches_nothing(tools, lib, monkeypatch):
    clone = clone_of(tools, lib)

    def never(*_a, **_k):
        raise AssertionError("the network was reached")

    monkeypatch.setattr(remote, "reachable", never)
    monkeypatch.setattr(zotero_web, "verify_key", never)
    (tools.root / "no-key").write_text("AbCdEfGhIjKlMnOpQrStUvWx\n")
    (tools.root / "no-key").chmod(0o600)
    checks = by_id(doctor.run_checks(clone, tools.root / "build", offline=True))
    assert checks["reach"].status == "skip" and checks["zotero-key"].status == "skip"


@pytest.mark.parametrize(
    ("command", "says"),
    [
        ("cd /no/such/folder && GLOSSATOR_LIBRARY={lib} /bin/true -m glossator inbox run", "/no/such/folder is gone"),
        ("cd / && GLOSSATOR_LIBRARY={lib} PATH=.:/bin uv run glossator inbox run", "calls uv by name"),
        ("cd / && PATH=.:/bin GLOSSATOR_LIBRARY={lib} /bin/true -m glossator inbox run", "'.'"),
        ("cd / && GLOSSATOR_LIBRARY={lib} /no/such/python -m glossator inbox run", "/no/such/python is gone"),
    ],
)
def test_a_daily_run_that_cannot_work_fails(tools, lib, command, says):
    tools.cron.write_text(own_line(lib, command))
    check = by_id(doctor.library_checks(lib, tools.root / "build", offline=True))["inbox-cron"]
    assert check.status == "fail" and says in check.detail and "07:30" in check.fix


def test_a_daily_run_of_an_earlier_glossator_is_warned(tools, lib):
    tools.cron.write_text(f"30 7 * * * cd {lib.parent} && /bin/true run glossator inbox run {CRON_TAG}\n")
    assert by_id(doctor.library_checks(lib, tools.root / "build", offline=True))["inbox-cron"].status == "warn"


def test_a_build_of_the_library_as_it_is_is_ok(tools, lib):
    build = tools.root / "build"
    build.mkdir()
    (build / "manifest.json").write_text(json.dumps({"library_head": git(lib, "rev-parse", "HEAD")}))
    assert by_id(doctor.library_checks(lib, build, offline=True))["build"].status == "ok"


def test_missing_tools_fail_with_their_fix(tools, lib, monkeypatch):
    real = doctor.shutil.which
    monkeypatch.setattr(doctor.shutil, "which", lambda name: None if name in ("pdftotext", "claude") else real(name))
    checks = by_id(doctor.computer_checks(lib))
    assert checks["poppler"].status == "fail" and "poppler" in checks["poppler"].fix
    assert checks["claude"].status == "fail"


def test_no_library_says_how_to_start_as_init_does(tools):
    checks = by_id(doctor.library_checks(tools.root / "nothing", tools.root / "build", offline=True))
    assert checks["library"].status == "fail" and "glossator init" in checks["library"].fix
    folder = tools.root / "bibs"
    (folder / "methods").mkdir(parents=True)
    (folder / "methods" / "biblio.json").write_text('{"profile": "ml", "title": "Methods"}')
    assert "glossator init (makes this folder" in by_id(doctor.library_checks(folder, tools.root, True))["library"].fix
    other = tools.root / "stuff"
    other.mkdir()
    (other / "x.txt").write_text("x")
    assert by_id(doctor.library_checks(other, tools.root, True))["library"].fix.startswith(f"mv {other} ")


def test_a_library_without_commit_fails(tools):
    empty = tools.root / "empty"
    empty.mkdir()
    git(empty, "init", "-q")
    assert "no commit" in by_id(doctor.library_checks(empty, tools.root, True))["library"].detail


def test_uncommitted_changes_on_the_original_fail(tools, lib):
    (lib / "methods" / "PROFILE.md").write_text("changed by hand")
    check = by_id(doctor.library_checks(lib, tools.root / "build", offline=True))["clean"]
    assert check.status == "fail" and "refused" in check.detail


def test_a_moved_original_and_a_clone_accepting_pushes(tools, lib):
    clone = clone_of(tools, lib)
    (lib / "library.toml").write_text('original = "lab9:/srv/library"\n')
    git(lib, "commit", "-qam", "moved")
    git(clone, "pull", "-q")
    git(clone, "config", "receive.denyCurrentBranch", "updateInstead")
    checks = by_id(doctor.library_checks(clone, tools.root / "build", offline=True))
    assert checks["moved"].status == "fail" and checks["moved"].fix == "glossator follow lab9:/srv/library"
    assert checks["accepts"].status == "warn"


def test_origins_in_a_loop_fail(tools, lib):
    clone = clone_of(tools, lib)
    git(lib, "remote", "add", "origin", f"lab2:{clone}")
    assert by_id(doctor.library_checks(clone, tools.root / "build", offline=False))["loop"].status == "fail"


def test_an_open_key_file_is_warned_and_the_key_still_checked(tools, lib, monkeypatch):
    zotero_web.KEY_FILE.write_text("AbCdEfGhIjKlMnOpQrStUvWx\n")
    zotero_web.KEY_FILE.chmod(0o644)
    asked = []
    monkeypatch.setattr(zotero_web, "verify_key", lambda k: asked.append(k) or {"library": 1, "notes": 1, "write": 1})
    checks = by_id(doctor.zotero_checks(lib, offline=False))
    assert checks["zotero-mode"].status == "warn" and "chmod 600" in checks["zotero-mode"].fix
    assert checks["zotero-key"].status == "ok" and asked


def test_zotero_offline_is_a_warning_and_a_revoked_key_a_failure(tools, lib, monkeypatch):
    zotero_web.KEY_FILE.write_text("AbCdEfGhIjKlMnOpQrStUvWx\n")
    zotero_web.KEY_FILE.chmod(0o600)

    def offline(key):
        raise OSError("Network is unreachable")

    monkeypatch.setattr(zotero_web, "verify_key", offline)
    check = by_id(doctor.zotero_checks(lib, offline=False))["zotero-key"]
    assert check.status == "warn" and check.detail == "Zotero not reached (offline?): the key was not checked"

    def revoked(key):
        raise zotero_web.ZoteroError("GET /keys/<key>: HTTP 403", 403)

    monkeypatch.setattr(zotero_web, "verify_key", revoked)
    assert by_id(doctor.zotero_checks(lib, offline=False))["zotero-key"].status == "fail"


def test_an_ascii_terminal_gets_ascii_marks(tools, lib, monkeypatch):
    import io

    out = io.TextIOWrapper(io.BytesIO(), encoding="ascii")
    monkeypatch.setattr("sys.stdout", out)
    doctor.doctor(lib, tools.root / "build", offline=True)
    out.flush()
    text = out.buffer.getvalue().decode("ascii")
    assert "  ok " in text and "✓" not in text


def test_a_light_clone_without_git_lfs_is_a_warning(tools, lib, monkeypatch):
    (lib / ".gitattributes").write_text("*.pdf filter=lfs diff=lfs merge=lfs -text\n")
    git(lib, "add", "-A")
    git(lib, "commit", "-qm", "lfs")
    clone = clone_of(tools, lib)
    git(clone, "config", "lfs.fetchexclude", "*")
    monkeypatch.setattr(doctor, "lfs_version", lambda: None)
    check = by_id(doctor.computer_checks(clone))["git-lfs"]
    assert check.status == "warn" and "light clone syncs records" in check.detail


def test_placeholders_on_the_original_are_checked_out_not_pulled(tools, lib, monkeypatch):
    monkeypatch.setattr(doctor, "lfs_used", lambda repo: True)
    monkeypatch.setattr(doctor, "lfs_placeholders", lambda repo: 2)
    check = by_id(doctor.library_checks(lib, tools.root / "build", offline=True))["lfs-files"]
    assert "lfs checkout" in check.fix and "lfs pull" not in check.fix
