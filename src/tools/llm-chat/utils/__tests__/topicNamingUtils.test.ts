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

import { describe, expect, it } from "vitest";
import {
  buildTopicNamingRequestOptions,
  extractTopicTitle,
  getTopicStructuredOutputMode,
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

    it("accepts name-style prefixes used by sibling tools", () => {
      const title = extractTopicTitle({
        content: "名称：媒体提示词生成",
      });

      expect(title).toBe("媒体提示词生成");
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

    it("replaces base64 data urls with placeholder", () => {
      const sanitized = sanitizeTopicContextContent(
        "图片数据：data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
      );

      expect(sanitized).toBe("图片数据：[Base64 Data]");
    });

    it("folds long code blocks", () => {
      const longCode =
        "```typescript\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\nconst f = 6;\nconst g = 7;\nconst h = 8;\nconst i = 9;\nconst j = 10;\n```";
      const sanitized = sanitizeTopicContextContent(longCode);

      expect(sanitized).toContain("[代码折叠: 省略 5 行]");
      expect(sanitized).toContain("const a = 1;");
      expect(sanitized).toContain("const j = 10;");
    });

    it("performs smart head-tail truncation for extremely long messages", () => {
      // 构造一个超过 1200 字符的文本
      const headPart = "今天天气真好。我想写一个 Vue 3 的 Composable。";
      const middlePart = "这里是无意义的填充文本。".repeat(150); // 150 * 11 = 1650 字符
      const tailPart = "请帮我重构上面这段代码，让它支持状态持久化。";
      const content = `${headPart}\n${middlePart}\n${tailPart}`;

      const sanitized = sanitizeTopicContextContent(content);

      // 应该保留头部和尾部
      expect(sanitized).toContain("今天天气真好");
      expect(sanitized).toContain("请帮我重构上面这段代码");
      expect(sanitized).toContain("[省略");
      // 长度应该被限制在合理范围内
      expect(sanitized.length).toBeLessThan(1200);
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
      expect(request.maxTokens).toBe(1024);
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
      expect(request.maxTokens).toBeGreaterThanOrEqual(1280);
      expect(request.responseFormat).toBeUndefined();
    });

    it("keeps enough output room when disabling budget thinking on first attempt", () => {
      const request = buildTopicNamingRequestOptions({
        profileId: "p1",
        modelId: "m1",
        temperature: 0.5,
        maxTokens: 128,
        useStructuredOutput: false,
        isRetry: false,
        capabilities: {
          thinking: true,
          thinkingConfigType: "budget",
        },
      });

      expect(request.thinkingEnabled).toBe(false);
      expect(request.thinkingBudget).toBeUndefined();
      expect(request.maxTokens).toBe(1024);
    });

    it("uses json_object response format for json-output-only models", () => {
      const request = buildTopicNamingRequestOptions({
        profileId: "p1",
        modelId: "m1",
        temperature: 0.5,
        maxTokens: 128,
        useStructuredOutput: true,
        structuredOutputMode: "json_object",
        isRetry: false,
        capabilities: {
          jsonOutput: true,
        },
      });

      expect(request.responseFormat?.type).toBe("json_object");
      expect((request.responseFormat as any).json_schema).toBeUndefined();
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

    it("uses model jsonOutput capability for OpenAI-compatible models", () => {
      const options = {
        profileType: "openai-compatible",
        modelId: "custom-json-model",
        modelProvider: "custom",
        capabilities: { jsonOutput: true },
      };

      expect(shouldUseTopicStructuredOutput(options)).toBe(true);
      expect(getTopicStructuredOutputMode(options)).toBe("json_object");
    });

    it("keeps schema mode for providers with native schema support", () => {
      expect(
        getTopicStructuredOutputMode({
          profileType: "gemini",
          modelId: "gemini-2.5-pro",
          capabilities: { jsonOutput: true },
        })
      ).toBe("json_schema");
    });
  });
});
