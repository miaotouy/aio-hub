import { describe, it, expect, beforeEach, vi } from "vitest";
import ContentDeduplicatorRegistry from "../content-deduplicator.registry";
import type { DedupAnalysisResult } from "../types";

const {
  mockRunner,
  mockStore,
  mockWrapAsync,
} = vi.hoisted(() => ({
  mockRunner: {
    initialize: vi.fn(),
    scanDirectory: vi.fn(),
    dispose: vi.fn(),
  },
  mockStore: {
    scanPath: "",
    config: null as any,
  },
  mockWrapAsync: vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  }),
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
  ErrorLevel: {
    ERROR: "error",
  },
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
    wrapAsync: mockWrapAsync,
  }),
}));

vi.mock("../stores/store", () => ({
  useContentDeduplicatorStore: () => mockStore,
}));

vi.mock("../composables/useDeduplicatorRunner", () => ({
  useDeduplicatorRunner: () => mockRunner,
}));

vi.mock("@/tools/directory-janitor/utils/utils", () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
}));

const duplicateResult: DedupAnalysisResult = {
  statistics: {
    totalFilesScanned: 12,
    totalTextFiles: 10,
    totalGroups: 2,
    totalDuplicates: 3,
    totalWastedBytes: 4096,
  },
  groups: [
    {
      id: "g1",
      representativeFile: {
        path: "C:/repo/a.md",
        name: "a.md",
        size: 2048,
        modified: 1,
        extension: "md",
        isText: true,
      },
      similarFiles: [
        {
          file: {
            path: "C:/repo/a-copy.md",
            name: "a-copy.md",
            size: 2048,
            modified: 2,
            extension: "md",
            isText: true,
          },
          similarity: 1,
          matchType: "exact",
          diffSummary: null,
        },
        {
          file: {
            path: "C:/repo/a-near.md",
            name: "a-near.md",
            size: 1024,
            modified: 3,
            extension: "md",
            isText: true,
          },
          similarity: 0.9,
          matchType: "normalized",
          diffSummary: null,
        },
      ],
      metadata: {
        isSuspicious: false,
        totalWastedBytes: 3072,
        avgSimilarity: 0.95,
      },
    },
    {
      id: "g2",
      representativeFile: {
        path: "C:/repo/b.txt",
        name: "b.txt",
        size: 1024,
        modified: 4,
        extension: "txt",
        isText: true,
      },
      similarFiles: [
        {
          file: {
            path: "C:/repo/b-copy.txt",
            name: "b-copy.txt",
            size: 1024,
            modified: 5,
            extension: "txt",
            isText: true,
          },
          similarity: 1,
          matchType: "exact",
          diffSummary: null,
        },
      ],
      metadata: {
        isSuspicious: false,
        totalWastedBytes: 1024,
        avgSimilarity: 1,
      },
    },
  ],
  skippedFiles: [],
};

describe("content-deduplicator registry", () => {
  beforeEach(() => {
    mockRunner.initialize.mockReset();
    mockRunner.scanDirectory.mockReset();
    mockRunner.dispose.mockReset();
    mockWrapAsync.mockClear();
    mockStore.scanPath = "";
    mockStore.config = null;
  });

  it("scanDuplicates 应初始化 runner、写入 store 配置并格式化重复结果", async () => {
    mockRunner.scanDirectory.mockResolvedValue(duplicateResult);

    const registry = new ContentDeduplicatorRegistry();
    const result = await registry.scanDuplicates({
      path: "C:/repo",
      preset: "code",
      config: {
        minSimilarity: 0.92,
        normalizeOptions: {
          ignoreWhitespace: true,
          ignorePunctuation: true,
          caseSensitive: false,
          preserveLineBreaks: true,
        },
      },
    });

    expect(mockRunner.initialize).toHaveBeenCalledTimes(1);
    expect(mockRunner.scanDirectory).toHaveBeenCalledTimes(1);
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
    expect(mockStore.scanPath).toBe("C:/repo");
    expect(mockStore.config).toMatchObject({
      preset: "code",
      minSimilarity: 0.92,
      normalizeOptions: {
        ignoreWhitespace: true,
        ignorePunctuation: true,
        caseSensitive: false,
        preserveLineBreaks: true,
      },
    });
    expect(result).toEqual({
      summary: "扫描 12 个文件，发现 2 组重复（3 个冗余文件），可释放 4096 B",
      details: {
        totalFilesScanned: 12,
        totalGroups: 2,
        totalDuplicates: 3,
        totalWastedBytes: 4096,
        groups: [
          {
            representativeFile: "C:/repo/a.md",
            duplicateCount: 2,
            wastedBytes: 3072,
            matchType: "exact",
          },
          {
            representativeFile: "C:/repo/b.txt",
            duplicateCount: 1,
            wastedBytes: 1024,
            matchType: "exact",
          },
        ],
      },
    });
  });

  it("没有重复组时应返回未发现重复摘要", async () => {
    mockRunner.scanDirectory.mockResolvedValue({
      ...duplicateResult,
      statistics: {
        totalFilesScanned: 8,
        totalTextFiles: 8,
        totalGroups: 0,
        totalDuplicates: 0,
        totalWastedBytes: 0,
      },
      groups: [],
    });

    const registry = new ContentDeduplicatorRegistry();
    const result = await registry.scanDuplicates({ path: "C:/repo" });

    expect(result?.summary).toBe("扫描 8 个文件，未发现重复");
    expect(result?.details.groups).toEqual([]);
    expect(mockStore.config.preset).toBe("relaxed");
  });

  it("runner 返回 null 时应透传 null 并释放监听", async () => {
    mockRunner.scanDirectory.mockResolvedValue(null);

    const registry = new ContentDeduplicatorRegistry();
    const result = await registry.scanDuplicates({ path: "C:/repo" });

    expect(result).toBeNull();
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
  });

  it("扫描异常时 wrapAsync 应返回 null 且 finally 释放 runner", async () => {
    mockRunner.scanDirectory.mockRejectedValue(new Error("scan failed"));

    const registry = new ContentDeduplicatorRegistry();
    const result = await registry.scanDuplicates({ path: "C:/repo" });

    expect(result).toBeNull();
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
    expect(mockWrapAsync).toHaveBeenCalledWith(expect.any(Function), {
      level: "error",
      userMessage: "查重扫描失败",
      context: { path: "C:/repo" },
    });
  });

  it("getMetadata 应声明 scanDuplicates 为 agentCallable", () => {
    const registry = new ContentDeduplicatorRegistry();
    const metadata = registry.getMetadata();
    const method = metadata.methods.find((item) => item.name === "scanDuplicates");

    expect(method?.agentCallable).toBe(true);
    expect(method?.returnType).toBe("Promise<FormattedDedupResult | null>");
  });
});
