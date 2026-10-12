import { beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli";
import { executeRequest } from "./commands";
import { validateRequest } from "./protocol";

vi.mock("./commands", () => ({
  executeRequest: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => vi.clearAllMocks());

describe("double-click control contract", () => {
  it("sends a native double-click request using the same scoped targeting and timeout options as click", async () => {
    await main([
      "dblclick",
      "--instance",
      "preview",
      "--window",
      "main",
      "--css",
      ".tab-name",
      "--scope",
      ".tabs-header",
      "--timeout",
      "5000",
    ]);
    expect(executeRequest).toHaveBeenCalledExactlyOnceWith({
      instance: "preview",
      window: "main",
      timeoutMs: 5000,
      steps: [
        { op: "dblclick", target: { css: ".tab-name", scope: ".tabs-header" } },
      ],
    });
  });

  it("accepts double clicks in batches and rejects missing or ambiguous targeting before execution", () => {
    const step = {
      op: "dblclick",
      target: { role: "button", name: "Keep open" },
    };
    expect(validateRequest({ steps: [step] }).steps).toEqual([step]);
    expect(() => validateRequest({ steps: [{ op: "dblclick" }] })).toThrow();
    expect(() =>
      validateRequest({
        steps: [{ op: "dblclick", target: { css: ".tab", testid: "tab" } }],
      })
    ).toThrow();
  });

  it("forwards one-shot click modifiers and rejects invalid modifier batches", async () => {
    await main(["click", "--css", ".file-item", "--modifiers", "Alt"]);
    expect(executeRequest).toHaveBeenCalledExactlyOnceWith({
      instance: undefined,
      window: undefined,
      timeoutMs: undefined,
      steps: [
        { op: "click", target: { css: ".file-item" }, modifiers: ["Alt"] },
      ],
    });
    const step = {
      op: "click",
      target: { css: ".file-item" },
      modifiers: ["Alt"],
    };
    expect(validateRequest({ steps: [step] }).steps).toEqual([step]);
    expect(() =>
      validateRequest({ steps: [{ ...step, modifiers: ["CapsLock"] }] })
    ).toThrow();
    expect(() =>
      validateRequest({ steps: [{ ...step, modifiers: ["Alt", "Alt"] }] })
    ).toThrow();
  });

  it("rejects unrelated flags for double-click commands", async () => {
    await expect(
      main(["dblclick", "--css", ".tab", "--text", "unexpected"])
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(executeRequest).not.toHaveBeenCalled();
  });
});
