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

/**
 * aio-file-operator 单元测试
 * 覆盖所有 agentCallable 方法、安全策略、审计日志、换行符转换
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { AioFileOperatorRegistry } from "../aio-file-operator.registry";
import * as actions from "../actions";
import { toolRegistryManager } from "@/services/registry";
import { executeToolRequests } from "../../tool-calling/core/executor";
import type { ParsedToolRequest } from "../../tool-calling/types";

// ==================== Mock Tauri invoke ====================
// 使用 vi.hoisted 确保 mock 在 vi.mock 工厂之前初始化
const { mockInvoke } = vi.hoisted(() => {
  return { mockInvoke: vi.fn() };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

// ==================== 辅助函数 ====================

/** 设置沙箱为黑名单模式且黑名单为空，允许任意路径 */
async function allowAllPaths() {
  await actions.setConfig({
    sandboxMode: "blacklist",
    blackListRules: [],
  });
}

/** 设置沙箱为白名单模式，仅允许指定目录 */
async function whitelistDirs(dirs: string[]) {
  await actions.setConfig({
    sandboxMode: "whitelist",
    allowedDirectories: dirs,
    blackListRules: [],
  });
}

/** 重置 invoke mock */
function resetInvokeMock() {
  mockInvoke.mockReset();
}

// ==================== 测试套件 ====================

