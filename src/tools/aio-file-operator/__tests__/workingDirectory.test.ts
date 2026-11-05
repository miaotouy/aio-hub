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

import { beforeAll, describe, expect, it, vi } from "vitest";

const { invoke, parseDocx } = vi.hoisted(() => ({
  invoke: vi.fn(),
  parseDocx: vi.fn(),
}));
vi.mock("@/platform/native/core", () => ({ invoke }));
vi.mock("@/utils/appPath", () => ({
  getAppWorkDir: async () => "C:/AIO/workspace",
  getAppConfigDir: async () => "C:/AIO",
}));
vi.mock("@/utils/docxParser", () => ({ parseDocx }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
import { createConfigManager } from "@/utils/configManager";
import { DEFAULT_CONFIG } from "../config";

let actions: typeof import("../actions");
const original = {
  ...DEFAULT_CONFIG,
  allowedDirectories: ["C:/Custom"],
  blackListRules: [
    { id: "private", path: "C:/Custom/private", type: "block" as const },
  ],
  enableAuditLog: false,
};

beforeAll(async () => {
  await createConfigManager({
    moduleName: "aio-file-operator",
    fileName: "config.json",
    createDefault: () => original,
  }).save(original);
  invoke.mockImplementation(async (command: string, args: any) => {
    if (command === "resolve_path_for_security") return args.path;
    if (command === "get_file_metadata") return { size: 4, isFile: true };
    if (command === "convert_legacy_document")
      return "C:/AIO/workspace/conversions/document-1/note.docx";
    if (command === "read_file_binary") return [1, 2, 3, 4];
    return null;
  });
  parseDocx.mockResolvedValue({ text: "first\nsecond\n" });
  actions = await import("../actions");
  await actions.ensureInitialized();
});

describe("常驻工作目录", () => {
  // 保护已保存配置的升级契约：扩展名单、保留自定义范围与规则，并真实持久化。
  it("adds the workspace to existing configuration and preserves user policy", async () => {
    const config = await actions.getConfig();
    expect(config.allowedDirectories).toEqual([
      "C:/Custom",
      "C:/AIO/workspace",
    ]);
    expect(config.blackListRules).toEqual(original.blackListRules);
    expect(config.sandboxMode).toBe("whitelist");
    expect((await actions.configManager.load()).allowedDirectories).toEqual(
      config.allowedDirectories
    );
    expect(await actions.getWorkingDirectory()).toBe("C:/AIO/workspace");
    const { AioFileOperatorRegistry } =
      await import("../aio-file-operator.registry");
    expect(
      await new AioFileOperatorRegistry().get_working_directory()
    ).toMatchObject({
      success: true,
      data: { path: "C:/AIO/workspace" },
    });
  });

  // 保护旧格式读取的转换链路与按行读取；内部解析器可替换，公开返回保持稳定。
  it("reads converted legacy documents while keeping the data-root boundary", async () => {
    const result = await actions.readFile("C:/Custom/note.doc", 2, 2);
    expect(result).toMatchObject({
      success: true,
      data: {
        content: "second\n",
        lineRange: { startLine: 2, endLine: 2, returnedLines: 1 },
      },
    });
    expect((await actions.readFile("C:/AIO/config.json")).success).toBe(false);
    expect(
      (await actions.readFile("C:/AIO/workspace-other/note.txt")).success
    ).toBe(false);
  });

  it("retains the managed workspace across saves and still enforces explicit block rules", async () => {
    await actions.setConfig({ allowedDirectories: [] });
    expect((await actions.getConfig()).allowedDirectories).toEqual([
      "C:/AIO/workspace",
    ]);
    await actions.setConfig({
      blackListRules: [
        { id: "blocked", path: "C:/AIO/workspace/private", type: "block" },
      ],
    });
    expect(
      (await actions.readFile("C:/AIO/workspace/private/note.txt")).success
    ).toBe(false);
    expect(
      (await actions.readFile("C:/AIO/workspace/conversions/note.docx")).success
    ).toBe(true);
  });
});
