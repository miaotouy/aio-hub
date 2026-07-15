import { describe, expect, it } from "vitest";
import {
  modelListAdapter,
  parseProviderModels,
  type JsonValue,
  type WireResponse,
} from "../src";

describe("model list adapter", () => {
  it("builds provider URLs and authentication without application dependencies", () => {
    const openRouter = modelListAdapter.buildRequest(
      {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "key",
      },
      {
        provider: "openrouter",
        endpoint: "models",
        includeAllOutputModalities: true,
      }
    );
    expect(openRouter).toMatchObject({
      url: "https://openrouter.ai/api/v1/models?output_modalities=all",
      headers: { Authorization: "Bearer key" },
    });

    const gemini = modelListAdapter.buildRequest(
      {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "gemini-key",
      },
      { provider: "gemini", endpoint: "models" }
    );
    expect(gemini).toMatchObject({
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: { "x-goog-api-key": "gemini-key" },
    });
  });

  it("normalizes OpenRouter, Gemini, Anthropic, Cohere and Ollama fixtures", async () => {
    const openRouter = parseProviderModels(
      {
        data: [
          {
            id: "vendor/model",
            name: "Model",
            context_length: 128000,
            architecture: {
              input_modalities: ["text", "image"],
              output_modalities: ["text"],
            },
            supported_parameters: ["reasoning"],
          },
        ],
      },
      "openrouter"
    );
    expect(openRouter[0]).toMatchObject({
      id: "vendor/model",
      contextLength: 128000,
      inputModalities: ["text", "image"],
      supportedParameters: ["reasoning"],
    });

    expect(
      parseProviderModels(
        { models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini Pro" }] },
        "gemini"
      )[0]
    ).toMatchObject({ id: "gemini-2.5-pro", provider: "gemini" });
    expect(
      parseProviderModels(
        { data: [{ type: "model", id: "claude-sonnet", display_name: "Sonnet" }] },
        "claude"
      )[0]
    ).toMatchObject({ id: "claude-sonnet", provider: "anthropic" });
    expect(
      parseProviderModels({ models: [{ model_id: "command-r" }] }, "cohere")[0]
    ).toMatchObject({ id: "command-r", provider: "cohere" });

    const parsed = await modelListAdapter.parseResponse(
      jsonResponse({ models: [{ name: "qwen2.5:7b", size: 4_700_000_000 }] }),
      { provider: "ollama", endpoint: "api/tags" }
    );
    expect(parsed.models[0]).toMatchObject({
      id: "qwen2.5:7b",
      provider: "ollama",
      description: expect.stringContaining("GB"),
    });
  });
});

function jsonResponse(value: JsonValue): WireResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield new TextEncoder().encode(JSON.stringify(value));
    })(),
  };
}
