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

import { describe, it, expect } from "vitest";
import { parseRequestMessages, parseResponseMessages } from "../messageParser";

describe("messageParser - 请求解析", () => {
  describe("OpenAI Chat 请求", () => {
    it("应解析 system + user + assistant 三轮对话", () => {
      const body = JSON.stringify({
        model: "gpt-4-turbo",
        stream: true,
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
      });

      const result = parseRequestMessages(body, "openai-chat");

      expect(result.format).toBe("openai-chat");
      expect(result.model).toBe("gpt-4-turbo");
      expect(result.stream).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "You are helpful.",
      });
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[2].role).toBe("assistant");
      expect(result.messages[2].blocks[0]).toMatchObject({
        type: "text",
        text: "Hello!",
      });
    });

    it("应解析多模态 content 数组（text + image_url）", () => {
      const body = JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              {
                type: "image_url",
                image_url: { url: "https://example.com/cat.jpg" },
              },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "openai-chat");

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].blocks).toHaveLength(2);
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "What's in this image?",
      });
      expect(result.messages[0].blocks[1]).toMatchObject({
        type: "image",
        imageRef: "https://example.com/cat.jpg",
      });
    });

    it("应解析 assistant 的 tool_calls", () => {
      const body = JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Tokyo"}',
                },
              },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "openai-chat");

      expect(result.messages[0].blocks).toHaveLength(1);
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "tool_call",
        toolName: "get_weather",
        toolCallId: "call_abc",
        toolArguments: { city: "Tokyo" },
      });
    });

    it("请求体非合法 JSON 应在 errors 中报告且不抛错", () => {
      const result = parseRequestMessages("not json {{", "openai-chat");
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.messages).toEqual([]);
    });

    it("请求体为空时应在 errors 中报告", () => {
      const result = parseRequestMessages(undefined, "openai-chat");
      expect(result.errors).toContain("请求体为空");
    });
  });

  describe("Anthropic 请求", () => {
    it("应解析顶层 system 字符串与 messages", () => {
      const body = JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        system: "You are Claude.",
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Let me think..." },
              { type: "text", text: "Hi there." },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "anthropic");

      expect(result.format).toBe("anthropic");
      expect(result.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.messages).toHaveLength(3);

      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "You are Claude.",
      });

      expect(result.messages[2].role).toBe("assistant");
      expect(result.messages[2].blocks).toHaveLength(2);
      expect(result.messages[2].blocks[0]).toMatchObject({
        type: "thinking",
        text: "Let me think...",
      });
      expect(result.messages[2].blocks[1]).toMatchObject({
        type: "text",
        text: "Hi there.",
      });
    });

    it("应解析 tool_use 与 tool_result 块", () => {
      const body = JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "get_weather",
                input: { city: "Tokyo" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: "Sunny, 25°C",
              },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "anthropic");

      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "tool_call",
        toolName: "get_weather",
        toolCallId: "toolu_1",
        toolArguments: { city: "Tokyo" },
      });
      expect(result.messages[1].blocks[0]).toMatchObject({
        type: "tool_result",
        toolCallId: "toolu_1",
        toolResult: "Sunny, 25°C",
      });
    });
  });

  describe("Gemini 请求", () => {
    it("应解析 systemInstruction + contents", () => {
      const body = JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are Gemini." }],
        },
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
          { role: "model", parts: [{ text: "Hi!" }] },
        ],
      });

      const result = parseRequestMessages(body, "gemini");

      expect(result.format).toBe("gemini");
      expect(result.messages).toHaveLength(3);

      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "You are Gemini.",
      });

      expect(result.messages[1].role).toBe("user");
      expect(result.messages[2].role).toBe("model");
      expect(result.messages[2].blocks[0]).toMatchObject({
        type: "text",
        text: "Hi!",
      });
    });

    it("应解析 functionCall part 为 tool_call", () => {
      const body = JSON.stringify({
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { city: "Tokyo" },
                },
              },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "gemini");

      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "tool_call",
        toolName: "get_weather",
        toolArguments: { city: "Tokyo" },
      });
    });

    it("应将 thought=true 的 part 标记为 thinking", () => {
      const body = JSON.stringify({
        contents: [
          {
            role: "model",
            parts: [
              { text: "Internal reasoning...", thought: true },
              { text: "Final answer." },
            ],
          },
        ],
      });

      const result = parseRequestMessages(body, "gemini");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "thinking",
        text: "Internal reasoning...",
      });
      expect(result.messages[0].blocks[1]).toMatchObject({
        type: "text",
        text: "Final answer.",
      });
    });
  });
});

