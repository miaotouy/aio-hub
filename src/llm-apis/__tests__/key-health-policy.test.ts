import { describe, expect, it } from "vitest";
import { LlmApiError } from "../common";
import {
  getKeyHealthAction,
  getKeyHealthActionForError,
} from "../key-health-policy";

describe("key health policy", () => {
  it("records request and endpoint errors without counting them", () => {
    expect(
      getKeyHealthActionForError(
        new LlmApiError("use image endpoint", 400, "Bad Request")
      )
    ).toBe("record-only");
    expect(
      getKeyHealthAction({ success: false, category: "configuration" })
    ).toBe("record-only");
  });

  it("counts provider and network failures as transient", () => {
    expect(
      getKeyHealthActionForError(
        new LlmApiError("channel unavailable", 503, "Service Unavailable")
      )
    ).toBe("transient-failure");
    expect(
      getKeyHealthActionForError(new Error("network connection failed"))
    ).toBe("transient-failure");
  });

  it("distinguishes authentication and rate limit failures", () => {
    expect(
      getKeyHealthActionForError(
        new LlmApiError("invalid API key", 401, "Unauthorized")
      )
    ).toBe("authentication-failure");
    expect(
      getKeyHealthActionForError(
        new LlmApiError("rate limited", 429, "Too Many Requests")
      )
    ).toBe("rate-limit-failure");
  });

  it("does not count model-unavailable provider routing errors", () => {
    expect(
      getKeyHealthActionForError(
        new LlmApiError(
          "API 请求失败 (503 Service Unavailable): No available channel for model gpt-image-2 (code model_not_found)",
          503,
          "Service Unavailable"
        )
      )
    ).toBe("record-only");
  });

  it("records unknown failures instead of silently ignoring them", () => {
    expect(getKeyHealthActionForError(new Error("unexpected response"))).toBe(
      "record-only"
    );
  });
});
