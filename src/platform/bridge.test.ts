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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke, PlatformError } from "./index";

describe("Platform Bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("在测试环境下调用未模拟的命令会抛出友好 PlatformError", async () => {
    await expect(invoke("path_exists", { path: "test" })).rejects.toThrow(
      PlatformError
    );
  });

  it("PlatformError 包含命令名与入参上下文", async () => {
    try {
      await invoke("path_exists", { path: "/dummy/path" });
      expect.unreachable("应该抛出错误");
    } catch (err) {
      expect(err).toBeInstanceOf(PlatformError);
      const pErr = err as PlatformError;
      expect(pErr.command).toBe("path_exists");
      expect(pErr.args).toEqual({ path: "/dummy/path" });
    }
  });
});
