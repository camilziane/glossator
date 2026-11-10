"""`glossator web` and `glossator demo` on a checkout of the test's own, with fake `node` and `npm`: built once,
nothing done when current, `npm ci` only when the lock changed, a Node too old refused; the demo served from its
own home."""

import json

import pytest
from fake_tools import commit, git, make_tools

from glossator import webapp

NPM = """#!/bin/sh
echo "$*" >> "$NPM_LOG"
case "$1" in
  ci) mkdir -p node_modules ;;
  run) mkdir -p out && echo '<html></html>' > out/index.html ;;
esac
"""


@pytest.fixture
def tools(tmp_path, monkeypatch):
    return make_tools(tmp_path, monkeypatch)


@pytest.fixture
def checkout(tools, monkeypatch):
    root = tools.root / "glossator"
    (root / "web").mkdir(parents=True)
    git(root.parent, "init", "-q", str(root))
    (root / "web" / ".gitignore").write_text("out/\nnode_modules/\n")
    (root / "web" / "package-lock.json").write_text('{"lockfileVersion": 3}')
    commit(root, "web/package.json", '{"name": "glossator-web"}')
    for name, text in (("node", "#!/bin/sh\necho v22.11.0\n"), ("npm", NPM)):
        (tools.bin / name).write_text(text)
        (tools.bin / name).chmod(0o755)
    monkeypatch.setenv("NPM_LOG", str(tools.root / "npm.log"))
    monkeypatch.setattr(webapp, "CHECKOUT", root)
    return root


def npm_calls(tools):
    log = tools.root / "npm.log"
    return log.read_text().splitlines() if log.exists() else []


def test_web_builds_once_then_does_nothing(tools, checkout, capsys):
    assert not webapp.current()
    assert webapp.build_web() == 0
    assert npm_calls(tools) == ["ci --no-fund --no-audit", "run build"]
    stamp = json.loads((checkout / "web" / "out" / webapp.STAMP).read_text())
    assert stamp["web"] == git(checkout, "rev-parse", "HEAD:web")
    assert webapp.current()
    assert webapp.build_web() == 0 and len(npm_calls(tools)) == 2
    assert "nothing to do" in capsys.readouterr().out


def test_a_new_commit_rebuilds_and_a_new_lock_reinstalls(tools, checkout):
    webapp.build_web()
    commit(checkout, "web/src/page.tsx", "export {}")
    assert not webapp.current()
    webapp.build_web()
    assert npm_calls(tools)[2:] == ["run build"]  # the lock did not change: no npm ci
    commit(checkout, "web/package-lock.json", '{"lockfileVersion": 3, "x": 1}')
    webapp.build_web()
    assert npm_calls(tools)[3:] == ["ci --no-fund --no-audit", "run build"]


def test_local_changes_make_it_stale(tools, checkout):
    webapp.build_web()
    import os
    import time

    src = checkout / "web" / "package.json"
    src.write_text('{"name": "changed"}')
    later = time.time() + 5
    os.utime(src, (later, later))
    assert not webapp.current()


def test_node_too_old_is_refused(tools, checkout, capsys):
    (tools.bin / "node").write_text("#!/bin/sh\necho v20.18.1\n")
    assert webapp.node_version() == (20, 18, 1)
    assert webapp.build_web() == 1
    assert "20.19 or later" in capsys.readouterr().err and npm_calls(tools) == []


def test_without_the_sources_web_says_where_they_are(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(webapp, "CHECKOUT", tmp_path)
    assert webapp.build_web() == 1 and "come with the repository" in capsys.readouterr().err


def test_demo_builds_once_and_serves_from_its_home(tools, checkout, monkeypatch):
    (checkout / "demo" / "library" / "methods").mkdir(parents=True)
    runs, served = [], []
    real = webapp.subprocess.run

    def run(cmd, env=None, **kw):
        if cmd[-1] != "build":
            return real(cmd, env=env, **kw)
        runs.append((cmd[-1], env["GLOSSATOR_HOME"]))
        (checkout / "demo" / "build").mkdir(exist_ok=True)
        (checkout / "demo" / "build" / "manifest.json").write_text("{}")
        return type("R", (), {"returncode": 0})()

    monkeypatch.setattr(webapp.subprocess, "run", run)
    monkeypatch.setattr(webapp, "build_web", lambda *a, **k: 0)
    monkeypatch.setattr(webapp.os, "execvpe", lambda f, argv, env: served.append((argv[-3:], env["GLOSSATOR_HOME"])))
    webapp.demo(8765, True, False)
    webapp.demo(8800, False, False)
    home = str(checkout / "demo")
    assert runs == [("build", home)]  # built once
    assert served == [(["--port", "8765", "--open"], home), (["serve", "--port", "8800"], home)]
