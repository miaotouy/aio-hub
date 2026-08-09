// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { describe, expect, it } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import {
  createLlmProfileBundle,
  parseLlmProfileBundle,
} from "@/utils/llm-profile-transfer";

function profile(): LlmProfile {
  return {
    id: "profile-ollama",
    name: "Local Ollama",
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    apiKeys: ["private-api-key"],
    enabled: true,
    networkStrategy: "native",
    toolHandling: {
      callConsumer: "upstream",
      upstreamProtocol: "vcp-text",
      aioDistributedExposure: "complete",
      evidence: "explicit",
    },
    customHeaders: {
      Authorization: "Bearer private-token",
      "X-Client-Name": "AIO Hub Test",
      "X-Api-Key": "header-secret",
    },
    options: {
      projectId: "test-project",
      nested: { clientSecret: "nested-secret" },
    },
    models: [
      {
        id: "nomic-embed-text",
        name: "Nomic Embed Text",
        provider: "ollama",
        capabilities: { embedding: true },
        tokenLimits: { contextLength: 8192 },
        routing: {
          bindings: {
            embedding: {
              adapterId: "openai-embeddings",
              source: "manual",
            },
          },
          supportedEndpointTypes: ["openai", "future-protocol"],
          discoveredAt: "2026-08-06T00:00:00.000Z",
        },
      },
    ],
  };
}

describe("LLM profile transfer bundle", () => {
  it("redacts credentials without mutating non-sensitive profile fields", () => {
    const source = profile();
    const bundle = createLlmProfileBundle([source], {
      exportedAt: "2026-07-20T00:00:00.000Z",
    });

    expect(source.apiKeys).toEqual(["private-api-key"]);
    expect(bundle).toMatchObject({
      format: "aiohub.llm-profiles",
      formatVersion: 1,
      containsSecrets: false,
      exportedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(bundle.profiles[0].apiKeys).toEqual([]);
    expect(bundle.profiles[0].customHeaders).toEqual({
      "X-Client-Name": "AIO Hub Test",
    });
    expect(bundle.profiles[0].options).toEqual({
      projectId: "test-project",
      nested: {},
    });
    expect(bundle.profiles[0].models[0].tokenLimits).toEqual({
      contextLength: 8192,
    });
    expect(bundle.profiles[0].models[0].routing).toEqual({
      bindings: {
        embedding: {
          adapterId: "openai-embeddings",
          source: "manual",
        },
      },
      supportedEndpointTypes: ["openai", "future-protocol"],
      discoveredAt: "2026-08-06T00:00:00.000Z",
    });
    expect(bundle.redactedPaths).toEqual(
      expect.arrayContaining([
        "profiles[0].apiKeys",
        "profiles[0].customHeaders.Authorization",
        "profiles[0].customHeaders.X-Api-Key",
        "profiles[0].options.nested.clientSecret",
      ])
    );
  });

  it("round-trips a full profile when secrets are explicitly included", () => {
    const bundle = createLlmProfileBundle([profile()], {
      includeSecrets: true,
    });
    const parsed = parseLlmProfileBundle(JSON.parse(JSON.stringify(bundle)));

    expect(bundle.containsSecrets).toBe(true);
    expect(bundle.redactedPaths).toEqual([]);
    expect(parsed).toMatchObject({
      recognized: true,
      bundle: { profiles: [profile()] },
    });
  });

  it("rejects unsupported versions and malformed profiles", () => {
    expect(
      parseLlmProfileBundle({
        format: "aiohub.llm-profiles",
        formatVersion: 2,
        profiles: [profile()],
      })
    ).toMatchObject({ recognized: true, error: expect.any(String) });

    expect(
      parseLlmProfileBundle({
        format: "aiohub.llm-profiles",
        formatVersion: 1,
        profiles: [{ ...profile(), baseUrl: "file:///tmp/profile" }],
      })
    ).toMatchObject({ recognized: true, error: expect.any(String) });

    expect(
      parseLlmProfileBundle({
        format: "aiohub.llm-profiles",
        formatVersion: 1,
        profiles: [
          {
            ...profile(),
            models: [
              {
                ...profile().models[0],
                routing: { supportedEndpointTypes: ["openai", 42] },
              },
            ],
          },
        ],
      })
    ).toMatchObject({ recognized: true, error: expect.any(String) });

    expect(
      parseLlmProfileBundle({
        format: "aiohub.llm-profiles",
        formatVersion: 1,
        profiles: [
          {
            ...profile(),
            toolHandling: {
              callConsumer: "upstream",
              upstreamProtocol: "invalid",
            },
          },
        ],
      })
    ).toMatchObject({ recognized: true, error: expect.any(String) });
  });
});
