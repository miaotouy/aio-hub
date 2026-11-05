import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { ControlError } from "./errors";
import { INSTANCE_ID_PATTERN, STARTUP_ID_PATTERN } from "./protocol";

export const WORKSPACE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const CONTROL_ROOT = path.join(
  WORKSPACE_ROOT,
  ".dev-data",
  "dev-control"
);
export interface DevInstance {
  protocolVersion: 1;
  instanceId: string;
  startupId: string;
  launcherPid: number;
  launcherStartTicks?: string;
  appPid?: number;
  startedAt: string;
  endpoint: string;
  frontendUrl: string;
  transport?: "cdp" | "embedded-webdriver";
  frontendMode: "hmr" | "static" | "bundled-debug";
  dataDir: string;
  status: "starting" | "ready" | "failed";
  error?: string;
}

export function linuxProcessStartTicks(pid: number): string | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/)[19];
  } catch {
    return undefined;
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function instanceFile(id: string) {
  if (!INSTANCE_ID_PATTERN.test(id))
    throw new ControlError("INVALID_INSTANCE", "实例名称无效。");
  return path.join(CONTROL_ROOT, "instances", `${id}.json`);
}
export function validateInstance(value: unknown): DevInstance {
  const data = value as Partial<DevInstance> | null;
  if (
    !data ||
    data.protocolVersion !== 1 ||
    !INSTANCE_ID_PATTERN.test(data.instanceId ?? "") ||
    !STARTUP_ID_PATTERN.test(data.startupId ?? "") ||
    !Number.isInteger(data.launcherPid) ||
    Number(data.launcherPid) <= 0 ||
    !["starting", "ready", "failed"].includes(data.status ?? "")
  ) {
    throw new ControlError(
      "INVALID_INSTANCE",
      "实例描述无效，请重新启动开发实例。"
    );
  }
  if (
    typeof data.endpoint !== "string" ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(data.endpoint)
  )
    throw new ControlError(
      "INVALID_INSTANCE",
      "控制端点需要 loopback HTTP 地址。"
    );
  const port = Number(new URL(data.endpoint).port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ControlError("INVALID_INSTANCE", "控制端口无效。");
  if (
    typeof data.frontendUrl !== "string" ||
    !(
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(data.frontendUrl) ||
      (data.frontendMode === "bundled-debug" &&
        data.frontendUrl === "tauri://localhost")
    )
  )
    throw new ControlError("INVALID_INSTANCE", "前端地址无效。");
  if (
    data.transport !== undefined &&
    !["cdp", "embedded-webdriver"].includes(data.transport)
  )
    throw new ControlError("INVALID_INSTANCE", "未知控制传输类型。");
  if (!["hmr", "static", "bundled-debug"].includes(data.frontendMode ?? ""))
    throw new ControlError("INVALID_INSTANCE", "未知前端运行模式。");
  return data as DevInstance;
}
export function listInstances(): DevInstance[] {
  const dir = path.join(CONTROL_ROOT, "instances");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const item = validateInstance(
          JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
        );
        return processAlive(item.launcherPid) &&
          (!item.launcherStartTicks ||
            item.launcherStartTicks ===
              linuxProcessStartTicks(item.launcherPid))
          ? [item]
          : [];
      } catch {
        return [];
      }
    });
}
export function getInstance(id?: string): DevInstance {
  const instances = listInstances();
  const matches = id
    ? instances.filter((item) => item.instanceId === id)
    : instances;
  if (matches.length !== 1)
    throw new ControlError(
      matches.length ? "INSTANCE_AMBIGUOUS" : "INSTANCE_NOT_FOUND",
      matches.length ? "发现多个开发实例。" : "找不到正在运行的开发控制实例。",
      matches.length
        ? "使用 --instance 指定目标。"
        : "使用 bun run dev -- --agent 启动。",
      instances.map((item) => ({
        instanceId: item.instanceId,
        status: item.status,
      }))
    );
  const instance = matches[0];
  if (instance.status === "starting")
    throw new ControlError(
      "INSTANCE_STARTING",
      "开发控制正在启动并核验本机监听。",
      "等待启动终端提示控制就绪后再操作。"
    );
  if (instance.status === "failed")
    throw new ControlError(
      "INSTANCE_FAILED",
      instance.error ?? "开发控制启动失败。",
      "检查开发启动终端并重新启动实例。"
    );
  return instance;
}
export function publishInstance(instance: DevInstance): void {
  const file = instanceFile(instance.instanceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(instance, null, 2), "utf8");
  fs.renameSync(temp, file);
}
export function removeInstance(instance: DevInstance): void {
  const file = instanceFile(instance.instanceId);
  try {
    const current = JSON.parse(fs.readFileSync(file, "utf8")) as DevInstance;
    if (current.startupId === instance.startupId) fs.unlinkSync(file);
  } catch {
    /* Already removed. */
  }
}

/** Serialize stale-lock reclamation too, so two reclaimers cannot remove a new owner's lease. */
function acquireLease(file: string): () => void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const owner = { pid: process.pid, token: randomUUID() };
  const release = (target: string) => {
    try {
      const current = JSON.parse(
        fs.readFileSync(target, "utf8")
      ) as typeof owner;
      if (current.token === owner.token) fs.unlinkSync(target);
    } catch {
      /* Ownership already released. */
    }
  };
  const claim = () =>
    fs.writeFileSync(file, JSON.stringify(owner), {
      flag: "wx",
      encoding: "utf8",
    });
  try {
    claim();
    return () => release(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const reclaim = file + ".reclaim";
  let guarded = false;
  try {
    fs.writeFileSync(reclaim, JSON.stringify(owner), {
      flag: "wx",
      encoding: "utf8",
    });
    guarded = true;
    // Re-read under the reclaim guard; a prior reclaimer may have installed a live lease.
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as typeof owner;
    if (
      !Number.isInteger(existing.pid) ||
      existing.pid <= 0 ||
      processAlive(existing.pid)
    ) {
      throw new ControlError(
        "WINDOW_BUSY",
        "此窗口正在执行另一批操作。",
        "等待该批操作结束后再次调用。"
      );
    }
    fs.unlinkSync(file);
    claim();
    return () => release(file);
  } catch (error) {
    if (error instanceof ControlError) throw error;
    throw new ControlError(
      "WINDOW_BUSY",
      "控制锁正在使用或回收中。",
      "稍后重试；异常退出留下的回收锁可通过重新启动实例恢复。"
    );
  } finally {
    if (guarded) release(reclaim);
  }
}

export async function acquireWindowLock(
  instance: DevInstance,
  label: string
): Promise<() => void> {
  const labelKey = createHash("sha256")
    .update(label)
    .digest("hex")
    .slice(0, 24);
  return acquireLease(
    path.join(
      CONTROL_ROOT,
      "locks",
      instance.startupId + "-" + labelKey + ".json"
    )
  );
}
export function acquireInstanceLock(id: string): () => void {
  if (!INSTANCE_ID_PATTERN.test(id))
    throw new ControlError("INVALID_INSTANCE", "实例名称无效。");
  try {
    return acquireLease(
      path.join(CONTROL_ROOT, "locks", "instance-" + id + ".json")
    );
  } catch (error) {
    if (error instanceof ControlError)
      throw new ControlError(
        "INSTANCE_RUNNING",
        "此开发实例名称已被另一启动进程使用。",
        "使用 --agent-instance 指定另一个名称。"
      );
    throw error;
  }
}
