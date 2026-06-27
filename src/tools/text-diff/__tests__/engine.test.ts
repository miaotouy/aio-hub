import { describe, it, expect, beforeEach, vi } from "vitest";
import TextDiffRegistry from "../text-diff.registry";
import {
  formatPatchResult,
  generatePatch,
  inferLanguage,
  loadFile,
} from "../engine";

const { mockReadTextFile } = vi.hoisted(() => ({
  mockReadTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: mockReadTextFile,
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
    wrapAsync: async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    },
  }),
}));

describe("text-diff engine", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
  });

  it("应根据文件扩展名推断语言", () => {
    expect(inferLanguage("demo.ts")).toBe("typescript");
    expect(inferLanguage("README.md")).toBe("markdown");
    expect(inferLanguage("unknown.custom")).toBe("plaintext");
  });

  describe("loadFile", () => {
    it("应读取文本文件并返回文件名与语言", async () => {
      mockReadTextFile.mockResolvedValue("const a = 1;");

      const result = await loadFile("C:/repo/src/demo.ts");

      expect(result.success).toBe(true);
      expect(result.fileName).toBe("demo.ts");
      expect(result.language).toBe("typescript");
      expect(result.content).toBe("const a = 1;");
    });

    it("包含 NUL 字符时应拒绝二进制文件", async () => {
      mockReadTextFile.mockResolvedValue("abc\0def");

      const result = await loadFile("C:/repo/blob.bin");

      expect(result.success).toBe(false);
      expect(result.error).toBe("不支持二进制文件");
    });

    it("读取异常时应返回失败结果", async () => {
      mockReadTextFile.mockRejectedValue(new Error("not found"));

      const result = await loadFile("C:/repo/missing.txt");

      expect(result.success).toBe(false);
      expect(result.error).toBe("读取文件失败");
    });
  });

  describe("generatePatch", () => {
    it("应生成统一 diff 补丁", () => {
      const result = generatePatch("line1\nline2\n", "line1\nchanged\n", {
        oldFileName: "old.txt",
        newFileName: "new.txt",
        context: 1,
      });

      expect(result.success).toBe(true);
      expect(result.patch).toContain("--- old.txt");
      expect(result.patch).toContain("+++ new.txt");
      expect(result.patch).toContain("-line2");
      expect(result.patch).toContain("+changed");
    });

    it("两侧均为空时应返回错误", () => {
      const result = generatePatch("", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("两侧内容均为空");
    });

    it("内容相同时应返回无差异错误", () => {
      const result = generatePatch("same\n", "same\n");

      expect(result.success).toBe(false);
      expect(result.patch).toBe("");
      expect(result.error).toBe("两侧内容相同，无差异");
    });

    it("默认应忽略行尾空白差异", () => {
      const result = generatePatch("alpha   \n", "alpha\n");

      expect(result.success).toBe(false);
      expect(result.error).toBe("两侧内容相同，无差异");
    });

    it("ignoreWhitespace=false 时应保留行尾空白差异", () => {
      const result = generatePatch("alpha   \n", "alpha\n", {
        ignoreWhitespace: false,
      });

      expect(result.success).toBe(true);
      expect(result.patch).toContain("-alpha   ");
      expect(result.patch).toContain("+alpha");
    });
  });

  describe("formatPatchResult / registry", () => {
    it("formatPatchResult 应格式化失败消息", () => {
      expect(formatPatchResult({ patch: "", success: false, error: "empty" })).toBe(
        "❌ Diff 生成失败：empty"
      );
    });

    it("registry 应适配扁平化 Agent 参数", () => {
      const registry = new TextDiffRegistry();
      const result = registry.generatePatch({
        oldText: "a\nb\n",
        newText: "a\nc\n",
        oldFileName: "before.md",
        newFileName: "after.md",
        ignoreWhitespace: "false",
        context: "0",
      });

      expect(result).toContain("--- before.md");
      expect(result).toContain("+++ after.md");
      expect(result).toContain("-b");
      expect(result).toContain("+c");
    });

    it("registry 元数据应标记 generatePatch 为 agentCallable", () => {
      const registry = new TextDiffRegistry();
      const metadata = registry.getMetadata();
      const method = metadata.methods.find((item) => item.name === "generatePatch");

      expect(method?.agentCallable).toBe(true);
    });
  });
});
