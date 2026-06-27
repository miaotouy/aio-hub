import { describe, it, expect, beforeEach, vi } from "vitest";
import DirSearchRegistry from "../dir-search.registry";
import { replaceInDirectory, searchDirectory } from "../actions";
import type { FileSearchResult, SearchResultBatch } from "../types";

const { mockInvoke, mockListen, mockUnlisten, listeners } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
  mockUnlisten: vi.fn(),
  listeners: new Map<string, (event: { payload: SearchResultBatch }) => void>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

function emitBatch(results: FileSearchResult[]) {
  listeners.get("dir-search-result-batch")?.({ payload: { results } });
}

const resultA: FileSearchResult = {
  filePath: "C:/repo/src/a.ts",
  relativePath: "src/a.ts",
  matches: [
    {
      lineNumber: 3,
      lineContent: "const value = `needle`;".padEnd(260, "x"),
      matchStart: 15,
      matchEnd: 21,
    },
    {
      lineNumber: 8,
      lineContent: "needle again",
      matchStart: 0,
      matchEnd: 6,
    },
  ],
};

const resultB: FileSearchResult = {
  filePath: "C:/repo/src/b.vue",
  relativePath: "src/b.vue",
  matches: [
    {
      lineNumber: 1,
      lineContent: "<template>needle</template>",
      matchStart: 10,
      matchEnd: 16,
    },
  ],
};

