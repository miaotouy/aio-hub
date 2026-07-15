import { describe, expect, it } from "vitest";
import {
  classifyProbeError,
  resolveProbePlan,
  validateProbeResponse,
} from "../src";

describe("resolveProbePlan", () => {
  it("uses explicit capability before model capabilities", () => {
    const plan = resolveProbePlan(
      { id: "multi", capabilities: { embedding: true } },
      { capability: "chat", stream: true }
    );
    expect(plan.capability).toBe("chat");
    expect(plan.stream).toBe(true);
  });

  it("does not infer capability from the model id", () => {
    expect(resolveProbePlan({ id: "my-embedding-model" }).capability).toBe(
      "chat"
    );
  });

  it("never falls video or music back to chat", () => {
    expect(
      resolveProbePlan({ id: "video", capabilities: { videoGeneration: true } })
    ).toMatchObject({ capability: "video", supported: false });
    expect(
      resolveProbePlan({ id: "music", capabilities: { musicGeneration: true } })
    ).toMatchObject({ capability: "music", supported: false });
  });

  it("marks cost-bearing media probes as explicit", () => {
    expect(
      resolveProbePlan({ id: "image", capabilities: { imageGeneration: true } })
    ).toMatchObject({ capability: "image", requiresExplicitConsent: true });
  });
});

describe("validateProbeResponse", () => {
  it("accepts text and tool calls but rejects empty chat responses", () => {
    expect(
      validateProbeResponse({ capability: "chat", response: { content: "ok" } })
        .valid
    ).toBe(true);
    expect(
      validateProbeResponse({
        capability: "chat",
        response: { toolCalls: [{}] },
      }).valid
    ).toBe(true);
    expect(
      validateProbeResponse({ capability: "chat", response: { content: "" } })
        .valid
    ).toBe(false);
  });

  it("requires a real delta for stream probes", () => {
    expect(
      validateProbeResponse({
        capability: "chat",
        stream: true,
        streamDeltaReceived: false,
        response: { content: "completed" },
      }).valid
    ).toBe(false);
  });

  it("validates finite embedding vectors", () => {
    expect(
      validateProbeResponse({
        capability: "embedding",
        embedding: { data: [{ embedding: [0, 1] }] },
      }).valid
    ).toBe(true);
    expect(
      validateProbeResponse({
        capability: "embedding",
        embedding: { data: [{ embedding: [Number.NaN] }] },
      }).valid
    ).toBe(false);
  });

  it("rejects rerank indices outside the document range", () => {
    expect(
      validateProbeResponse({
        capability: "rerank",
        rerank: { results: [{ index: 2 }] },
        rerankDocumentCount: 2,
      }).valid
    ).toBe(false);
    expect(
      validateProbeResponse({
        capability: "rerank",
        rerank: { results: [{ index: 1 }] },
        rerankDocumentCount: 2,
      }).valid
    ).toBe(true);
  });
});

describe("classifyProbeError", () => {
  it.each([
    [400, "bad-request"],
    [401, "authentication"],
    [403, "authorization"],
    [404, "model-unavailable"],
    [408, "timeout"],
    [429, "rate-limit"],
    [503, "provider"],
  ])("classifies HTTP %s", (status, category) => {
    expect(
      classifyProbeError({ status, message: `HTTP ${status}` }).category
    ).toBe(category);
  });

  it("redacts credentials in details", () => {
    const result = classifyProbeError(
      new Error("Authorization: Bearer secret-value request failed")
    );
    expect(result.detail).not.toContain("secret-value");
  });

  it("prefers an explicit credential failure over a generic 4xx category", () => {
    expect(
      classifyProbeError({
        status: 400,
        message: "API key is invalid. Please provide a valid API key.",
      }).category
    ).toBe("authentication");
  });
});
