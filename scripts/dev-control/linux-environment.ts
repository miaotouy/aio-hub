import fs from "node:fs";
import path from "node:path";
import { ControlError } from "./errors";

/** Resolve the current user's desktop only; never read whole environment or credential files. */
export function prepareLinuxDesktop() {
  if (process.platform !== "linux") return;
  const uid = process.getuid?.();
  const runtime = process.env.XDG_RUNTIME_DIR || "/run/user/" + uid;
  if (!fs.existsSync(runtime) || fs.statSync(runtime).uid !== uid)
    throw new ControlError(
      "DESKTOP_UNAVAILABLE",
      "当前用户缺少桌面运行目录。",
      "先登录 Ubuntu 桌面，再通过 SSH 启动。"
    );
  const files = fs.readdirSync(runtime);
  const wayland =
    process.env.WAYLAND_DISPLAY ||
    files.find((name) => /^wayland-\d+$/.test(name));
  if (!wayland && !process.env.DISPLAY)
    throw new ControlError(
      "DESKTOP_UNAVAILABLE",
      "未发现可用的桌面会话。",
      "登录桌面或显式设置 DISPLAY。"
    );
  process.env.XDG_RUNTIME_DIR = runtime;
  if (wayland) process.env.WAYLAND_DISPLAY = wayland;
  if (fs.existsSync(path.join(runtime, "bus")))
    process.env.DBUS_SESSION_BUS_ADDRESS ??=
      "unix:path=" + path.join(runtime, "bus");
  if (!process.env.XAUTHORITY) {
    const auth = files.find((name) => name.startsWith(".mutter-Xwaylandauth."));
    if (auth) {
      process.env.XAUTHORITY = path.join(runtime, auth);
      process.env.DISPLAY ??= ":0";
    }
  }
}
