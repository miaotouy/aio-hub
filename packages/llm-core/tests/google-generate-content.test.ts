import { describe, expect, it } from "vitest";
import {
  GoogleGenerateContentStreamDecoder,
  buildGoogleGenerateContentRequest,
  parseGoogleGenerateContentResponseValue,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const developerProfile: ProviderProfile = {
  provider: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  apiKey: "gemini-key",
  headers: { "X-Tenant": "tenant-a" },
};

function createRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: "gemini-3-flash",
    messages: [
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hello." },
    ],
    ...overrides,
  };
}

describe("Google GenerateContent provider adapter", () => {
  it("builds Developer API multimodal, tools, thinking and extension fields", () => {
    const wire = buildGoogleGenerateContentRequest(
      developerProfile,
      createRequest({
        requestId: "request-1",
        stream: true,
        messages: [
          { role: "system", content: "Be concise." },
          {
            role: "user",
            content: [
              { type: "text", text: "Inspect." },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "aW1hZ2U=",
                },
              },
            ],
          },
          {
            role: "assistant",
            content: "Previous answer.",
            metadata: {
              geminiReplayParts: [
                { text: "Thought.", thought: true },
                { text: "Previous answer.", thoughtSignature: "sig-1" },
              ],
            },
          },
        ],
        maxTokens: 2048,
        temperature: 0.2,
        topP: 0.8,
        topK: 20,
        stop: "END",
        thinkingEnabled: true,
        reasoningEffort: "high",
        tools: [
          {
            type: "function",
            function: {
              name: "lookup",
              description: "Look up a value",
              parameters: { type: "object" },
            },
          },
        ],
        toolChoice: { type: "function", function: { name: "lookup" } },
        enableCodeExecution: true,
        webSearchEnabled: true,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        ],
        extensions: { vendorFlag: true },
      })
    );

    expect(wire).toEqual({
      method: "POST",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent?key=gemini-key&alt=sse",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": "gemini-key",
        "X-Request-ID": "request-1",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
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
            {
              role: "model",
              parts: [
                { text: "Thought.", thought: true },
                { text: "Previous answer.", thoughtSignature: "sig-1" },
              ],
            },
          ],
          systemInstruction: { parts: [{ text: "Be concise." }] },
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.2,
            topP: 0.8,
            topK: 20,
            stopSequences: ["END"],
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: "high",
            },
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "lookup",
                  description: "Look up a value",
                  parameters: { type: "object" },
                },
              ],
            },
            { codeExecution: {} },
            { googleSearch: {} },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["lookup"],
            },
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
          ],
          vendorFlag: true,
        },
      },
      streaming: true,
    });
  });

  it("builds the configured Vertex resource path and bearer authorization", () => {
    const wire = buildGoogleGenerateContentRequest(
      {
        provider: "vertexai",
        baseUrl: "https://us-central1-aiplatform.googleapis.com",
        apiKey: "access-token",
        options: {
          apiStyle: "vertex",
          projectId: "aio-project",
          location: "us-central1",
        },
      },
      createRequest({ model: "gemini-2.5-pro" })
    );

    expect(wire.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent"
    );
    expect(wire.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer access-token",
    });
    expect((wire.body as any).value.safetySettings).toBeUndefined();
  });

  it("preserves a Vertex base URL that already contains the resource prefix", () => {
    const wire = buildGoogleGenerateContentRequest(
      {
        provider: "vertexai",
        baseUrl:
          "https://us-central1-aiplatform.googleapis.com/v1/projects/custom-project/locations/europe-west1",
        apiKey: "access-token",
        options: { apiStyle: "vertex", projectId: "ignored-project" },
      },
      createRequest({ model: "gemini-2.5-pro" })
    );
    expect(wire.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/custom-project/locations/europe-west1/publishers/google/models/gemini-2.5-pro:generateContent"
    );
  });

  it("parses thought, tools, media, grounding, detailed usage and replay parts", () => {
    const response = parseGoogleGenerateContentResponseValue({
      candidates: [
        {
          content: {
            parts: [
              { text: "Analyze.", thought: true },
              { text: "Done.", thoughtSignature: "sig-1" },
              { functionCall: { name: "lookup", args: { q: "aio" } } },
              { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
            ],
          },
          finishReason: "STOP",
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com", title: "Example" } },
            ],
            groundingSupports: [
              {
                segment: { startIndex: 0, endIndex: 5 },
                groundingChunkIndices: [0],
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
        cachedContentTokenCount: 3,
        thoughtsTokenCount: 4,
      },
    });

    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Analyze.",
        finishReason: "stop",
        usage: {
          promptTokens: 11,
          completionTokens: 7,
          totalTokens: 18,
          promptTokensDetails: { cachedTokens: 3 },
          completionTokensDetails: { reasoningTokens: 4 },
        },
        toolCalls: [
          {
            id: "call_0",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"aio"}' },
          },
        ],
        images: [
          {
            kind: "inline-base64",
            data: "aW1hZ2U=",
            contentType: "image/png",
          },
        ],
        annotations: [
          {
            type: "url_citation",
            url_citation: {
              start_index: 0,
              end_index: 5,
              url: "https://example.com",
              title: "Example",
            },
          },
        ],
      })
    );
    expect(response.metadata?.geminiParts).toHaveLength(4);
  });

  it("decodes byte-split SSE thought, text, tools and usage", () => {
    const values = [
      {
        candidates: [
          {
            content: { parts: [{ text: "分析", thought: true }] },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [
                { text: "结果", thoughtSignature: "sig-1" },
                { functionCall: { name: "lookup", args: { q: "aio" } } },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      },
    ];
    const fixture = values
      .map((value, index) =>
        `data: ${JSON.stringify(value)}${index ? "\r\n\r\n" : "\n\n"}`
      )
      .join("");
    const decoder = new GoogleGenerateContentStreamDecoder();
    const events = [];
    for (const byte of new TextEncoder().encode(fixture)) {
      events.push(...decoder.push(new Uint8Array([byte])));
    }
    events.push(...decoder.finish());

    expect(events).toEqual([
      { type: "reasoning-delta", delta: "分析" },
      {
        type: "usage",
        usage: {
          promptTokens: 5,
          completionTokens: 3,
          totalTokens: 8,
        },
      },
      { type: "text-delta", delta: "结果" },
      {
        type: "tool-call",
        toolCall: {
          id: "call_0",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      },
      {
        type: "completed",
        response: {
          content: "结果",
          reasoningContent: "分析",
          finishReason: "stop",
          usage: {
            promptTokens: 5,
            completionTokens: 3,
            totalTokens: 8,
          },
          toolCalls: [
            {
              id: "call_0",
              type: "function",
              function: { name: "lookup", arguments: '{"q":"aio"}' },
            },
          ],
          metadata: {
            geminiParts: [
              { text: "分析", thought: true },
              { text: "结果", thoughtSignature: "sig-1" },
              { functionCall: { name: "lookup", args: { q: "aio" } } },
            ],
          },
        },
      },
    ]);
  });
});
