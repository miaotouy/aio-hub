import { describe, expect, it } from "vitest";
import {
  buildCapabilityPreflight,
  getIntegerOverrideBounds,
} from "../retrievalPresetCapabilities";
import type {
  RecallPipelineCompileResult,
  RecallPresetSummary,
} from "../../types/pipeline";

const summary = (schema: Record<string, unknown>): RecallPresetSummary => ({
  id: "comprehensive",
  displayName: "综合召回",
  description: "test",
  visibility: "product",
  stability: "stable",
  algorithmVersion: "v1",
  allowedOverrides: [{ key: "limit", schema }],
});

const compilation = (
  kinds: RecallPipelineCompileResult["externalRequirements"]
): RecallPipelineCompileResult => ({
  runId: "run-1",
  valid: true,
  pipelineId: "comprehensive",
  configHash: "hash-1",
  algorithmVersion: "v1",
  candidateBudget: 80,
  expansionBudget: 80,
  externalRequirements: kinds,
  issues: [],
  stages: [],
  moduleVersions: {},
});

describe("retrieval preset capabilities", () => {
  it("reads integer override bounds from the preset summary", () => {
    expect(
      getIntegerOverrideBounds(
        summary({ type: "integer", minimum: 1, maximum: 100, default: 6 }),
        "limit"
      )
    ).toEqual({ minimum: 1, maximum: 100, defaultValue: 6 });
  });

  it("rejects malformed or non-integer override schemas", () => {
    expect(
      getIntegerOverrideBounds(
        summary({ type: "number", minimum: 1, maximum: 100 }),
        "limit"
      )
    ).toBeNull();
    expect(
      getIntegerOverrideBounds(
        summary({ type: "integer", minimum: 100, maximum: 1 }),
        "limit"
      )
    ).toBeNull();
  });

  it("blocks query embedding only when the global model route is unavailable", () => {
    const result = compilation([
      {
        kind: "query-embedding",
        status: "missing",
        blocking: true,
      },
      { kind: "entry-vectors", status: "missing", blocking: true },
    ]);

    expect(buildCapabilityPreflight(result, false)).toMatchObject({
      status: "blocked",
      items: [
        { kind: "query-embedding", status: "missing", blocking: true },
        { kind: "entry-vectors", status: "runtime", blocking: false },
      ],
    });
    expect(buildCapabilityPreflight(result, true).status).toBe("ready");
  });
});
