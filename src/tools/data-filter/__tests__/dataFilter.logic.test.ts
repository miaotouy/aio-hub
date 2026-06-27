import { describe, it, expect, beforeEach, vi } from "vitest";
import DataFilterRegistry from "../data-filter.registry";
import {
  applyFilter,
  applyFilterFromFile,
  formatFilterResult,
  loadDataFile,
  parseFilterOptions,
} from "../logic/dataFilter.logic";

const { mockReadTextFile, mockHandleError } = vi.hoisted(() => ({
  mockReadTextFile: vi.fn(),
  mockHandleError: vi.fn(),
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
    handle: mockHandleError,
    wrapAsync: async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    },
  }),
}));

const sampleData = {
  data: {
    items: [
      { id: 1, name: "alpha", title: "Draft", active: true, score: 88 },
      { id: 2, name: "beta", title: "Published", active: false, score: 61 },
      { id: 3, name: "gamma", title: "Published", active: true, score: 95 },
    ],
  },
};

describe("data-filter logic", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
    mockHandleError.mockReset();
  });

  describe("applyFilter", () => {
    it("应按 dataPath 定位深层数组并用 AND 条件过滤", () => {
      const result = applyFilter(sampleData, {
        dataPath: "data.items",
        conditions: [
          { key: "active", operator: "eq", value: true },
          { key: "score", operator: "ge", value: 90 },
        ],
      });

      expect(result.error).toBeUndefined();
      expect(result.total).toBe(3);
      expect(result.filtered).toBe(1);
      expect(result.data).toEqual([
        { id: 3, name: "gamma", title: "Published", active: true, score: 95 },
      ]);
    });

    it("同一条件中的多键应使用 OR 逻辑", () => {
      const result = applyFilter(sampleData.data.items, {
        conditions: [
          { key: "name,title", operator: "contains", value: "Draft" },
        ],
      });

      expect(result.filtered).toBe(1);
      expect(result.data[0].id).toBe(1);
    });

    it("应跳过禁用条件并支持反向保留未匹配项", () => {
      const result = applyFilter(sampleData.data.items, {
        conditions: [
          { key: "active", operator: "eq", value: true },
          { key: "score", operator: "gt", value: 90, enabled: false },
        ],
        keepUnmatched: true,
      });

      expect(result.total).toBe(3);
      expect(result.filtered).toBe(1);
      expect(result.data).toEqual([
        { id: 2, name: "beta", title: "Published", active: false, score: 61 },
      ]);
    });

    it("应执行自定义脚本条件", () => {
      const result = applyFilter(sampleData.data.items, {
        conditions: [
          {
            key: "",
            operator: "custom",
            value: 80,
            customScript: "item.score > value && item.title === 'Published'",
          },
        ],
      });

      expect(result.filtered).toBe(1);
      expect(result.data[0].id).toBe(3);
    });

    it("自定义脚本异常时应记录错误并让该条件通过", () => {
      const result = applyFilter(sampleData.data.items, {
        conditions: [
          { key: "", operator: "custom", customScript: "item.missing(" },
        ],
      });

      expect(mockHandleError).toHaveBeenCalledTimes(3);
      expect(result.filtered).toBe(3);
    });

    it("目标路径不是数组时应返回明确错误", () => {
      const result = applyFilter(sampleData, {
        dataPath: "data",
        conditions: [],
      });

      expect(result.error).toBe("目标路径不是一个数组");
      expect(result.total).toBe(0);
    });
  });

  describe("parseFilterOptions", () => {
    it("应解析 Agent 传入的 conditions 与 keepUnmatched", () => {
      const result = parseFilterOptions({
        dataPath: "data.items",
        conditions: '[{"key":"name","operator":"contains","value":"a"}]',
        keepUnmatched: "true",
      });

      expect(result.error).toBeUndefined();
      expect(result.dataPath).toBe("data.items");
      expect(result.keepUnmatched).toBe(true);
      expect(result.conditions).toEqual([
        { key: "name", operator: "contains", value: "a" },
      ]);
    });

    it("conditions 非 JSON 时应返回参数错误", () => {
      const result = parseFilterOptions({
        conditions: "{bad json",
      });

      expect(result.error).toContain("conditions 参数格式错误");
      expect(result.conditions).toEqual([]);
      expect(result.keepUnmatched).toBe(false);
    });
  });

  describe("loadDataFile / applyFilterFromFile", () => {
    it("应按扩展名解析 YAML 文件", async () => {
      mockReadTextFile.mockResolvedValue("items:\n  - name: alpha\n");

      const result = await loadDataFile("C:/tmp/data.yaml");

      expect(mockReadTextFile).toHaveBeenCalledWith("C:/tmp/data.yaml");
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ items: [{ name: "alpha" }] });
    });

    it("JSON 解析失败时应回退到 YAML 解析", async () => {
      mockReadTextFile.mockResolvedValue("items:\n  - name: beta\n");

      const result = await loadDataFile("C:/tmp/data.txt");

      expect(result.data).toEqual({ items: [{ name: "beta" }] });
    });

    it("读取失败时应返回加载错误", async () => {
      mockReadTextFile.mockRejectedValue(new Error("permission denied"));

      const result = await loadDataFile("C:/tmp/blocked.json");

      expect(result.data).toBeNull();
      expect(result.error).toBe("读取或解析文件失败: permission denied");
    });

    it("缺少 path 时完整流程应返回参数错误", async () => {
      const result = await applyFilterFromFile({});

      expect(result.error).toBe("缺少必要参数：path");
      expect(mockReadTextFile).not.toHaveBeenCalled();
    });

    it("完整流程应读取文件、解析条件并执行过滤", async () => {
      mockReadTextFile.mockResolvedValue(JSON.stringify(sampleData));

      const result = await applyFilterFromFile({
        path: "C:/tmp/data.json",
        dataPath: "data.items",
        conditions: '[{"key":"title","operator":"eq","value":"Published"}]',
      });

      expect(result.error).toBeUndefined();
      expect(result.total).toBe(3);
      expect(result.filtered).toBe(2);
      expect(result.data.map((item: { id: number }) => item.id)).toEqual([2, 3]);
    });
  });

  describe("formatFilterResult / registry", () => {
    it("formatFilterResult 应格式化成功结果", () => {
      const text = formatFilterResult({
        data: [{ id: 1 }],
        total: 3,
        filtered: 1,
      });

      expect(text).toContain("## 数据筛选结果");
      expect(text).toContain("- **总条数**: 3");
      expect(text).toContain('"id": 1');
    });

    it("formatFilterResult 应格式化失败与空结果", () => {
      expect(
        formatFilterResult({ data: null, total: 0, filtered: 0, error: "bad" })
      ).toBe("❌ 过滤失败：bad");

      expect(formatFilterResult({ data: [], total: 3, filtered: 0 })).toContain(
        "*没有匹配的数据。*"
      );
    });

    it("registry 应暴露 agentCallable 的 applyFilter 方法", async () => {
      mockReadTextFile.mockResolvedValue(JSON.stringify(sampleData));

      const registry = new DataFilterRegistry();
      const metadata = registry.getMetadata();
      const method = metadata.methods.find((item) => item.name === "applyFilter");
      const result = await registry.applyFilter({
        path: "C:/tmp/data.json",
        dataPath: "data.items",
        conditions: '[{"key":"active","operator":"eq","value":true}]',
      });

      expect(method?.agentCallable).toBe(true);
      expect(result).toContain("- **筛选后条数**: 2");
      expect(result).toContain('"name": "alpha"');
      expect(result).toContain('"name": "gamma"');
    });
  });
});
