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
import { getProviderTypeInfo, providerTypes } from "../llm-providers";

describe("Ollama provider configuration", () => {
  it("declares the OpenAI-compatible chat codec and native model discovery", () => {
    const ollama = getProviderTypeInfo("ollama");

    expect(ollama).toMatchObject({
      modelListEndpoint: "api/tags",
      supportedParameters: {
        tools: true,
        toolChoice: true,
      },
      endpointPlaceholders: {
        chatCompletions: "/v1/chat/completions",
        completions: "/v1/completions",
        models: "/api/tags",
        embeddings: "/v1/embeddings",
      },
    });
  });
});

describe("Aggregate channel providers", () => {
  it("registers the four aggregate channel types with OpenAI-style model discovery", () => {
    const aggregateTypes = [
      "new-api",
      "sub2api",
      "aggregate-compatible",
      "opencode-go",
    ];

    for (const type of aggregateTypes) {
      const info = getProviderTypeInfo(type as never);
      expect(info, type).toBeDefined();
      expect(info?.supportsModelList, type).toBe(true);
      expect(info?.modelListEndpoint, type).toBe("models");
      expect(info?.configFields?.length, type).toBeGreaterThan(0);
    }
  });

  it("configures channel default protocol fields under routingDefaults", () => {
    const info = getProviderTypeInfo("new-api" as never);
    const chatField = info?.configFields?.find(
      (field) => field.modelPath === "routingDefaults.chat"
    );

    expect(chatField).toBeDefined();
    expect(chatField?.component).toBe("ElSelect");
    expect(chatField?.props).toMatchObject({ clearable: true });
  });

  it("provides adapter options from the shared operation registry", () => {
    const info = getProviderTypeInfo("new-api" as never);
    const chatField = info?.configFields?.find(
      (field) => field.modelPath === "routingDefaults.chat"
    );
    const options =
      typeof chatField?.options === "function" ? chatField.options({}) : [];

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "openai-chat-completions" }),
        expect.objectContaining({ value: "anthropic-messages" }),
        expect.objectContaining({ value: "openai-responses" }),
      ])
    );
  });

  it("declares the OpenCode Go default base URL and model discovery endpoint", () => {
    const opencode = getProviderTypeInfo("opencode-go" as never);

    expect(opencode).toMatchObject({
      defaultBaseUrl: "https://opencode.ai/zen/go/v1",
      modelListEndpoint: "models",
    });
  });

  it("keeps the provider type list internally consistent with getProviderTypeInfo", () => {
    for (const entry of providerTypes) {
      expect(getProviderTypeInfo(entry.type)).toBe(entry);
    }
  });
});
