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
      "gemini-4.1-flash",
      "openai"
    );

    expect(resolveAppliedModelGroup("OpenAI", claudeMetadata?.group)).toBe(
      "Claude 4"
    );
    expect(resolveAppliedModelGroup("OpenAI", geminiMetadata?.group)).toBe(
      "Gemini 2"
    );
    expect(resolveAppliedModelGroup("OpenAI", futureGeminiMetadata?.group)).toBe(
      "Gemini 3"
    );
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
      capabilities: { thinking: false, toolUse: true, vision: true },
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
  it("classifies GPT-6 Astra as an OpenAI flagship model", () => {
    const metadata = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gpt-6-astra",
      "openai"
    );

    expect(metadata).toMatchObject({
      group: "OpenAI",
      icon: `/model-icons/openai.svg`,
      capabilities: {
        thinking: true,
        toolUse: true,
      },
    });
  });
});
