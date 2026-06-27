import { describe, it, expect, beforeEach, vi } from "vitest";
import DirectoryJanitorRegistry from "../directory-janitor.registry";

const { mockRunner, mockWrapAsync } = vi.hoisted(() => ({
  mockRunner: {
    initialize: vi.fn(),
    analyzePath: vi.fn(),
    cleanupItems: vi.fn(),
    dispose: vi.fn(),
    getFormattedScanResult: vi.fn(),
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

vi.mock("../composables/useDirectoryJanitorRunner", () => ({
  useDirectoryJanitorRunner: () => mockRunner,
}));

vi.mock("../utils/utils", () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
}));

const scanResult = {
  summary: "扫描完成: 找到 2 项（1 个目录，1 个文件），共 3072 B",
  details: {
    totalItems: 2,
    totalSize: 3072,
    totalDirs: 1,
    totalFiles: 1,
    items: [
      {
        path: "C:/repo/cache",
        name: "cache",
        isDir: true,
        size: 2048,
        modified: 1,
      },
      {
        path: "C:/repo/debug.log",
        name: "debug.log",
        isDir: false,
        size: 1024,
        modified: 2,
      },
    ],
  },
};

describe("directory-janitor registry", () => {
  beforeEach(() => {
    mockRunner.initialize.mockReset();
    mockRunner.analyzePath.mockReset();
    mockRunner.cleanupItems.mockReset();
    mockRunner.dispose.mockReset();
    mockRunner.getFormattedScanResult.mockReset();
    mockWrapAsync.mockClear();
  });

  it("scanDirectory 默认应隐藏完整 items 并释放 runner", async () => {
    mockRunner.getFormattedScanResult.mockReturnValue(scanResult);

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanDirectory({
      path: "C:/repo",
      namePattern: "*.log",
      minAgeDays: 7,
      minSizeMB: 1,
      maxDepth: 3,
    });

    expect(mockRunner.initialize).toHaveBeenCalledTimes(1);
    expect(mockRunner.analyzePath).toHaveBeenCalledWith({
      path: "C:/repo",
      namePattern: "*.log",
      minAgeDays: 7,
      minSizeMB: 1,
      maxDepth: 3,
    });
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      summary: scanResult.summary,
      details: {
        ...scanResult.details,
        items: [],
      },
    });
  });

  it("scanDirectory includeDetails=true 时应保留扫描项目列表", async () => {
    mockRunner.getFormattedScanResult.mockReturnValue(scanResult);

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanDirectory({
      path: "C:/repo",
      includeDetails: true,
    });

    expect(result?.details.items).toEqual(scanResult.details.items);
  });

  it("scanDirectory 应将 includeDetails 字符串 false 解析为 false", async () => {
    mockRunner.getFormattedScanResult.mockReturnValue(scanResult);

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanDirectory({
      path: "C:/repo",
      includeDetails: "false",
    } as any);

    expect(result?.details.items).toEqual([]);
  });

  it("cleanupItems 应格式化成功和失败统计", async () => {
    mockRunner.cleanupItems.mockResolvedValue({
      successCount: 2,
      errorCount: 1,
      freedSpace: 4096,
      errors: ["C:/repo/locked.log: permission denied"],
    });

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.cleanupItems({
      paths: ["C:/repo/cache", "C:/repo/debug.log", "C:/repo/locked.log"],
    });

    expect(mockRunner.cleanupItems).toHaveBeenCalledWith([
      "C:/repo/cache",
      "C:/repo/debug.log",
      "C:/repo/locked.log",
    ]);
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      summary: "清理完成: 2 项成功，1 项失败，释放 4096 B",
      details: {
        successCount: 2,
        errorCount: 1,
        freedSpace: 4096,
        errors: ["C:/repo/locked.log: permission denied"],
      },
    });
  });

  it("cleanupItems runner 返回 null 时应透传 null", async () => {
    mockRunner.cleanupItems.mockResolvedValue(null);

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.cleanupItems({
      paths: ["C:/repo/debug.log"],
    });

    expect(result).toBeNull();
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
  });

  it("scanAndCleanup 没有扫描项目时应跳过清理", async () => {
    mockRunner.getFormattedScanResult.mockReturnValue({
      ...scanResult,
      details: {
        ...scanResult.details,
        totalItems: 0,
        totalSize: 0,
        totalDirs: 0,
        totalFiles: 0,
        items: [],
      },
    });

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanAndCleanup({
      path: "C:/repo",
      namePattern: "*.tmp",
    });

    expect(mockRunner.analyzePath).toHaveBeenCalledWith({
      path: "C:/repo",
      namePattern: "*.tmp",
    });
    expect(mockRunner.cleanupItems).not.toHaveBeenCalled();
    expect(result?.cleanupResult).toEqual({
      summary: "没有需要清理的项目",
      details: {
        successCount: 0,
        errorCount: 0,
        freedSpace: 0,
        errors: [],
      },
    });
  });

  it("scanAndCleanup 应清理扫描结果中的所有路径", async () => {
    mockRunner.getFormattedScanResult.mockReturnValue(scanResult);
    mockRunner.cleanupItems.mockResolvedValue({
      successCount: 2,
      errorCount: 0,
      freedSpace: 3072,
      errors: [],
    });

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanAndCleanup({
      path: "C:/repo",
      maxDepth: 4,
    });

    expect(mockRunner.cleanupItems).toHaveBeenCalledWith([
      "C:/repo/cache",
      "C:/repo/debug.log",
    ]);
    expect(result?.scanResult).toBe(scanResult);
    expect(result?.cleanupResult.summary).toBe("清理完成: 2 项成功，释放 3072 B");
  });

  it("runner 异常时 wrapAsync 应返回 null 且释放 runner", async () => {
    mockRunner.analyzePath.mockRejectedValue(new Error("scan failed"));

    const registry = new DirectoryJanitorRegistry();
    const result = await registry.scanDirectory({ path: "C:/repo" });

    expect(result).toBeNull();
    expect(mockRunner.dispose).toHaveBeenCalledTimes(1);
    expect(mockWrapAsync).toHaveBeenCalledWith(expect.any(Function), {
      level: "error",
      userMessage: "扫描目录失败",
      context: { path: "C:/repo" },
    });
  });

  it("getMetadata 应声明三个 Agent 方法", () => {
    const registry = new DirectoryJanitorRegistry();
    const metadata = registry.getMetadata();

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "scanDirectory",
      "cleanupItems",
      "scanAndCleanup",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
  });
});
