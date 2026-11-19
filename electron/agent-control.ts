import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  CONTROL_VERSION,
  CONTROL_EVENT,
  MAX_REQUEST_BYTES,
  MAX_REPLY_BYTES,
  controlFailure,
  type ControlManifest,
  type ControlRequest,
  type ControlReply,
  type ControlStatus,
  type ControlDelivery,
} from "../src/services/agent-control/protocol";

interface Pending {
  window: string;
  resolve: (reply: ControlReply) => void;
}
interface ControlHost {
  windows(): string[];
  deliver(window: string, event: string, payload: unknown): boolean;
  status(status: ControlStatus): void;
}
/** Packaged and development hosts use this same opt-in local socket, independent of CDP. */
export class AgentControl {
  private server?: net.Server;
  private manifest?: ControlManifest;
  private sockets = new Set<net.Socket>();
  private pending = new Map<string, Pending>();
  private readyWindows = new Set<string>();
  private changing = false;
  private enabled = false;
  private inFlight = false;
  private readonly discoveryDir: string;
  constructor(
    private dataDir: string,
    private host: ControlHost,
    discoveryDir = path.join(os.homedir(), ".aiohub", "control")
  ) {
    this.discoveryDir = discoveryDir;
  }
  private get settingsPath() {
    return path.join(this.dataDir, "control-settings.json");
  }
  private get manifestPath() {
    return path.join(this.dataDir, "control.json");
  }
  private get discoveryPath() {
    return path.join(this.discoveryDir, `${process.pid}.json`);
  }
  status(): ControlStatus {
    return {
      enabled: this.enabled,
      connected:
        this.enabled &&
        this.host.windows().some((w) => this.readyWindows.has(w)),
      pid: process.pid,
      host: "electron",
    };
  }
  ready(window: string) {
    this.readyWindows.add(window);
    return this.status();
  }
  reply(window: string, id: string, reply: ControlReply) {
    const pending = this.pending.get(id);
    if (pending?.window === window) {
      this.pending.delete(id);
      pending.resolve(reply);
    }
  }
  async initialize() {
    let enabled = false;
    try {
      enabled =
        JSON.parse(await fs.readFile(this.settingsPath, "utf8")).enabled ===
        true;
    } catch {
      /* opt-in only */
    }
    if (enabled) await this.start();
  }
  async configure(enabled: boolean) {
    if (this.changing) throw new Error("调试接管正在切换，请稍后重试。");
    this.changing = true;
    try {
      if (enabled) await this.start();
      else await this.stop();
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(this.settingsPath, JSON.stringify({ enabled }), {
        mode: 0o600,
      });
      return this.status();
    } catch (error) {
      if (enabled) await this.stop();
      throw error;
    } finally {
      this.changing = false;
      this.host.status(this.status());
    }
  }
  private async start() {
    if (this.server) return;
    await fs.mkdir(this.discoveryDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await fs.chmod(this.discoveryDir, 0o700);
    await fs.mkdir(this.dataDir, { recursive: true });
    const session = randomUUID();
    const manifest: ControlManifest = {
      protocolVersion: CONTROL_VERSION,
      pid: process.pid,
      host: "electron",
      endpoint:
        process.platform === "win32"
          ? `\\\\.\\pipe\\aiohub-control-${process.pid}-${session}`
          : path.join(this.discoveryDir, `${process.pid}-${session}.sock`),
      token: randomUUID(),
      dataDir: this.dataDir,
    };
    const server = net.createServer((socket) =>
      this.accept(socket, manifest.token)
    );
    server.maxConnections = 16;
    this.server = server;
    this.manifest = manifest;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(manifest.endpoint, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      server.on("error", () => {
        void this.stop().then(() => this.host.status(this.status()));
      });
      if (process.platform !== "win32")
        await fs.chmod(manifest.endpoint, 0o600);
      const text = JSON.stringify(manifest);
      await fs.writeFile(this.manifestPath, text, { mode: 0o600 });
      await fs.writeFile(this.discoveryPath, text, { mode: 0o600 });
      this.enabled = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  private accept(socket: net.Socket, token: string) {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => {});
    socket.setTimeout(17000, () => socket.destroy());
    let data = Buffer.alloc(0);
    let consumed = false;
    socket.on("data", (chunk) => {
      if (consumed) return;
      data = Buffer.concat([data, chunk]);
      if (data.length > MAX_REQUEST_BYTES) {
        consumed = true;
        socket.end(
          JSON.stringify(
            controlFailure("REQUEST_TOO_LARGE", "指令超过容量限制。")
          ) + "\n"
        );
        return;
      }
      const newline = data.indexOf(10);
      if (newline < 0) return;
      consumed = true;
      void (async () => {
        let reply: ControlReply;
        try {
          const request = JSON.parse(
            data.subarray(0, newline).toString("utf8")
          ) as ControlRequest;
          reply = await this.dispatch(request, token);
        } catch {
          reply = controlFailure("INVALID_REQUEST", "指令格式无效。");
        }
        let text: string;
        try {
          text = JSON.stringify(reply);
        } catch {
          text = JSON.stringify(
            controlFailure("INVALID_REPLY", "回复无法序列化。")
          );
        }
        if (Buffer.byteLength(text) > MAX_REPLY_BYTES)
          text = JSON.stringify(
            controlFailure(
              "REPLY_TOO_LARGE",
              "回复超过容量限制，请缩小观察范围。"
            )
          );
        if (!socket.destroyed) socket.end(text + "\n");
      })();
    });
  }
  private async dispatch(
    request: ControlRequest,
    token: string
  ): Promise<ControlReply> {
    if (!this.enabled || request.token !== token)
      return controlFailure(
        "CONTROL_UNAVAILABLE",
        "调试接管已关闭或连接信息已过期。"
      );
    if (!request.command || typeof request.command.op !== "string")
      return controlFailure("INVALID_REQUEST", "缺少 command.op。");
    if (request.command.op === "windows")
      return {
        ok: true,
        result: this.host
          .windows()
          .map((label) => ({ label, ready: this.readyWindows.has(label) })),
      };
    const window = request.window || "main";
    if (!this.host.windows().includes(window) || !this.readyWindows.has(window))
      return controlFailure(
        "WINDOW_NOT_READY",
        "目标窗口尚未就绪，请使用 windows 查看窗口。"
      );
    if (this.inFlight)
      return controlFailure("CONTROL_BUSY", "上一条指令仍在执行，请稍后重试。");
    this.inFlight = true;
    const id = randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<ControlReply>((resolve) => {
        this.pending.set(id, { window, resolve });
        timer = setTimeout(() => {
          this.pending.delete(id);
          resolve(
            controlFailure(
              "COMMAND_TIMEOUT",
              "指令超时；请先观察当前状态，避免重复执行。"
            )
          );
        }, 15000);
        const delivery: ControlDelivery = {
          id,
          command: request.command,
          expiresAt: Date.now() + 14500,
        };
        if (!this.host.deliver(window, CONTROL_EVENT, delivery)) {
          this.pending.delete(id);
          resolve(controlFailure("WINDOW_NOT_READY", "目标窗口已关闭。"));
        }
      });
    } finally {
      if (timer) clearTimeout(timer);
      this.pending.delete(id);
      this.inFlight = false;
    }
  }
  async stop() {
    this.enabled = false;
    for (const pending of this.pending.values())
      pending.resolve(controlFailure("CONTROL_DISABLED", "调试接管已关闭。"));
    this.pending.clear();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = undefined;
    if (server?.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (this.manifest) {
      await fs.rm(this.discoveryPath, { force: true });
      // Another process may share a data directory; only remove our descriptor.
      try {
        if (
          JSON.parse(await fs.readFile(this.manifestPath, "utf8")).token ===
          this.manifest.token
        )
          await fs.rm(this.manifestPath, { force: true });
      } catch {
        /* already gone */
      }
      if (process.platform !== "win32")
        await fs.rm(this.manifest.endpoint, { force: true });
      this.manifest = undefined;
    }
  }
}
