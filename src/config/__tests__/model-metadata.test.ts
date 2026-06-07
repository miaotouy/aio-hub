import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
  getMatchedRuleChain,
} from "../model-metadata";
import type { ModelMetadataRule } from "@/types/model-metadata";

function makeRule(
  id: string,
  priority: number,
  properties: ModelMetadataRule["properties"],
  overrides: Partial<ModelMetadataRule> = {}
): ModelMetadataRule {
  return {
    id,
    matchType: "modelPrefix",
    matchValue: "gpt",
    priority,
    enabled: true,
    properties,
    ...overrides,
  };
}

describe("model-metadata rule chain", () => {
  it("returns matching rules from low to high priority and merges in the same order", () => {
    const rules = [
      makeRule("provider-openai", 5, { group: "OpenAI" }),
      makeRule("gpt-family", 20, {
        icon: "/model-icons/openai-color.svg",
        capabilities: { vision: true },
      }),
      makeRule("gpt-specific", 100, {
        group: "GPT",
        capabilities: { toolUse: true },
      }),
    ];

    const chain = getMatchedRuleChain(rules, "gpt-4o");
    const finalProperties = getMatchedModelProperties(rules, "gpt-4o");

    expect(chain.map((rule) => rule.id)).toEqual([
      "provider-openai",
      "gpt-family",
      "gpt-specific",
    ]);
    expect(finalProperties).toEqual({
      group: "GPT",
      icon: "/model-icons/openai-color.svg",
      capabilities: { vision: true, toolUse: true },
    });
  });

  it("keeps only rules at or above the highest exclusive priority", () => {
    const rules = [
      makeRule("low", 10, { group: "Low" }),
      makeRule("exclusive", 50, { icon: "/model-icons/gpt.svg" }, {
        exclusive: true,
      }),
      makeRule("high", 80, { group: "High" }),
    ];

    const chain = getMatchedRuleChain(rules, "gpt-4o");
    const finalProperties = getMatchedModelProperties(rules, "gpt-4o");

    expect(chain.map((rule) => rule.id)).toEqual(["exclusive", "high"]);
    expect(finalProperties).toEqual({
      icon: "/model-icons/gpt.svg",
      group: "High",
    });
  });
});

describe("model-metadata presets", () => {
  it("marks image generation parameter presets as image generation models", () => {
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "dall-e-3")
    ).toMatchObject({
      capabilities: {
        imageGeneration: true,
      },
      mediaGenParams: {
        size: {
          default: "1024x1024",
        },
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "gpt-image-2")
    ).toMatchObject({
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
    });
  });

  it("applies Gemma 4 family metadata across common model id forms", () => {
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "gemma-4")
    ).toMatchObject({
      icon: "/model-icons/gemma-color.svg",
      group: "Gemma 4",
      tokenizer: "gemini",
      contextLength: 131072,
      capabilities: {
        vision: true,
        video: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "google/gemma-4-12b")
    ).toMatchObject({
      group: "Gemma 4",
      contextLength: 262144,
      capabilities: {
        audio: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "gemma4:e4b")
    ).toMatchObject({
      group: "Gemma 4",
      contextLength: 131072,
      capabilities: {
        audio: true,
      },
    });
  });

  it("covers recently added model aliases and related families", () => {
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "glm-ocr:bf16")
    ).toMatchObject({
      icon: "/model-icons/zai.svg",
      group: "Z AI",
      capabilities: {
        vision: true,
        document: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "nano-banana-pro-preview"
      )
    ).toMatchObject({
      icon: "/model-icons/gemini-color.svg",
      group: "Gemini",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      mediaGenParams: {
        geminiImageConfig: {
          defaultImageSize: "1K",
        },
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "x-ai/grok-4.1-fast:free"
      )
    ).toMatchObject({
      icon: "/model-icons/grok.svg",
      group: "xAI",
      contextLength: 2000000,
      capabilities: {
        vision: true,
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "meta-llama/Llama-3.3-70B-Instruct"
      )
    ).toMatchObject({
      icon: "/model-icons/meta-color.svg",
      group: "Meta",
      contextLength: 128000,
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "meta-llama/Llama-3.1-8B-Instruct"
      )
    ).toMatchObject({
      icon: "/model-icons/meta-color.svg",
      group: "Meta",
      contextLength: 128000,
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "mistralai/Mixtral-8x7B-Instruct-v0.1"
      )
    ).toMatchObject({
      icon: "/model-icons/mistral-color.svg",
      group: "Mistral",
      contextLength: 32768,
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "microsoft/Phi-3-mini-4k-instruct"
      )
    ).toMatchObject({
      icon: "/model-icons/microsoft-color.svg",
      group: "Microsoft",
      contextLength: 4096,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "ZhipuAI/GLM-4.6")
    ).toMatchObject({
      icon: "/model-icons/zhipu-color.svg",
      group: "Zhipu",
      contextLength: 200000,
      capabilities: {
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "GLM-4.6V-FlashX")
    ).toMatchObject({
      icon: "/model-icons/zhipu-color.svg",
      group: "Zhipu",
      contextLength: 128000,
      capabilities: {
        vision: true,
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "GLM-4.6V-Flash")
    ).toMatchObject({
      icon: "/model-icons/zhipu-color.svg",
      group: "Zhipu",
      contextLength: 128000,
      capabilities: {
        vision: true,
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "command-a-translate")
    ).toMatchObject({
      icon: "/model-icons/cohere-color.svg",
      group: "Cohere",
      contextLength: 8000,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "command-a-code")
    ).toMatchObject({
      icon: "/model-icons/cohere-color.svg",
      group: "Cohere",
      contextLength: 256000,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "command-r-plus-08-2024")
    ).toMatchObject({
      icon: "/model-icons/cohere-color.svg",
      group: "Cohere",
      contextLength: 128000,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "command-r-plus")
    ).toMatchObject({
      icon: "/model-icons/cohere-color.svg",
      group: "Cohere",
      contextLength: 128000,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "command-light")
    ).toMatchObject({
      icon: "/model-icons/cohere-color.svg",
      group: "Cohere",
      contextLength: 4000,
      deprecated: true,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "MiniMaxAI/MiniMax-M2.7")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      contextLength: 204800,
      capabilities: {
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "MiniMax-M2.7-highspeed"
      )
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      contextLength: 204800,
      capabilities: {
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "MiniMax-M2.5")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      contextLength: 204800,
      capabilities: {
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "MiniMax-M3")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      contextLength: 1000000,
      capabilities: {
        vision: true,
        toolUse: true,
      },
    });
  });
});
