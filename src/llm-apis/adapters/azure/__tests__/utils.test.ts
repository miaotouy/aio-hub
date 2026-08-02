import { describe, expect, it } from "vitest";
import { buildOpenAiCompatibleUrl } from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import { buildOpenAiHeaders } from "../../openai";
import {
  appendAzureApiVersion,
  azureOpenAiUrlHandler,
  prepareAzureOpenAiProfile,
} from "../utils";

function createProfile(overrides: Partial<LlmProfile> = {}): LlmProfile {
  return {
    id: "azure-profile",
    name: "Azure OpenAI",
    type: "azure",
    baseUrl:
      "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    apiKeys: ["azure-secret"],
    enabled: true,
    models: [],
    options: {
      resource: "aio-resource",
      deployment: "gpt-4o production",
      apiVersion: "2024-12-01-preview",
    },
    ...overrides,
  };
}

describe("Azure OpenAI adapter utilities", () => {
  it("materializes deployment placeholders, api-version and api-key auth", () => {
    const source = createProfile({
      customHeaders: { "X-Custom": "value" },
    });

    const result = prepareAzureOpenAiProfile(source, "chat");

    expect(result.baseUrl).toBe(
      "https://aio-resource.openai.azure.com/openai/deployments/gpt-4o%20production"
    );
    expect(result.apiKeys).toEqual([]);
    expect(result.customHeaders).toEqual({
      "api-key": "azure-secret",
      "X-Custom": "value",
    });
    expect(result.customEndpoints?.chatCompletions).toBe(
      "chat/completions?api-version=2024-12-01-preview"
    );
    expect(buildOpenAiHeaders(result)).toMatchObject({
      "Content-Type": "application/json",
      "api-key": "azure-secret",
      "X-Custom": "value",
    });
    expect(buildOpenAiHeaders(result)).not.toHaveProperty("Authorization");
    expect(
      buildOpenAiCompatibleUrl({
        provider: result.type,
        baseUrl: result.baseUrl,
        headers: buildOpenAiHeaders(result),
        endpoints: result.customEndpoints,
      })
    ).toBe(
      "https://aio-resource.openai.azure.com/openai/deployments/gpt-4o%20production/chat/completions?api-version=2024-12-01-preview"
    );
    expect(source.apiKeys).toEqual(["azure-secret"]);
  });

  it("preserves custom endpoint queries and does not duplicate api-version", () => {
    const profile = createProfile({
      customEndpoints: {
        embeddings: "/custom/embeddings?mode=test",
      },
    });

    expect(
      prepareAzureOpenAiProfile(profile, "embedding").customEndpoints
        ?.embeddings
    ).toBe("/custom/embeddings?mode=test&api-version=2024-12-01-preview");
    expect(
      appendAzureApiVersion(
        "/custom?api-version=2024-10-21",
        "2024-12-01-preview"
      )
    ).toBe("/custom?api-version=2024-10-21");
  });

  it("reports missing values when a preset placeholder cannot be resolved", () => {
    expect(() =>
      prepareAzureOpenAiProfile(
        createProfile({ options: { apiVersion: "2024-12-01-preview" } }),
        "chat"
      )
    ).toThrow("Azure OpenAI 配置缺少资源名称");
  });

  it("keeps the v1 route free of legacy date api-version defaults", () => {
    const profile = createProfile({
      baseUrl: "https://aio-resource.openai.azure.com/openai/v1",
    });

    expect(prepareAzureOpenAiProfile(profile, "chat")).toMatchObject({
      baseUrl: "https://aio-resource.openai.azure.com/openai/v1",
      customEndpoints: { chatCompletions: "chat/completions" },
    });
  });

  it("uses the same URL contract for settings previews", () => {
    const profile = createProfile();

    expect(
      azureOpenAiUrlHandler.buildUrl(profile.baseUrl, undefined, profile)
    ).toBe(
      "https://aio-resource.openai.azure.com/openai/deployments/gpt-4o%20production/chat/completions?api-version=2024-12-01-preview"
    );
  });
});
