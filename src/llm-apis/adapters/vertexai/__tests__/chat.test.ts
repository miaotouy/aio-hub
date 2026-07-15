import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { vertexAiAdapter } from "../index";

const profile: LlmProfile = {
  id: "vertex-profile",
  name: "Vertex AI",
  type: "vertexai",
  baseUrl: "https://us-central1-aiplatform.googleapis.com",
  apiKeys: ["access-token"],
  customHeaders: { "X-Tenant": "tenant-a" },
  options: { projectId: "aio-project", location: "us-central1" },
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("desktop Vertex AI facade", () => {
  it("routes Gemini through the shared Google provider with a full resource path", async () => {
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Done." }] },
              finishReason: "STOP",
            },
          ],
        })
      ),
    });

    const response = await vertexAiAdapter.chat!(profile, {
      profileId: profile.id,
      modelId: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hello." }],
      thinkingEnabled: true,
      thinkingBudget: 256,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "X-Tenant": "tenant-a",
        }),
        body: {
          kind: "json",
          value: expect.objectContaining({
            contents: [{ role: "user", parts: [{ text: "Hello." }] }],
            generationConfig: expect.objectContaining({
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 256,
              },
            }),
          }),
        },
      }),
      expect.any(Object)
    );
    expect(response.content).toBe("Done.");
  });

  it("routes Claude through the shared Anthropic semantics and rawPredict wire", async () => {
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(
        JSON.stringify({
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 2 },
        })
      ),
    });

    const response = await vertexAiAdapter.chat!(profile, {
      profileId: profile.id,
      modelId: "claude-sonnet-4-5",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello." },
      ],
      maxTokens: 512,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/anthropic/models/claude-sonnet-4-5:rawPredict",
        body: {
          kind: "json",
          value: expect.objectContaining({
            anthropic_version: "vertex-2023-10-16",
            system: "Be concise.",
            messages: [{ role: "user", content: "Hello." }],
            max_tokens: 512,
          }),
        },
      }),
      expect.any(Object)
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        finishReason: "end_turn",
        stopSequence: null,
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      })
    );
  });
});

async function* chunks(value: string) {
  yield new TextEncoder().encode(value);
}
