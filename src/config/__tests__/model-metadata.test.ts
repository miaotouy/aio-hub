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
  getMatchedRuleChain,
  getBundledModelIconPath,
} from "../model-metadata";
import type { ModelMetadataRule } from "@/types/model-metadata";
import { chineseModelRules } from "../model-metadata-presets/models-chinese";

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
      makeRule(
        "exclusive",
        50,
        { icon: "/model-icons/gpt.svg" },
        {
          exclusive: true,
        }
      ),
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

describe("bundled model icon fallback", () => {
  it("prefers a recognizable model ID over an OpenAI-compatible transport", () => {
    expect(getBundledModelIconPath("gemini-2.5-pro", "openai")).toBe(
      "/model-icons/gemini-color.svg"
    );
  });
});
describe("model-metadata presets", () => {
  it("provides explicit metadata for the supported Agnes 2.x models", () => {
    const modelIds = [
      "agnes-2.0-flash",
      "agnes-image-2.0-flash",
      "agnes-2.5-flash",
      "agnes-2.5-pro-alpha",
      "agnes-image-2.1-flash",
      "agnes-video-2.5",
      "agnes-2.5-pro",
      "agnes-video-v2.0",
    ];
    const directRules = chineseModelRules.filter(
      (rule) => rule.matchType === "model" && modelIds.includes(rule.matchValue)
    );

    expect(directRules.map((rule) => rule.matchValue).sort()).toEqual(
      [...modelIds].sort()
    );
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "agnes-2.5-pro")
    ).toMatchObject({
      group: "Agnes AI",
      tokenizer: "gpt4",
      capabilities: { thinking: true, toolUse: true },
      features: { streaming: true, functionCalling: true },
    });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "agnes-image-2.0-flash")
    ).toMatchObject({
      group: "Agnes AI",
      capabilities: { imageGeneration: true, iterativeRefinement: true },
    });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "agnes-video-v2.0")
    ).toMatchObject({
      group: "Agnes AI",
      capabilities: { videoGeneration: true, vision: true },
    });
  });
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

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "agnes-image-2.1-flash")
    ).toMatchObject({
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      mediaGenParams: {
        size: {
          default: "1024x1024",
        },
        style: { supported: false },
        quality: { supported: false },
      },
    });
  });

  it("applies official DeepSeek V4.1 versions, pricing, and effort controls", () => {
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "deepseek-v4-pro")
    ).toMatchObject({
      contextLength: 1024000,
      maxOutputTokens: 384000,
      version: "DeepSeek-V4-Pro-0813",
      pricing: {
        input: 9,
        output: 27,
        cacheHitInput: 0.3,
        unit: "CNY",
      },
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "deepseek-flash")
    ).toMatchObject({
      contextLength: 1024000,
      maxOutputTokens: 384000,
      version: "DeepSeek-V4.1-Flash",
      pricing: {
        input: 2,
        output: 8,
        cacheHitInput: 0.04,
        unit: "CNY",
      },
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "deepseek-v4-flash")
    ).toMatchObject({
      version: "DeepSeek-V4.1-Flash",
      deprecated: true,
      pricing: {
        input: 2,
        output: 8,
        cacheHitInput: 0.04,
        unit: "CNY",
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "deepseek-v4-flash-vision-exp"
      )
    ).toMatchObject({
      contextLength: 1024000,
      maxOutputTokens: 384000,
      version: "DeepSeek-V4.1-Flash",
      deprecated: true,
      pricing: {
        input: 2,
        output: 8,
        cacheHitInput: 0.04,
        unit: "CNY",
      },
      capabilities: {
        vision: true,
        thinking: true,
        thinkingConfigType: "switch",
        fim: false,
        prefixCompletion: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "deepseek-chat")
    ).toMatchObject({ deprecated: true });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "deepseek-reasoner")
    ).toMatchObject({ deprecated: true });
  });

  it("applies predictive DeepSeek V4.1 Pro capability metadata", () => {
    const deepseekPro = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "deepseek-pro"
    );

    expect(deepseekPro).toMatchObject({
      contextLength: 1024000,
      maxOutputTokens: 384000,
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
        fim: true,
        prefixCompletion: true,
        jsonOutput: true,
      },
    });
    // V4.1 Pro 尚未发布，不预填价格和版本，避免展示未公布的计费信息。
    expect(deepseekPro?.pricing).toBeUndefined();
    expect(deepseekPro?.version).toBeUndefined();
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
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "command-r-plus-08-2024"
      )
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
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "MiniMaxAI/MiniMax-M2.7"
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

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "MiniMax-M2.1-highspeed"
      )
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      capabilities: {
        toolUse: true,
        thinking: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "MiniMax-M2")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      capabilities: {
        toolUse: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "MiniMax Hailuo 2.3 Fast"
      )
    ).toMatchObject({
      icon: "/model-icons/hailuo-color.svg",
      group: "MiniMax",
      capabilities: {
        videoGeneration: true,
        vision: true,
      },
      mediaGenParams: {
        aspectRatioMode: {
          defaultRatio: "16:9",
          defaultResolution: "1080p",
        },
        duration: {
          default: 6,
        },
        promptEnhancement: {
          supported: true,
        },
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "sora-2")
    ).toMatchObject({
      capabilities: {
        videoGeneration: true,
      },
      mediaGenParams: {
        size: {
          default: "1280x720",
        },
        duration: {
          options: [
            { label: "4s", value: 4 },
            { label: "8s", value: 8 },
            { label: "12s", value: 12 },
          ],
          default: 8,
        },
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "veo-3.1-generate")
    ).toMatchObject({
      capabilities: {
        videoGeneration: true,
      },
      mediaGenParams: {
        aspectRatioMode: {
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          default: 8,
        },
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "Speech-2.8-HD")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      capabilities: {
        audioGeneration: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "image-01-live")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "music-cover")
    ).toMatchObject({
      icon: "/model-icons/minimax-color.svg",
      group: "MiniMax",
      capabilities: {
        musicGeneration: true,
        audio: true,
      },
    });
  });
});

