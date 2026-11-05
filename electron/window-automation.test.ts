import { test, expect } from "bun:test";
import { EventEmitter } from "node:events";
import { WindowAutomation } from "./window-automation";
class Worker extends EventEmitter {
  messages: any[] = [];
  killed = false;
  postMessage(message: any) {
    this.messages.push(message);
  }
  kill() {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", 0));
    return true;
  }
  reply(result: unknown, index = this.messages.length - 1) {
    this.emit("message", { id: this.messages[index].id, ok: true, result });
  }
}
async function poll(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await Bun.sleep(1);
  }
  throw Error("worker did not receive command");
}
function setup(timeoutMs = 1000) {
  const workers: Worker[] = [];
  const host = new WindowAutomation({
    platform: "win32",
    timeoutMs,
    spawnWorker() {
      const w = new Worker();
      workers.push(w);
      return w;
    },
  });
  return { host, workers };
}
// Public boundary: global focus mutations stay serialized and window/document work is isolated.
test("serializes input across owners; disposed queued documents never inject, other owners continue", async () => {
  const { host, workers } = setup();
  const first = host.runCommand(1, "wa_send_click");
  const stale = host.runCommand(1, "wa_send_keypress");
  const other = host.runCommand(2, "wa_get_client_rect");
  const staleResult = stale.catch((e) => e.message);
  const firstResult = first.catch((e) => e.message);
  await poll(() => workers[0]?.messages.length === 1);
  host.disposeOwner(1);
  expect(workers[0]!.killed).toBe(false);
  workers[0]!.reply({ mode: "background" });
  expect(await firstResult).toContain("页面关闭");
  expect(await staleResult).toContain("页面关闭");
  await poll(() => workers[0]?.messages.length === 2);
  expect(workers[0]!.messages[1].command).toBe("wa_get_client_rect");
  workers[0]!.reply({ width: 100, height: 80 });
  expect(await other).toEqual({ width: 100, height: 80 });
  await host.shutdown();
  expect(workers[0]!.killed).toBe(true);
});
test("times out a hung target, kills its process and accepts a fresh process on retry", async () => {
  const { host, workers } = setup(20);
  await expect(host.runCommand(1, "wa_capture_window")).rejects.toThrow(
    "响应超时"
  );
  expect(workers[0]!.killed).toBe(true);
  const next = host.runCommand(1, "wa_is_window_valid", { hwnd: 2 });
  await poll(() => workers[1]?.messages.length === 1);
  workers[0]!.emit("message", { id: "1", ok: true, result: true });
  workers[1]!.reply(false);
  expect(await next).toBe(false);
  await host.shutdown();
});
test("returns exact screenshot bytes as ArrayBuffer and identifies the owning application process", async () => {
  const { host, workers } = setup();
  const bytes = Buffer.from([137, 80, 78, 71, 0, 255]);
  const capture = host.runCommand(1, "wa_capture_window", { hwnd: 42 });
  await poll(() => workers[0]?.messages.length === 1);
  expect(workers[0]!.messages[0].selfPid).toBe(process.pid);
  workers[0]!.reply(bytes.toString("base64"));
  const result = await capture;
  expect(result).toBeInstanceOf(ArrayBuffer);
  expect(Buffer.from(result as ArrayBuffer)).toEqual(bytes);
  await host.shutdown();
});
test("refresh interrupts read-only work; new document can reuse its owner ID", async () => {
  const { host, workers } = setup();
  const old = host.runCommand(4, "wa_capture_window");
  const failed = old.catch((e) => e.message);
  await poll(() => workers[0]?.messages.length === 1);
  host.disposeOwner(4);
  expect(await failed).toContain("页面关闭");
  expect(workers[0]!.killed).toBe(true);
  const fresh = host.runCommand(4, "wa_get_windows");
  await poll(() => workers[1]?.messages.length === 1);
  workers[1]!.reply([]);
  expect(await fresh).toEqual([]);
  await host.shutdown();
  await expect(host.runCommand(4, "wa_get_windows")).rejects.toThrow(
    "正在退出"
  );
});
test("bounds accepted work without dropping another owner's operation", async () => {
  const { host, workers } = setup();
  const tasks = Array.from({ length: 8 }, () =>
    host.runCommand(1, "wa_get_windows").catch((e) => e.message)
  );
  await expect(host.runCommand(1, "wa_get_windows")).rejects.toThrow(
    "稍后重试"
  );
  await poll(() => workers[0]?.messages.length === 1);
  host.disposeOwner(1);
  await Promise.all(tasks);
  const other = host.runCommand(2, "wa_get_windows");
  await poll(() => workers[1]?.messages.length === 1);
  workers[1]!.reply([]);
  expect(await other).toEqual([]);
  await host.shutdown();
});

test("failed process cleanup stops already accepted queued actions", async () => {
  class StuckWorker extends Worker {
    override kill() {
      this.killed = true;
      return true;
    }
  }
  const worker = new StuckWorker();
  let created = 0;
  const host = new WindowAutomation({
    platform: "win32",
    timeoutMs: 10,
    spawnWorker() {
      created++;
      return worker;
    },
  });
  const first = host
    .runCommand(1, "wa_capture_window")
    .catch((error) => error.message);
  const queued = host
    .runCommand(2, "wa_send_keypress")
    .catch((error) => error.message);
  expect(await first).toContain("停止窗口自动化进程超时");
  expect(await queued).toContain("服务已停止");
  expect(created).toBe(1);
  expect(worker.messages).toHaveLength(1);
  worker.emit("exit", 0);
  await host.shutdown();
}, 10000);
