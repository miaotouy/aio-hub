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
