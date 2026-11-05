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

import { describe, it, expect, vi } from "vitest";
import { ImageCapture } from "./image-capture";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function turn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function fixture() {
  const runs: Array<{
    id: number;
    command: string;
    args: any;
    gate: ReturnType<typeof deferred<string>>;
  }> = [];
  const cancels: number[] = [];
  let count = 0;
  class Runtime {
    readonly id = ++count;
    run(command: string, configuration: string) {
      const gate = deferred<string>();
      runs.push({
        id: this.id,
        command,
        args: JSON.parse(configuration),
        gate,
      });
      return gate.promise;
    }
    cancel() {
      cancels.push(this.id);
    }
  }
  const loadAddon = vi.fn(() => ({ ImageCaptureRuntime: Runtime }));
  const service = new ImageCapture("C:/app", { platform: "win32", loadAddon });
  return { service, runs, cancels, loadAddon };
}
describe("native image work ownership", () => {
  // Protects immutable accepted input, per-document ordering and a bounded cross-window work budget.
  it("snapshots arguments and limits native concurrency while allowing independent windows", async () => {
    const { service, runs } = fixture();
    const args = { x: 10 };
    const first = service.runCommand(1, "capture_screen_rect", args);
    args.x = 999;
    const queued = service.runCommand(1, "check_native_ocr_availability");
    const peer = service.runCommand(2, "native_ocr", { imageData: "fixture" });
    const third = service.runCommand(3, "capture_screen_rect", { x: 30 });
    await turn();
    expect(runs).toHaveLength(2);
    expect(runs[0].args.x).toBe(10);
    expect(runs[0].id).not.toBe(runs[1].id);
    runs[0].gate.resolve('{"first":true}');
    expect(await first).toEqual({ first: true });
    await turn();
    expect(runs).toHaveLength(3);
    expect(runs[2].args.x).toBe(30);
    runs[1].gate.resolve("null");
    await peer;
    await turn();
    expect(runs).toHaveLength(4);
    expect(runs[3].id).toBe(runs[0].id);
    runs[2].gate.resolve("null");
    runs[3].gate.resolve("null");
    await Promise.all([third, queued]);
    await service.shutdown();
  });
  // Protects refreshed documents from late results and queued work that belonged to the old document.
  it("cancels only the disposed owner and gives a replacement document a fresh runtime", async () => {
    const { service, runs, cancels } = fixture();
    const old = expect(
      service.runCommand(1, "native_ocr", { imageData: "fixture" })
    ).rejects.toThrow("关闭");
    const queued = expect(
      service.runCommand(1, "capture_screen_rect")
    ).rejects.toThrow("关闭");
    const peer = service.runCommand(2, "capture_screen_rect");
    await turn();
    service.disposeOwner(1);
    expect(cancels).toEqual([runs[0].id]);
    const replacement = service.runCommand(1, "check_native_ocr_availability");
    runs[0].gate.resolve('"late"');
    await old;
    await queued;
    await turn();
    expect(runs).toHaveLength(3);
    expect(runs[2].id).not.toBe(runs[0].id);
    expect(cancels).not.toContain(runs[1].id);
    runs[1].gate.resolve("null");
    runs[2].gate.resolve("null");
    await Promise.all([peer, replacement]);
    await service.shutdown();
  });
  // Protects shutdown from resolving while a native operation still owns image/WinRT resources.
  it("drains accepted work on exit and rejects new submissions", async () => {
    const { service, runs, cancels } = fixture();
    const work = expect(service.runCommand(1, "native_ocr")).rejects.toThrow(
      "关闭"
    );
    await turn();
    let drained = false;
    const closing = service.shutdown().then(() => {
      drained = true;
    });
    await turn();
    expect(cancels).toHaveLength(1);
    expect(drained).toBe(false);
    expect(service.hasPendingOperations).toBe(true);
    await expect(service.runCommand(2, "native_ocr")).rejects.toThrow("退出");
    runs[0].gate.resolve("null");
    await work;
    await closing;
    expect(service.hasPendingOperations).toBe(false);
  });
  // Protects capacity after failures; an OCR failure cannot strand future screenshot requests.
  it("releases failed slots and keeps the owner's queue usable", async () => {
    const { service, runs } = fixture();
    const first = expect(service.runCommand(1, "native_ocr")).rejects.toThrow(
      "fixture error"
    );
    const next = service.runCommand(1, "capture_screen_rect");
    await turn();
    runs[0].gate.reject(Error("fixture error"));
    await first;
    await turn();
    expect(runs).toHaveLength(2);
    runs[1].gate.resolve('{"changed":false,"hash":"sample","imageBytes":null}');
    expect(await next).toMatchObject({ changed: false, imageBytes: null });
    await service.shutdown();
  });
  // Protects resource budgets and platform attribution before native work is scheduled.
  it("rejects unsupported platforms and excessive per-window/global submissions", async () => {
    const loadAddon = vi.fn();
    await expect(
      new ImageCapture("/app", { platform: "linux", loadAddon }).runCommand(
        1,
        "native_ocr"
      )
    ).rejects.toThrow("Windows");
    expect(loadAddon).not.toHaveBeenCalled();
    const { service, runs } = fixture();
    const pending = [
      service.runCommand(1, "native_ocr"),
      service.runCommand(1, "native_ocr"),
    ];
    await expect(service.runCommand(1, "native_ocr")).rejects.toThrow(
      "当前窗口"
    );
    for (let owner = 2; owner <= 7; owner++)
      pending.push(service.runCommand(owner, "native_ocr"));
    await expect(service.runCommand(8, "native_ocr")).rejects.toThrow("较多");
    const outcomes = pending.map((work) =>
      expect(work).rejects.toThrow("关闭")
    );
    await turn();
    const closing = service.shutdown();
    for (const run of runs) run.gate.resolve("null");
    await Promise.all(outcomes);
    await closing;
  });
});
