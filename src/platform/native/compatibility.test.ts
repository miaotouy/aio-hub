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

import { afterEach, describe, expect, it, vi } from "vitest";

// Protect the existing IPC binary/options/error and event-envelope contracts while moving imports.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));
vi.unmock("@/platform/native/core");
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

import { invoke } from "./core";
import { listen } from "./events";

afterEach(() => vi.resetAllMocks());

describe("host SDK compatibility boundary", () => {
  it("retains binary arguments, request options, results and the original rejection", async () => {
    const command = "compatibility-test";
    const bytes = new Uint8Array([0, 128, 255]);
    const options = { headers: { "x-file-name": "sample.bin" } };
    const response = { written: bytes.byteLength };
    mocks.invoke.mockResolvedValueOnce(response);
    await expect(invoke(command, bytes, options)).resolves.toBe(response);
    expect(mocks.invoke).toHaveBeenCalledWith(command, bytes, options);
    const failure = { code: "ACCESS_DENIED", message: "read denied" };
    mocks.invoke.mockRejectedValueOnce(failure);
    await expect(invoke(command)).rejects.toBe(failure);
  });

  it("retains the event envelope, target options and listener teardown", async () => {
    const unlisten = vi.fn();
    const envelope = { event: "progress", id: 7, payload: { completed: 3 } };
    const handler = vi.fn();
    const options = { target: { kind: "Window" as const, label: "main" } };
    mocks.listen.mockImplementationOnce(async (_name, callback) => {
      callback(envelope);
      return unlisten;
    });
    const stop = await listen("progress", handler, options);
    expect(handler).toHaveBeenCalledWith(envelope);
    expect(mocks.listen).toHaveBeenCalledWith("progress", handler, options);
    stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
