// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profiles: {
    value: [
      {
        models: [
          { id: "model", tokenizerProfileId: "explicit", capabilities: {} },
        ],
      },
    ],
  },
  calculateTokens: vi.fn(async () => ({
    count: 7,
    isEstimated: false,
    tokenizerName: "explicit",
  })),
  calculateImageTokens: vi.fn(async (width: number) => width),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ profiles: mocks.profiles }),
}));
vi.mock("../stores/tokenizerRegistryStore", () => ({
  useTokenizerRegistryStore: vi.fn(),
}));
vi.mock("../worker/calculator.proxy", () => ({
  calculatorProxy: {
    calculateTokens: mocks.calculateTokens,
    calculateImageTokens: mocks.calculateImageTokens,
    getRegistryRevision: () => 1,
  },
}));
import { tokenCalculatorService } from "../token-calculator.registry";

describe("scoped multimodal token calculation", () => {
  // The same text must use the configured tokenizer in every stage; media options remain live.
  it("reuses explicit-tokenizer text across text and media requests without reusing image costs", async () => {
    const scope = tokenCalculatorService.createScope();
    const image = [
      { type: "image" as const, metadata: { width: 2048, height: 1024 } },
    ];
    const [text, small, large] = await Promise.all([
      scope.calculateTokens("hello", "model"),
      scope.calculateMessageTokens("hello", "model", image, {
        maxImageDimension: 512,
      }),
      scope.calculateMessageTokens("hello", "model", image, {
        maxImageDimension: 1024,
      }),
    ]);
    expect(text.count).toBe(7);
    expect(mocks.calculateTokens).toHaveBeenCalledTimes(1);
    expect(mocks.calculateTokens).toHaveBeenCalledWith(
      "hello",
      "model",
      "explicit"
    );
    expect(small).toMatchObject({
      count: 519,
      textTokenCount: 7,
      imageTokenCount: 512,
    });
    expect(large).toMatchObject({
      count: 1031,
      textTokenCount: 7,
      imageTokenCount: 1024,
    });
  });
});
