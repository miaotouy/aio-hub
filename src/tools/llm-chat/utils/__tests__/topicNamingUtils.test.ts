import { describe, expect, it } from "vitest";
import {
  buildTopicNamingRequestOptions,
  extractTopicTitle,
  sanitizeTopicContextContent,
  shouldUseTopicStructuredOutput,
  stripConfiguredThinkingBlocks,
} from "../topicNamingUtils";

describe("topicNamingUtils", () => {
  describe("extractTopicTitle", () => {
    it("extracts title from strict JSON content", () => {
      const title = extractTopicTitle({
        content: '{"title":"思考模型命名优化"}',
      });

      expect(title).toBe("思考模型命名优化");
    });

    it("extracts title from fenced JSON content", () => {
      const title = extractTopicTitle({
        content: '```json\n{"title":"会话标题清洗"}\n```',
      });

      expect(title).toBe("会话标题清洗");
    });

    it("strips thinking blocks before reading the final title", () => {
      const title = extractTopicTitle({
        content: "<think>我先分析一下需求</think>\n标题：话题命名适配",
      });

      expect(title).toBe("话题命名适配");
    });

    it("uses the last useful line for leaked reasoning prose", () => {
      const title = extractTopicTitle({
        content: "我需要先理解用户想法。\n最终标题：推理模型标题生成",
      });

      expect(title).toBe("推理模型标题生成");
    });

    it("rejects prompt echoes instead of saving them as titles", () => {
      const title = extractTopicTitle({
        content:
          "我们被要求为以上对话综合情况生成一个简短精准的标题 不可使用任何标点符号 直接输出标题文本",
      });

      expect(title).toBeNull();
    });

    it("keeps technical titles that mention JSON objects", () => {
      const title = extractTopicTitle({
        content: "JSON 对象解析",
      });

      expect(title).toBe("JSON 对象解析");
    });

    it("rejects empty content even if reasoning content exists", () => {
      const title = extractTopicTitle({
        content: "",
        reasoningContent: "这里是思考内容",
      });

      expect(title).toBeNull();
    });
  });

  describe("stripConfiguredThinkingBlocks", () => {
    it("supports custom thinking tags", () => {
      const stripped = stripConfiguredThinkingBlocks(
        "<analysis>内部推理</analysis>\n真实标题",
        ["analysis"]
      );

      expect(stripped).toBe("真实标题");
    });
  });

  describe("sanitizeTopicContextContent", () => {
    it("removes thinking blocks from context messages", () => {
      const sanitized = sanitizeTopicContextContent(
        "正文前<thinking>隐藏推理</thinking>正文后"
      );

      expect(sanitized).toBe("正文前正文后");
    });
  });

  describe("buildTopicNamingRequestOptions", () => {
    it("uses low reasoning effort for effort-based thinking models", () => {
      const request = buildTopicNamingRequestOptions({
        profileId: "p1",
        modelId: "m1",
        temperature: 0.5,
        maxTokens: 30,
        useStructuredOutput: true,
        isRetry: false,
        capabilities: {
          thinking: true,
          thinkingConfigType: "effort",
        },
      });

      expect(request.reasoningEffort).toBe("low");
      expect(request.maxTokens).toBe(256);
      expect(request.responseFormat?.type).toBe("json_schema");
    });

    it("enables a small thinking budget on retry for budget models", () => {
      const request = buildTopicNamingRequestOptions({
        profileId: "p1",
        modelId: "m1",
        temperature: 0.5,
        maxTokens: 30,
        useStructuredOutput: false,
        isRetry: true,
        capabilities: {
          thinking: true,
          thinkingConfigType: "budget",
        },
      });

      expect(request.thinkingEnabled).toBe(true);
      expect(request.thinkingBudget).toBe(256);
      expect(request.maxTokens).toBeGreaterThan(request.thinkingBudget!);
      expect(request.responseFormat).toBeUndefined();
    });
  });

  describe("shouldUseTopicStructuredOutput", () => {
    it("allows official OpenAI-style model ids", () => {
      expect(
        shouldUseTopicStructuredOutput({
          profileType: "openai",
          modelId: "gpt-5",
          modelProvider: "openai",
        })
      ).toBe(true);
    });

    it("skips non-OpenAI models behind OpenAI-compatible profiles", () => {
      expect(
        shouldUseTopicStructuredOutput({
          profileType: "openai",
          modelId: "deepseek-v4-flash",
          modelProvider: "deepseek",
        })
      ).toBe(false);
    });
  });
});
