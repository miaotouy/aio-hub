import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  host?: "tauri" | "electron";
  instanceId: string;
  startupId: string;
  launcherPid: number;
  /** Linux /proc start ticks. Windows uses launcherStartedAtMs instead. */
  launcherStartTicks?: string;
  launcherStartedAtMs?: number;
  appPid?: number;
  startedAt: string;
  endpoint: string;
  frontendUrl: string;
  transport?: "cdp" | "embedded-webdriver";
  frontendMode: "hmr" | "static" | "bundled-debug" | "bundled-electron";
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

const WINDOWS_START_CACHE_MS = 3000;
const execFileAsync = promisify(execFile);
let windowsStartTimes: { at: number; times: Map<number, number> } | undefined;

function budget(deadline: number | undefined, maximum: number): number {
  const remaining = deadline === undefined ? maximum : deadline - Date.now();
  if (remaining <= 0)
    throw new ControlError(
      "COMMAND_TIMEOUT",
      "指令执行超时。",
      "先 observe 确认当前状态。"
    );
  return Math.min(remaining, maximum);
}

/** Cache completed snapshots; each query can be cancelled by its caller's deadline. */
async function readWindowsStartTimes(
  deadline?: number
): Promise<Map<number, number>> {
  budget(deadline, 10000);
  if (
    windowsStartTimes &&
    Date.now() - windowsStartTimes.at < WINDOWS_START_CACHE_MS
  )
    return windowsStartTimes.times;
  const times = new Map<number, number>();
  const signal = AbortSignal.timeout(budget(deadline, 10000));
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        'Get-Process -ErrorAction SilentlyContinue | ForEach-Object { try { "$($_.Id) $($_.StartTime.ToFileTimeUtc())" } catch { } }',
      ],
      { encoding: "utf8", windowsHide: true, signal }
    );
    for (const line of stdout.split(/\r?\n/)) {
      const [id, fileTime] = line.trim().split(/\s+/);
      const pid = Number(id),
        ticks = Number(fileTime);
      if (
        Number.isInteger(pid) &&
        pid > 0 &&
        Number.isFinite(ticks) &&
        ticks > 0
      )
        times.set(pid, Math.round(ticks / 10000 - 11644473600000));
    }
  } catch {
    budget(deadline, 10000);
    // An unavailable process snapshot must not authorize stealing a live lease.
    return times;
  }
  budget(deadline, 10000);
  windowsStartTimes = { at: Date.now(), times };
  return times;
}

/** Process start epoch milliseconds, available on Windows only. */
export async function processStartedAtMs(
  pid: number,
  deadline?: number
): Promise<number | undefined> {
  if (process.platform !== "win32") return undefined;
  return (await readWindowsStartTimes(deadline)).get(pid);
}

/** A descriptor is only credible while the recorded launcher process is the same one. */
export async function launcherIsCurrent(
  instance: DevInstance,
  deadline?: number
): Promise<boolean> {
  if (!processAlive(instance.launcherPid)) return false;
  if (instance.launcherStartTicks) {
    const current = linuxProcessStartTicks(instance.launcherPid);
    if (current !== undefined) return current === instance.launcherStartTicks;
  }
  const startedAtMs = await processStartedAtMs(instance.launcherPid, deadline);
  if (startedAtMs === undefined) return true;
  if (instance.launcherStartedAtMs !== undefined)
    return startedAtMs === instance.launcherStartedAtMs;
  const publishedAt = Date.parse(instance.startedAt);
  return !Number.isFinite(publishedAt) || startedAtMs <= publishedAt + 2;
}

/** The application endpoint can temporarily disappear during a Rust rebuild. */
export function probeEndpoint(
  instance: DevInstance,
  timeoutMs = 1500
): Promise<boolean> {
  const url = new URL(instance.endpoint);
  return new Promise((resolve) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port) });
    let settled = false;
    const finish = (alive: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
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
        data.frontendUrl === "tauri://localhost") ||
      (data.host === "electron" &&
        data.frontendMode === "bundled-electron" &&
        data.frontendUrl === "aiohub://app")
    )
  )
    throw new ControlError("INVALID_INSTANCE", "前端地址无效。");
  if (
    data.transport !== undefined &&
    !["cdp", "embedded-webdriver"].includes(data.transport)
  )
    throw new ControlError("INVALID_INSTANCE", "未知控制传输类型。");
  if (data.host !== undefined && !["tauri", "electron"].includes(data.host))
    throw new ControlError("INVALID_INSTANCE", "未知应用宿主。");
  if (data.host === "electron" && data.transport !== "cdp")
    throw new ControlError("INVALID_INSTANCE", "Electron 需要 CDP 控制传输。");
  if (
    !["hmr", "static", "bundled-debug", "bundled-electron"].includes(
      data.frontendMode ?? ""
    )
  )
    throw new ControlError("INVALID_INSTANCE", "未知前端运行模式。");
  return data as DevInstance;
}
function readInstances(id?: string): DevInstance[] {
  const dir = path.join(CONTROL_ROOT, "instances");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".json") && (id === undefined || name === id + ".json")
    )
    .flatMap((name) => {
      try {
        return [
          validateInstance(
            JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
          ),
        ];
      } catch {
        return [];
      }
    });
}
/** Live descriptor lookup without throwing, used when reserving an instance name. */
export async function findInstance(
  id: string,
  deadline?: number
): Promise<DevInstance | undefined> {
  return (await reclaimInstances(deadline, id))[0];
}

