// Copyright 2025-2026 miaotouy(Github@miaotouy)

import { describe, expect, it } from "vitest";
import type { LlmMessage } from "../common";
import {
  getContinuationThinkingOptions,
  normalizeContinuationSettings,
  DEFAULT_CONTINUATION_SETTINGS,
  prepareContinuationMessages,
} from "../continuation";

const last = <T>(values: T[] | undefined): T | undefined =>
  values?.[values.length - 1];

const prefix = '{"message":"接力续';
function history(): LlmMessage[] {
  return [
    { role: "user", content: "输出 JSON" },
    {
      role: "assistant",
      content: prefix,
      prefix: true,
      reasoningContent: "Other model thought",
      reasoningArtifacts: [
        {
          provider: "deepseek",
          kind: "reasoning_content",
          replayPolicy: "with_tool_calls",
          payload: { reasoning_content: "Other model thought" },
        },
      ],
    },
  ];
}

describe("physical-model continuation messages", () => {
  it("preserves native prefix completion and the Beta preference without requiring prior reasoning", () => {
    const messages = history();
    const profile = {
      type: "deepseek" as const,
      options: { deepseekBeta: true },
    };
    const result = prepareContinuationMessages(messages, profile, {})!;
    expect(
      result.map(({ role, content, prefix }) => ({ role, content, prefix }))
    ).toEqual([
      { role: "user", content: "输出 JSON", prefix: undefined },
      { role: "assistant", content: prefix, prefix: true },
    ]);
    expect(result[1].reasoningContent).toBeUndefined();
    expect(result[1].reasoningArtifacts).toBeUndefined();
    expect(messages[1].reasoningContent).toBe("Other model thought");
    expect(profile.options.deepseekBeta).toBe(true);
  });

  it("selects prompt continuation for a physical model without the native capability", () => {
    const messages = history();
    const result = prepareContinuationMessages(
      messages,
      { type: "openai-compatible" },
      {}
    )!;
    expect(
      result.slice(0, 2).map(({ role, content }) => ({ role, content }))
    ).toEqual(messages.map(({ role, content }) => ({ role, content })));
    expect(last(result)?.role).toBe("user");
    // The anchor is an exact, machine-decodable cursor, independent of prompt wording.
    expect(JSON.parse(String(last(result)?.content).split("\n").pop()!)).toBe(
      prefix
    );
    expect(result[1].prefix).toBeUndefined();
    expect(messages).toHaveLength(2);
    expect(
      last(
        prepareContinuationMessages(
          messages,
          { type: "openai-compatible" },
          {
            capabilities: { prefixCompletion: true },
          }
        )
      )?.prefix
    ).toBe(true);
  });

  it("honors an explicit capability override and preserves injections after the source", () => {
    const messages = [
      ...history(),
      { role: "system" as const, content: "Keep this instruction" },
    ];
    const result = prepareContinuationMessages(
      messages,
      { type: "deepseek" },
      {}
    )!;
    expect(result[2]).toBe(messages[2]);
    expect(last(result)?.role).toBe("user");
    expect(
      last(
        prepareContinuationMessages(
          history(),
          { type: "deepseek" },
          {
            capabilities: { prefixCompletion: false },
          }
        )
      )?.role
    ).toBe("user");
    expect(
      last(
        prepareContinuationMessages(
          history(),
          { type: "openai-responses" },
          {
            capabilities: { prefixCompletion: true },
          }
        )
      )?.role
    ).toBe("user");
  });

  it("keeps a bounded exact tail for long prefixes and leaves ordinary requests untouched", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", prefix: true, content: "a".repeat(5000) + "结尾" },
    ];
    const result = prepareContinuationMessages(
      messages,
      { type: "openai" },
      {}
    )!;
    const tail = JSON.parse(String(last(result)?.content).split("\n").pop()!);
    expect(tail).toHaveLength(1200);
    expect(String(messages[0].content).endsWith(tail)).toBe(true);
    const ordinary: LlmMessage[] = [{ role: "user", content: "hello" }];
    expect(
      prepareContinuationMessages(ordinary, { type: "deepseek" }, {})
    ).toBe(ordinary);
  });
});

// Protect user policy across physical model changes and preserve an exact cursor with custom instructions.
describe("continuation preferences", () => {
  it("forces prompt mode for a native-capable model and appends an exact configurable tail", () => {
    const text = "a".repeat(200) + "🌟" + "b".repeat(99);
    const messages: LlmMessage[] = [
      { role: "assistant", content: text, prefix: true },
    ];
    const result = prepareContinuationMessages(
      messages,
      { type: "deepseek" },
      {},
      {
        mode: "prompt",
        prompt: "继续这段代码，只追加新字符。",
        tailLength: 100,
      }
    )!;
    expect(result[0].prefix).toBeUndefined();
    expect(last(result)?.role).toBe("user");
    expect(
      String(last(result)?.content).startsWith("继续这段代码，只追加新字符。\n")
    ).toBe(true);
    const anchor = JSON.parse(String(last(result)?.content).split("\n").pop()!);
    expect(anchor).toBe("b".repeat(99));
    expect(messages[0].prefix).toBe(true);
  });

  it.each(["enabled", "disabled"] as const)(
    "overrides DeepSeek extension thinking with %s only for body continuation",
    (thinking) => {
      const options = {
        profileId: "profile",
        modelId: "model",
        messages: history(),
        continuation: { deepseekThinking: thinking },
        thinkingEnabled: thinking !== "enabled",
        extraBody: { thinking: { type: "old" }, keep: "value" },
      };
      expect(getContinuationThinkingOptions(options, true)).toEqual({
        thinkingEnabled: thinking === "enabled",
        extraBody: { thinking: { type: thinking }, keep: "value" },
      });
      expect(getContinuationThinkingOptions(options, false)).toEqual({});
      expect(
        getContinuationThinkingOptions(
          { ...options, messages: [{ role: "user", content: "hello" }] },
          true
        )
      ).toEqual({});
      expect(options.extraBody.thinking.type).toBe("old");
      expect(
        getContinuationThinkingOptions(
          { ...options, continuation: { deepseekThinking: "inherit" } },
          true
        )
      ).toEqual({});
    }
  );

  it("merges legacy preferences and bounds malformed persisted values", () => {
    expect(normalizeContinuationSettings()).toEqual(
      DEFAULT_CONTINUATION_SETTINGS
    );
    expect(
      normalizeContinuationSettings({
        mode: "prompt",
        deduplicate: false,
        prompt: " ",
      })
    ).toEqual({
      ...DEFAULT_CONTINUATION_SETTINGS,
      mode: "prompt",
      deduplicate: false,
    });
    expect(normalizeContinuationSettings({ tailLength: 1 }).tailLength).toBe(
      100
    );
    expect(normalizeContinuationSettings({ tailLength: 1e8 }).tailLength).toBe(
      16000
    );
    expect(normalizeContinuationSettings({ tailLength: NaN }).tailLength).toBe(
      1200
    );
  });
});
