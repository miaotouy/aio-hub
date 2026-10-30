import { describe, expect, it } from "vitest";
import { attachRequestSources, protocolInput } from "../src/request-sources";
import { anthropicMessagesAdapter } from "../src/providers/anthropic-messages";
import { googleGenerateContentAdapter } from "../src/providers/google-generate-content";
import { openAiResponsesAdapter } from "../src/providers/openai-responses";
import { cohereChatAdapter } from "../src/providers/cohere-chat";
import type { LlmRequest } from "../src/types/request";
const profile = { provider: "test", baseUrl: "https://example.test" };
describe("final protocol source references", () => {
  it.each([
    anthropicMessagesAdapter,
    googleGenerateContentAdapter,
    openAiResponsesAdapter,
  ])(
    "maps extracted system and duplicate body messages using adapter $id",
    async (adapter) => {
      const request: LlmRequest = {
        model: "test",
        messages: [
          { role: "system", content: "instruction", sourceKeys: ["preset"] },
          { role: "user", content: "same", sourceKeys: ["first"] },
          { role: "user", content: "same", sourceKeys: ["second"] },
        ],
      };
      const wire = await adapter.buildRequest(profile, request);
      await attachRequestSources(adapter, profile, request, wire);
      expect(wire.sourceMap).toEqual({
        messages: [["first"], ["second"]],
        system: ["preset"],
        complete: true,
      });
      expect(protocolInput(wire).messages).toHaveLength(2);
    }
  );
  it("keeps the original source across split Cohere tool results", async () => {
    const request: LlmRequest = {
      model: "test",
      messages: [
        {
          role: "tool",
          sourceKeys: ["parallel-results"],
          content: [
            { type: "tool_result", toolUseId: "a", content: "first" },
            { type: "tool_result", toolUseId: "b", content: "second" },
          ],
        },
      ],
    };
    const wire = await cohereChatAdapter.buildRequest(profile, request);
    await attachRequestSources(cohereChatAdapter, profile, request, wire);
    expect(wire.sourceMap?.messages).toEqual([
      ["parallel-results"],
      ["parallel-results"],
    ]);
  });
  it("marks overwritten extra-body messages as unknown", async () => {
    const request: LlmRequest = {
      model: "test",
      messages: [
        { role: "user", content: "original", sourceKeys: ["original"] },
      ],
      extraBody: { messages: [{ role: "user", content: "overridden" }] },
    };
    const wire = await anthropicMessagesAdapter.buildRequest(profile, request);
    await attachRequestSources(
      anthropicMessagesAdapter,
      profile,
      request,
      wire
    );
    expect(wire.sourceMap).toEqual({
      messages: [[]],
      system: [],
      complete: false,
    });
  });
});
