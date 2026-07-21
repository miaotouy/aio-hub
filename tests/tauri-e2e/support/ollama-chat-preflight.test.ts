import { describe, expect, it, vi } from "vitest";
import { preflightOllamaChat } from "./ollama-chat-preflight";

describe("Ollama Chat preflight", () => {
  it("accepts a non-empty OpenAI-compatible Chat response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [{ message: { role: "assistant", content: "ready" } }],
      })
    );
    const result = await preflightOllamaChat({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3.5:9b",
      fetchImpl,
    });
    expect(result).toMatchObject({
      status: "success",
      model: "qwen3.5:9b",
      responseLength: 5,
    });
  });

  it("distinguishes optional skip from required failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    expect(
      await preflightOllamaChat({
        baseUrl: "http://127.0.0.1:11434",
        model: "missing",
        fetchImpl,
      })
    ).toMatchObject({ status: "skip", reason: { code: "chat-http-error" } });
    expect(
      await preflightOllamaChat({
        baseUrl: "http://127.0.0.1:11434",
        model: "missing",
        required: true,
        fetchImpl,
      })
    ).toMatchObject({
      status: "failure",
      reason: { code: "chat-http-error" },
    });
  });

  it("rejects empty or malformed responses without preserving content", async () => {
    const result = await preflightOllamaChat({
      baseUrl: "http://127.0.0.1:11434",
      model: "chat-model",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json({})),
    });
    expect(result).toMatchObject({
      status: "skip",
      reason: { code: "invalid-chat-response" },
    });
    expect(JSON.stringify(result)).not.toContain("choices");
  });
});
