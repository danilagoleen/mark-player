#!/usr/bin/env python3
"""player_ctl — one command for an agent to drive Mark Player.

The operator says "запусти плеер" / "покажи моменты 812–819" / "open the player".
This is the button for that: it starts the app, puts a command file into the
player's inbox, waits for the ack and tells you plainly what happened.

    python3 player_playground/scripts/player_ctl.py launch
    python3 player_playground/scripts/player_ctl.py open_file /Volumes/x/clip.mov
    python3 player_playground/scripts/player_ctl.py play_range --file /Volumes/x/clip.mov 812.4 819
    python3 player_playground/scripts/player_ctl.py open_playlist --inline questions.json --by Beta
    python3 player_playground/scripts/player_ctl.py read_answers --cmd <command id>

Protocol: player_playground/docs/AGENT_DATA_MANIFEST.md §5.5 (inbox/ + ack/ in the
app data dir, no port, no network). Standard library only.

Honest limits: `done` in an ack means "the command was executed", not "the human
sees the question" — see AGENT_DATA_MANIFEST §5.5.2.
"""
from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import secrets
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

APP_ID = "ai.vetka.playerlab"
DEFAULT_APP = "/Applications/Mark Player.app"
BIN_NAME = "vetka_player_lab"
QUEUE_VERSION = 1

EXIT_OK = 0
EXIT_USAGE = 2  # bad arguments (argparse uses 2 too); nothing was queued
EXIT_ACK_ERROR = 3  # the player answered, but with error/expired
EXIT_NOT_RUNNING = 4  # Mark Player is not running; nothing was queued
EXIT_FOREIGN = 5  # another copy of the player runs; not touched
EXIT_NO_ACK = 6  # nobody answered within the timeout
EXIT_LAUNCH_FAILED = 7  # the app could not be started
EXIT_NO_ANSWERS = 8  # no answers file yet

DEFAULT_TIMEOUT = 20.0
LAUNCH_TIMEOUT = 45.0
SETTLE_SEC = 1.0

_PS_LINE = re.compile(r"^\s*(\d+)\s+(/.*?/" + re.escape(BIN_NAME) + r")(?=\s|$)")


def real_ps() -> str:
    try:
        return subprocess.run(
            ["ps", "-axo", "pid=,command="], capture_output=True, text=True, check=False
        ).stdout
    except OSError:
        return ""


def real_launch(app: str) -> None:
    # open <path-to-.app>, not `open -a Mark Player`: all copies share one bundle id
    subprocess.run(["open", app], check=True)


class Deps:
    """Everything the script touches outside itself — replaceable in tests."""

    def __init__(self, ps=None, launch=None, out=None, err=None, env=None, sleep=None):
        self.ps = ps or real_ps
        self.launch = launch or real_launch
        self.out = out or sys.stdout
        self.err = err or sys.stderr
        self.env = os.environ if env is None else env
        self.sleep = sleep or time.sleep


# --------------------------------------------------------------------------- paths


def default_data_dir() -> Path:
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / APP_ID
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA", str(home))) / APP_ID
    return Path(os.environ.get("XDG_DATA_HOME", str(home / ".local" / "share"))) / APP_ID


def installed_version(app: str) -> str | None:
    try:
        with open(Path(app) / "Contents" / "Info.plist", "rb") as fh:
            value = plistlib.load(fh).get("CFBundleShortVersionString")
    except (OSError, plistlib.InvalidFileException, ValueError):
        return None
    return str(value) if value else None


def classify_running(ps_text: str, app: str):
    """('none'|'ours'|'foreign', [(pid, exe), ...]) from `ps -axo pid=,command=`."""
    want = os.path.realpath(str(Path(app) / "Contents" / "MacOS" / BIN_NAME))
    ours: list[tuple[int, str]] = []
    other: list[tuple[int, str]] = []
    for line in ps_text.splitlines():
        m = _PS_LINE.match(line)
        if not m:
            continue
        pid, exe = int(m.group(1)), m.group(2)
        (ours if os.path.realpath(exe) == want else other).append((pid, exe))
    if ours:
        return "ours", ours
    if other:
        return "foreign", other
    return "none", []


