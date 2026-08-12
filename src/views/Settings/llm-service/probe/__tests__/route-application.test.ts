import { describe, expect, it } from "vitest";
import { createProbeRouteApplication } from "../route-application";
import type { ChannelProbeResult } from "../types";

function result(
  values: Partial<ChannelProbeResult> & Pick<ChannelProbeResult, "success">
): ChannelProbeResult {
  return {
    kind: "inference",
    modelId: "model-a",
    endpointType: "openai-chat",
    phase: "semantic-validation",
    totalMs: 120,
    testedAt: 1786000000000,
    ...values,
  };
}

describe("createProbeRouteApplication", () => {
  it("converts a successful chat probe into a manual-confirmed probe binding", () => {
    expect(
      createProbeRouteApplication(
        result({ success: true, capability: "chat" })
      )
    ).toEqual({
      operation: "chat",
      binding: {
        adapterId: "openai-chat-completions",
        endpointType: "openai-chat",
        source: "probe",
      },
    });
  });

  it("maps each endpoint type to its protocol adapter by capability", () => {
    expect(
      createProbeRouteApplication(
        result({
          success: true,
          capability: "chat",
          endpointType: "anthropic-messages",
        })
      )
    ).toMatchObject({
      operation: "chat",
      binding: { adapterId: "anthropic-messages", source: "probe" },
    });
    expect(
      createProbeRouteApplication(
        result({
          success: true,
          capability: "embedding",
          endpointType: "embeddings",
        })
      )
    ).toMatchObject({
      operation: "embedding",
      binding: { adapterId: "openai-embeddings", source: "probe" },
    });
    expect(
      createProbeRouteApplication(
        result({
          success: true,
          capability: "image",
          endpointType: "image-generation",
        })
      )
    ).toMatchObject({
      operation: "image",
      binding: { adapterId: "openai-image-generation", source: "probe" },
    });
  });

  it("never applies failed, unresolved or unmatched results", () => {
    expect(
      createProbeRouteApplication(result({ success: false }))
    ).toBeNull();
    expect(
      createProbeRouteApplication(
        result({ success: true, endpointType: "auto" })
      )
    ).toBeNull();
    expect(
      createProbeRouteApplication(
        result({ success: true, capability: "chat", endpointType: "embeddings" })
      )
    ).toBeNull();
    expect(
      createProbeRouteApplication(
        result({
          success: true,
          endpointType: "future-protocol" as unknown as ChannelProbeResult["endpointType"],
        })
      )
    ).toBeNull();
  });
});
