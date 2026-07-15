import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import { mobileLlmTransport } from "../../transports/mobile";
import { callGeminiApi, callGeminiEmbeddingApi } from "../gemini";

const profile: LlmProfile = {
  id: "gemini-profile",
  name: "Gemini",
  type: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  apiKeys: ["test-key"],
  customHeaders: { "X-Tenant": "tenant-a" },
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("mobile Gemini facade", () => {
  it("uses the shared wire builder and preserves thought replay state", async () => {
    const signedParts = [
      { text: "Think.", thought: true },
      { text: "Done.", thoughtSignature: "sig-1" },
    ];
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: chunks(
        JSON.stringify({
          candidates: [
            { content: { parts: signedParts }, finishReason: "STOP" },
          ],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 2,
            totalTokenCount: 6,
          },
        })
      ),
    });

    const response = await callGeminiApi(profile, {
      profileId: profile.id,
      modelId: "gemini-3-flash",
      messages: [
        { role: "system", content: "Be concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect." },
            {
              type: "image",
              imageBase64: "aW1hZ2U=",
              mimeType: "image/png",
            },
          ],
        },
      ],
      maxTokens: 512,
      thinkingEnabled: true,
      thinkingBudget: 256,
      enableCodeExecution: true,
      webSearchEnabled: true,
    } as any);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=test-key",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key",
          "X-Tenant": "tenant-a",
        }),
        body: {
          kind: "json",
          value: expect.objectContaining({
            systemInstruction: { parts: [{ text: "Be concise." }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: "Inspect." },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "aW1hZ2U=",
                    },
                  },
                ],
              },
            ],
            generationConfig: expect.objectContaining({
              maxOutputTokens: 512,
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 256,
              },
            }),
            tools: [{ codeExecution: {} }, { googleSearch: {} }],
          }),
        },
        streaming: false,
      }),
      expect.objectContaining({ requestId: expect.any(String) })
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        finishReason: "stop",
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        reasoningArtifacts: [
          {
            provider: "gemini",
            kind: "model.parts",
            replayPolicy: "always",
            payload: { parts: signedParts },
            visibleText: "Think.",
          },
        ],
      })
    );
  });

  it("keeps text and reasoning stream callbacks separate", async () => {
    const fixture = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Think.","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Done."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3,"totalTokenCount":8}}\r\n\r\n',
    ].join("");
    vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/event-stream" },
      body: chunks(fixture, 1),
    });
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();

    const response = await callGeminiApi(profile, {
      profileId: profile.id,
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
    });

    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        finishReason: "stop",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        isStream: true,
      })
    );
  });

  it("keeps the mobile Gemini Embedding compatibility entry on shared Core", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(JSON.stringify({ embedding: { values: [0.1, 0.2] } })),
    });
    const response = await callGeminiEmbeddingApi(profile, {
      modelId: "text-embedding-004",
      input: "hello",
      taskType: "RETRIEVAL_QUERY",
    });
    expect(send.mock.calls[0][0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=test-key"
    );
    expect(response.data[0].embedding).toEqual([0.1, 0.2]);
  });
});

async function* chunks(value: string, size = value.length) {
  const bytes = new TextEncoder().encode(value);
  for (let index = 0; index < bytes.length; index += size) {
    yield bytes.slice(index, index + size);
  }
}
