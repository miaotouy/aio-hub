import { describe, expect, it } from "vitest";
import { summarizeGitError } from "./gitError";

const warning = "warning: TLS certificate verification has been disabled!\n";

describe("Git failure summary", () => {
  it("prioritizes the hook failure over repeated warnings and source excerpts", () => {
    const reason =
      "error: This script requires bun@^1.4.4, but you are using bun@1.4.2";
    const message =
      warning.repeat(12) +
      "10 | throw new Error(...)\n" +
      reason +
      "\n at repo/[eval]:10:13\nerror: failed to push some refs to 'https://example.com/repo.git'";
    expect(summarizeGitError(message)).toBe(reason);
  });

  it("keeps rejection details and recovery hints", () => {
    const rejected = "! [rejected] main -> main (fetch first)";
    const hint =
      "hint: Updates were rejected because the remote contains work that you do not have locally.";
    expect(
      summarizeGitError(
        "To https://example.com/repo.git\r\n " +
          rejected +
          "\r\nerror: failed to push some refs to 'https://example.com/repo.git'\r\n" +
          hint
      )
    ).toBe(rejected + "\n" + hint);
  });

  it.each([
    [
      warning + "remote: error: repository rule violation",
      "remote: error: repository rule violation",
    ],
    [warning + "pre-push: checks failed", "pre-push: checks failed"],
    ["error: failed to push some refs", "error: failed to push some refs"],
    [warning, warning],
    ["", ""],
  ])(
    "retains actionable output or the original fallback: %s",
    (message, expected) => {
      expect(summarizeGitError(message)).toBe(expected);
    }
  );
});
