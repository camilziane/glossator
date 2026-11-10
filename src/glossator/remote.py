"""Another computer's library, by its address, and the commands run there.

An address is what git clones from: `[user@]host:path` (an ssh name, as `ssh host` takes it, then the library's
folder there; a relative path starts from the home folder there), `ssh://[user@]host[:port]/path`, or an absolute
local path (a shared disk). Commands on another computer go through ssh without a password prompt
(`BatchMode=yes`) and a 10-second connection timeout, every argument quoted; they are plain `git`, `sh`, `crontab`
and `pgrep`, so the other computer needs no particular version of glossator."""

from __future__ import annotations

import re
import shlex
import subprocess
import urllib.parse
from dataclasses import dataclass, replace
from pathlib import Path

CRON_TAG = "# glossator-inbox"  # ends the crontab line of a library's daily run (GLOSSATOR_LIBRARY in it says which)
SSH_OPTIONS = ("-o", "BatchMode=yes", "-o", "ConnectTimeout=10")
ADDRESS_HELP = "an ssh name and a path (lab.example.org:/srv/glossator/library), ssh://host/path, or a local path"


@dataclass(frozen=True)
class Address:
    """Where a library is: on a computer reached by ssh (`host`), or on this one (`host` None)."""

    path: str
    host: str | None = None
    user: str | None = None
    port: int | None = None
    url: bool = False  # written ssh://…

    @classmethod
    def parse(cls, text: str) -> Address:
        t = text.strip()
        if not t:
            raise ValueError(f"an address is needed: {ADDRESS_HELP}")
        if t.startswith("ssh://"):
            u = urllib.parse.urlsplit(t)
            if not u.hostname or not u.path or u.path == "/":
                raise ValueError(f"{t}: {ADDRESS_HELP}")
            return cls(path=u.path, host=u.hostname, user=u.username, port=u.port, url=True)
        if t.startswith("file://"):
            t = t[len("file://") :]
        colon, slash = t.find(":"), t.find("/")
        if colon < 0 or (0 <= slash < colon):  # git's rule: no colon before the first slash, a local path
            return cls(path=str(Path(t).expanduser().resolve()))
        m = re.fullmatch(r"(?:([^@/:\s]+)@)?([^@/:\s]+):(.+)", t)
        if not m:
            raise ValueError(f"{t}: {ADDRESS_HELP}")
        return cls(path=m.group(3), host=m.group(2), user=m.group(1))

    @property
    def key(self) -> tuple:
        """What two ways of writing the same address share: ssh://host/path is host:/path, a trailing slash or a
        leading ~/ does not count (the case of a path does)."""
        path = self.path.rstrip("/") or "/"
        if self.host is not None and path.startswith("~/"):
            path = path[2:]
        return (self.host.lower() if self.host else None, self.user, self.port if self.port != 22 else None, path)

    def same(self, other: Address | str | None) -> bool:
        if other is None:
            return False
        try:
            other = other if isinstance(other, Address) else Address.parse(other)
        except ValueError:
            return False
        return self.key == other.key

    @property
    def remote_path(self) -> str:
        """The path as a command run there takes it (~/x is x: commands start in the home folder)."""
        if self.host is not None and self.path.startswith("~/"):
            return self.path[2:]
        return "." if self.host is not None and self.path == "~" else self.path

    def __str__(self) -> str:
        if self.host is None:
            return self.path
        who = f"{self.user}@{self.host}" if self.user else self.host
        if self.url or self.port:
            return f"ssh://{who}{':' + str(self.port) if self.port else ''}{self.path}"
        return f"{who}:{self.path}"

    @property
    def target(self) -> str:
        """What ssh takes: [user@]host."""
        return f"{self.user}@{self.host}" if self.user else str(self.host)

    @property
    def name(self) -> str:
        """How messages name the computer."""
        return self.host or "this computer"

    def child(self, sub: str) -> Address:
        return replace(self, path=self.path.rstrip("/") + "/" + sub)

    def shell(self) -> Shell:
        return Shell(self)


class Shell:
    """Runs commands on the address's computer: through ssh, or here for a local path."""

    def __init__(self, address: Address | None = None):
        self.address = address

    @property
    def remote(self) -> bool:
        return self.address is not None and self.address.host is not None

    def run(self, args: list[str], timeout: float = 120, input: str | None = None) -> subprocess.CompletedProcess:
        if self.remote:
            a = self.address
            cmd = ["ssh", *SSH_OPTIONS, *(["-p", str(a.port)] if a.port else []), a.target, shlex.join(args)]
        else:
            cmd = list(args)
        try:
            return subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=timeout, input=input)
        except FileNotFoundError as e:
            return subprocess.CompletedProcess(cmd, 127, "", f"{e.filename}: not found")
        except subprocess.TimeoutExpired:
            return subprocess.CompletedProcess(cmd, 124, "", f"no answer within {timeout:.0f} s")

    def sh(self, script: str, timeout: float = 120) -> subprocess.CompletedProcess:
        return self.run(["sh", "-c", script], timeout=timeout)

    def git(self, path: str, *args: str, timeout: float = 120) -> subprocess.CompletedProcess:
        if self.remote and path.startswith("~/"):
            path = path[2:]
        return self.run(["git", "-C", path, *args], timeout=timeout)


