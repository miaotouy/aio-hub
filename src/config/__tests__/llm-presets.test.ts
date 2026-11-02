import { describe, expect, it } from "vitest";
import {
  getPresetByName,
  llmPresets,
  getLlmPresetCategory,
} from "../llm-presets";
import {
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
} from "../model-metadata";
import { materializeModelMetadata } from "@/utils/modelMetadataMaterialization";

describe("TypeSafe preset", () => {
  it("creates a decision-only Jev channel with official endpoints and links", () => {
    const preset = getPresetByName("TypeSafe AI");

    expect(preset).toMatchObject({
      type: "typesafe",
      defaultBaseUrl: "https://api.typesafe.ai",
      logoUrl: "/model-icons/typesafe.png",
      defaultModels: expect.arrayContaining([
        expect.objectContaining({
          id: "jev-latest",
          provider: "typesafe",
          capabilities: {
            decision: true,
            vision: true,
            maxImageDimension: 1568,
          },
          routing: {
            supportedEndpointTypes: ["typesafe-system-one"],
          },
        }),
      ]),
    });
    expect(preset?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://console.typesafe.ai" }),
        expect.objectContaining({ url: "https://docs.typesafe.ai" }),
      ])
    );
  });
});

// Presets are materialized before persistence; endpoint-specific tool flags must survive.
describe("current model presets", () => {
  it.each([
    {
      name: "TypeSafe AI",
      id: "jev-1.14.0",
      contextLength: 65536,
      endpoint: "typesafe-system-one",
    },
    {
      name: "OpenRouter",
      id: "typesafe/jev-1.14",
      contextLength: 262144,
      endpoint: "openrouter-decisions",
    },
  ])(
    "materializes Jev 1.14 capabilities and routing on $name",
    ({ name, id, contextLength, endpoint }) => {
      const model = getPresetByName(name)?.defaultModels?.find(
        (entry) => entry.id === id
      );
      if (!model) throw new Error(`Missing Jev preset: ${name}`);
      const properties = getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        id,
        model.provider
      );
      expect(materializeModelMetadata(model, properties).model).toMatchObject({
        capabilities: { decision: true, vision: true, maxImageDimension: 1568 },
        tokenLimits: { contextLength },
        architecture: { inputModalities: ["text", "image"] },
        routing: { supportedEndpointTypes: [endpoint] },
      });
    }
  );

  it.each(["OpenAI", "OpenAI Responses"])(
    "offers all GPT-6 models with endpoint-specific tools in %s",
    (name) => {
      const models = getPresetByName(name)?.defaultModels;
      for (const id of ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"]) {
        const model = models?.find((entry) => entry.id === id);
        expect(model, id).toMatchObject({
          tokenLimits: { contextLength: 1050000, output: 128000 },
          capabilities: {
            thinkingConfigType: "effort",
            toolUse: name === "OpenAI Responses" || id !== "gpt-6-astra",
            computerUse: name === "OpenAI Responses",
          },
        });
      }
    }
  );

  it.each(["Anthropic Claude", "Vertex AI"])(
    "offers Opus 5.5 adaptive effort in %s",
    (name) => {
      const model = getPresetByName(name)?.defaultModels?.find(
        (entry) => entry.id === "claude-opus-5-5"
      );
      expect(model).toMatchObject({
        tokenLimits: { contextLength: 1000000, output: 128000 },
        capabilities: {
          thinking: true,
          thinkingConfigType: "effort",
          reasoningEffortOptions: ["low", "medium", "high", "xhigh", "max"],
        },
      });
    }
  );

  it.each(["Google Gemini", "Vertex AI"])(
    "offers Gemini 4 Argon with synchronous limits in %s",
    (name) => {
      const model = getPresetByName(name)?.defaultModels?.find(
        (entry) => entry.id === "gemini-4-argon"
      );

      expect(model).toMatchObject({
        group: "Gemini 4",
        tokenLimits: { contextLength: 1048576, output: 65536 },
        capabilities: {
          vision: true,
          toolUse: true,
          thinkingConfigType: "effort",
          reasoningEffortOptions: ["low", "medium", "high"],
        },
      });
    }
  );

  it.each([
    { name: "OpenAI", toolUse: false },
    { name: "OpenAI Responses", toolUse: true },
  ])(
    "preserves GPT-6.1 Sol endpoint capabilities in $name",
    ({ name, toolUse }) => {
      const model = getPresetByName(name)?.defaultModels?.find(
        (entry) => entry.id === "gpt-6.1-sol"
      );
      expect(model).toBeDefined();
      if (!model) throw new Error("GPT-6.1 Sol preset missing");

      const metadata = getMatchedModelProperties(
        DEFAULT_METADATA_RULES,
        model.id,
        model.provider
      );
      const applied = materializeModelMetadata(model, metadata).model;

      expect(applied).toMatchObject({
        tokenLimits: { contextLength: 1050000, output: 128000 },
        capabilities: {
          vision: true,
          toolUse,
          webSearch: toolUse,
          fileSearch: toolUse,
          codeExecution: toolUse,
          computerUse: toolUse,
          thinkingConfigType: "effort",
          reasoningEffortOptions: ["low", "medium", "high", "xhigh", "max"],
        },
      });
    }
  );
});

// A selected platform must expose model routing and preserve its protocol defaults.
describe("aggregate platform presets", () => {
  it.each([
    ["OpenRouter", "openrouter"],
    ["SiliconFlow", "siliconflow"],
    ["Groq", "groq"],
    ["Together AI", "together"],
    ["Fireworks AI", "fireworks"],
    ["DeepInfra", "deepinfra"],
    ["Hugging Face", "huggingface"],
    ["魔搭 ModelScope", "modelscope"],
    ["LM Studio", "lmstudio"],
    ["VCP", "vcp"],
    ["New API", "new-api"],
    ["Sub2API", "sub2api"],
    ["OpenCode Go", "opencode-go"],
  ])(
    "creates %s with its own aggregate identity and editable fallback",
    async (name, type) => {
      const { getProviderTypeInfo } = await import("../llm-providers");
      const { resolveModelExecution } = await import("@aiohub/llm-core");
      const preset = getPresetByName(name);
      expect(preset?.type).toBe(type);
      expect(getLlmPresetCategory(preset!)).toBe("aggregate");
      const info = getProviderTypeInfo(preset!.type);
      const field = info?.configFields?.find(
        (item) => item.modelPath === "routingDefaults.chat"
      );
      const choices =
        typeof field?.options === "function" ? field.options({}) : [];
      expect(choices).toContainEqual(
        expect.objectContaining({ value: "anthropic-messages" })
      );
      const execution = resolveModelExecution({
        profile: {
          type: preset!.type,
          options: { routingDefaults: { chat: "anthropic-messages" } },
        },
        model: { id: "user-model" },
        operation: "chat",
      });
      expect(execution).toMatchObject({
        adapterId: "anthropic-messages",
        effectiveProfile: { type: "claude", channelType: type },
      });
    }
  );

  it("resolves the legacy NewAPI name to the canonical creation entry", () => {
    expect(getPresetByName("NewAPI")).toEqual(getPresetByName("New API"));
    expect(
      llmPresets.filter((preset) => preset.type === "new-api")
    ).toHaveLength(1);
  });
});
