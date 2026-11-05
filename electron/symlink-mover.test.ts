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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SymlinkMover } from "./symlink-mover";
const log = (source = "source", success = 1) => ({
  timestamp: 1,
  operationType: "move",
  linkType: "link",
  sourceCount: 1,
  successCount: success,
  errorCount: 0,
  errors: [],
  warnings: [],
  durationMs: 1,
  targetDirectory: "target",
  sourcePaths: [source],
  totalSize: 13,
  processedFiles: success ? [source] : [],
});
class Runtime {
  finish!: (json: string) => void;
  fail!: (error: Error) => void;
  configuration = "";
  command = "";
  events: unknown[] = [];
  cancel = vi.fn();
  drainEvents = () => JSON.stringify(this.events.splice(0));
  operate(command: string, configuration: string) {
    this.command = command;
    this.configuration = configuration;
    return new Promise<string>((resolve, reject) => {
      this.finish = resolve;
      this.fail = reject;
    });
  }
}
let service: SymlinkMover,
  runtimes: Runtime[],
  emit: ReturnType<typeof vi.fn>,
  query: ReturnType<typeof vi.fn>;
const args = () => ({
  operationId: "owned",
  sourcePaths: ["source"],
  targetDir: "target",
  linkType: "link",
});
const complete = (runtime: Runtime, source = "source") =>
  runtime.finish(JSON.stringify({ message: "done", log: log(source) }));
beforeEach(() => {
  runtimes = [];
  emit = vi.fn();
  query = vi.fn(async () => JSON.stringify({ canExecute: true }));
  service = new SymlinkMover("app", {
    emit,
    loadAddon: () => ({
      SymlinkMoverRuntime: class extends Runtime {
        constructor() {
          super();
          runtimes.push(this);
        }
      },
      runSymlinkMoverQuery: query,
    }),
  });
});
afterEach(async () => {
  for (const runtime of runtimes) if (runtime.finish) complete(runtime);
  await service.shutdown();
});

describe("symlink mover ownership and task completion", () => {
  it("snapshots accepted options, rejects overlapping writes and isolates cancellation", async () => {
    const input = args();
    const pending = service.runCommand(1, "move_and_link", input);
    input.sourcePaths[0] = "changed";
    await vi.waitFor(() => expect(runtimes).toHaveLength(1));
    expect(JSON.parse(runtimes[0].configuration).sourcePaths).toEqual([
      "source",
    ]);
    await expect(
      service.runCommand(2, "create_links_only", args())
    ).rejects.toThrow("正在运行");
    await service.runCommand(2, "cancel_move_operation", {
      operationId: "owned",
    });
    await service.runCommand(1, "cancel_move_operation", {
      operationId: "old",
    });
    expect(runtimes[0].cancel).not.toHaveBeenCalled();
    let settled = false;
    const cancelling = service
      .runCommand(1, "cancel_move_operation", { operationId: "owned" })
      .then(() => {
        settled = true;
      });
    expect(runtimes[0].cancel).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(settled).toBe(false);
    complete(runtimes[0]);
    await pending;
    await cancelling;
    const next = service.runCommand(2, "create_links_only", args());
    await vi.waitFor(() => expect(runtimes).toHaveLength(2));
    complete(runtimes[1]);
    await next;
    expect(runtimes[1].command).toBe("create_links_only");
  });
  it("sends progress privately and silences a disposed owner while retaining its final history", async () => {
    const pending = service.runCommand(1, "move_and_link", args());
    await vi.waitFor(() => expect(runtimes).toHaveLength(1));
    runtimes[0].events.push({ copiedBytes: 1 });
    await vi.waitFor(() => expect(emit).toHaveBeenCalledOnce());
    expect(emit).toHaveBeenCalledWith(1, "copy-progress", {
      copiedBytes: 1,
      operationId: "owned",
    });
    service.disposeOwner(2);
    expect(runtimes[0].cancel).not.toHaveBeenCalled();
    service.disposeOwner(1);
    runtimes[0].events.push({ copiedBytes: 2 });
    complete(runtimes[0]);
    await pending;
    expect(runtimes[0].cancel).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    expect(await service.runCommand(2, "get_all_operation_logs")).toEqual([
      log(),
    ]);
  });
  it("honors owner cancellation before native startup", async () => {
    const pending = service.runCommand(1, "move_and_link", args());
    const rejected = expect(pending).rejects.toThrow("已被用户取消");
    await service.runCommand(1, "cancel_move_operation", {
      operationId: "owned",
    });
    await rejected;
    expect(runtimes).toHaveLength(0);
  });
  it("invalidates queries both before and after native dispatch", async () => {
    const first = service.runCommand(1, "preflight_symlink_operation", args());
    service.disposeOwner(1);
    await expect(first).rejects.toThrow("窗口关闭");
    expect(query).not.toHaveBeenCalled();
    let finish!: (value: string) => void;
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const next = service.runCommand(2, "validate_files_for_link", args());
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    service.disposeOwner(2);
    finish("[]");
    await expect(next).rejects.toThrow("窗口关闭");
    query.mockResolvedValueOnce("[]");
    expect(
      await service.runCommand(3, "validate_files_for_link", args())
    ).toEqual([]);
  });
  it("waits for accepted transactions on shutdown and rejects subsequent writes", async () => {
    const pending = service.runCommand(1, "move_and_link", args());
    await vi.waitFor(() => expect(runtimes).toHaveLength(1));
    let settled = false;
    const shutdown = service.shutdown().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(runtimes[0].cancel).toHaveBeenCalledOnce();
    expect(service.hasPendingOperations).toBe(true);
    expect(settled).toBe(false);
    await expect(
      service.runCommand(2, "create_links_only", args())
    ).rejects.toThrow("退出");
    complete(runtimes[0]);
    await pending;
    await shutdown;
    expect(service.hasPendingOperations).toBe(false);
  });
  it("keeps latest completion associated with its owner and caps shared history at 100", async () => {
    for (let n = 0; n < 102; n++) {
      const pending = service.runCommand(n ? 2 : 1, "move_and_link", args());
      await Promise.resolve();
      complete(runtimes[n], String(n));
      await pending;
    }
    expect(await service.runCommand(1, "get_latest_operation_log")).toEqual(
      log("0")
    );
    const history: any = await service.runCommand(3, "get_all_operation_logs");
    expect(history).toHaveLength(100);
    expect(history[0].sourcePaths).toEqual(["2"]);
    history[0].sourcePaths.push("mutated");
    expect(
      ((await service.runCommand(3, "get_all_operation_logs")) as any)[0]
        .sourcePaths
    ).toEqual(["2"]);
  });
  it("releases the task slot after native failure", async () => {
    const pending = service.runCommand(1, "move_and_link", args());
    const rejected = expect(pending).rejects.toThrow("preflight failed");
    await vi.waitFor(() => expect(runtimes).toHaveLength(1));
    runtimes[0].fail(Error("preflight failed"));
    await rejected;
    const next = service.runCommand(1, "move_and_link", args());
    await vi.waitFor(() => expect(runtimes).toHaveLength(2));
    complete(runtimes[1]);
    expect(await next).toBe("done");
  });
});