describe("messageParser - 响应解析", () => {
  describe("OpenAI Chat 响应", () => {
    it("应解析 choices[0].message.content 与 finish_reason", () => {
      const body = JSON.stringify({
        model: "gpt-4-turbo",
        choices: [
          {
            message: { role: "assistant", content: "Hello there." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = parseResponseMessages(body, "openai-chat");

      expect(result.format).toBe("openai-chat");
      expect(result.model).toBe("gpt-4-turbo");
      expect(result.stopReason).toBe("stop");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("assistant");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "Hello there.",
      });
    });

    it("应将 reasoning_content 标记为 thinking 块", () => {
      const body = JSON.stringify({
        model: "deepseek-reasoner",
        choices: [
          {
            message: {
              role: "assistant",
              reasoning_content: "step 1, step 2",
              content: "Final answer",
            },
            finish_reason: "stop",
          },
        ],
      });

      const result = parseResponseMessages(body, "openai-chat");

      expect(result.messages[0].blocks).toHaveLength(2);
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "thinking",
        text: "step 1, step 2",
      });
      expect(result.messages[0].blocks[1]).toMatchObject({
        type: "text",
        text: "Final answer",
      });
    });

    it("应解析 tool_calls", () => {
      const body = JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_x",
                  function: { name: "calc", arguments: '{"a":1}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });

      const result = parseResponseMessages(body, "openai-chat");
      expect(result.stopReason).toBe("tool_calls");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "tool_call",
        toolName: "calc",
        toolCallId: "call_x",
        toolArguments: { a: 1 },
      });
    });
  });

  describe("Anthropic 响应", () => {
    it("应解析 content blocks（text + thinking + tool_use）", () => {
      const body = JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        role: "assistant",
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "Thinking aloud..." },
          { type: "text", text: "Here is the result." },
          {
            type: "tool_use",
            id: "toolu_2",
            name: "lookup",
            input: { q: "x" },
          },
        ],
      });

      const result = parseResponseMessages(body, "anthropic");

      expect(result.format).toBe("anthropic");
      expect(result.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.stopReason).toBe("end_turn");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].blocks).toHaveLength(3);
      expect(result.messages[0].blocks[0].type).toBe("thinking");
      expect(result.messages[0].blocks[1].type).toBe("text");
      expect(result.messages[0].blocks[2]).toMatchObject({
        type: "tool_call",
        toolName: "lookup",
        toolCallId: "toolu_2",
        toolArguments: { q: "x" },
      });
    });
  });

  describe("Gemini 响应", () => {
    it("应解析 candidates[].content.parts 并提取 finishReason", () => {
      const body = JSON.stringify({
        modelVersion: "gemini-2.0-flash",
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Hi from Gemini" }],
            },
            finishReason: "STOP",
          },
        ],
      });

      const result = parseResponseMessages(body, "gemini");

      expect(result.format).toBe("gemini");
      expect(result.model).toBe("gemini-2.0-flash");
      expect(result.stopReason).toBe("STOP");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("model");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "text",
        text: "Hi from Gemini",
      });
    });

    it("应解析包含 functionCall 的 candidates", () => {
      const body = JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "search",
                    args: { q: "weather" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      });

      const result = parseResponseMessages(body, "gemini");
      expect(result.messages[0].blocks[0]).toMatchObject({
        type: "tool_call",
        toolName: "search",
        toolArguments: { q: "weather" },
      });
    });
  });

  describe("通用容错", () => {
    it("非 JSON 响应体应在 errors 中报告（流式 SSE 场景）", () => {
      const result = parseResponseMessages(
        "data: {...}\n\ndata: [DONE]\n\n",
        "openai-chat"
      );
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.messages).toEqual([]);
    });

    it("空响应体应在 errors 中报告", () => {
      const result = parseResponseMessages(undefined, "anthropic");
      expect(result.errors).toContain("响应体为空");
    });
  });
});
