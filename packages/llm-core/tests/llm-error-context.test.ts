import { describe, expect, it } from "vitest";
import { decorateLlmError, formatLlmErrorContextLabel } from "../src";

describe("formatLlmErrorContextLabel", () => {
  it("joins profile and model with a middle dot", () => {
    expect(
      formatLlmErrorContextLabel({
        profileName: "OpenAI 官方",
        modelName: "gpt-4o",
      })
    ).toBe("[OpenAI 官方 · gpt-4o] ");
  });

  it("drops missing parts and returns empty when there is nothing to show", () => {
    expect(formatLlmErrorContextLabel({ profileName: "本地" })).toBe("[本地] ");
    expect(formatLlmErrorContextLabel({ modelName: "gpt-4o" })).toBe(
      "[gpt-4o] "
    );
    expect(formatLlmErrorContextLabel({})).toBe("");
    expect(formatLlmErrorContextLabel({ profileName: "  " })).toBe("");
  });
});

describe("decorateLlmError", () => {
  it("prefixes an Error in place, preserving type and status", () => {
    class LlmApiError extends Error {
      status = 429;
    }
    const error = new LlmApiError("API 请求失败 (429)");

    const decorated = decorateLlmError(error, {
      profileName: "OpenAI 官方",
      modelName: "gpt-4o",
    });

    expect(decorated).toBe(error);
    expect(error.message).toBe("[OpenAI 官方 · gpt-4o] API 请求失败 (429)");
    expect((decorated as LlmApiError).status).toBe(429);
  });

  it("does not prefix the same context twice", () => {
    const error = new Error("boom");
    const context = { profileName: "渠道", modelName: "模型" };

    decorateLlmError(error, context);
    decorateLlmError(error, context);

    expect(error.message).toBe("[渠道 · 模型] boom");
  });

  it("wraps a read-only message error while keeping name and extras", () => {
    const error = new Error("canceled");
    Object.defineProperty(error, "message", {
      get: () => "canceled",
      configurable: true,
    });
    (error as unknown as Record<string, unknown>).code = 400;

    const decorated = decorateLlmError(error, {
      profileName: "渠道",
      modelName: "模型",
    }) as Error;

    expect(decorated).not.toBe(error);
    expect(decorated.message).toBe("[渠道 · 模型] canceled");
    expect(decorated.name).toBe("Error");
    expect((decorated as unknown as Record<string, unknown>).code).toBe(400);
  });

  it("returns the original value when no context is available", () => {
    const error = new Error("boom");
    expect(decorateLlmError(error, {})).toBe(error);
  });

  it("wraps non-Error values", () => {
    const decorated = decorateLlmError("plain failure", {
      profileName: "渠道",
    }) as Error;
    expect(decorated).toBeInstanceOf(Error);
    expect(decorated.message).toBe("[渠道] plain failure");
  });
});
