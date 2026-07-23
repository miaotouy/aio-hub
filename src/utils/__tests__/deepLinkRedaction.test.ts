import { describe, expect, it } from "vitest";
import { redactDeepLinkUrl, redactDeepLinkValue } from "../deepLinkRedaction";

describe("deep link redaction", () => {
  it("redacts credentials while retaining diagnostic URL fields", () => {
    const result = redactDeepLinkUrl(
      "aiohub://add-profile/?key=secret-value&address=https%3A%2F%2Fexample.com&name=Demo"
    );

    expect(result).toContain("key=%5BREDACTED%5D");
    expect(result).toContain("address=https%3A%2F%2Fexample.com");
    expect(result).toContain("name=Demo");
    expect(result).not.toContain("secret-value");
  });

  it("redacts nested event payloads without changing unrelated values", () => {
    const result = redactDeepLinkValue({
      args: ["aiohub://add-profile/?key=secret-value", "C:\\Windows\\System32"],
      count: 2,
    });

    expect(result).toEqual({
      args: [
        "aiohub://add-profile/?key=%5BREDACTED%5D",
        "C:\\Windows\\System32",
      ],
      count: 2,
    });
  });

  it("redacts accepted URLs wrapped in quotes or whitespace", () => {
    expect(
      redactDeepLinkValue({
        args: ['  "aiohub://add-profile/?key=secret-value"  '],
      })
    ).toEqual({
      args: ['  "aiohub://add-profile/?key=%5BREDACTED%5D"  '],
    });
  });
});
