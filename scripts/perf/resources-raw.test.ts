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

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startResourceCollector } from "./resources";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

beforeEach(() => {
  spawnMock.mockReset();
});
describe("raw resource samples", () => {
  it("preserves line-split JSON samples, returns defensive copies and stops once", async () => {
    const process = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    process.kill.mockImplementation(() => {
      process.emit("close", 0);
      return true;
    });
    spawnMock.mockReturnValue(process);
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const collector = startResourceCollector(1234);
    const row = (at: number, cpuSeconds: number) =>
      JSON.stringify({
        alive: true,
        at,
        cpuSeconds,
        workingSetBytes: 100,
        hasGpuProcess: true,
        hasWebView2Process: true,
      });
    process.stdout.write(row(0, 1) + "\n");
    expect(collector.getSamples()).toHaveLength(1);
    collector.resetSamples();
    expect(collector.getSamples()).toHaveLength(0);
    const first = row(1000, 10);
    process.stdout.write(first.slice(0, 7));
    process.stdout.write(first.slice(7) + "\nnot-json\n");
    process.stdout.write(row(2000, 11)); // flushed even without a final newline
    clock.mockReturnValue(2000);
    const summary = await collector.stop();
    expect(summary.samples).toBe(2);
    expect(summary.cpuSecondsPerSecond).toBe(1);
    const copy = collector.getSamples();
    copy[0].cpuSeconds = 999;
    copy.pop();
    expect(collector.getSamples()).toHaveLength(2);
    expect(collector.getSamples()[0].cpuSeconds).toBe(10);
    await collector.stop();
    expect(process.kill).toHaveBeenCalledOnce();
    expect(() => collector.resetSamples()).toThrow("stopped");
    clock.mockRestore();
  });
});
