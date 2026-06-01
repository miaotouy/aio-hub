import { describe, it, expect } from "vitest";
import { estimateMessages, extractServerUsage } from "../tokenEstimator";
import type { ParsedMessage } from "../../types";

describe("tokenEstimator - extractServerUsage", () => {
  describe("OpenAI Chat / Completions", () => {
    it("应从 usage.prompt_tokens / completion_tokens / total_tokens 提取", () => {
      const body = JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 7,
          total_tokens: 19,
        },
      });

      const usage = extractServerUsage(body, "openai-chat");
      expect(usage).not.toBeNull();
      expect(usage).toEqual({
        promptTokens: 12,
        completionTokens: 7,
        totalTokens: 19,
      });
    });

    it("缺失 total_tokens 时应自动推导为 prompt + completion", () => {
      const body = JSON.stringify({
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      const usage = extractServerUsage(body, "openai-chat");
      expect(usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("响应体完全缺失 usage 应返回 null", () => {
      const body = JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      });
      const usage = extractServerUsage(body, "openai-chat");
      expect(usage).toBeNull();
    });
  });

  describe("OpenAI Responses API", () => {
    it("应从 usage.input_tokens / output_tokens 提取", () => {
      const body = JSON.stringify({
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          total_tokens: 50,
        },
      });
      const usage = extractServerUsage(body, "openai-responses");
      expect(usage).toEqual({
        promptTokens: 20,
        completionTokens: 30,
        totalTokens: 50,
      });
    });

    it("应兼容老字段 prompt_tokens / completion_tokens", () => {
      const body = JSON.stringify({
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      });
      const usage = extractServerUsage(body, "openai-responses");
      expect(usage).toEqual({
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      });
    });
  });

  describe("Anthropic", () => {
    it("应从 usage.input_tokens / output_tokens 提取并求和总数", () => {
      const body = JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      const usage = extractServerUsage(body, "anthropic");
      expect(usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it("没有 usage 字段应返回 null", () => {
      const body = JSON.stringify({ model: "claude-3-5-sonnet-20241022" });
      const usage = extractServerUsage(body, "anthropic");
      expect(usage).toBeNull();
    });
  });

  describe("Gemini", () => {
    it("应从 usageMetadata.promptTokenCount / candidatesTokenCount / totalTokenCount 提取", () => {
      const body = JSON.stringify({
        usageMetadata: {
          promptTokenCount: 42,
          candidatesTokenCount: 18,
          totalTokenCount: 60,
        },
      });
      const usage = extractServerUsage(body, "gemini");
      expect(usage).toEqual({
        promptTokens: 42,
        completionTokens: 18,
        totalTokens: 60,
      });
    });

    it("缺失 totalTokenCount 时应自动推导", () => {
      const body = JSON.stringify({
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 9,
        },
      });
      const usage = extractServerUsage(body, "gemini");
      expect(usage).toEqual({
        promptTokens: 11,
        completionTokens: 9,
        totalTokens: 20,
      });
    });
  });

  describe("通用容错", () => {
    it("空响应体应返回 null", () => {
      expect(extractServerUsage(undefined, "openai-chat")).toBeNull();
      expect(extractServerUsage("", "anthropic")).toBeNull();
    });

    it("非 JSON 应返回 null", () => {
      expect(extractServerUsage("not json", "openai-chat")).toBeNull();
    });

    it("unknown 格式应走通用兜底（任意厂商字段都能拿到）", () => {
      const body = JSON.stringify({
        usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
      });
      const usage = extractServerUsage(body, "unknown");
      expect(usage).toEqual({
        promptTokens: 3,
        completionTokens: 5,
        totalTokens: 8,
      });
    });
  });
});

describe("tokenEstimator - estimateMessages", () => {
  it("空消息列表应返回零结果", async () => {
    const result = await estimateMessages([], "gpt-4-turbo");
    expect(result).toEqual({
      text: 0,
      attachment: 0,
      total: 0,
      algorithm: "none",
      isEstimated: false,
    });
  });

  it("应对纯文本消息返回非零文本 Token，附件 Token 为 0（A3 stub）", async () => {
    const messages: ParsedMessage[] = [
      {
        role: "user",
        blocks: [{ type: "text", text: "Hello world, this is a test prompt." }],
      },
    ];

    const result = await estimateMessages(messages, "gpt-4-turbo");
    expect(result.text).toBeGreaterThan(0);
    expect(result.attachment).toBe(0);
    expect(result.total).toBe(result.text);
    // 测试环境没注册 tokenizer profile，应该走 estimator fallback
    expect(typeof result.algorithm).toBe("string");
  });

  it("应将 tool_call 与 thinking 块也计入文本 Token", async () => {
    const messages: ParsedMessage[] = [
      {
        role: "assistant",
        blocks: [
          { type: "thinking", text: "Let me think about this carefully." },
          {
            type: "tool_call",
            toolName: "search",
            toolArguments: { q: "weather in Tokyo" },
          },
        ],
      },
    ];

    const result = await estimateMessages(messages, undefined);
    expect(result.text).toBeGreaterThan(0);
  });

  it("model 为 undefined 时应走 estimator 路径", async () => {
    const messages: ParsedMessage[] = [
      {
        role: "user",
        blocks: [{ type: "text", text: "some content" }],
      },
    ];
    const result = await estimateMessages(messages, undefined);
    expect(result.text).toBeGreaterThan(0);
    expect(result.isEstimated).toBe(true);
  });
});
