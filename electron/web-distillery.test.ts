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
import { WebDistillery } from "./web-distillery";
class Runtime {
  run = vi.fn(async (command: string, configuration: string) =>
    JSON.stringify({ command, args: JSON.parse(configuration) })
  );
  cancel = vi.fn();
  shutdown = vi.fn(async () => {});
}
let runtimes: Runtime[],
  network: ReturnType<typeof vi.fn>,
  service: WebDistillery;
beforeEach(() => {
  runtimes = [];
  network = vi.fn(async () => ({ mode: "none" as const }));
  service = new WebDistillery("app", {
    networkOptions: network,
    loadAddon: () => ({
      WebDistilleryRuntime: class extends Runtime {
        constructor() {
          super();
          runtimes.push(this);
        }
      },
    }),
  });
});
afterEach(async () => {
  await service.shutdown();
});
const command = (
  owner: number,
  name = "distillery_get_proxy_port",
  args: Record<string, unknown> = {}
) => service.runCommand(owner, name, args);
describe("web distillery native hosting", () => {
  it("snapshots accepted arguments and keeps runtime state private to each window", async () => {
    const args = { url: "https://example.test/", options: { timeout: 1234 } };
    const pending = command(1, "distillery_quick_fetch", args);
    args.options.timeout = 9;
    expect(await pending).toEqual({
      command: "distillery_quick_fetch",
      args: { url: "https://example.test/", options: { timeout: 1234 } },
    });
    await command(1, "distillery_set_proxy_cookies", { cookies: "test=value" });
    await command(2, "distillery_set_proxy_cookies", { cookies: "test=peer" });
    expect(runtimes).toHaveLength(2);
    expect(runtimes[0].run.mock.calls.map((call) => call[0])).toEqual([
      "distillery_quick_fetch",
      "distillery_set_proxy_cookies",
    ]);
    expect(runtimes[1].run).toHaveBeenCalledWith(
      "distillery_set_proxy_cookies",
      JSON.stringify({ cookies: "test=peer" }),
      JSON.stringify({ mode: "none" })
    );
  });
  it("serializes proxy control per owner while peer windows remain independent", async () => {
    await command(1);
    let finish!: (value: string) => void;
    runtimes[0].run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = command(1, "distillery_start_proxy");
    const second = command(1, "distillery_set_proxy_cookies", {
      cookies: "next=value",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await command(2);
    expect(runtimes).toHaveLength(2);
    expect(runtimes[0].run).toHaveBeenCalledTimes(2);
    finish("12345");
    expect(await first).toBe(12345);
    await second;
    expect(runtimes[0].run).toHaveBeenCalledTimes(3);
  });
  it("prevents late network setup from reviving a closed document", async () => {
    let finish!: (value: { mode: "none" }) => void;
    network.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = command(1, "distillery_quick_fetch", {
      url: "https://example.test/",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    service.disposeOwner(1);
    finish({ mode: "none" });
    await expect(pending).rejects.toThrow("关闭");
    expect(runtimes).toHaveLength(0);
  });
  it("closes only its owner and allocates a fresh runtime for a replacement document", async () => {
    await command(1);
    await command(2);
    service.disposeOwner(1);
    expect(runtimes[0].cancel).toHaveBeenCalledOnce();
    expect(runtimes[0].shutdown).toHaveBeenCalledOnce();
    expect(runtimes[1].cancel).not.toHaveBeenCalled();
    await command(1);
    expect(runtimes).toHaveLength(3);
  });
  it("waits for native resource shutdown and rejects new work during exit", async () => {
    await command(1);
    let finish!: () => void;
    runtimes[0].shutdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let done = false;
    const stopped = service.shutdown().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await expect(command(2)).rejects.toThrow("退出");
    finish();
    await stopped;
    expect(service.hasPendingOperations).toBe(false);
  });
  it("keeps crypto and cleanup usable when network settings cannot be loaded", async () => {
    network.mockRejectedValue(Error("invalid network settings"));
    await expect(command(1, "distillery_start_proxy")).rejects.toThrow(
      "invalid network settings"
    );
    await command(1, "distillery_check_crypto");
    await command(1, "distillery_stop_proxy");
    expect(network).toHaveBeenCalledOnce();
  });
});
