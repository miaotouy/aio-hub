import { describe, expect, it } from "vitest";
import {
  buildOpenRouterDecisionsRequest,
  parseOpenRouterDecisionsResponse,
  resolveOpenRouterDecisionsEndpoint,
  type SystemOneRequest,
  type WireResponse,
} from "../src";

const request: SystemOneRequest = {
  model: "perplexity/pplx-decider-v1.1-27b",
  state: { ticket: "Checkout failed" },
  questions: {
    urgent: { type: "noul", instructions: "Is this urgent?" },
    team: {
      type: "choice",
      instructions: "Choose a team",
      criteria: { billing: "Payments", support: "Other" },
    },
    priority: {
      type: "score",
      instructions: "Rate urgency",
      criteria: ["Low", "High"],
    },
  },
  requestId: "decision-test",
};

describe("OpenRouter Decisions", () => {
  it.each([
    ["https://openrouter.ai", "https://openrouter.ai/api/alpha/decisions"],
    ["https://openrouter.ai/api", "https://openrouter.ai/api/alpha/decisions"],
    [
      "https://openrouter.ai/api/v1/",
      "https://openrouter.ai/api/alpha/decisions",
    ],
    [
      "https://openrouter.ai/api/alpha",
      "https://openrouter.ai/api/alpha/decisions",
    ],
    [
      "https://openrouter.ai/api/alpha/decisions",
      "https://openrouter.ai/api/alpha/decisions",
    ],
    [
      "https://gateway.example.com/root/v1",
      "https://gateway.example.com/root/alpha/decisions",
    ],
  ])("resolves the default endpoint for %s", (baseUrl, expected) => {
    expect(
      resolveOpenRouterDecisionsEndpoint({ provider: "openrouter", baseUrl })
    ).toBe(expected);
  });

  it.each([
    [
      "/custom/decisions",
      "https://gateway.example.com/root/v1/custom/decisions",
    ],
    [
      "https://other.example.com/decisions",
      "https://other.example.com/decisions",
    ],
  ])("honors the custom endpoint %s", (decisions, expected) => {
    expect(
      resolveOpenRouterDecisionsEndpoint({
        provider: "openrouter",
        baseUrl: "https://gateway.example.com/root/v1/",
        endpoints: { decisions, systemOne: "/legacy/systemone" },
      })
    ).toBe(expected);
  });

  it("builds the multi-question wire request and retains answers, provider and billing metadata", async () => {
    const wire = buildOpenRouterDecisionsRequest(
      {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        headers: { "X-Title": "AIO Hub" },
      },
      request
    );
    expect(wire).toMatchObject({
      method: "POST",
      url: "https://openrouter.ai/api/alpha/decisions",
      streaming: false,
      headers: {
        Authorization: "Bearer test-key",
        "X-Request-ID": "decision-test",
        "X-Title": "AIO Hub",
      },
      body: {
        kind: "json",
        value: {
          model: request.model,
          state: request.state,
          questions: request.questions,
        },
      },
    });
    const answers = {
      urgent: { type: "noul", noul: 0.9 },
      team: {
        type: "choice",
        choice: "billing",
        probabilities: { billing: 0.8, support: 0.2 },
        confidence: 0.7,
      },
      priority: {
        type: "score",
        score: 0.9,
        legend: { "0": "Low", "1": "High" },
        probabilities: { "0": 0.1, "1": 0.9 },
        confidence: 0.8,
      },
    };
    const response: WireResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: (async function* () {
        yield new TextEncoder().encode(
          JSON.stringify({
            id: "gen-dec-test",
            provider: "Perplexity",
            model: request.model,
            answers,
            usage: { input_tokens: 123, output_tokens: 12, cost: 0.00000246 },
          })
        );
      })(),
    };
    expect(await parseOpenRouterDecisionsResponse(response, request)).toEqual({
      id: "gen-dec-test",
      provider: "Perplexity",
      model: request.model,
      answers,
      usage: { inputTokens: 123, outputTokens: 12, cost: 0.00000246 },
    });
  });
});