# --------------------------------------------------------------------------- command file


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(int(epoch), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_command(verb: str, args: dict, by: str, ttl_sec: float, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    return {
        "cmd_version": QUEUE_VERSION,
        "id": f"pc-{int(now * 1000)}-{secrets.token_hex(4)}",
        "verb": verb,
        "args": args,
        "created_at": _iso(now),
        "expires_at": _iso(now + ttl_sec),
        "author": by,
    }


def write_command(data_dir, cmd: dict) -> str:
    """inbox/<id>.cmd.json, written atomically: the player only reads *.cmd.json."""
    inbox = Path(data_dir) / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    final = inbox / f"{cmd['id']}.cmd.json"
    tmp = inbox / f".{cmd['id']}.cmd.tmp"
    tmp.write_text(json.dumps(cmd, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, final)
    return str(final)


def wait_ack(data_dir, cmd_id: str, timeout: float, sleep=time.sleep):
    target = Path(data_dir) / "ack" / f"{cmd_id}.ack.json"
    deadline = time.monotonic() + timeout
    while True:
        if target.exists():
            try:
                return json.loads(target.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                pass  # half-written: the player renames atomically, so this is rare
        if time.monotonic() >= deadline:
            return None
        sleep(0.1)


# --------------------------------------------------------------------------- context


class Ctx:
    def __init__(self, ns: argparse.Namespace, deps: Deps):
        env = deps.env
        self.deps = deps
        self.by = ns.by or "agent"
        self.app = ns.app or env.get("MARK_PLAYER_APP") or DEFAULT_APP
        self.data = Path(ns.data_dir or env.get("MARK_PLAYER_DATA_DIR") or default_data_dir())
        self.timeout = ns.timeout

    def say(self, text: str) -> None:
        print(text, file=self.deps.out)

    def warn(self, text: str) -> None:
        print(text, file=self.deps.err)

    def running(self):
        return classify_running(self.deps.ps(), self.app)


def describe_copy(exe: str) -> str:
    """Say WHAT a running player is, from its binary path (Beta's cold test 17.11:
    «a DIFFERENT copy» without a kind read as a mystery). A cargo target dir means
    somebody's build, not an installed app."""
    path = str(exe).replace("\\", "/")
    if "/target/debug/" in path:
        return "a dev build (cargo target/debug)"
    if "/target/release/" in path:
        return "a local release build (cargo target/release)"
    return "another install (not the bundle this script launches)"


def _foreign_message(ctx: Ctx, procs) -> str:
    where = "; ".join(f"pid {pid} {exe} — {describe_copy(exe)}" for pid, exe in procs)
    return (
        f"player_ctl: another copy of Mark Player is running ({where}), not the installed one "
        f"({ctx.app}). I do not kill or double-start it. Ask the operator to close that copy, "
        f"then run: player_ctl.py launch"
    )


def _gate(ctx: Ctx) -> int | None:
    """None = the right player is up. Otherwise an exit code, and nothing is queued."""
    kind, procs = ctx.running()
    if kind == "none":
        ctx.warn(
            "player_ctl: Mark Player is not running. Nothing was queued (an inbox nobody "
            "reads would swallow the command silently). Start it first: player_ctl.py launch"
        )
        return EXIT_NOT_RUNNING
    if kind == "foreign":
        ctx.warn(_foreign_message(ctx, procs))
        return EXIT_FOREIGN
    return None


def _send(ctx: Ctx, verb: str, args: dict, timeout: float | None = None):
    """Queue one command and wait. Returns (exit_code, ack|None)."""
    wait = ctx.timeout if timeout is None else timeout
    cmd = build_command(verb, args, ctx.by, wait + 5)
    path = write_command(ctx.data, cmd)
    started = time.monotonic()
    ack = wait_ack(ctx.data, cmd["id"], wait, ctx.deps.sleep)
    took = time.monotonic() - started
    if ack is None:
        ctx.warn(
            f"player_ctl: no ack for {cmd['id']} ({verb}) within {wait:g}s. The command file is "
            f"still in the inbox ({path}) — nobody picked it up: the player may be frozen, or "
            f"older than the command queue. It expires at {cmd['expires_at']} and is ignored "
            f"after that. Check: player_ctl.py status"
        )
        return EXIT_NO_ACK, None
    status = ack.get("status")
    version = ack.get("player_version") or "unknown (older than 0.26.7)"
    if status == "done":
        ctx.say(f"player_ctl: {verb} -> done (player_version {version}, {took:.2f}s, id {cmd['id']})")
        ctx.say(json.dumps(ack, ensure_ascii=False, indent=2))
        return EXIT_OK, ack
    err = ack.get("error") or {}
    ctx.warn(
        f"player_ctl: {verb} -> {status}: {err.get('code', '?')} — {err.get('message', '')} "
        f"(player_version {version}, id {cmd['id']})"
    )
    ctx.say(json.dumps(ack, ensure_ascii=False, indent=2))
    return EXIT_ACK_ERROR, ack


# --------------------------------------------------------------------------- verbs


def _abs_file(ctx: Ctx, raw: str) -> str | None:
    path = os.path.abspath(os.path.expanduser(raw))
    if not os.path.exists(path):
        ctx.warn(f"player_ctl: file not found: {path}. Nothing was queued.")
        return None
    return path


def _num(ctx: Ctx, raw: str, name: str) -> float | None:
    try:
        return float(raw)
    except ValueError:
        ctx.warn(f"player_ctl: {name} must be a number of seconds, got {raw!r}. Nothing was queued.")
        return None


def cmd_status(ctx: Ctx, ns) -> int:
    kind, procs = ctx.running()
    version = installed_version(ctx.app)
    bundle = version or "unknown (bundle not found)"
    if kind == "ours":
        pid, exe = procs[0]
        ctx.say(f"Mark Player: running — pid {pid}, {exe}")
        ctx.say(f"installed bundle: {ctx.app}, version {bundle} — this is the copy that runs; verbs go to it")
    elif kind == "foreign":
        where = "; ".join(f"pid {pid} {exe}" for pid, exe in procs)
        ctx.say(f"Mark Player: a DIFFERENT copy is running — {where}")
        for pid, exe in procs:
            ctx.say(f"  pid {pid} is {describe_copy(exe)}, not the installed bundle")
        ctx.say(f"installed bundle: {ctx.app}, version {bundle} — NOT running; the copy above is a different build")
        ctx.say(
            "every verb and launch is refused with exit 5 (nothing queued) until the operator closes "
            "that copy; then `launch` starts the installed bundle"
        )
    else:
        ctx.say("Mark Player: not running")
        ctx.say(f"installed bundle: {ctx.app}, version {bundle} — not running; `launch` starts it")
    ctx.say(f"data dir: {ctx.data}")
    acks = sorted((ctx.data / "ack").glob("*.ack.json"), key=lambda p: p.stat().st_mtime) if (ctx.data / "ack").is_dir() else []
    if acks:
        try:
            last = json.loads(acks[-1].read_text(encoding="utf-8"))
            ctx.say(
                f"last ack: {last.get('verb')} {last.get('status')} at {last.get('at')}, answered by a copy "
                f"reporting player_version {last.get('player_version', 'unknown')} "
                "(the data dir is shared: any copy that ran writes here, not only the one above)"
            )
        except (OSError, ValueError):
            pass
    inbox = ctx.data / "inbox"
    waiting = [p for p in inbox.glob("*.cmd.json") if not (ctx.data / "ack" / (p.name[: -len(".cmd.json")] + ".ack.json")).exists()] if inbox.is_dir() else []
    ctx.say(f"inbox: {len(waiting)} command(s) with no ack yet" if waiting else "inbox: no commands waiting")
    if kind == "none":
        ctx.say("start it: player_ctl.py launch")
        return EXIT_NOT_RUNNING
    return EXIT_FOREIGN if kind == "foreign" else EXIT_OK


def cmd_launch(ctx: Ctx, ns) -> int:
    kind, procs = ctx.running()
    bundle = installed_version(ctx.app)
    if kind == "foreign":
        ctx.warn(_foreign_message(ctx, procs))
        return EXIT_FOREIGN
    if kind == "ours":
        pid, exe = procs[0]
        ctx.say(f"Mark Player already running — pid {pid}, {exe}, bundle version {bundle or 'unknown'}. Nothing started.")
        return EXIT_OK
    if not Path(ctx.app).is_dir():
        ctx.warn(f"player_ctl: Mark Player.app not found at {ctx.app}. Install it, or point MARK_PLAYER_APP / --app at the bundle.")
        return EXIT_LAUNCH_FAILED
    try:
        ctx.deps.launch(ctx.app)
    except (OSError, subprocess.CalledProcessError) as exc:
        ctx.warn(f"player_ctl: could not start {ctx.app}: {exc}")
        return EXIT_LAUNCH_FAILED
    wait = ctx.timeout
    deadline = time.monotonic() + wait
    pid = None
    while True:
        k, p = ctx.running()
        if k == "ours":
            pid = p[0][0]
            break
        if time.monotonic() >= deadline:
            ctx.warn(f"player_ctl: asked the system to open {ctx.app}, but the player process did not appear within {wait:g}s.")
            return EXIT_LAUNCH_FAILED
        ctx.deps.sleep(0.25)
    # first command of a fresh app: pause is harmless when nothing plays yet
    code, ack = _send_quiet(ctx, "pause", {}, wait)
    if ack is None:
        ctx.warn(f"player_ctl: Mark Player was started (pid {pid}), but it never acked the first command: no ack — the queue is not being read.")
        return EXIT_NO_ACK
    answered = ack.get("player_version")
    ctx.say(f"Mark Player started — pid {pid}; answered player_version {answered or 'unknown (older than 0.26.7)'}, bundle version {bundle or 'unknown'}.")
    if answered and bundle and answered != bundle:
        ctx.say(f"WARNING: the running build {answered} differs from the installed bundle {bundle}. Ask the operator to restart the player.")
    return EXIT_OK if code == EXIT_OK else code


def _send_quiet(ctx: Ctx, verb: str, args: dict, wait: float):
    """Like _send, but only prints on failure (launch prints its own summary)."""
    cmd = build_command(verb, args, ctx.by, wait + 5)
    write_command(ctx.data, cmd)
    ack = wait_ack(ctx.data, cmd["id"], wait, ctx.deps.sleep)
    if ack is None:
        return EXIT_NO_ACK, None
    if ack.get("status") != "done":
        err = ack.get("error") or {}
        ctx.warn(f"player_ctl: {verb} -> {ack.get('status')}: {err.get('code', '?')} — {err.get('message', '')}")
        return EXIT_ACK_ERROR, ack
    return EXIT_OK, ack


def cmd_seek(ctx: Ctx, ns) -> int:
    t = _num(ctx, ns.t_sec, "t_sec")
    if t is None:
        return EXIT_USAGE
    return _gated(ctx, "seek", {"t_sec": t})


def cmd_pause(ctx: Ctx, ns) -> int:
    args: dict = {}
    if ns.t_sec is not None:
        t = _num(ctx, ns.t_sec, "t_sec")
        if t is None:
            return EXIT_USAGE
        args["t_sec"] = t
    return _gated(ctx, "pause", args)


def cmd_next(ctx: Ctx, ns) -> int:
    return _gated(ctx, "next", {})


def cmd_open_file(ctx: Ctx, ns) -> int:
    path = _abs_file(ctx, ns.path)
    if path is None:
        return EXIT_USAGE
    return _gated(ctx, "open_file", {"path": path})


def cmd_open_playlist(ctx: Ctx, ns) -> int:
    if bool(ns.path) == bool(ns.inline):
        ctx.warn("player_ctl: open_playlist needs exactly one of: a playlist PATH, or --inline FILE.json (name + entries[]).")
        return EXIT_USAGE
    if ns.inline:
        src = _abs_file(ctx, ns.inline)
        if src is None:
            return EXIT_USAGE
        try:
            args = json.loads(Path(src).read_text(encoding="utf-8"))
        except ValueError as exc:
            ctx.warn(f"player_ctl: {src} is not valid JSON: {exc}")
            return EXIT_USAGE
        if not isinstance(args, dict) or not isinstance(args.get("entries"), list) or not args["entries"]:
            ctx.warn(f"player_ctl: {src} must be an object with a non-empty entries[] (see AGENT_DATA_MANIFEST §5.5).")
            return EXIT_USAGE
        args.setdefault("by", ctx.by)
    else:
        path = _abs_file(ctx, ns.path)
        if path is None:
            return EXIT_USAGE
        args = {"path": path}
    return _gated(ctx, "open_playlist", args)


def cmd_play_range(ctx: Ctx, ns) -> int:
    t_in = _num(ctx, ns.in_sec, "in_sec")
    t_out = _num(ctx, ns.out_sec, "out_sec")
    if t_in is None or t_out is None:
        return EXIT_USAGE
    if t_out <= t_in:
        ctx.warn(f"player_ctl: play_range needs in_sec < out_sec, got {t_in:g} .. {t_out:g}. Nothing was queued.")
        return EXIT_USAGE
    path = None
    if ns.file:
        path = _abs_file(ctx, ns.file)
        if path is None:
            return EXIT_USAGE
    gate = _gate(ctx)
    if gate is not None:
        return gate
    if path:
        code, _ = _send(ctx, "open_file", {"path": path})
        if code != EXIT_OK:
            return code
        ctx.deps.sleep(ns.settle)  # let the new media become seekable before the window starts
    return _send(ctx, "play_range", {"in_sec": t_in, "out_sec": t_out})[0]


def _gated(ctx: Ctx, verb: str, args: dict) -> int:
    gate = _gate(ctx)
    if gate is not None:
        return gate
    return _send(ctx, verb, args)[0]


def cmd_read_answers(ctx: Ctx, ns) -> int:
    if ns.playlist:
        base = os.path.abspath(os.path.expanduser(ns.playlist))
        candidates = [Path(base if base.endswith(".answers.json") else base + ".answers.json")]
    else:
        candidates = [
            ctx.data / "ack" / f"{ns.cmd}.answers.json",
            ctx.data / "playlists" / f"queue_{ns.cmd}.playlist.json.answers.json",
        ]
    found = next((c for c in candidates if c.is_file()), None)
    if found is None:
        where = ", ".join(str(c) for c in candidates)
        ctx.warn(f"player_ctl: no answers file yet (looked at: {where}). The operator has not answered or sent anything, or the playlist was never opened.")
        return EXIT_NO_ANSWERS
    try:
        doc = json.loads(found.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        ctx.warn(f"player_ctl: cannot read {found}: {exc}")
        return EXIT_NO_ANSWERS
    asked = doc.get("question_ids") or []
    done = doc.get("answered_question_ids") or []
    pending = doc.get("pending_question_ids") or []
    ctx.say(f"answers file: {found}")
    ctx.say(f"complete: {'yes' if doc.get('complete') else 'no'}")
    ctx.say(f"answered {len(done)} of {len(asked)} question(s)")
    if pending:
        ctx.say("pending: " + ", ".join(str(q) for q in pending))
    if doc.get("sent_by"):
        ctx.say(f"sent_by: {doc['sent_by']}")
    if doc.get("updated_at"):
        ctx.say(f"updated_at: {doc['updated_at']}")
    ctx.say(json.dumps(doc, ensure_ascii=False, indent=2))
    return EXIT_OK


# --------------------------------------------------------------------------- CLI

EPILOG = """\
exit codes:
  0 ok | 2 bad arguments (nothing queued) | 3 player answered error/expired
  4 player not running (nothing queued) | 5 another copy of the player runs
  6 no ack within the timeout | 7 could not start the app | 8 no answers file yet

Without a running player a verb is refused instead of queued silently: run `launch` first.
`launch` starts /Applications/Mark Player.app (or $MARK_PLAYER_APP), waits for the first
ack and says whether it started it or it was already up, and which player_version answered.
"""


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="player_ctl.py",
        description="Drive Mark Player from an agent: launch, open, seek, play a range, read the operator's answers.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    # The same options are accepted before AND after the verb: a cold agent writes
    # `play_range --by Beta 10 14` as often as `--by Beta play_range 10 14`.
    # SUPPRESS keeps the verb-level copy from overwriting a value given before it.
    def add_common(parser: argparse.ArgumentParser, suppress: bool) -> None:
        dflt = {"default": argparse.SUPPRESS} if suppress else {}
        parser.add_argument("--by", help="who is asking (your role), e.g. Beta; goes into author/by", **dflt)
        parser.add_argument("--timeout", type=float, help=f"seconds to wait for the ack (default {DEFAULT_TIMEOUT:g}; launch {LAUNCH_TIMEOUT:g})", **dflt)
        parser.add_argument("--app", help=f"path to Mark Player.app (default $MARK_PLAYER_APP or {DEFAULT_APP})", **dflt)
        parser.add_argument("--data-dir", dest="data_dir", help="player app data dir (default: ~/Library/Application Support/ai.vetka.playerlab, or $MARK_PLAYER_DATA_DIR)", **dflt)

    add_common(p, suppress=False)
    sub = p.add_subparsers(dest="verb", required=True, metavar="verb")

    def verb(name: str, help_text: str) -> argparse.ArgumentParser:
        sp = sub.add_parser(name, help=help_text)
        add_common(sp, suppress=True)
        return sp

    verb("launch", "start the player if it is not running; say what happened").set_defaults(fn=cmd_launch)
    verb("status", "running? which copy? installed version, inbox backlog (read-only)").set_defaults(fn=cmd_status)

    s = verb("open_file", "open a media file")
    s.add_argument("path")
    s.set_defaults(fn=cmd_open_file)

    s = verb("open_playlist", "open a playlist file, or an inline question playlist")
    s.add_argument("path", nargs="?")
    s.add_argument("--inline", metavar="FILE.json", help='JSON object {"name", "entries": [...]} (AGENT_DATA_MANIFEST §5.5)')
    s.set_defaults(fn=cmd_open_playlist)

    s = verb("seek", "move the playhead")
    s.add_argument("t_sec")
    s.set_defaults(fn=cmd_seek)

    s = verb("play_range", "play IN..OUT of the open file (with --file: open it first)")
    s.add_argument("in_sec")
    s.add_argument("out_sec")
    s.add_argument("--file", help="media file to open before playing")
    s.add_argument("--settle", type=float, default=SETTLE_SEC, help="seconds to wait after open_file before the window starts")
    s.set_defaults(fn=cmd_play_range)

    s = verb("pause", "pause (at t_sec if given)")
    s.add_argument("t_sec", nargs="?")
    s.set_defaults(fn=cmd_pause)

    verb("next", "next playlist entry").set_defaults(fn=cmd_next)

    s = verb("read_answers", "the operator's answers to a question playlist")
    grp = s.add_mutually_exclusive_group(required=True)
    grp.add_argument("--cmd", help="id of the open_playlist command (printed by open_playlist)")
    grp.add_argument("--playlist", help="path of the playlist file; reads <playlist>.answers.json")
    s.set_defaults(fn=cmd_read_answers)
    return p


def main(argv=None, deps: Deps | None = None) -> int:
    deps = deps or Deps()
    try:
        ns = build_parser().parse_args(argv)
    except SystemExit as exc:  # argparse prints its own message
        return int(exc.code) if isinstance(exc.code, int) else EXIT_USAGE
    if ns.timeout is None:
        ns.timeout = LAUNCH_TIMEOUT if ns.verb == "launch" else DEFAULT_TIMEOUT
    return ns.fn(Ctx(ns, deps), ns)


if __name__ == "__main__":
    sys.exit(main())
