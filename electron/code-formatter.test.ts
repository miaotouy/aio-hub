// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { test, expect } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodeFormatter } from "./code-formatter";
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
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw Error("worker not ready");
}
async function setup(timeoutMs = 1000) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aio-formatter-test-"));
  const workers: Worker[] = [];
  const killed: number[] = [];
  const host = new CodeFormatter({
    root,
    timeoutMs,
    terminateTree: async (pid) => {
      killed.push(pid);
    },
    spawnWorker() {
      const w = new Worker();
      workers.push(w);
      return w;
    },
  });
  return {
    root,
    workers,
    host,
    killed,
    async close() {
      await host.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
const args = {
  language: "php",
  code: "<?php echo 1;",
  options: { tabWidth: 2 },
};
// Protects document ownership and bounded native work, independent of implementation structure.
test("refresh drops active and queued source; a peer completes with its own scratch directory", async () => {
  const t = await setup();
  try {
    const active = t.host
      .runCommand(1, "format_code", args)
      .catch((e) => e.message);
    const stale = t.host
      .runCommand(1, "format_code", args)
      .catch((e) => e.message);
    const peer = t.host.runCommand(2, "format_code", {
      ...args,
      code: "<?php echo 2;",
    });
    await poll(() => t.workers[0]?.messages.length === 1);
    const first = t.workers[0]!.messages[0];
    t.host.disposeOwner(1);
    expect(await active).toContain("页面关闭");
    expect(await stale).toContain("页面关闭");
    await poll(() => t.workers[1]?.messages.length === 1);
    expect(t.workers[0]!.messages).toHaveLength(1);
    expect(t.workers[1]!.messages[0].scratch).not.toBe(first.scratch);
    t.workers[1]!.reply("<?php\necho 2;\n");
    expect(await peer).toContain("echo 2");
    expect(await readdir(path.join(t.root, "code-formatter/jobs"))).toEqual([]);
  } finally {
    await t.close();
  }
});
test("hung native formatter is killed and retry starts a fresh worker", async () => {
  const t = await setup(20);
  try {
    await expect(t.host.runCommand(1, "format_code", args)).rejects.toThrow(
      "超时"
    );
    expect(t.workers[0]!.killed).toBe(true);
    const retry = t.host.runCommand(1, "code_formatter_status", {
      language: "rust",
    });
    await poll(() => t.workers[1]?.messages.length === 1);
    t.workers[1]!.reply({
      available: false,
      engine: "rustfmt",
      error: "install",
    });
    expect(await retry).toEqual({
      available: false,
      engine: "rustfmt",
      error: "install",
    });
  } finally {
    await t.close();
  }
});
test("bounds code bytes and accepted work; shutdown cleans queued jobs", async () => {
  const t = await setup();
  try {
    await expect(
      t.host.runCommand(1, "format_code", {
        ...args,
        code: "中".repeat(1500000),
      })
    ).rejects.toThrow("4 MiB");
    expect(t.workers).toHaveLength(0);
    const first = t.host
      .runCommand(1, "format_code", args)
      .catch((e) => e.message);
    const second = t.host
      .runCommand(1, "format_code", args)
      .catch((e) => e.message);
    await expect(t.host.runCommand(1, "format_code", args)).rejects.toThrow(
      "稍后重试"
    );
    await poll(() => t.workers[0]?.messages.length === 1);
    await t.host.shutdown();
    expect(await first).toContain("页面关闭");
    expect(await second).toContain("页面关闭");
    expect(t.workers[0]!.killed).toBe(true);
    expect(await readdir(path.join(t.root, "code-formatter/jobs"))).toEqual([]);
    await expect(t.host.runCommand(2, "format_code", args)).rejects.toThrow(
      "正在退出"
    );
  } finally {
    await t.close();
  }
});
