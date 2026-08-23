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

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";

const { loggerInfo } = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: loggerInfo,
  }),
}));

vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { fetchModelsFromApi, toDesktopModelInfo } from "../model-fetcher";
import { fetchWithTimeout } from "@/llm-apis/common";

describe("ModelFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps metadata vision capability when the API omits input modalities", () => {
    const gptModel = toDesktopModelInfo({
      id: "gpt-5.6",
      name: "gpt-5.6",
      provider: "openai",
    });
    const claudeModel = toDesktopModelInfo({
      id: "claude-5-opus",
      name: "Claude 5 Opus",
      provider: "anthropic",
    });

    expect(gptModel.capabilities?.vision).toBe(true);
    expect(claudeModel.capabilities?.vision).toBe(true);
  });

  it("persists declared endpoint types as discovery routing metadata", () => {
    const model = toDesktopModelInfo({
      id: "gpt-routed",
      name: "GPT Routed",
      provider: "openai",
      supportedEndpointTypes: ["openai", "openai-response", "future-protocol"],
    });

    expect(model.routing).toEqual({
      supportedEndpointTypes: ["openai", "openai-response", "future-protocol"],
      discoveredAt: expect.any(String),
    });
  });

  it("uses an explicitly returned text-only modality over metadata", () => {
    const model = toDesktopModelInfo({
      id: "gpt-5.6",
      name: "gpt-5.6",
      provider: "openai",
      inputModalities: ["text"],
    });

    expect(model.capabilities?.vision).toBe(false);
  });

  it("logs model-list cache diagnostics and strips sensitive URL queries", async () => {
    const profile: LlmProfile = {
      id: "custom-model-list",
      name: "Custom model list",
      baseUrl: "https://example.com",
      apiKeys: ["secret-key"],
      type: "openai",
      enabled: true,
      models: [],
      customEndpoints: {
        models: "https://models.example.com/v1/models?api_key=secret-query",
      },
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "cache-control": "public, max-age=14400",
        "cf-cache-status": "HIT",
        "cf-ray": "ray-id",
        "x-secret-header": "must-not-log",
      }),
      json: async () => ({
        data: [{ id: "agnes-2.5-pro", object: "model" }],
      }),
    });

    await fetchModelsFromApi(profile, { requestId: "model-list-diagnostics" });

    const successLog = loggerInfo.mock.calls.find(
      ([message]) => message === "模型列表获取成功"
    );
    expect(successLog?.[1]).toMatchObject({
      modelCount: 1,
      modelIds: ["agnes-2.5-pro"],
      requestId: "model-list-diagnostics",
      requestUrl: "https://models.example.com/v1/models",
      responseStatus: 200,
      responseHeaders: {
        "cache-control": "public, max-age=14400",
        "cf-cache-status": "HIT",
        "cf-ray": "ray-id",
      },
    });
    expect(successLog?.[1].responseHeaders).not.toHaveProperty(
      "x-secret-header"
    );
  });

  it("uses Ollama api/tags endpoint for model list", async () => {
    const profile: LlmProfile = {
      id: "ollama-local",
      name: "Ollama 本地",
      baseUrl: "http://localhost:11434",
      apiKeys: [],
      type: "ollama",
      enabled: true,
      models: [],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "qwen2.5:7b", size: 4_700_000_000 }],
      }),
    });

    const result = await fetchModelsFromApi(profile);

    expect(fetchWithTimeout).toHaveBeenCalled();
    const [url, requestOptions] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/tags");
    expect(requestOptions.method).toBe("GET");
    expect(result.models).toEqual([
      expect.objectContaining({
        id: "qwen2.5:7b",
        provider: "ollama",
      }),
    ]);
  });
});