def tail(r: subprocess.CompletedProcess, n: int = 0) -> str:
    """What went wrong, in one whole line: git's first `fatal:` or `error:` line, else the last line said."""
    lines = [ln.strip() for ln in (r.stderr or r.stdout or "").splitlines() if ln.strip()]
    for ln in lines:
        if ln.lower().startswith(("fatal:", "error:", "ssh:")):
            return ln
    return lines[-1] if lines else f"exit {r.returncode}"


def reachable(address: Address) -> str | None:
    """None when ssh reaches the address's computer without a password prompt (or it is this one); else why not."""
    if address.host is None:
        return None
    r = address.shell().run(["true"], timeout=30)
    return None if r.returncode == 0 else tail(r)


def has_command(shell: Shell, name: str) -> str | None:
    """Where `name` is on the PATH a non-interactive command gets there (the one git gets), or None."""
    r = shell.sh(f"command -v {shlex.quote(name)}", timeout=60)
    return (r.stdout.strip() or None) if r.returncode == 0 else None


def ls_remote_head(address: Address, shell: Shell | None = None) -> str | None:
    """The commit HEAD names in the repository at `address` (seen from `shell`'s computer, this one by default)."""
    r = (shell or Shell()).run(["git", "ls-remote", str(address), "HEAD"], timeout=120)
    return r.stdout.split()[0] if r.returncode == 0 and r.stdout.strip() else None


# --------------------------------------------------------------------------- the inbox's crontab line


def owns(line: str, library: str | Path) -> bool:
    """Is this crontab line the daily run of `library`? Its GLOSSATOR_LIBRARY says which library it runs; a line of
    an earlier glossator (none) runs the library of the folder it goes into."""
    line = line.rstrip()
    if not line.endswith(CRON_TAG):
        return False
    try:
        words = shlex.split(line[: -len(CRON_TAG)].replace("\\%", "%"))
    except ValueError:
        return False
    named = next((w.split("=", 1)[1] for w in words if w.startswith("GLOSSATOR_LIBRARY=")), None)
    if named is not None:
        return named == str(library)
    folder = next((words[i + 1] for i, w in enumerate(words[:-1]) if w == "cd"), "")
    return bool(folder) and str(Path(folder) / "library") == str(library)


def is_daily_run(line: str) -> bool:
    return CRON_TAG in line


def cron_lines(shell: Shell) -> list[str]:
    r = shell.run(["crontab", "-l"], timeout=60)
    return r.stdout.splitlines() if r.returncode == 0 else []


def cron_entry(shell: Shell, library: str | Path) -> str | None:
    """The daily run's line of this library in that computer's crontab, if any."""
    return next((x for x in cron_lines(shell) if owns(x, library)), None)


def real_path(shell: Shell, path: str) -> str | None:
    """The folder's absolute path on that computer, links resolved (None: no such folder)."""
    if shell.remote and path.startswith("~/"):
        path = path[2:]
    r = shell.sh(f"cd -- {shlex.quote(path)} && pwd -P", timeout=60)
    return (r.stdout.strip() or None) if r.returncode == 0 else None


def cron_time(line: str | None) -> str | None:
    """HH:MM of a crontab line `M H * * * …`."""
    if not line:
        return None
    try:
        minute, hour = line.split()[:2]
        return f"{int(hour):02d}:{int(minute):02d}"
    except ValueError:
        return None


def cron_remove(shell: Shell, library: str | Path) -> None:
    """Take this library's daily line out of that computer's crontab, keeping every other line (another library's
    daily run included)."""
    keep = [x for x in cron_lines(shell) if not owns(x, library)]
    script = 't=$(mktemp) && cat > "$t" && crontab "$t"; s=$?; rm -f "$t"; exit $s'
    r = shell.run(["sh", "-c", script], timeout=60, input="".join(f"{x}\n" for x in keep))
    if r.returncode != 0:
        raise RuntimeError(f"crontab on {shell.address.name if shell.address else 'this computer'}: {tail(r)}")


def inbox_running(shell: Shell) -> bool:
    """Is a daily run going on that computer now? (`[g]` keeps pgrep from finding its own shell.)"""
    return shell.run(["pgrep", "-f", "[g]lossator inbox run"], timeout=60).returncode == 0
