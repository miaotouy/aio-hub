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
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
} from "@/config/model-metadata";
import { resolveAppliedModelGroup } from "../modelMetadataApplication";

describe("resolveAppliedModelGroup", () => {
  it("prefers model metadata over an OpenAI-compatible channel group", () => {
    const claudeMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "claude-sonnet-4",
      "openai"
    );
    const geminiMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-2.5-pro",
      "openai"
    );
    const futureGeminiMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-3.8-flash",
      "openai"
    );
    const multiDigitGeminiMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-3.20-flash",
      "openai"
    );
    const nextMajorGeminiMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-5.1-flash",
      "openai"
    );

    expect(resolveAppliedModelGroup("OpenAI", claudeMetadata?.group)).toBe(
      "Claude 4"
    );
    expect(resolveAppliedModelGroup("OpenAI", geminiMetadata?.group)).toBe(
      "Gemini 2"
    );
    expect(
      resolveAppliedModelGroup("OpenAI", futureGeminiMetadata?.group)
    ).toBe("Gemini 3");
    expect(
      resolveAppliedModelGroup("OpenAI", multiDigitGeminiMetadata?.group)
    ).toBe("Gemini 3");
    expect(
      resolveAppliedModelGroup("OpenAI", nextMajorGeminiMetadata?.group)
    ).toBe("Gemini");
    expect(futureGeminiMetadata?.icon).toBe(`/model-icons/gemini-color.svg`);
  });

  it("keeps the source group when no metadata group matches", () => {
    expect(resolveAppliedModelGroup("Other", undefined)).toBe("Other");
  });
});

describe("current vendor model metadata", () => {
  it("uses Opus 5.5 adaptive effort and its own release metadata", () => {
    const metadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "claude-opus-5-5",
      "anthropic"
    );
    expect(metadata).toMatchObject({
      group: "Claude 5",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      releaseDate: "2026-09-22",
      knowledgeCutoff: "2026-06",
      pricing: { input: 4, output: 20, cacheHitInput: 0.2, unit: "USD" },
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high", "xhigh", "max"],
      },
    });
    expect(metadata?.notBeforeRetirementDate).toBeUndefined();
    const previous = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "claude-opus-5-20260609",
      "anthropic"
    );
    expect(previous).toMatchObject({
      releaseDate: "2026-06-09",
      notBeforeRetirementDate: "2027-06-09",
    });
  });
  it.each(["google", "openai"])(
    "applies Gemini 4 Argon limits and thinking levels through %s",
    (provider) => {
      const metadata = getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "gemini-4-argon",
        provider
      );

      expect(metadata).toMatchObject({
        group: "Gemini 4",
        icon: "/model-icons/gemini-color.svg",
        tokenizer: "gemini",
        contextLength: 1048576,
        maxOutputTokens: 65536,
        pricing: { input: 2, output: 10, cacheHitInput: 0.1, unit: "USD" },
        capabilities: {
          vision: true,
          audio: true,
          video: true,
          document: true,
          toolUse: true,
          webSearch: true,
          fileSearch: true,
          codeExecution: true,
          computerUse: true,
          thinking: true,
          thinkingConfigType: "effort",
          reasoningEffortOptions: ["low", "medium", "high"],
        },
      });
    }
  );

  it("classifies the latest Claude Fable route without requiring a fixed suffix", () => {
    const metadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "claude-fable-5-1",
      "anthropic"
    );

    expect(metadata).toMatchObject({
      group: "Claude 5",
      icon: "/model-icons/claude-color.svg",
      tokenizer: "claude",
      capabilities: { thinking: true, toolUse: true, vision: true },
    });
  });

  it("exposes Gemini transcription models as audio-capable models", () => {
    const fileMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-3.5-transcribe",
      "google"
    );
    const liveMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-3.5-transcribe-live",
      "google"
    );

    expect(fileMetadata).toMatchObject({
      group: "Gemini 3",
      capabilities: { audio: true },
      features: { audio: true },
    });
    expect(liveMetadata).toMatchObject({
      group: "Gemini 3",
      capabilities: { audio: true },
      features: { audio: true, streaming: true },
    });
  });

  it("classifies the current Agnes text and media model routes", () => {
    const textMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "agnes-3.0-flash",
      "agnes-ai"
    );
    const imageMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "agnes-image-2.5-flash",
      "agnes-ai"
    );
    const videoMetadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "agnes-video-2.5-flash",
      "agnes-ai"
    );

    expect(textMetadata).toMatchObject({
      group: "Agnes AI",
      capabilities: { vision: true, thinking: true, toolUse: true },
    });
    expect(imageMetadata).toMatchObject({
      group: "Agnes AI",
      capabilities: { imageGeneration: true, iterativeRefinement: true },
    });
    expect(videoMetadata).toMatchObject({
      group: "Agnes AI",
      capabilities: { videoGeneration: true },
    });
  });

  it("records Agnes 2.5 Flash vision and current context limits", () => {
    const metadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "agnes-2.5-flash",
      "agnes-ai"
    );

    expect(metadata).toMatchObject({
      group: "Agnes AI",
      contextLength: 512000,
      maxOutputTokens: 65536,
      capabilities: { vision: true, thinking: true, toolUse: true },
      features: { vision: true, streaming: true, functionCalling: true },
    });
  });
});

describe("current OpenAI model metadata", () => {
  it("applies GPT-6.1 Sol limits and supported reasoning efforts", () => {
    const metadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gpt-6.1-sol",
      "openai"
    );

    expect(metadata).toMatchObject({
      group: "OpenAI",
      tokenizer: "gpt4o",
      contextLength: 1050000,
      maxOutputTokens: 128000,
      pricing: { input: 2, output: 10, cacheHitInput: 0.1, unit: "USD" },
      releaseDate: "2026-09-29",
      knowledgeCutoff: "2026-04-30",
      capabilities: {
        vision: true,
        toolUse: true,
        computerUse: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "medium", "high", "xhigh", "max"],
      },
    });
  });

  it.each([
    {
      id: "gpt-6-astra",
      input: 10,
      output: 50,
      cacheHitInput: 1,
      cutoff: "2026-04-30",
      release: "2026-09-03",
      efforts: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      id: "gpt-6-sol",
      input: 2,
      output: 10,
      cacheHitInput: 0.2,
      cutoff: "2026-04-20",
      release: "2026-09-22",
      efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    },
    {
      id: "gpt-6-luna",
      input: 0.1,
      output: 0.5,
      cacheHitInput: 0.01,
      cutoff: "2026-05-18",
      release: "2026-09-22",
      efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    },
  ])(
    "applies independently verified specs for $id",
    ({ id, input, output, cacheHitInput, cutoff, release, efforts }) => {
      const metadata = getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        id,
        "openai"
      );

      expect(metadata).toMatchObject({
        group: "OpenAI",
        icon: "/model-icons/openai.svg",
        tokenizer: "gpt4o",
        contextLength: 1050000,
        maxInputTokens: 922000,
        maxOutputTokens: 128000,
        pricing: { input, output, cacheHitInput, unit: "USD" },
        knowledgeCutoff: cutoff,
        releaseDate: release,
        capabilities: {
          vision: true,
          toolUse: true,
          computerUse: true,
          thinking: true,
          thinkingConfigType: "effort",
          reasoningEffortOptions: efforts,
        },
      });
    }
  );
});