describe("dir-search actions", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    mockUnlisten.mockReset();
    listeners.clear();
    mockListen.mockImplementation(async (eventName: string, callback: any) => {
      listeners.set(eventName, callback);
      return mockUnlisten;
    });
  });

  describe("searchDirectory", () => {
    it("缺少必要参数时应返回明确错误且不触发 IPC", async () => {
      await expect(
        searchDirectory({ path: "", pattern: "needle" })
      ).resolves.toBe("错误: 必须指定搜索目录路径 (path)。");
      await expect(
        searchDirectory({ path: "C:/repo", pattern: "" })
      ).resolves.toBe("错误: 必须指定搜索模式 (pattern)。");

      expect(mockListen).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("应收集流式 batch 并格式化搜索结果", async () => {
      const reportStatus = vi.fn();
      mockInvoke.mockImplementation(async (command: string) => {
        expect(command).toBe("dir_search");
        emitBatch([resultA, resultB]);
        return {
          filesScanned: 12,
          filesMatched: 2,
          totalMatches: 3,
          durationMs: 34,
          cancelled: false,
        };
      });

      const output = await searchDirectory(
        {
          path: "C:/repo",
          pattern: "needle",
          isRegex: true,
          caseSensitive: true,
          wholeWord: true,
          includeGlobs: "*.ts, *.vue",
          excludeGlobs: "dist,node_modules",
          useGitignore: false,
          maxResults: 50,
          contextLines: 2,
          maxDisplayFiles: 1,
          maxMatchesPerFile: 1,
        },
        { reportStatus } as any
      );

      expect(mockListen).toHaveBeenCalledWith(
        "dir-search-result-batch",
        expect.any(Function)
      );
      expect(mockInvoke).toHaveBeenCalledWith("dir_search", {
        request: {
          rootPath: "C:/repo",
          pattern: "needle",
          isRegex: true,
          caseSensitive: true,
          wholeWord: true,
          includeGlobs: ["*.ts", "*.vue"],
          excludeGlobs: ["dist", "node_modules"],
          useGitignore: false,
          contextLines: 2,
          maxResults: 50,
        },
      });
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
      expect(reportStatus).toHaveBeenCalledWith("正在搜索目录...", 10);
      expect(reportStatus).toHaveBeenCalledWith("格式化结果...", 90);
      expect(output).toContain("## 搜索结果");
      expect(output).toContain("- **搜索模式**: `needle` (正则)");
      expect(output).toContain("### src/a.ts");
      expect(output).toContain("\\`needle\\`");
      expect(output).toContain("- ... 还有 1 处匹配");
      expect(output).toContain("> 结果已截断，仅展示前 1 个文件。");
      expect(output).not.toContain("### src/b.vue");
    });

    it("无匹配时应返回空结果说明", async () => {
      mockInvoke.mockResolvedValue({
        filesScanned: 4,
        filesMatched: 0,
        totalMatches: 0,
        durationMs: 10,
        cancelled: false,
      });

      const output = await searchDirectory({
        path: "C:/repo",
        pattern: "absent",
      });

      expect(output).toContain("未找到匹配项。");
    });

    it("搜索失败时应解绑监听并返回错误文本", async () => {
      mockInvoke.mockRejectedValue(new Error("backend failed"));

      const output = await searchDirectory({
        path: "C:/repo",
        pattern: "needle",
      });

      expect(output).toBe("搜索失败: backend failed");
      expect(mockUnlisten).toHaveBeenCalledTimes(2);
    });
  });

  describe("replaceInDirectory", () => {
    it("缺少参数时应返回明确错误", async () => {
      await expect(
        replaceInDirectory({ path: "", pattern: "a", replacement: "b" })
      ).resolves.toBe("错误: 必须指定目录路径 (path)。");
      await expect(
        replaceInDirectory({ path: "C:/repo", pattern: "", replacement: "b" })
      ).resolves.toBe("错误: 必须指定搜索模式 (pattern)。");
      await expect(
        replaceInDirectory({ path: "C:/repo", pattern: "a", replacement: null as any })
      ).resolves.toBe("错误: 必须指定替换文本 (replacement)，可以为空字符串。");
    });

    it("搜索阶段无结果时不执行替换", async () => {
      mockInvoke.mockResolvedValue({
        filesScanned: 5,
        filesMatched: 0,
        totalMatches: 0,
        durationMs: 11,
        cancelled: false,
      });

      const output = await replaceInDirectory({
        path: "C:/repo",
        pattern: "needle",
        replacement: "",
      });

      expect(output).toBe("未找到匹配项，无需替换。");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith("dir_search", {
        request: expect.objectContaining({ maxResults: 0 }),
      });
    });

    it("应先搜索影响范围再执行批量替换", async () => {
      const reportStatus = vi.fn();
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "dir_search") {
          emitBatch([resultA, resultB]);
          return {
            filesScanned: 12,
            filesMatched: 2,
            totalMatches: 3,
            durationMs: 34,
            cancelled: false,
          };
        }
        if (command === "dir_replace") {
          return {
            filesReplaced: 2,
            filesFailed: 1,
            totalReplacements: 3,
            errors: [{ filePath: "C:/repo/src/b.vue", error: "readonly" }],
          };
        }
        throw new Error(`Unexpected command: ${command}`);
      });

      const output = await replaceInDirectory(
        {
          path: "C:/repo",
          pattern: "needle",
          replacement: "thread",
          isRegex: true,
          caseSensitive: true,
          wholeWord: true,
          preserveCase: true,
          includeGlobs: "*.ts,*.vue",
          excludeGlobs: "dist",
          useGitignore: false,
        },
        { reportStatus } as any
      );

      expect(mockInvoke).toHaveBeenNthCalledWith(1, "dir_search", {
        request: {
          rootPath: "C:/repo",
          pattern: "needle",
          isRegex: true,
          caseSensitive: true,
          wholeWord: true,
          includeGlobs: ["*.ts", "*.vue"],
          excludeGlobs: ["dist"],
          useGitignore: false,
          maxResults: 0,
        },
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, "dir_replace", {
        request: {
          filePaths: ["C:/repo/src/a.ts", "C:/repo/src/b.vue"],
          pattern: "needle",
          replacement: "thread",
          isRegex: true,
          caseSensitive: true,
          wholeWord: true,
          preserveCase: true,
        },
      });
      expect(reportStatus).toHaveBeenCalledWith("搜索匹配项...", 20);
      expect(reportStatus).toHaveBeenCalledWith(
        "正在替换 2 个文件中的 3 处匹配...",
        50
      );
      expect(reportStatus).toHaveBeenCalledWith("替换完成", 100);
      expect(output).toContain("## 替换完成");
      expect(output).toContain("- **搜索模式**: `needle` (正则)");
      expect(output).toContain("- **替换为**: `thread`");
      expect(output).toContain("- ⚠️ **失败文件数**: 1");
      expect(output).toContain("readonly");
    });

    it("搜索或替换 IPC 失败时应返回对应阶段错误", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("search failed"));
      await expect(
        replaceInDirectory({
          path: "C:/repo",
          pattern: "needle",
          replacement: "thread",
        })
      ).resolves.toBe("搜索阶段失败: search failed");

      mockInvoke.mockReset();
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "dir_search") {
          emitBatch([resultA]);
          return {
            filesScanned: 1,
            filesMatched: 1,
            totalMatches: 2,
            durationMs: 4,
            cancelled: false,
          };
        }
        throw new Error("replace failed");
      });

      await expect(
        replaceInDirectory({
          path: "C:/repo",
          pattern: "needle",
          replacement: "thread",
        })
      ).resolves.toBe("替换执行失败: replace failed");
    });
  });

  describe("registry", () => {
    it("应暴露搜索和替换 Agent 方法并适配字符串参数", async () => {
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "dir_search") {
          return {
            filesScanned: 0,
            filesMatched: 0,
            totalMatches: 0,
            durationMs: 0,
            cancelled: false,
          };
        }
        return {
          filesReplaced: 0,
          filesFailed: 0,
          totalReplacements: 0,
          errors: [],
        };
      });

      const registry = new DirSearchRegistry();
      const metadata = registry.getMetadata();
      const searchOutput = await registry.searchDirectory({
        path: "C:/repo",
        pattern: "needle",
        isRegex: "true",
        useGitignore: "false",
        maxResults: "7",
        contextLines: "2",
      });

      expect(metadata.methods.map((method) => method.name)).toEqual([
        "searchDirectory",
        "replaceInDirectory",
      ]);
      expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
      expect(searchOutput).toContain("## 搜索结果");
      expect(mockInvoke).toHaveBeenCalledWith("dir_search", {
        request: expect.objectContaining({
          isRegex: true,
          useGitignore: false,
          maxResults: 7,
          contextLines: 2,
        }),
      });
    });
  });
});