describe("AioFileOperator Registry", () => {
  let registry: AioFileOperatorRegistry;

  beforeAll(async () => {
    registry = new AioFileOperatorRegistry();
    await toolRegistryManager.register(registry);
  });

  afterAll(async () => {
    await toolRegistryManager.unregister(registry.id);
  });

  // ==================== writeFile ====================

  describe("writeFile", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("文件不存在时应成功创建", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/new-file.txt",
        content: "hello world",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("成功写入文件");
    });

    it("文件已存在且 allowOverwrite=true 时应覆盖写入", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return true;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/exists.txt",
        content: "overwritten",
        allowOverwrite: true,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("已覆盖写入");
    });

    it("文件已存在且 allowOverwrite=false 时应自动累加序号", async () => {
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === "path_exists") {
          // 原路径存在，累加路径不存在
          return args.path === "C:/test/exists.txt";
        }
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/exists.txt",
        content: "new content",
        allowOverwrite: false,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("已保存为");
      expect(result.data.path).toContain("(1)");
    });

    it("overwritePolicy=always 时忽略 allowOverwrite 参数直接覆盖", async () => {
      await actions.setConfig({ overwritePolicy: "always" });
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return true;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/exists.txt",
        content: "forced overwrite",
        allowOverwrite: false,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("已覆盖写入");
    });

    it("overwritePolicy=never 时即使 allowOverwrite=true 也不覆盖", async () => {
      await actions.setConfig({ overwritePolicy: "never" });
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === "path_exists") {
          // 原路径存在，累加路径不存在
          return args.path === "C:/test/exists.txt";
        }
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/exists.txt",
        content: "no overwrite",
        allowOverwrite: true,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("已保存为");
    });

    it("写入失败时应返回 success=false", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") throw new Error("磁盘已满");
        return null;
      });

      const result = await registry.write_file({
        path: "C:/test/fail.txt",
        content: "test",
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("磁盘已满");
    });
  });

  // ==================== readFile ====================

  describe("readFile", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功读取普通文本文件", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 100,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        if (cmd === "read_text_file_force") return "hello world";
        return null;
      });

      const result = await registry.read_file({ path: "C:/test/readme.txt" });
      expect(result.success).toBe(true);
      expect(result.data.content).toBe("hello world");
    });

    it("路径不是文件时应失败", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 0,
            isFile: false,
            isDir: true,
            modified: null,
            created: null,
          };
        return null;
      });

      const result = await registry.read_file({ path: "C:/test/dir" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("不是文件");
    });

    it("文件超过大小限制时应失败", async () => {
      await actions.setConfig({ maxFileSize: 1024 }); // 1KB
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 2048,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        return null;
      });

      const result = await registry.read_file({ path: "C:/test/large.txt" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("超过限制");
    });
  });

  // ==================== deleteFile ====================

  describe("deleteFile", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功删除文件（移入回收站）", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "delete_file_to_trash") return true;
        return null;
      });

      const result = await registry.delete_file({
        path: "C:/test/to-delete.txt",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("已移入回收站");
    });

    it("删除失败时应返回 success=false", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "delete_file_to_trash") throw new Error("权限不足");
        return null;
      });

      const result = await registry.delete_file({
        path: "C:/test/protected.txt",
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("权限不足");
    });
  });

  // ==================== appendFile ====================

  describe("appendFile", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功追加内容到文件", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "append_file_force") return true;
        return null;
      });

      const result = await registry.append_file({
        path: "C:/test/log.txt",
        content: "new line\n",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("成功追加");
    });

    it("追加失败时应返回 success=false", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "append_file_force") throw new Error("文件不存在");
        return null;
      });

      const result = await registry.append_file({
        path: "C:/test/missing.txt",
        content: "data",
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== listDirectory ====================

  describe("listDirectory", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功列出目录内容", async () => {
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === "list_directory") return ["file1.txt", "subdir"];
        if (cmd === "get_file_metadata") {
          if (args.path.endsWith("file1.txt"))
            return {
              size: 500,
              isFile: true,
              isDir: false,
              modified: 1234567890,
              created: 1234567800,
            };
          if (args.path.endsWith("subdir"))
            return {
              size: 0,
              isFile: false,
              isDir: true,
              modified: null,
              created: null,
            };
        }
        return null;
      });

      const result = await registry.list_directory({ path: "C:/test" });
      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(2);
      expect(result.data.entries[0].name).toBe("file1.txt");
      expect(result.data.entries[0].isDirectory).toBe(false);
      expect(result.data.entries[1].name).toBe("subdir");
      expect(result.data.entries[1].isDirectory).toBe(true);
    });

    it("获取元数据失败时应跳过该条目", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "list_directory") return ["bad-file.txt"];
        if (cmd === "get_file_metadata") throw new Error("无法读取");
        return null;
      });

      const result = await registry.list_directory({ path: "C:/test" });
      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(1);
      expect(result.data.entries[0].size).toBe(0);
    });
  });

  // ==================== createDirectory ====================

  describe("createDirectory", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功创建目录", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "create_dir_force") return true;
        return null;
      });

      const result = await registry.create_directory({
        path: "C:/test/new-dir",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("成功创建目录");
    });

    it("创建失败时应返回 success=false", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "create_dir_force") throw new Error("路径无效");
        return null;
      });

      const result = await registry.create_directory({
        path: "C:/invalid/path",
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== pathExists ====================

  describe("pathExists", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("路径存在时应返回 exists=true", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return true;
        return null;
      });

      const result = await registry.path_exists({ path: "C:/test/exists.txt" });
      expect(result.success).toBe(true);
      expect(result.data.exists).toBe(true);
    });

    it("路径不存在时应返回 exists=false", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        return null;
      });

      const result = await registry.path_exists({
        path: "C:/test/missing.txt",
      });
      expect(result.success).toBe(true);
      expect(result.data.exists).toBe(false);
    });
  });

  // ==================== applyDiff ====================

  describe("applyDiff", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("应成功应用精确匹配的 Diff", async () => {
      const originalContent = "line1\nline2\nline3\n";
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_text_file_force") return originalContent;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.apply_diff({
        path: "C:/test/file.ts",
        search: "line2",
        replace: "line2-modified",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("成功应用 Diff");
      expect(result.data.strategy).toBe("exact");
    });

    it("空 search 时应追加内容到文件末尾", async () => {
      const originalContent = "line1\nline2\n";
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_text_file_force") return originalContent;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.apply_diff({
        path: "C:/test/file.ts",
        search: "",
        replace: "line3",
      });
      expect(result.success).toBe(true);
      expect(result.data.strategy).toBe("exact");
    });

    it("匹配失败时应返回 success=false", async () => {
      const originalContent = "completely\ndifferent\ncontent\n";
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_text_file_force") return originalContent;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.apply_diff({
        path: "C:/test/file.ts",
        search: "nonexistent text block that cannot be matched",
        replace: "new content",
      });
      expect(result.success).toBe(false);
    });

    it("应支持 startLine 参数消歧义", async () => {
      const originalContent = "line1\nline2\nline1\nline2\n";
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_text_file_force") return originalContent;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      const result = await registry.apply_diff({
        path: "C:/test/file.ts",
        search: "line1\nline2",
        replace: "modified1\nmodified2",
        startLine: 3,
      });
      expect(result.success).toBe(true);
      // 应该匹配到第3行开始的 line1\nline2
      expect(result.data.matchRange[0]).toBe(3);
    });
  });

  // ==================== 安全策略 ====================

  describe("安全策略 (Security Policy)", () => {
    beforeEach(async () => {
      resetInvokeMock();
    });

    it("白名单模式下，路径不在白名单中应被拦截", async () => {
      await whitelistDirs(["C:/Users/test/Desktop"]);

      const result = await registry.read_file({
        path: "C:/Windows/System32/config",
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("安全沙箱拦截");
    });

    it("白名单模式下，路径在白名单中应允许", async () => {
      await whitelistDirs(["C:/Users/test/Desktop"]);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 100,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        if (cmd === "read_text_file_force") return "safe content";
        return null;
      });

      const result = await registry.read_file({
        path: "C:/Users/test/Desktop/file.txt",
      });
      expect(result.success).toBe(true);
    });

    it("黑名单模式下，路径匹配死区规则应被拦截", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Windows", type: "block" }],
      });

      const result = await registry.read_file({
        path: "C:/Windows/System32/test",
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("死区");
    });

    it("黑名单模式下，路径匹配审批区规则应返回 approve 状态", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Sensitive", type: "approve" }],
      });

      // checkSecurityPolicy 返回 approve 时，validatePath 不会抛错（只有 block 才抛）
      // 所以操作应该继续执行
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 100,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        if (cmd === "read_text_file_force") return "approved content";
        return null;
      });

      const result = await registry.read_file({
        path: "C:/Sensitive/data.txt",
      });
      expect(result.success).toBe(true);
    });

    it("黑名单模式下，路径不在任何规则中应允许", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Windows", type: "block" }],
      });
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 100,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        if (cmd === "read_text_file_force") return "safe content";
        return null;
      });

      const result = await registry.read_file({ path: "C:/Projects/code.ts" });
      expect(result.success).toBe(true);
    });
  });

  // ==================== 审计日志 ====================

  describe("审计日志 (Audit Log)", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
      await actions.setConfig({ enableAuditLog: true });
      await actions.clearLogs();
    });

    it("成功操作应记录审计日志", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      await registry.write_file({
        path: "C:/test/log-test.txt",
        content: "logged",
      });

      const logs = await actions.getOperationLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].method).toBe("writeFile");
      expect(logs[0].result.success).toBe(true);
    });

    it("失败操作也应记录审计日志", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") throw new Error("写入失败");
        return null;
      });

      await registry.write_file({
        path: "C:/test/fail-log.txt",
        content: "test",
      });

      const logs = await actions.getOperationLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].result.success).toBe(false);
    });

    it("禁用审计日志时不应记录", async () => {
      await actions.setConfig({ enableAuditLog: false });
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      await registry.write_file({
        path: "C:/test/no-log.txt",
        content: "silent",
      });

      const logs = await actions.getOperationLogs();
      expect(logs).toHaveLength(0);
    });

    it("日志超过 100 条时应移除最旧的", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "path_exists") return false;
        if (cmd === "create_dir_force") return true;
        if (cmd === "write_text_file_force") return true;
        return null;
      });

      // 写入 105 次
      for (let i = 0; i < 105; i++) {
        await registry.write_file({
          path: `C:/test/file-${i}.txt`,
          content: `content ${i}`,
        });
      }

      const logs = await actions.getOperationLogs();
      expect(logs.length).toBeLessThanOrEqual(100);
    });
  });

  // ==================== 换行符处理 ====================

  describe("换行符处理 (Line Ending)", () => {
    beforeEach(async () => {
      resetInvokeMock();
      await allowAllPaths();
    });

    it("CRLF 文件应用 Diff 后应保持 CRLF", async () => {
      const crlfContent = "line1\r\nline2\r\nline3\r\n";
      let writtenContent = "";
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === "read_text_file_force") return crlfContent;
        if (cmd === "write_text_file_force") {
          writtenContent = args.content;
          return true;
        }
        return null;
      });

      await registry.apply_diff({
        path: "C:/test/crlf.txt",
        search: "line2",
        replace: "line2-modified",
      });

      // 写入的内容应保持 CRLF
      expect(writtenContent).toContain("\r\n");
    });

    it("LF 文件应用 Diff 后应保持 LF", async () => {
      const lfContent = "line1\nline2\nline3\n";
      let writtenContent = "";
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === "read_text_file_force") return lfContent;
        if (cmd === "write_text_file_force") {
          writtenContent = args.content;
          return true;
        }
        return null;
      });

      await registry.apply_diff({
        path: "C:/test/lf.txt",
        search: "line2",
        replace: "line2-modified",
      });

      // 写入的内容应保持 LF（不含 \r\n）
      expect(writtenContent).not.toContain("\r\n");
      expect(writtenContent).toContain("\n");
    });
  });

  // ==================== checkSecurityPolicy ====================

  describe("checkSecurityPolicy (Registry Hook)", () => {
    beforeEach(async () => {
      resetInvokeMock();
    });

    it("白名单模式 + 路径不在白名单 → block", async () => {
      await whitelistDirs(["C:/Safe"]);
      const result = await registry.checkSecurityPolicy("read_file", {
        path: "C:/Unsafe/file.txt",
      });
      expect(result.status).toBe("block");
    });

    it("白名单模式 + 路径在白名单 → allow", async () => {
      await whitelistDirs(["C:/Safe"]);
      const result = await registry.checkSecurityPolicy("read_file", {
        path: "C:/Safe/file.txt",
      });
      expect(result.status).toBe("allow");
    });

    it("黑名单模式 + 路径匹配死区 → block", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Secret", type: "block" }],
      });
      const result = await registry.checkSecurityPolicy("read_file", {
        path: "C:/Secret/data.txt",
      });
      expect(result.status).toBe("block");
    });

    it("黑名单模式 + 路径匹配审批区 → approve", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Risky", type: "approve" }],
      });
      const result = await registry.checkSecurityPolicy("read_file", {
        path: "C:/Risky/data.txt",
      });
      expect(result.status).toBe("approve");
    });

    it("无 path 参数时应返回 allow", async () => {
      await whitelistDirs(["C:/Safe"]);
      const result = await registry.checkSecurityPolicy("some_method", {});
      expect(result.status).toBe("allow");
    });
  });

  // ==================== getMetadata ====================

  describe("getMetadata", () => {
    it("应返回所有 agentCallable 方法", () => {
      const metadata = registry.getMetadata();
      const methodNames = metadata.methods.map((m) => m.name);
      expect(methodNames).toContain("read_file");
      expect(methodNames).toContain("write_file");
      expect(methodNames).toContain("append_file");
      expect(methodNames).toContain("delete_file");
      expect(methodNames).toContain("list_directory");
      expect(methodNames).toContain("apply_diff");
      expect(methodNames).toContain("create_directory");
      expect(methodNames).toContain("path_exists");
    });

    it("所有方法应标记为 agentCallable", () => {
      const metadata = registry.getMetadata();
      for (const method of metadata.methods) {
        expect(method.agentCallable).toBe(true);
      }
    });
  });

  // ==================== 工具调用系统集成 ====================

  describe("工具调用系统集成 (Tool Calling Integration)", () => {
    const defaultToolConfig = {
      enabled: true,
      mode: "auto" as const,
      toolToggles: {},
      autoApproveTools: { "aio-file-operator": true },
      autoApproveMethods: {},
      methodToggles: {},
      defaultToolEnabled: true,
      defaultAutoApprove: true,
      maxIterations: 5,
      timeout: 30000,
      parallelExecution: false,
      protocol: "vcp" as const,
    };

    beforeEach(async () => {
      resetInvokeMock();
    });

    it("白名单模式 + 路径不在白名单 → executor 拦截并返回 denied", async () => {
      await whitelistDirs(["C:/Safe"]);

      const requests: ParsedToolRequest[] = [
        {
          requestId: "req-block-1",
          toolId: "aio-file-operator",
          methodName: "read_file",
          toolName: "本地文件操作器",
          rawBlock: "",
          args: {
            path: "C:/Unsafe/file.txt",
          },
        },
      ];

      const results = await executeToolRequests(requests, {
        config: defaultToolConfig,
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("denied");
      expect(results[0].result).toContain("安全沙箱拦截");
    });

    it("白名单模式 + 路径在白名单 → executor 正常放行并执行成功", async () => {
      await whitelistDirs(["C:/Safe"]);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_file_metadata")
          return {
            size: 100,
            isFile: true,
            isDir: false,
            modified: null,
            created: null,
          };
        if (cmd === "read_text_file_force") return "safe content";
        return null;
      });

      const requests: ParsedToolRequest[] = [
        {
          requestId: "req-allow-1",
          toolId: "aio-file-operator",
          methodName: "read_file",
          toolName: "本地文件操作器",
          rawBlock: "",
          args: {
            path: "C:/Safe/file.txt",
          },
        },
      ];

      const results = await executeToolRequests(requests, {
        config: defaultToolConfig,
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("success");
      expect(JSON.parse(results[0].result).data.content).toBe("safe content");
    });

    it("黑名单模式 + 路径匹配死区 → executor 拦截并返回 denied", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Secret", type: "block" }],
      });

      const requests: ParsedToolRequest[] = [
        {
          requestId: "req-block-2",
          toolId: "aio-file-operator",
          methodName: "read_file",
          toolName: "本地文件操作器",
          rawBlock: "",
          args: {
            path: "C:/Secret/data.txt",
          },
        },
      ];

      const results = await executeToolRequests(requests, {
        config: defaultToolConfig,
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("denied");
      expect(results[0].result).toContain("死区");
    });

    it("黑名单模式 + 路径匹配审批区 → executor 触发审批流程 (拒绝时返回 denied)", async () => {
      await actions.setConfig({
        sandboxMode: "blacklist",
        blackListRules: [{ id: "1", path: "C:/Risky", type: "approve" }],
      });

      const requests: ParsedToolRequest[] = [
        {
          requestId: "req-approve-1",
          toolId: "aio-file-operator",
          methodName: "read_file",
          toolName: "本地文件操作器",
          rawBlock: "",
          args: {
            path: "C:/Risky/data.txt",
          },
        },
      ];

      const results = await executeToolRequests(requests, {
        config: {
          ...defaultToolConfig,
          mode: "manual", // 强制手动审批模式
        },
        onBeforeExecute: async () => "rejected" as const, // 模拟用户拒绝
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("denied");
      expect(results[0].result).toContain("被拒绝：用户未授权");
    });
  });
});
