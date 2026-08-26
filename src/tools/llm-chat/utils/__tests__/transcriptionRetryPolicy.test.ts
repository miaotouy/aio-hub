import { describe, expect, it } from "vitest";
import {
  shouldAutoCreateTranscriptionTask,
  shouldUseFailedTranscriptionFallback,
} from "../transcriptionRetryPolicy";

describe("shouldAutoCreateTranscriptionTask", () => {
  it("creates a task when no transcription exists", () => {
    expect(shouldAutoCreateTranscriptionTask("none")).toBe(true);
  });

  it("does not retry a failed historical transcription automatically", () => {
    expect(shouldAutoCreateTranscriptionTask("error")).toBe(false);
  });

  it("does not duplicate active or completed tasks", () => {
    expect(shouldAutoCreateTranscriptionTask("pending")).toBe(false);
    expect(shouldAutoCreateTranscriptionTask("processing")).toBe(false);
    expect(shouldAutoCreateTranscriptionTask("success")).toBe(false);
  });
});

describe("shouldUseFailedTranscriptionFallback", () => {
  it("replaces an unsupported attachment after transcription fails", () => {
    expect(shouldUseFailedTranscriptionFallback("error", true)).toBe(true);
  });

  it("keeps source media when the chat model supports it natively", () => {
    expect(shouldUseFailedTranscriptionFallback("error", false)).toBe(false);
  });
});