/** Only a finished launcher releases ownership; a rebuilding app retains its descriptor. */
async function reclaimInstances(
  deadline?: number,
  id?: string
): Promise<DevInstance[]> {
  budget(deadline, 1500);
  const candidates = readInstances(id);
  // Warm one snapshot before parallel checks to avoid spawning a query per instance.
  if (candidates.length) await processStartedAtMs(process.pid, deadline);
  const checked = await Promise.all(
    candidates.map(async (item) => {
      if (!(await launcherIsCurrent(item, deadline))) {
        pruneInstance(item);
        return undefined;
      }
      const reachable =
        item.status !== "ready" ||
        (await probeEndpoint(item, budget(deadline, 1500)));
      budget(deadline, 1500);
      // The launcher may have published a new state while the endpoint was being probed.
      const latest = readInstances(item.instanceId)[0];
      if (!latest || latest.startupId !== item.startupId) return undefined;
      return !reachable && latest.status === "ready"
        ? { ...latest, status: "starting" as const }
        : latest;
    })
  );
  return checked.filter((item): item is DevInstance => item !== undefined);
}

export async function liveInstances(deadline?: number): Promise<DevInstance[]> {
  return reclaimInstances(deadline);
}
export async function getInstance(
  id?: string,
  deadline?: number
): Promise<DevInstance> {
  const instances = await reclaimInstances(deadline, id);
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

function removeOwnedLock(file: string, launcherPid: number): void {
  try {
    const owner = JSON.parse(fs.readFileSync(file, "utf8")) as {
      pid?: number;
    };
    if (owner.pid === launcherPid) fs.rmSync(file, { force: true });
  } catch {
    /* Already removed. */
  }
}

/** Reclaim the descriptor and coordination locks left by a dead launcher. */
export function pruneInstance(instance: DevInstance): void {
  removeInstance(instance);
  const locks = path.join(CONTROL_ROOT, "locks");
  removeOwnedLock(
    path.join(locks, "instance-" + instance.instanceId + ".json"),
    instance.launcherPid
  );
  try {
    for (const name of fs.readdirSync(locks)) {
      if (!name.startsWith(instance.startupId)) continue;
      removeOwnedLock(path.join(locks, name), instance.launcherPid);
    }
  } catch {
    /* No locks directory. */
  }
}

/** A recycled PID must not inherit a finished owner's lease. */
async function leaseOwnerAlive(
  owner: { pid?: number; startedAtMs?: number; startTicks?: string },
  file: string,
  deadline?: number
): Promise<boolean> {
  if (!Number.isInteger(owner.pid) || (owner.pid ?? 0) <= 0) return false;
  if (!processAlive(owner.pid!)) return false;
  if (owner.startTicks) {
    const current = linuxProcessStartTicks(owner.pid!);
    if (current !== undefined) return current === owner.startTicks;
  }
  const current = await processStartedAtMs(owner.pid!, deadline);
  if (current === undefined) return true;
  if (owner.startedAtMs !== undefined) return current === owner.startedAtMs;
  // The owner must already have existed when the lease was claimed; a later
  // start time means the recorded PID was recycled.
  try {
    return current <= fs.statSync(file).mtimeMs + 2;
  } catch {
    return true;
  }
}

/** Serialize stale-lock reclamation too, so two reclaimers cannot remove a new owner's lease. */
async function acquireLease(
  file: string,
  deadline?: number
): Promise<() => void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const owner = {
    pid: process.pid,
    token: randomUUID(),
    startTicks: linuxProcessStartTicks(process.pid),
    startedAtMs: await processStartedAtMs(process.pid, deadline),
  };
  budget(deadline, 10000);
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
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as {
      pid?: number;
      startedAtMs?: number;
      startTicks?: string;
      token?: string;
    };
    if (await leaseOwnerAlive(existing, file, deadline)) {
      throw new ControlError(
        "WINDOW_BUSY",
        "此窗口正在执行另一批操作。",
        "等待该批操作结束后再次调用。"
      );
    }
    budget(deadline, 10000);
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
  label: string,
  deadline?: number
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
    ),
    deadline
  );
}
export async function acquireInstanceLock(id: string): Promise<() => void> {
  if (!INSTANCE_ID_PATTERN.test(id))
    throw new ControlError("INVALID_INSTANCE", "实例名称无效。");
  try {
    return await acquireLease(
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