describe("audited model-list metadata coverage", () => {
  it("covers routed model IDs and avoids treating video understanding as video generation", () => {
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "GLM-5.1-FP8", "custom")
    ).toMatchObject({
      group: "Zhipu",
      contextLength: 200000,
      capabilities: {
        toolUse: true,
        thinking: true,
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "glm-5.3", "zhipu")
    ).toMatchObject({
      icon: "/model-icons/zai.svg",
      group: "Z AI",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      releaseDate: "2026-08-19",
      pricing: {
        input: 8,
        output: 28,
        cacheHitInput: 2,
        unit: "CNY",
      },
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "GLM-5.3-FP8", "custom")
    ).toMatchObject({
      group: "Z AI",
      contextLength: 1000000,
      capabilities: {
        thinkingConfigType: "effort",
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "glm-5.2", "zhipu")
    ).toMatchObject({
      group: "Zhipu",
      contextLength: 1000000,
      maxOutputTokens: 128000,
      releaseDate: "2026-06-16",
      pricing: {
        input: 8,
        output: 28,
        cacheHitInput: 2,
        unit: "CNY",
      },
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "GLM-5.2-FP8", "custom")
    ).toMatchObject({
      contextLength: 1000000,
      capabilities: {
        thinking: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "glm-5.3-flash",
        "openai"
      )
    ).toMatchObject({
      group: "Z AI",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
      },
    });

    const museSpark = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "muse-spark-1.2-contributor",
      "openai"
    );
    expect(museSpark).toMatchObject({
      icon: "/model-icons/meta-color.svg",
      group: "Meta",
      contextLength: 1048576,
      capabilities: {
        vision: true,
        audio: true,
        video: true,
        document: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["minimal", "low", "medium", "high", "xhigh"],
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "meta/muse-spark-1.3-contributor",
        "openai"
      )
    ).toMatchObject({
      group: "Meta",
      capabilities: { vision: true, toolUse: true, thinking: true },
    });
    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "moonshotai/kimi-k2.6-turbo",
        "openai"
      )
    ).toMatchObject({
      group: "Kimi",
      capabilities: {
        toolUse: true,
        thinking: true,
        jsonOutput: true,
      },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "FunAudioLLM/CosyVoice2-0.5B",
        "siliconflow"
      )
    ).toMatchObject({
      group: "FunAudioLLM",
      capabilities: { audioGeneration: true },
    });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "lmstudio-nomic-embed-text:q4_k_m",
        "ollama"
      )
    ).toMatchObject({
      group: "Nomic AI",
      capabilities: { embedding: true },
    });

    const reranker = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "BAAI/bge-reranker-v2-m3",
      "siliconflow"
    );
    expect(reranker).toMatchObject({
      group: "BAAI",
      capabilities: { rerank: true },
    });
    expect(reranker?.capabilities?.embedding).toBeUndefined();

    const deepSeekOcr = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "deepseek-ai/DeepSeek-OCR",
      "openai"
    );
    expect(deepSeekOcr).toMatchObject({
      capabilities: { vision: true, document: true, jsonOutput: true },
    });
    expect(deepSeekOcr?.capabilities?.toolUse).toBeUndefined();

    const videoUnderstanding = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "gemini-3.7-flash-video-understanding-eap",
      "openai"
    );
    expect(videoUnderstanding).toMatchObject({ capabilities: { video: true } });
    expect(videoUnderstanding?.capabilities?.videoGeneration).toBeUndefined();

    const fluxTts = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "deepgram/flux-tts:free",
      "openrouter"
    );
    expect(fluxTts).toMatchObject({
      capabilities: { audioGeneration: true },
      description: expect.stringContaining("Deepgram Flux TTS"),
    });
    expect(fluxTts?.capabilities?.imageGeneration).toBeUndefined();
    expect(fluxTts?.mediaGenParams).toBeUndefined();

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "thenlper/gte-base",
        "openrouter"
      )
    ).toMatchObject({
      group: "Thenlper",
      contextLength: 512,
      capabilities: { embedding: true },
    });

    const fluxVideo = getMatchedModelProperties(
      DEFAULT_METADATA_RULES,
      "black-forest-labs/flux-3-video",
      "openrouter"
    );
    expect(fluxVideo).toMatchObject({
      group: "Black Forest Labs",
      capabilities: { videoGeneration: true, vision: true },
      description: expect.stringContaining("FLUX 视频模型"),
    });
    expect(fluxVideo?.capabilities?.imageGeneration).toBeUndefined();
    expect(fluxVideo?.mediaGenParams).toBeUndefined();
  });

  it("consolidates Qwen3, Hunyuan and Kimi metadata groups", () => {
    for (const id of [
      "qwen3.8-max",
      "qwen3.7-plus",
      "qwen3.6-plus",
      "qwen3.5-omni-plus",
      "qwen3-vl-plus",
      "qwen3-coder-plus",
      "qwen3-asr-flash",
      "qwen3-tts-flash",
    ]) {
      expect(
        getMatchedModelProperties(DEFAULT_METADATA_RULES, id)
      ).toMatchObject({ group: "Qwen3" });
    }

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "qwen3-rerank")
    ).toMatchObject({ group: "Qwen Rerank" });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "qwen-image-2.0")
    ).toMatchObject({ group: "Qwen Image" });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "qwen-image-edit-plus")
    ).toMatchObject({ group: "Qwen Image" });

    expect(
      getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        "hunyuan-turbo",
        "tencent"
      )
    ).toMatchObject({ group: "Hunyuan" });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "hy3-preview", "openai")
    ).toMatchObject({ group: "Hunyuan" });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "hy4-preview", "openai")
    ).toMatchObject({
      group: "Hunyuan",
      contextLength: 1000000,
    });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "moonshot-v1-8k")
    ).toMatchObject({ group: "Kimi" });

    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "tts-1")
    ).toMatchObject({ group: "OpenAI" });
    expect(
      getMatchedModelProperties(DEFAULT_METADATA_RULES, "gemini-2.5-flash-tts")
    ).toMatchObject({ group: "Gemini 2" });
  });
});
