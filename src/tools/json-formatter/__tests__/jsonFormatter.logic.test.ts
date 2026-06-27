import { describe, it, expect, beforeEach, vi } from "vitest";
import JsonFormatterRegistry from "../json-formatter.registry";
import {
  customJsonStringify,
  formatForAgent,
  formatJson,
  formatJsonAgent,
  parseJson,
} from "../logic/jsonFormatter.logic";

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
    error: vi.fn(),
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

describe("json-formatter logic", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
  });

  describe("parseJson", () => {
    it("应解析标准 JSON 字符串", () => {
      const result = parseJson('{"name":"aio","items":[1,2]}');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "aio", items: [1, 2] });
    });

    it("空字符串应返回明确错误", () => {
      const result = parseJson("   ");

      expect(result.success).toBe(false);
      expect(result.error).toBe("JSON 字符串为空");
    });

    it("非法 JSON 应返回解析错误而不是抛出", () => {
      const result = parseJson("{name:'aio'}");

      expect(result.success).toBe(false);
      expect(result.error).toContain("JSON 解析错误");
    });
  });

  describe("formatJson", () => {
    it("应按指定缩进格式化对象和数组", () => {
      const result = formatJson('{"name":"aio","items":[1,2]}', {
        expandDepth: 3,
        indentSize: 4,
      });

      expect(result.success).toBe(true);
      expect(result.formatted).toBe(
        '{\n    "name": "aio",\n    "items": [\n        1,\n        2\n    ]\n}'
      );
    });

    it("应根据 expandDepth 压缩深层对象", () => {
      const result = formatJson('{"user":{"name":"aio","tags":["dev"]}}', {
        expandDepth: 1,
        indentSize: 2,
      });

      expect(result.success).toBe(true);
      expect(result.formatted).toBe(
        '{\n  "user": {"name":"aio","tags":["dev"]}\n}'
      );
    });

    it("格式化失败时应保留错误信息", () => {
      const result = formatJson("not json");

      expect(result.success).toBe(false);
      expect(result.formatted).toBe("");
      expect(result.parsed).toBeNull();
      expect(result.error).toContain("JSON 解析错误");
    });
  });

  describe("customJsonStringify", () => {
    it("应处理 null、undefined 和空集合", () => {
      expect(customJsonStringify(null, 3)).toBe("null");
      expect(customJsonStringify(undefined, 3)).toBe("undefined");
      expect(customJsonStringify([], 3)).toBe("[]");
      expect(customJsonStringify({}, 3)).toBe("{}");
    });
  });

  describe("formatJsonAgent", () => {
    it("缺少 text 和 filePath 时应返回参数错误", async () => {
      const result = await formatJsonAgent({});

      expect(result.success).toBe(false);
      expect(result.error).toBe("必须提供 text 或 filePath 参数");
    });

    it("提供 filePath 时应优先读取文件内容", async () => {
      mockReadTextFile.mockResolvedValue('{"source":"file"}');

      const result = await formatJsonAgent({
        text: '{"source":"text"}',
        filePath: "C:/tmp/data.json",
      });

      expect(mockReadTextFile).toHaveBeenCalledWith("C:/tmp/data.json");
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({ source: "file" });
    });

    it("读取文件失败时应返回无法读取文件", async () => {
      mockReadTextFile.mockRejectedValue(new Error("permission denied"));

      const result = await formatJsonAgent({
        filePath: "C:/tmp/blocked.json",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("无法读取文件: C:/tmp/blocked.json");
    });
  });

  describe("formatForAgent / registry", () => {
    it("formatForAgent 应把失败结果转为 Agent 文本", () => {
      expect(
        formatForAgent({
          formatted: "",
          parsed: null,
          success: false,
          error: "bad input",
        })
      ).toBe("❌ JSON 格式化失败：bad input");
    });

    it("registry 应暴露 agentCallable 的 formatJson 方法", async () => {
      const registry = new JsonFormatterRegistry();
      const metadata = registry.getMetadata();
      const result = await registry.formatJson({
        text: '{"ok":true}',
        indentSize: "2",
      });

      expect(metadata.methods).toHaveLength(1);
      expect(metadata.methods[0].name).toBe("formatJson");
      expect(metadata.methods[0].agentCallable).toBe(true);
      expect(result).toContain('"ok": true');
    });
  });
});
