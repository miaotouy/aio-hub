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

import { describe, expect, it, vi } from "vitest";
const paths = vi.hoisted(() => ({
  desktopDir: vi.fn(),
  documentDir: vi.fn(),
  downloadDir: vi.fn(),
}));
vi.mock("@/platform/native/path", () => paths);
vi.mock("@/utils/appPath", () => ({
  getAppWorkDir: async () => "C:/AIO/workspace",
}));
import { DEFAULT_CONFIG, getDefaultAllowedDirectories } from "../config";

describe("新安装文件操作默认范围", () => {
  // 保护新安装路径边界与系统目录重定向，不依赖界面文案或实现布局。
  it("使用实际系统目录，跳过不可用目录并保持白名单模式", async () => {
    paths.desktopDir.mockResolvedValue("D:\\Redirected\\Desktop");
    paths.documentDir.mockRejectedValue(new Error("unavailable"));
    paths.downloadDir.mockResolvedValue("D:/Downloads");
    expect(DEFAULT_CONFIG.sandboxMode).toBe("whitelist");
    expect(await getDefaultAllowedDirectories()).toEqual([
      "D:/Redirected/Desktop",
      "D:/Downloads",
      "C:/AIO/workspace",
    ]);
  });
});
