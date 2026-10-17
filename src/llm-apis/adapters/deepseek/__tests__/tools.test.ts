import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import { fetchWithTimeout } from "@/llm-apis/common";
import { callDeepSeekSearchApi, callDeepSeekFetchApi } from "../tools";
const keyManager = vi.hoisted(() => ({
  ensureLoaded: vi.fn(async () => undefined),
  pickKey: vi.fn((profile: { apiKeys: string[] }) => profile.apiKeys[0]),
  reportSuccess: vi.fn(),
  reportFailure: vi.fn(),
}));
vi.mock("@/composables/useLlmKeyManager", () => ({
  useLlmKeyManager: () => keyManager,
}));
vi.mock("@/llm-apis/common", () => ({ fetchWithTimeout: vi.fn() }));
const profile: LlmProfile = {
  id: "tools-test",
  name: "Test",
  type: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKeys: ["test-only-key"],
  enabled: true,
  models: [],
  networkStrategy: "proxy",
};
const item = {
  title: "发布说明",
  url: "https://example.com/news",
  snippet: "短摘要",
  summary: "长摘要",
  content: "",
  site_name: null,
  site_icon: null,
  date: null,
  rerank_score: 2.1,
  authority: 3,
};
const success = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

describe("DeepSeek Search/Fetch API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithTimeout).mockReset();
  });

  it.each([
    "https://api.deepseek.com",
    "https://api.deepseek.com/v1/",
    "https://proxy.example/service/v1",
  ])("规范化基础地址并保留反向代理路径：%s", async (baseUrl) => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(success({ results: [item] }));
    await callDeepSeekSearchApi(
      { ...profile, baseUrl },
      {
        query: "更新",
        count: 5,
        originalQuestion: "有什么更新",
        localization: "127.0.0.1",
        needContent: true,
      }
    );
    const [url, request] = vi.mocked(fetchWithTimeout).mock.calls[0];
    expect(url).toBe(
      baseUrl.includes("proxy")
        ? "https://proxy.example/service/v1/tools/search"
        : "https://api.deepseek.com/v1/tools/search"
    );
    expect(JSON.parse(String(request.body))).toEqual({
      query: "更新",
      count: 5,
      ori_question: "有什么更新",
      localization: "127.0.0.1",
      need_content: true,
    });
    expect(request).toMatchObject({
      method: "POST",
      requestKind: "tool",
      proxyBodyKind: "raw",
      networkStrategy: "proxy",
    });
  });

  it("返回结构化来源并保留正常的空搜索结果", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(success({ results: [item] }))
      .mockResolvedValueOnce(success({ results: [] }));
    const page = await callDeepSeekSearchApi(profile, { query: "发布" });
    expect(page.results[0]).toMatchObject({
      summary: "长摘要",
      siteName: null,
      date: null,
      rerankScore: 2.1,
      authority: 3,
    });
    expect(
      (await callDeepSeekSearchApi(profile, { query: "无匹配" })).results
    ).toEqual([]);
  });

  it("按 Unicode 字符校验搜索词，允许 128 个非 BMP 字符", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(success({ results: [] }));
    await callDeepSeekSearchApi(profile, { query: "🌏".repeat(128) });
    await expect(
      callDeepSeekSearchApi(profile, { query: "🌏".repeat(129) })
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it.each([0, 51, 1.5])("无效结果数量在网络调用前被拒绝：%s", async (count) => {
    await expect(
      callDeepSeekSearchApi(profile, { query: "更新", count })
    ).rejects.toMatchObject({ code: "INVALID_COUNT" });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it.each([
    [401, false],
    [402, false],
    [429, true],
    [503, true],
  ] as const)(
    "保留 HTTP %s 的重试语义，单次失败保持一次请求",
    async (status, retryable) => {
      vi.mocked(fetchWithTimeout).mockResolvedValue(
        new Response("{}", { status })
      );
      await expect(
        callDeepSeekSearchApi(profile, { query: "更新" })
      ).rejects.toMatchObject({ status, retryable });
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    }
  );

  it("账号级限流保留 Key 状态，工具调用等待渠道 Key 设置加载", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response("{}", { status: 429 })
    );
    await expect(
      callDeepSeekSearchApi(profile, { query: "更新" })
    ).rejects.toMatchObject({ status: 429 });
    expect(keyManager.ensureLoaded).toHaveBeenCalledOnce();
    expect(keyManager.reportFailure).toHaveBeenCalledWith(
      profile.id,
      "test-only-key",
      expect.any(Error),
      expect.objectContaining({
        allowAutoDisable: false,
        countTowardThreshold: false,
      })
    );
  });

  it("抓取发送单一目标地址并解析 Markdown 正文", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      success({ title: "Article", content: "# Article\n\n正文" })
    );
    const result = await callDeepSeekFetchApi(profile, {
      url: "https://example.com/article",
    });
    expect(result).toEqual({ title: "Article", content: "# Article\n\n正文" });
    expect(
      JSON.parse(String(vi.mocked(fetchWithTimeout).mock.calls[0][1].body))
    ).toEqual({ url: "https://example.com/article" });
  });

  it("不可用正文与危险来源被识别为响应错误", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(success({ content: " " }))
      .mockResolvedValueOnce(
        success({ results: [{ ...item, url: "javascript:alert(1)" }] })
      );
    await expect(
      callDeepSeekFetchApi(profile, { url: "https://example.com" })
    ).rejects.toMatchObject({ code: "EMPTY_CONTENT" });
    await expect(
      callDeepSeekSearchApi(profile, { query: "更新" })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
