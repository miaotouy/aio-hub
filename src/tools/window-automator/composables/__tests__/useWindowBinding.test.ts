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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useWindowBinding } from "../useWindowBinding";

const os = vi.hoisted(() => ({ name: "linux" }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => os.name }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: (fn: () => Promise<unknown>) => fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("窗口绑定的平台能力", () => {
  it.each(["linux", "macos"])(
    "%s 保留空列表并阻止未注册的原生调用",
    async (platform) => {
      os.name = platform;
      const binding = useWindowBinding();
      expect(binding.isSupported).toBe(false);
      expect(await binding.refresh()).toEqual([]);
      expect(binding.lastError.value).toBeTruthy();
      expect(await binding.isValid(123)).toBe(false);
      expect(await binding.getClientRect(123)).toBeNull();
      expect(binding.isLoading.value).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    }
  );

  it("Windows 继续通过原生命令获取与校验窗口", async () => {
    os.name = "windows";
    const binding = useWindowBinding();
    const target = {
      hwnd: 123,
      title: "Test",
      className: "TestClass",
      processName: "test.exe",
      pid: 1,
    };
    vi.mocked(invoke)
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ width: 640, height: 480 });
    expect(binding.isSupported).toBe(true);
    expect(await binding.refresh()).toEqual([target]);
    expect(binding.windows.value).toEqual([target]);
    expect(await binding.isValid(123)).toBe(true);
    expect(await binding.getClientRect(123)).toEqual({
      width: 640,
      height: 480,
    });
    expect(invoke).toHaveBeenCalledWith("wa_get_windows", {
      excludeSelf: true,
    });
  });
});
