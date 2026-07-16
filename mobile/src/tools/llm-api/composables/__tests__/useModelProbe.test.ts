import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ChannelProbeResult } from "@aiohub/llm-core";
import type { LlmProfile } from "../../types";
import { createProfileProbeFingerprint, useModelProbe } from "../useModelProbe";

function profile(): LlmProfile {
  return {
    id: "profile-1",
    name: "Test",
    type: "openai",
    baseUrl: "https://example.com",
    apiKeys: ["secret-key"],
    customHeaders: { Authorization: "Bearer secret" },
    enabled: true,
    models: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  };
}

function success(modelId: string): ChannelProbeResult {
  return {
    success: true,
    kind: "batch-model",
    capability: "chat",
    modelId,
    phase: "semantic-validation",
    totalMs: 10,
    testedAt: 1,
  };
}

describe("useModelProbe", () => {
  it("fingerprints sensitive configuration without retaining plaintext", () => {
    const source = profile();
    const fingerprint = createProfileProbeFingerprint(source);
    expect(fingerprint).not.toContain("secret-key");
    expect(fingerprint).not.toContain("Bearer secret");
    source.apiKeys = ["changed-key"];
    expect(createProfileProbeFingerprint(source)).not.toBe(fingerprint);
  });

  it("keeps model order and marks results stale after configuration changes", async () => {
    const source = ref<LlmProfile | null>(profile());
    const probe = useModelProbe(source, {
      probeBatch: vi.fn(async (request) => {
        const ordered = request.modelIds.map(success);
        ordered.forEach((result: ChannelProbeResult, index: number) => {
          request.onStart?.(result.modelId!, index, ordered.length);
          request.onResult?.(result, index + 1, ordered.length);
        });
        return ordered;
      }),
    });
    probe.selectedIds.value = ["b", "a"];
    await probe.run();
    expect(probe.runOrder.value).toEqual(["a", "b"]);
    expect(probe.successCount.value).toBe(2);
    expect(probe.isStale.value).toBe(false);
    source.value!.baseUrl = "https://changed.example.com";
    expect(probe.isStale.value).toBe(true);
  });

  it("selects only the requested model for a row entry", () => {
    const probe = useModelProbe(ref(profile()), {
      probeBatch: vi.fn(),
    });
    probe.open("b");
    expect(probe.selectedIds.value).toEqual(["b"]);
  });
});
