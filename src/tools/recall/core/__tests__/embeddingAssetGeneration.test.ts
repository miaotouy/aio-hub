import { describe, expect, it } from "vitest";
import type { WorkspaceConfig } from "../../types/recall-collection";
import {
  createEmbeddingAssetGeneration,
  resolveEmbeddingAssetGeneration,
  withCurrentEmbeddingAssetGeneration,
} from "../embeddingAssetGeneration";

function config(modelIdentity: string): WorkspaceConfig {
  return { defaultEmbeddingModel: modelIdentity } as WorkspaceConfig;
}

describe("embedding asset generation", () => {
  it("adds a generation for legacy workspace config", () => {
    const result = withCurrentEmbeddingAssetGeneration(
      config("profile-a:model-a")
    );

    expect(result.changed).toBe(true);
    expect(result.config.embeddingAssetGeneration).toMatchObject({
      schemaVersion: 1,
      modelIdentity: "profile-a:model-a",
    });
  });

  it("keeps a matching generation unless a model switch forces rotation", () => {
    const existing = createEmbeddingAssetGeneration(
      "profile-a:model-a",
      10,
      "generation-a"
    );
    const currentConfig = {
      ...config("profile-a:model-a"),
      embeddingAssetGeneration: existing,
    };

    expect(withCurrentEmbeddingAssetGeneration(currentConfig).changed).toBe(
      false
    );
    const rotated = withCurrentEmbeddingAssetGeneration(currentConfig, true);
    expect(rotated.changed).toBe(true);
    expect(rotated.config.embeddingAssetGeneration?.generationId).not.toBe(
      "generation-a"
    );
  });

  it("uses a stable legacy identity until migrated", () => {
    const currentConfig = config("profile-a:model-a");

    expect(resolveEmbeddingAssetGeneration(currentConfig)).toBe(
      "recall-embedding-assets-v1:legacy:profile-a%3Amodel-a"
    );
  });
});
