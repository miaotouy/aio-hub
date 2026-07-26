import { describe, expect, it } from "vitest";
import type { ProcessableMessage } from "@/tools/llm-chat/types";
import {
  handleConvertSystemToUser,
  handleEnsureAlternatingRoles,
  handleMergeConsecutiveRoles,
  handleMergeSystemToHead,
  messageFormatter,
} from "../message-formatter";

const messages: ProcessableMessage[] = [
  { role: "system", content: "first" },
  { role: "user", content: "one" },
  { role: "system", content: "second" },
  { role: "user", content: "two" },
];

describe("messageFormatter", () => {
  it("merges system messages at the head", () => {
    const result = handleMergeSystemToHead(messages, "|");
    expect(result.map((message) => message.content)).toEqual([
      "first|second",
      "one",
      "two",
    ]);
    expect(result[0].sourceType).toBe("merged");
  });

  it("merges consecutive roles and can convert or alternate roles", () => {
    const consecutive: ProcessableMessage[] = [
      { role: "user", content: "one" },
      { role: "user", content: "two" },
      { role: "assistant", content: "three" },
      { role: "assistant", content: "four" },
    ];
    expect(handleMergeConsecutiveRoles(consecutive, "|").map((item) => item.content)).toEqual([
      "one|two",
      "three|four",
    ]);
    expect(handleConvertSystemToUser(messages)[0].role).toBe("user");
    expect(
      handleEnsureAlternatingRoles(consecutive, "u", "a").map(
        (item) => item.content
      )
    ).toEqual(["one", "a", "two", "three", "u", "four"]);
  });

  it("applies agent rules after model rules", async () => {
    const context = {
      messages: structuredClone(messages),
      session: {},
      agentConfig: {
        parameters: {
          contextPostProcessing: {
            rules: [
              { type: "post:convert-system-to-user", enabled: false },
              { type: "post:merge-consecutive-roles", enabled: false },
            ],
          },
        },
      },
      settings: {},
      timestamp: Date.now(),
      sharedData: new Map([
        ["model", { defaultPostProcessingRules: ["post:convert-system-to-user"] }],
      ]),
      logs: [],
    } as unknown as Parameters<typeof messageFormatter.execute>[0];

    await messageFormatter.execute(context);

    expect(context.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "user",
    ]);
    expect(context.messages.map((message) => message.content)).toEqual([
      "first\n\n---\n\nsecond",
      "one",
      "two",
    ]);
  });
});