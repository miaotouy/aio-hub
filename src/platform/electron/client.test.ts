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
import { reactive } from "vue";
import { cloneHostValue, request } from "./client";
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
});
describe("Electron renderer IPC contract", () => {
  it("transfers reactive state while preserving binary bytes", async () => {
    const state = reactive({
      theme: { name: "深色" },
      bytes: new Uint8Array([0, 128, 255]),
    });
    const host = vi.fn().mockResolvedValue({ ok: true, value: "saved" });
    Object.assign(window, { aiohub: { platform: "electron", request: host } });
    await expect(request("command", { state })).resolves.toBe("saved");
    const sent = host.mock.calls[0][1];
    const cloned = structuredClone(sent);
    expect(cloned.state.theme).toEqual({ name: "深色" });
    expect(Array.from(cloned.state.bytes)).toEqual([0, 128, 255]);
    const repeated = { value: 1 };
    expect(cloneHostValue([repeated, repeated])).toEqual([
      { value: 1 },
      { value: 1 },
    ]);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => cloneHostValue(cyclic)).toThrow("循环引用");
  });
  it("preserves actionable host error codes across context isolation", async () => {
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        request: async () => ({
          ok: false,
          error: { code: "ENOENT", message: "文件已移动" },
        }),
      },
    });
    await expect(request("fs")).rejects.toMatchObject({
      code: "ENOENT",
      message: "文件已移动",
    });
  });
});
