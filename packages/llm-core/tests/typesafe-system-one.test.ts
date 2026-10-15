import { describe, expect, it } from "vitest";
import {
  buildTypeSafeSystemOneRequest,
  parseTypeSafeSystemOneResponse,
  resolveTypeSafeSystemOneEndpoint,
  type JsonValue,
  type SystemOneRequest,
  type WireResponse,
} from "../src";

const request: SystemOneRequest = {
  model: "jev-1.13.0",
  state: { message: "Payment failed for three days" },
  questions: {
    department: {
      type: "choice",
      instructions: "Which team should handle this?",
      criteria: {
        billing: "Billing and payments",
        technical: "Integration failures",
      },
    },
    frustration: {
      type: "score",
      instructions: "How frustrated is the customer?",
      criteria: ["Calm", "Frustrated", "Very angry"],
    },
    is_urgent: {
      type: "noul",
      instructions: "Does this message convey urgency?",
    },
  },
  requestId: "request-1",
};

describe("TypeSafe System One provider", () => {
  it("builds a typed decision request for the default endpoint", () => {
    const wireRequest = buildTypeSafeSystemOneRequest(
      {
        provider: "typesafe",
        baseUrl: "https://api.typesafe.ai",
        apiKey: "secret",
        headers: { "X-Custom": "value" },
      },
      request
    );

    expect(wireRequest).toMatchObject({
      method: "POST",
      url: "https://api.typesafe.ai/v1/systemone",
      streaming: false,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
        "X-Request-ID": "request-1",
        "X-Custom": "value",
      },
      body: {
        kind: "json",
        value: {
          model: "jev-1.13.0",
          state: { message: "Payment failed for three days" },
          questions: request.questions,
        },
      },
    });
  });

  it.each(["box", "noul"] as const)(
    "sends image assets and opt-in headers for a %s question",
    (type) => {
      const assets = {
        "photo-ref": { type: "image", format: "png", data_base64: "aW1hZ2U=" },
      } as const;
      const wire = buildTypeSafeSystemOneRequest(
        { provider: "typesafe", baseUrl: "https://api.typesafe.ai" },
        {
          model: "jev-1.14.0",
          state: { photo: "photo-ref" },
          assets,
          longContext: true,
          questions: { target: { type, instructions: "The mug in photo" } },
        }
      );
      expect(wire).toMatchObject({
        headers: {
          "TypeSafe-Danger-Zone-Images": "true",
          "TypeSafe-Danger-Zone-Long-Context": "true",
        },
        body: { kind: "json", value: { assets, model: "jev-1.14.0" } },
      });
      const plain = buildTypeSafeSystemOneRequest(
        { provider: "typesafe", baseUrl: "https://api.typesafe.ai" },
        request
      );
      expect(
        plain.headers["TypeSafe-Danger-Zone-Long-Context"]
      ).toBeUndefined();
      expect(plain.headers["TypeSafe-Danger-Zone-Images"]).toBeUndefined();
    }
  );

  it("parses mixed Box and Noul answers from Jev 1.14", async () => {
    const box = { top: 0.25, bottom: 0.82, left: 0.44, right: 0.84 };
    await expect(
      parseTypeSafeSystemOneResponse(
        jsonResponse({
          model: "jev-1.14.0",
          answers: {
            target: { type: "box", box, confidence: 0.92 },
            present: { type: "noul", noul: 0.99 },
          },
          usage: { input_tokens: 290, output_tokens: 21 },
        }),
        {
          model: "jev-1.14.0",
          state: "photo-ref",
          questions: {
            target: { type: "box", instructions: "The mug" },
            present: { type: "noul", instructions: "Is there a mug?" },
          },
        }
      )
    ).resolves.toMatchObject({
      answers: {
        target: { type: "box", box, confidence: 0.92 },
        present: { type: "noul", noul: 0.99 },
      },
      usage: { inputTokens: 290, outputTokens: 21 },
    });
  });

  it.each([
    { box: { top: -0.1, bottom: 0.8, left: 0.4, right: 0.9 }, confidence: 0.9 },
    { box: { top: 0.2, bottom: 0.8, left: 0.9, right: 0.4 }, confidence: 0.9 },
    { box: { top: 0.2, bottom: 0.2, left: 0.4, right: 0.9 }, confidence: 0.9 },
    { box: { top: 0.2, bottom: 0.8, left: 0.4, right: 0.9 }, confidence: 1.1 },
  ])("rejects invalid Box geometry or confidence: %j", async (answer) => {
    await expect(
      parseTypeSafeSystemOneResponse(
        jsonResponse({
          model: "jev-1.14.0",
          answers: { target: { type: "box", ...answer } },
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        {
          model: "jev-1.14.0",
          state: "photo-ref",
          questions: { target: { type: "box", instructions: "The mug" } },
        }
      )
    ).rejects.toThrow(/answers\.target\.(?:box|confidence)/);
  });

  it("resolves versioned, relative, and absolute endpoints", () => {
    expect(
      resolveTypeSafeSystemOneEndpoint({
        provider: "typesafe",
        baseUrl: "https://api.typesafe.ai/v1",
      })
    ).toBe("https://api.typesafe.ai/v1/systemone");
    expect(
      resolveTypeSafeSystemOneEndpoint({
        provider: "typesafe",
        baseUrl: "https://gateway.example.com/root",
        endpoints: { systemOne: "/custom/systemone" },
      })
    ).toBe("https://gateway.example.com/root/custom/systemone");
    expect(
      resolveTypeSafeSystemOneEndpoint({
        provider: "typesafe",
        baseUrl: "https://gateway.example.com",
        endpoints: { systemOne: "https://other.example.com/v2/decide" },
      })
    ).toBe("https://other.example.com/v2/decide");
  });

  it("normalizes noul, choice, score, and usage fields", async () => {
    const response = jsonResponse({
      model: "jev-1.13.0",
      answers: {
        department: {
          type: "choice",
          choice: "technical",
          probabilities: { billing: 0.1, technical: 0.9 },
          confidence: 0.8,
        },
        frustration: {
          type: "score",
          score: 1.4,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
          probabilities: { "0": 0.05, "1": 0.5, "2": 0.45 },
          confidence: 0.25,
        },
        is_urgent: { type: "noul", noul: 0.96 },
      },
      usage: { input_tokens: 312, output_tokens: 48 },
    });

    await expect(
      parseTypeSafeSystemOneResponse(response, request)
    ).resolves.toEqual({
      model: "jev-1.13.0",
      answers: {
        department: {
          type: "choice",
          choice: "technical",
          probabilities: { billing: 0.1, technical: 0.9 },
          confidence: 0.8,
        },
        frustration: {
          type: "score",
          score: 1.4,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
          probabilities: { "0": 0.05, "1": 0.5, "2": 0.45 },
          confidence: 0.25,
        },
        is_urgent: { type: "noul", noul: 0.96 },
      },
      usage: { inputTokens: 312, outputTokens: 48 },
    });
  });

  it("rejects a response whose answer type does not match the question", async () => {
    const response = jsonResponse({
      model: "jev-1.13.0",
      answers: {
        department: { type: "noul", noul: 0.9 },
        frustration: {
          type: "score",
          score: 1,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
          probabilities: { "0": 0, "1": 1, "2": 0 },
          confidence: 1,
        },
        is_urgent: { type: "noul", noul: 0.9 },
      },
      usage: { input_tokens: 10, output_tokens: 3 },
    });

    await expect(
      parseTypeSafeSystemOneResponse(response, request)
    ).rejects.toThrow("department 的答案类型应为 choice");
  });
});

function jsonResponse(value: JsonValue): WireResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield new TextEncoder().encode(JSON.stringify(value));
    })(),
  };
}
