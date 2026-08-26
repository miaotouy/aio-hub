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
  getProviderTypeIconPath,
  getProviderTypeInfo,
  providerTypes,
} from "../llm-providers";

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

  it("groups channel default protocol fields into a collapsed advanced fallback section", () => {
    const info = getProviderTypeInfo("new-api" as never);
    const fields = info?.configFields ?? [];

    expect(fields).toHaveLength(4);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelPath: "routingDefaults.chat",
          component: "ElSelect",
          props: expect.objectContaining({ clearable: true }),
          groupCollapsible: {
            name: "aggregate-routing-defaults",
            title: "默认协议（高级回退）",
          },
        }),
      ])
    );
    expect(
      new Set(fields.map((field) => field.groupCollapsible?.name))
    ).toEqual(new Set(["aggregate-routing-defaults"]));
  });

  it("provides explicit icons for the aggregate channel identities", () => {
    expect(getProviderTypeIconPath("new-api")).toBe(
      "/model-icons/newapi-color.svg"
    );
    expect(getProviderTypeIconPath("sub2api")).toBe("/model-icons/sub2api.png");
    expect(getProviderTypeIconPath("aggregate-compatible")).toBe(
      "/model-icons/aggregate-compatible.svg"
    );
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
