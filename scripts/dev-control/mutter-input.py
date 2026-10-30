#!/usr/bin/env python3
"""Same-user GNOME guest input over Mutter D-Bus; no host cursor or uinput access."""
import fcntl
import json
import math
import os
from pathlib import Path
import sys
import time

RD = "org.gnome.Mutter.RemoteDesktop"
SC = "org.gnome.Mutter.ScreenCast"
BUTTONS = {"left": 272, "right": 273, "middle": 274}
KEYS = {"Escape": 0xFF1B, "Return": 0xFF0D, "Tab": 0xFF09, "space": 0x20,
        "Left": 0xFF51, "Up": 0xFF52, "Right": 0xFF53, "Down": 0xFF54}


def number(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be a finite number in [{low}, {high}]")
    return value


def validate(request, size=None):
    if not isinstance(request, dict) or set(request) - {"monitor", "actions", "screenshot"}:
        raise ValueError("Expected monitor, actions and optional screenshot")
    if not isinstance(request.get("monitor", ""), str):
        raise ValueError("monitor must be an output name")
    actions = request.get("actions", [])
    if not isinstance(actions, list) or len(actions) > 64:
        raise ValueError("actions must contain at most 64 operations")
    allowed = {"move": {"x", "y"}, "click": {"x", "y", "button"},
               "drag": {"x", "y", "toX", "toY"}, "scroll": {"dx", "dy"}, "key": {"key"}}
    for action in actions:
        if not isinstance(action, dict) or action.get("op") not in allowed:
            raise ValueError("Unknown input operation")
        op = action["op"]
        if set(action) - (allowed[op] | {"op"}):
            raise ValueError(f"Unexpected fields in {op}")
        for x, y in [("x", "y"), ("toX", "toY")] if op == "drag" else [("x", "y")] if op in ("move", "click") else []:
            number(action.get(x), x, 0, size[0] - 1 if size else 100000)
            number(action.get(y), y, 0, size[1] - 1 if size else 100000)
        if op == "click" and action.get("button", "left") not in BUTTONS:
            raise ValueError("button must be left, right or middle")
        if op == "scroll":
            number(action.get("dx", 0), "dx", -5000, 5000)
            number(action.get("dy", 0), "dy", -5000, 5000)
        if op == "key" and action.get("key") not in KEYS:
            raise ValueError("Unsupported key; use Escape/Return/Tab/space or arrows")
    screenshot = request.get("screenshot")
    if screenshot is not None:
        if not isinstance(screenshot, str) or not Path(screenshot).is_absolute() or Path(screenshot).suffix.lower() != ".png":
            raise ValueError("screenshot must be an absolute PNG path")
        if Path(screenshot).exists() or not Path(screenshot).parent.is_dir():
            raise ValueError("screenshot must be a new file in an existing directory")
    return actions


class InputFailure(RuntimeError):
    def __init__(self, message, completed):
        super().__init__(message)
        self.completed = completed


def execute(request):
    actions = validate(request)
    runtime = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}"))
    if not runtime.is_dir() or runtime.stat().st_uid != os.getuid():
        raise RuntimeError("Log in to the guest GNOME desktop as the SSH user first")
    # Serialize native desktop batches, including failure cleanup.
    fd = os.open(runtime / "aio-mutter-input.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        os.environ.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path={runtime}/bus")
        import gi
        from gi.repository import Gio, GLib
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        def call(dest, path, interface, method, signature=None, args=()):
            result = bus.call_sync(dest, path, interface, method,
                                   GLib.Variant(signature, args) if signature else None,
                                   None, Gio.DBusCallFlags.NONE, 3000, None)
            return result.unpack()

        session = call(RD, "/org/gnome/Mutter/RemoteDesktop", RD, "CreateSession")[0]
        screen_session = None
        subscription = None
        pressed = set()
        completed = 0

        def notify(method, signature, args):
            return call(RD, session, RD + ".Session", method, signature, args)

        def move(x, y):
            notify("NotifyPointerMotionAbsolute", "(sdd)", (stream, float(x), float(y)))

        def press(kind, code):
            method, signature = ("NotifyPointerButton", "(ib)") if kind == "button" else ("NotifyKeyboardKeysym", "(ub)")
            pressed.add((method, signature, code))
            notify(method, signature, (code, True))
            time.sleep(0.04)
            notify(method, signature, (code, False))
            pressed.remove((method, signature, code))

        try:
            sid = call(RD, session, "org.freedesktop.DBus.Properties", "Get", "(ss)", (RD + ".Session", "SessionId"))[0]
            screen_session = call(SC, "/org/gnome/Mutter/ScreenCast", SC, "CreateSession", "(a{sv})",
                                  ({"remote-desktop-session-id": GLib.Variant("s", sid)},))[0]
            stream = call(SC, screen_session, SC + ".Session", "RecordMonitor", "(sa{sv})",
                          (request.get("monitor", ""), {}))[0]
            params = call(SC, stream, "org.freedesktop.DBus.Properties", "Get", "(ss)", (SC + ".Stream", "Parameters"))[0]
            # Validate the entire batch against the actual monitor before sending input.
            validate(request, params["size"])
            node = []
            if request.get("screenshot"):
                subscription = bus.signal_subscribe(SC, SC + ".Stream", "PipeWireStreamAdded", stream, None,
                                                    Gio.DBusSignalFlags.NONE,
                                                    lambda *args: node.append(args[5].unpack()[0]), None)
            call(RD, session, RD + ".Session", "Start")
            for action in actions:
                op = action["op"]
                if op in ("move", "click", "drag"):
                    move(action["x"], action["y"])
                    time.sleep(0.06)
                if op == "click":
                    press("button", BUTTONS[action.get("button", "left")])
                elif op == "key":
                    press("key", KEYS[action["key"]])
                elif op == "scroll":
                    notify("NotifyPointerAxis", "(ddu)", (float(action.get("dx", 0)), float(action.get("dy", 0)), 1))
                elif op == "drag":
                    code = BUTTONS["left"]
                    pressed.add(("NotifyPointerButton", "(ib)", code))
                    notify("NotifyPointerButton", "(ib)", (code, True))
                    for i in range(1, 13):
                        move(action["x"] + (action["toX"] - action["x"]) * i / 12,
                             action["y"] + (action["toY"] - action["y"]) * i / 12)
                        time.sleep(0.02)
                    notify("NotifyPointerButton", "(ib)", (code, False))
                    pressed.remove(("NotifyPointerButton", "(ib)", code))
                completed += 1
                time.sleep(0.06)
            if request.get("screenshot"):
                gi.require_version("Gst", "1.0")
                from gi.repository import Gst
                context = GLib.MainContext.default()
                deadline = time.monotonic() + 5
                while not node and time.monotonic() < deadline:
                    while context.pending():
                        context.iteration(False)
                    time.sleep(0.01)
                if not node:
                    raise RuntimeError("Mutter did not provide a PipeWire stream")
                Gst.init(None)
                pipeline = Gst.parse_launch("pipewiresrc name=capture num-buffers=1 ! videoconvert ! pngenc ! fdsink name=output")
                pipeline.get_by_name("capture").set_property("path", str(node[0]))
                with open(request["screenshot"], "xb") as output:
                    pipeline.get_by_name("output").set_property("fd", output.fileno())
                    try:
                        pipeline.set_state(Gst.State.PLAYING)
                        message = pipeline.get_bus().timed_pop_filtered(5 * Gst.SECOND, Gst.MessageType.EOS | Gst.MessageType.ERROR)
                        if not message:
                            raise RuntimeError("Guest screenshot timed out")
                        if message.type == Gst.MessageType.ERROR:
                            raise RuntimeError(str(message.parse_error()[0]))
                    finally:
                        pipeline.set_state(Gst.State.NULL)
            return {"ok": True, "inputBackend": "mutter", "completed": completed,
                    "monitor": params, "path": request.get("screenshot")}
        except Exception as error:
            raise InputFailure(str(error), completed) from error
        finally:
            for method, signature, code in pressed:
                try:
                    notify(method, signature, (code, False))
                except Exception:
                    pass  # Session Stop also releases virtual devices.
            if subscription is not None:
                bus.signal_unsubscribe(subscription)
            # RemoteDesktop owns the associated ScreenCast session after Start.
            # Explicit ScreenCast Stop also covers failures before Start.
            for dest, path, interface in [(RD, session, RD + ".Session"), (SC, screen_session, SC + ".Session")]:
                if path:
                    try:
                        call(dest, path, interface, "Stop")
                    except GLib.Error:
                        pass  # It may already have been closed with its owner.


def main():
    try:
        if sys.argv[1:] != ["--stdin"]:
            raise ValueError("Use --stdin with a JSON batch; see docs/guide/ubuntu-vm-compatibility.md")
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("Input exceeds 64 KiB")
        result = execute(json.loads(raw))
    except Exception as error:
        result = {"ok": False, "error": {"code": "GUEST_INPUT_FAILED", "message": str(error),
                  "hint": "Observe the guest before retrying: earlier actions may have completed.",
                  "details": {"completed": getattr(error, "completed", 0)}}}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())