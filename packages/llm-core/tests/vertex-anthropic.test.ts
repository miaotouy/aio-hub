import { describe, expect, it } from "vitest";
import {
  buildVertexAnthropicRequest,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const profile: ProviderProfile = {
  provider: "vertexai",
  baseUrl: "https://us-central1-aiplatform.googleapis.com",
  apiKey: "access-token",
  headers: { "X-Tenant": "tenant-a" },
  options: {
    projectId: "aio-project",
    location: "us-central1",
  },
};

describe("Vertex Anthropic provider adapter", () => {
  it("wraps the shared Anthropic body in a Vertex rawPredict request", () => {
    const request: LlmRequest = {
      model: "claude-sonnet-4-5",
      requestId: "request-1",
      stream: true,
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello." },
      ],
      maxTokens: 1024,
      thinkingEnabled: true,
      thinkingBudget: 256,
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            parameters: { type: "object" },
          },
        },
      ],
    };

    expect(buildVertexAnthropicRequest(profile, request)).toEqual({
      method: "POST",
      url: "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/anthropic/models/claude-sonnet-4-5:streamRawPredict",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access-token",
        "X-Request-ID": "request-1",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
          messages: [{ role: "user", content: "Hello." }],
          max_tokens: 1024,
          system: "Be concise.",
          thinking: { type: "enabled", budget_tokens: 256 },
          tools: [
            {
              type: "custom",
              name: "lookup",
              input_schema: { type: "object" },
            },
          ],
          stream: true,
          anthropic_version: "vertex-2023-10-16",
        },
      },
      streaming: true,
    });
  });
});
