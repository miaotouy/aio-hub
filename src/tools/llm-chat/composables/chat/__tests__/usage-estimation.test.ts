import { describe, expect, it, vi } from "vitest";
const tokens = vi.hoisted(() => ({
  calculateTokens: vi.fn(async (text: string) => ({
    count: text.length,
    isEstimated: false,
    tokenizerName: "test",
  })),
}));
vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: tokens,
}));
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({}),
}));
vi.mock("../../session/useSessionManager", () => ({
  useSessionManager: () => ({}),
}));
vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({}),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({}),
}));
vi.mock("@/composables/useAttachmentProcessor", () => ({
  processInlineData: vi.fn(),
}));
vi.mock("../useStreamingMessageSources", () => ({
  appendStreamingMessageChunk: vi.fn(),
  completeAndDisposeStreamingMessageSource: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
import { useChatResponseHandler } from "../useChatResponseHandler";
import type { LlmResponse } from "@/llm-apis/common";
describe("usage display estimation provenance", () => {
  it.each([
    undefined,
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      providerUsageStatus: "reported" as const,
      reportedUsageFields: { input_tokens: 0, output_tokens: 0 },
    },
  ])(
    "preserves upstream missing/zero usage across local fallback and repeated validation (%#)",
    async (usage) => {
      const response: LlmResponse = {
        content: "answer",
        reasoningContent: "think",
        usage,
      };
      const handler = useChatResponseHandler();
      await handler.validateAndFixUsage(response, "model", [
        { role: "user", content: "prompt" },
      ]);
      expect(response.providerUsage).toEqual(usage);
      expect(response.usage).toMatchObject({
        promptTokens: 6,
        completionTokens: 12,
        totalTokens: 18,
        isLocalEstimated: true,
      });
      expect(response.estimatedUsage).toEqual(response.usage);
      await handler.validateAndFixUsage(response, "model", [
        { role: "user", content: "prompt" },
      ]);
      expect(response.providerUsage).toEqual(usage);
    }
  );
});
