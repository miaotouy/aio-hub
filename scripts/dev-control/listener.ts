import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ControlError } from "./errors";

export function assertLoopbackListeners(addresses: string[]) {
  if (!addresses.length)
    throw new ControlError("LISTENER_NOT_READY", "控制端口尚未监听。");
  if (addresses.some((address) => address !== "127.0.0.1" && address !== "::1"))
    throw new ControlError(
      "UNSAFE_LISTENER",
      "调试端口出现对外监听地址，请停止该实例。"
    );
}
export async function verifyLocalListener(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ControlError("INVALID_INSTANCE", "控制端口无效。");
  if (process.platform === "win32") {
    const { stdout } = await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-NetTCPConnection -State Listen -LocalPort " +
          port +
          " -ErrorAction Stop | Select-Object -ExpandProperty LocalAddress | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 10000 }
    );
    assertLoopbackListeners([JSON.parse(stdout.trim())].flat());
  } else {
    const { stdout } = await promisify(execFile)(
      "ss",
      ["-H", "-ltn", "sport = :" + port],
      { timeout: 5000 }
    );
    assertLoopbackListeners(
      stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) =>
          line
            .trim()
            .split(/\s+/)[3]
            .replace(/:\d+$/, "")
            .replace(/^\[|\]$/g, "")
        )
    );
  }
}
