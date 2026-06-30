import { describe, it, expect, beforeEach, vi } from "vitest";
import WebDistilleryRegistry from "../web-distillery.registry";
import type { FetchResult, ExtractResult } from "../types";

const { mockQuickFetch, mockSmartExtract, mockFormatFetchResult } = vi.hoisted(
  () => ({
    mockQuickFetch: vi.fn(),
    mockSmartExtract: vi.fn(),
    mockFormatFetchResult: vi.fn(
      (result: FetchResult | ExtractResult) => `formatted:${result.title}`
    ),
  })
);

vi.mock("../actions", () => ({
  quickFetch: mockQuickFetch,
  smartExtract: mockSmartExtract,
}));

vi.mock("../formatters", () => ({
  formatFetchResult: mockFormatFetchResult,
}));

const fetchResult: FetchResult = {
  url: "https://example.com/post",
  title: "Example Post",
  content: "distilled content",
  contentLength: 17,
  format: "markdown",
  quality: 0.92,
  mode: "fast",
  fetchedAt: "2026-06-28T10:00:00+08:00",
};

describe("web-distillery registry", () => {
  beforeEach(() => {
    mockQuickFetch.mockReset();
    mockSmartExtract.mockReset();
    mockFormatFetchResult.mockClear();
  });

  it("quickFetch 应适配 Agent 参数并格式化提取结果", async () => {
    const context = { reportStatus: vi.fn() };
    mockQuickFetch.mockResolvedValue(fetchResult);

    const registry = new WebDistilleryRegistry();
    const output = await registry.quickFetch(
      {
        url: "https://example.com/post",
        format: "text",
        cleanMode: "false",
      },
      context as any
    );

    expect(mockQuickFetch).toHaveBeenCalledWith(
      {
        url: "https://example.com/post",
        format: "text",
        cleanMode: false,
      },
      context
    );
    expect(mockFormatFetchResult).toHaveBeenCalledWith(fetchResult);
    expect(output).toBe("formatted:Example Post");
  });

  it("smartExtract 应传递 waitFor 并支持字符串 true 布尔值", async () => {
    const smartResult: ExtractResult = {
      ...fetchResult,
      title: "Rendered Post",
      mode: "smart",
    };
    mockSmartExtract.mockResolvedValue(smartResult);

    const registry = new WebDistilleryRegistry();
    const output = await registry.smartExtract({
      url: "https://example.com/app",
      format: "html",
      waitFor: ".article",
      cleanMode: "true",
    });

    expect(mockSmartExtract).toHaveBeenCalledWith(
      {
        url: "https://example.com/app",
        format: "html",
        waitFor: ".article",
        cleanMode: true,
      },
      undefined
    );
    expect(output).toBe("formatted:Rendered Post");
  });

  it("动作返回 null 时应返回明确错误文本且不调用格式化器", async () => {
    mockQuickFetch.mockResolvedValue(null);
    mockSmartExtract.mockResolvedValue(null);

    const registry = new WebDistilleryRegistry();

    await expect(
      registry.quickFetch({ url: "https://bad.test" })
    ).resolves.toBe("错误: 网页内容获取失败。");
    await expect(
      registry.smartExtract({ url: "https://bad.test" })
    ).resolves.toContain("错误: 智能提取失败");
    expect(mockFormatFetchResult).not.toHaveBeenCalled();
  });

  it("getMetadata 应声明两个 Agent 可调用方法", () => {
    const registry = new WebDistilleryRegistry();
    const metadata = registry.getMetadata();

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "quickFetch",
      "smartExtract",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
  });
});
