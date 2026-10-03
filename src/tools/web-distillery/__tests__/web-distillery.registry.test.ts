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
import { describe, it, expect, beforeEach, vi } from "vitest";

import WebDistilleryRegistry from "../web-distillery.registry";
import type { FetchResult, ExtractResult } from "../types";

const {
  mockQuickFetch,
  mockSmartExtract,
  mockJinaFetch,
  mockFormatFetchResult,
} = vi.hoisted(() => ({
  mockQuickFetch: vi.fn(),
  mockSmartExtract: vi.fn(),
  mockJinaFetch: vi.fn(),
  mockFormatFetchResult: vi.fn(
    (result: FetchResult | ExtractResult) => `formatted:${result.title}`
  ),
}));

vi.mock("../actions", () => ({
  quickFetch: mockQuickFetch,
  smartExtract: mockSmartExtract,
  jinaFetch: mockJinaFetch,
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
    mockJinaFetch.mockReset();
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

  it("jinaFetch 应适配 Agent 参数并格式化提炼结果", async () => {
    const context = { reportStatus: vi.fn() };
    const jinaResult: FetchResult = {
      ...fetchResult,
      title: "Jina Post",
      mode: "jina",
    };
    mockJinaFetch.mockResolvedValue(jinaResult);

    const registry = new WebDistilleryRegistry();
    const output = await registry.jinaFetch(
      {
        url: "https://example.com/jina",
        format: "markdown",
        cleanMode: "true",
      },
      context as any
    );

    expect(mockJinaFetch).toHaveBeenCalledWith(
      {
        url: "https://example.com/jina",
        format: "markdown",
        cleanMode: true,
      },
      context
    );
    expect(mockFormatFetchResult).toHaveBeenCalledWith(jinaResult);
    expect(output).toBe("formatted:Jina Post");
  });

  it("动作返回 null 时应返回明确错误文本且不调用格式化器", async () => {
    mockQuickFetch.mockResolvedValue(null);
    mockSmartExtract.mockResolvedValue(null);
    mockJinaFetch.mockResolvedValue(null);

    const registry = new WebDistilleryRegistry();

    await expect(
      registry.quickFetch({ url: "https://bad.test" })
    ).resolves.toBe("错误: 网页内容获取失败。");
    await expect(
      registry.smartExtract({ url: "https://bad.test" })
    ).resolves.toContain("错误: 智能提取失败");
    await expect(registry.jinaFetch({ url: "https://bad.test" })).resolves.toBe(
      "错误: Jina Reader 提炼失败。"
    );
    expect(mockFormatFetchResult).not.toHaveBeenCalled();
  });

  it("getMetadata 应声明三个 Agent 可调用方法", () => {
    const registry = new WebDistilleryRegistry();
    const metadata = registry.getMetadata();

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "quickFetch",
      "smartExtract",
      "jinaFetch",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
  });
});
