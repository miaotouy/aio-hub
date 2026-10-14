import { describe, expect, it } from "vitest";
import { getPresetByName } from "../llm-presets";
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
      defaultModels: [
        expect.objectContaining({
          id: "jev-latest",
          provider: "typesafe",
          capabilities: { decision: true },
          routing: {
            supportedEndpointTypes: ["typesafe-system-one"],
          },
        }),
      ],
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
