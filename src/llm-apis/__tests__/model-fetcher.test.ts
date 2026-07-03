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

import { fetchModelsFromApi } from "../model-fetcher";
import { fetchWithTimeout } from "@/llm-apis/common";

describe("ModelFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
