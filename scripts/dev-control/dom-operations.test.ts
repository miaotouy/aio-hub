// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDomOperation } from "./dom-operations";
import { inspectElement } from "./dom-inspect";
import { readDiagnostics } from "./page-actions";

beforeEach(() => {
  document.body.innerHTML =
    '<button data-testid="save">Save</button><div id="cover"></div><input id="input" data-testid="input" />';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(10, 10, 100, 40)
  );
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => document.querySelector("button")),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  delete window.__AIO_DEV_DIAGNOSTICS__;
});

describe("embedded DOM input contracts", () => {
  it("blocks a covered target and performs one click after it is actionable", async () => {
    const click = vi.fn();
    document.querySelector("button")!.addEventListener("click", click);
    vi.mocked(document.elementFromPoint).mockReturnValue(
      document.querySelector("#cover")
    );
    const step = { op: "click" as const, target: { testid: "save" } };
    await expect(runDomOperation(step)).rejects.toMatchObject({
      code: "TARGET_OBSCURED",
    });
    expect(click).not.toHaveBeenCalled();
    vi.mocked(document.elementFromPoint).mockReturnValue(
      document.querySelector("button")
    );
    await expect(runDomOperation(step)).resolves.toMatchObject({
      inputBackend: "dom",
    });
    expect(click).toHaveBeenCalledOnce();
  });
  it("blocks disabled and expired writes without producing click events", async () => {
    const button = document.querySelector("button")!;
    const click = vi.fn();
    button.addEventListener("click", click);
    button.disabled = true;
    await expect(
      runDomOperation({ op: "click", target: { testid: "save" } })
    ).rejects.toMatchObject({ code: "TARGET_DISABLED" });
    button.disabled = false;
    button.parentElement!.style.opacity = "0";
    await expect(
      runDomOperation({ op: "click", target: { testid: "save" } })
    ).rejects.toMatchObject({ code: "TARGET_HIDDEN" });
    button.parentElement!.style.opacity = "1";
    await expect(
      runDomOperation(
        { op: "click", target: { testid: "save" } },
        Date.now() - 1
      )
    ).rejects.toMatchObject({ code: "COMMAND_TIMEOUT" });
    expect(click).not.toHaveBeenCalled();
  });
  it("updates an editable input through native value and input/change events", async () => {
    const input = document.querySelector("input")!;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    vi.mocked(document.elementFromPoint).mockReturnValue(input);
    await runDomOperation({
      op: "fill",
      target: { css: "#input" },
      text: "sample",
    });
    expect(input.value).toBe("sample");
    expect(events).toEqual(["input", "change"]);
    input.readOnly = true;
    await expect(
      runDomOperation({ op: "fill", target: { css: "#input" }, text: "other" })
    ).rejects.toMatchObject({ code: "TARGET_READONLY" });
    expect(input.value).toBe("sample");
  });
  it("restarts diagnostic cursors when the document identity changes", () => {
    window.__AIO_DEV_DIAGNOSTICS__ = {
      documentId: "new-document",
      cursor: 3,
      entries: [1, 2, 3].map((cursor) => ({
        cursor,
        kind: "error",
        message: "sample",
        at: cursor,
      })),
    };
    const result = readDiagnostics({
      since: 2,
      limit: 10,
      documentId: "old-document",
    });
    expect(result.reset).toBe(true);
    expect(result.entries.map((entry) => entry.cursor)).toEqual([1, 2, 3]);
    expect(result.documentId).toBe("new-document");
  });
  it("omits input values from the shared inspect result", () => {
    document.querySelector("input")!.value = "private-probe-value";
    const snapshot = inspectElement(document.body);
    expect(
      snapshot.elements.some((element) => element.role === "textbox")
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("private-probe-value");
  });
});
