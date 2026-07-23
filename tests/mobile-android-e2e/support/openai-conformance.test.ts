import { describe, expect, it } from "vitest";
import {
  MOBILE_E2E_DELAYED_MODEL_ID,
  MOBILE_E2E_HTTP_ERROR_MODEL_ID,
  MOBILE_E2E_INTERRUPTED_MODEL_ID,
  MOBILE_E2E_TIMEOUT_MODEL_ID,
  MOBILE_E2E_MODEL_IDS,
  responseModeForModel,
  sseEventCountForMode,
  summarizeOpenAiAttachments,
} from "./openai-conformance";

describe("mobile OpenAI attachment summaries", () => {
  it("records MIME, decoded bytes, and hash without retaining base64", () => {
    const summaries = summarizeOpenAiAttachments([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aGVsbG8=" },
          },
        ],
      },
    ]);
    expect(summaries).toEqual([
      {
        mimeType: "image/png",
        bytes: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      },
    ]);
    expect(JSON.stringify(summaries)).not.toContain("aGVsbG8");
  });

  it("maps advertised deterministic models to isolated response modes", () => {
    expect(MOBILE_E2E_MODEL_IDS).toEqual(
      expect.arrayContaining([
        MOBILE_E2E_HTTP_ERROR_MODEL_ID,
        MOBILE_E2E_INTERRUPTED_MODEL_ID,
        MOBILE_E2E_DELAYED_MODEL_ID,
      ])
    );
    expect(responseModeForModel(MOBILE_E2E_HTTP_ERROR_MODEL_ID)).toBe(
      "http-error"
    );
    expect(responseModeForModel(MOBILE_E2E_INTERRUPTED_MODEL_ID)).toBe(
      "interrupted-stream"
    );
    expect(responseModeForModel(MOBILE_E2E_DELAYED_MODEL_ID)).toBe(
      "delayed-stream"
    );
    expect(responseModeForModel(MOBILE_E2E_TIMEOUT_MODEL_ID)).toBe("timeout");
    expect(sseEventCountForMode("timeout", true, true)).toBe(0);
    expect(sseEventCountForMode("interrupted-stream", true, true)).toBe(1);
    expect(sseEventCountForMode("attachment", true, true)).toBe(4);
  });
});
