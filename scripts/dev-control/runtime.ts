import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadDevSettings, applyDevEnvironment } from "../dev-settings";
import { prepareDevControl } from "./launch";
import { prepareLinuxDesktop } from "./linux-environment";
import {
  CONTROL_ROOT,
  listInstances,
  linuxProcessStartTicks,
  processAlive,
} from "./discovery";
import { INSTANCE_ID_PATTERN } from "./protocol";
import { ControlError, errorResult } from "./errors";

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((v) => v !== "--"),
    allowPositionals: true,
    strict: true,
    options: {
      instance: { type: "string", default: "ubuntu-probe" },
      binary: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const command = positionals[0];
  if (values.help || !command)
    return {
      help: "bun run dev:control -- <start|serve|status|stop> --instance <name> [--binary <bundled debug binary>]",
    };
  if (process.platform !== "linux")
    throw new ControlError(
      "UNSUPPORTED_PLATFORM",
      "独立运行入口目前用于 Linux；Windows 使用 dev --agent。"
    );
  if (!INSTANCE_ID_PATTERN.test(values.instance!))
    throw new ControlError("INVALID_INSTANCE", "实例名称无效。");
  const existing = () =>
    listInstances().find((i) => i.instanceId === values.instance);
  if (command === "status") return { ok: true, instance: existing() ?? null };
  if (command === "stop") {
    const instance = existing();
    if (!instance) return { ok: true, stopped: false };
    if (
      !instance.launcherStartTicks ||
      instance.launcherStartTicks !==
        linuxProcessStartTicks(instance.launcherPid)
    )
      throw new ControlError(
        "IDENTITY_MISMATCH",
        "启动进程身份无法核对，已停止自动终止操作。"
      );
    process.kill(instance.launcherPid, "SIGTERM");
    const until = Date.now() + 10000;
    while (
      Date.now() < until &&
      processAlive(instance.launcherPid) &&
      linuxProcessStartTicks(instance.launcherPid) ===
        instance.launcherStartTicks
    )
      await Bun.sleep(100);
    if (existing())
      throw new ControlError("STOP_TIMEOUT", "实例尚未退出，请查看启动日志。");
    return { ok: true, stopped: true };
  }
  if (!["start", "serve"].includes(command) || positionals.length !== 1)
    throw new ControlError(
      "INVALID_REQUEST",
      "请使用 start、serve、status 或 stop。"
    );
  if (existing())
    throw new ControlError(
      "INSTANCE_RUNNING",
      "该实例已运行，请先查看 status。"
    );
  const binary = path.resolve(values.binary || "src-tauri/target/debug/aiohub");
  if (!fs.existsSync(binary))
    throw new ControlError(
      "BINARY_NOT_FOUND",
      "找不到 Debug 程序。",
      "先按开发控制指南构建生产资源 Debug 程序。"
    );
  if (command === "start") {
    const dir = path.join(CONTROL_ROOT, "launchers");
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, values.instance + "-" + Date.now() + ".log");
    const fd = fs.openSync(log, "a");
    const child = spawn(
      process.execPath,
      [
        "run",
        fileURLToPath(import.meta.url),
        "serve",
        "--instance",
        values.instance!,
        "--binary",
        binary,
      ],
      { detached: true, stdio: ["ignore", fd, fd], env: process.env }
    );
    fs.closeSync(fd);
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      const instance = existing();
      if (instance?.status === "ready") return { ok: true, instance, log };
      if (
        instance?.status === "failed" ||
        (child.pid && !processAlive(child.pid))
      )
        throw new ControlError(
          "STARTUP_FAILED",
          "独立实例启动失败。",
          "查看启动日志：" + log
        );
      await Bun.sleep(200);
    }
    throw new ControlError(
      "STARTUP_TIMEOUT",
      "实例仍在启动，请查看 status。",
      "启动日志：" + log
    );
  }
  prepareLinuxDesktop();
  process.env.AIO_ID_SUFFIX = values.instance;
  const settings = loadDevSettings({ agent: true });
  const control = await prepareDevControl(settings, false, true);
  applyDevEnvironment(settings);
  delete process.env.TAURI_DEV_URL;
  const child = spawn(binary, [], {
    detached: true,
    stdio: "inherit",
    env: process.env,
  });
  let stopping = false;
  let force: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    // Only this launcher's own process group is stopped.
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already exited. */
      }
      force = setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }, 5000);
    }
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  void control
    .waitUntilReady(() => console.error("[Control] ready " + values.instance))
    .catch((error) => {
      control.fail(error);
      console.error(errorResult(error));
      stop();
    });
  try {
    const exit = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? (stopping ? 0 : 1)));
    });
    if (!stopping && exit) process.exitCode = exit;
  } finally {
    if (force) clearTimeout(force);
    control.dispose();
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
  return { ok: true, stopped: true };
}
try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  console.log(
    JSON.stringify({ ok: false, error: errorResult(error) }, null, 2)
  );
  process.exitCode = 1;
}
