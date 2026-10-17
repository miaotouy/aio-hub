import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWebDistilleryConfig } from "../config";
import type { FetchResult } from "../types";
import { fetchPage, fetchSearchResult } from "../service";
import {
  BrowserUpgradeRequired,
  DistilleryError,
} from "../core/engines/errors";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  http: vi.fn(),
  browser: vi.fn(),
  jina: vi.fn(),
  deepseek: vi.fn(),
}));
vi.mock("../config", async (original) => ({
  ...(await original<object>()),
  ensureDistilleryConfig: mocks.config,
}));
vi.mock("../core/engines/local", () => ({
  fetchHttp: mocks.http,
  fetchBrowser: mocks.browser,
}));
vi.mock("../core/engines/deepseek", async (original) => ({
  ...(await original<object>()),
  fetchDeepSeek: mocks.deepseek,
  searchDeepSeek: vi.fn(),
}));
vi.mock("../core/engines/jina", () => ({ fetchJina: mocks.jina }));
const result: FetchResult = {
  url: "https://example.com/",
  title: "Example",
  content: "article",
  contentLength: 7,
  format: "markdown",
  quality: null,
  mode: "jina",
  fetchedAt: "2026-10-17T00:00:00Z",
};

describe("fetchPage public behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockResolvedValue(createDefaultWebDistilleryConfig());
    mocks.http.mockResolvedValue({ ...result, mode: "fast" });
    mocks.browser.mockResolvedValue({ ...result, mode: "smart" });
    mocks.jina.mockImplementation(async (options) => ({
      ...result,
      content: JSON.stringify({
        format: options.format,
        cleanMode: options.cleanMode,
        timeout: options.timeout,
      }),
    }));
  });

  it("搜索附带正文时复用内容与清洗偏好，摘要来源才调用抓取", async () => {
    const config = createDefaultWebDistilleryConfig();
    config.defaultCleanMode = true;
    mocks.config.mockResolvedValue(config);
    const source = {
      title: "Source",
      url: result.url,
      content: "# Source\n\n[link](https://example.com)",
      summary: "Summary",
      snippet: "",
      siteName: null,
      siteIcon: null,
      date: null,
      rerankScore: null,
      authority: -1,
    };
    const cached = await fetchSearchResult(source);
    expect(cached.content).toBe("# Source\n\nlink");
    expect(cached.mode).toBe("deepseek");
    expect(mocks.deepseek).not.toHaveBeenCalled();
    mocks.deepseek.mockResolvedValue({ ...result, mode: "deepseek" });
    await fetchSearchResult({ ...source, content: "" });
    expect(mocks.deepseek).toHaveBeenCalledTimes(1);
  });

  it("引擎受限格式使用兼容默认值，显式不支持的格式给出错误", async () => {
    const config = createDefaultWebDistilleryConfig();
    config.defaultFormat = "html";
    mocks.config.mockResolvedValue(config);
    mocks.deepseek.mockImplementation(async (options) => ({
      ...result,
      format: options.format,
      mode: "deepseek",
    }));
    expect(
      (await fetchPage({ url: result.url, engine: "deepseek" })).format
    ).toBe("markdown");
    await expect(
      fetchPage({ url: result.url, engine: "deepseek", format: "html" })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(mocks.deepseek).toHaveBeenCalledTimes(1);
  });

  it("后台调用等待配置就绪，并继承已保存的引擎与默认参数", async () => {
    const config = createDefaultWebDistilleryConfig();
    config.defaultMode = "jina";
    config.defaultFormat = "text";
    config.defaultCleanMode = true;
    config.network.timeout = 23000;
    mocks.config.mockResolvedValue(config);
    const page = await fetchPage({ url: result.url });
    expect(JSON.parse(page.content)).toEqual({
      format: "text",
      cleanMode: true,
      timeout: 23000,
    });
  });

  it("显式参数优先于偏好设置，包括 false", async () => {
    const config = createDefaultWebDistilleryConfig();
    config.defaultCleanMode = true;
    mocks.config.mockResolvedValue(config);
    const page = await fetchPage({
      url: result.url,
      engine: "jina",
      format: "text",
      cleanMode: false,
      timeout: 9000,
    });
    expect(JSON.parse(page.content)).toEqual({
      format: "text",
      cleanMode: false,
      timeout: 9000,
    });
  });

  it("快速提取遇到需渲染页面时仅升级到本地浏览器", async () => {
    mocks.http.mockRejectedValue(new BrowserUpgradeRequired("SPA 页面"));
    expect((await fetchPage({ url: result.url, engine: "fast" })).mode).toBe(
      "smart"
    );
    expect(mocks.jina).not.toHaveBeenCalled();
  });

  it("调用方可以禁止浏览器回退", async () => {
    mocks.http.mockRejectedValue(new BrowserUpgradeRequired("SPA 页面"));
    await expect(
      fetchPage({
        url: result.url,
        engine: "fast",
        allowBrowserFallback: false,
      })
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    expect(mocks.browser).not.toHaveBeenCalled();
  });

  it("云端失败保留可行动的状态且不切换到其他引擎", async () => {
    mocks.jina.mockRejectedValue(
      new DistilleryError("RATE_LIMITED", "请求过于频繁", 429, true)
    );
    await expect(
      fetchPage({ url: result.url, engine: "jina" })
    ).rejects.toMatchObject({ status: 429, retryable: true });
    expect(mocks.http).not.toHaveBeenCalled();
    expect(mocks.browser).not.toHaveBeenCalled();
  });

  it.each([
    "file:///private.txt",
    "https://user:password@example.com",
    "invalid",
  ])("无效或含凭据的目标地址在发请求前被拒绝：%s", async (url) => {
    await expect(fetchPage({ url })).rejects.toMatchObject({
      code: "INVALID_URL",
    });
    expect(mocks.http).not.toHaveBeenCalled();
  });
});
