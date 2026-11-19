import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlDom } from "../dom";
import { LayoutRecorder } from "../recorder";
import { redactOutput } from "../redact";

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 10,
    width: 100,
    height: 30,
    top: 10,
    left: 10,
    right: 110,
    bottom: 40,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("production controller observations", () => {
  it("protects sensitive subtrees and form values even when observing their parent or external labels", async () => {
    document.body.innerHTML = `<section id="root"><button aria-labelledby="secret-label">safe action</button><span id="secret-label" data-sensitive>private-example-key</span><div data-sensitive title="private-title"><button aria-label="private-label">private-content</button></div><input aria-label="account" value="private-input"><textarea>private-textarea</textarea><div data-control-ignore><button>private-ignored</button></div><button aria-label="public-action">public</button></section>`;
    const dom = new ControlDom();
    const observation = dom.observe();
    const inspection = await dom.operate(
      { op: "inspect", css: "#root" },
      Date.now() + 1000
    );
    const output = JSON.stringify({ observation, inspection });
    expect(output).toContain("public-action");
    expect(output).toContain("safe action");
    expect(output).not.toMatch(
      /private-(example-key|title|label|content|input|textarea|ignored)/
    );
    expect(
      await dom.operate(
        { op: "inspect", css: "#secret-label" },
        Date.now() + 1000
      )
    ).toEqual({ sensitive: true });
  });
  it("exposes visible Element Plus switches through their labelled wrapper and finds teleported options", () => {
    document.body.innerHTML =
      '<div class="el-switch"><input type="checkbox" aria-label="enable control" checked></div><div role="listbox"><div role="option">remote option</div></div>';
    const observation = new ControlDom().observe();
    expect(observation.elements).toContainEqual(
      expect.objectContaining({
        role: "switch",
        name: "enable control",
        checked: true,
      })
    );
    expect(observation.elements).toContainEqual(
      expect.objectContaining({ role: "option", name: "remote option" })
    );
  });
  it("observes an Element Plus select as one actionable combobox instead of its hidden input", () => {
    document.body.innerHTML =
      '<div class="el-select"><div role="combobox"><input aria-label="choose model"><span>selected model</span></div></div>';
    const observation = new ControlDom().observe();
    const controls = observation.elements.filter(
      (element) => element.role === "combobox"
    );
    expect(controls).toHaveLength(1);
    expect(controls[0].name).toBe("choose model");
  });
  it("refuses refs from a replaced snapshot and recycled controls with a changed meaning", () => {
    document.body.innerHTML = '<button aria-label="first">first</button>';
    const dom = new ControlDom();
    const first = dom.observe();
    const second = dom.observe();
    expect(() =>
      dom.resolve({
        op: "click",
        ref: first.elements[0].ref,
        snapshotId: first.snapshotId,
      })
    ).toThrow(/过期/);
    document
      .querySelector("button")!
      .setAttribute("aria-label", "different action");
    expect(() =>
      dom.resolve({
        op: "click",
        ref: second.elements[0].ref,
        snapshotId: second.snapshotId,
      })
    ).toThrow(/语义/);
  });
  it("inspects scroll geometry without moving the failing view", async () => {
    document.body.innerHTML = '<div class="sessions-list">rows</div>';
    const element = document.querySelector<HTMLElement>(".sessions-list")!;
    element.scrollTop = 123;
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    const result = (await new ControlDom().operate(
      { op: "inspect", css: ".sessions-list" },
      Date.now() + 1000
    )) as { scroll: { top: number } };
    expect(result.scroll.top).toBe(123);
    expect(element.scrollTop).toBe(123);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
  it("redacts nested configuration secrets with an explicit API-key presence bit", () => {
    expect(
      redactOutput({
        model: {
          apiKey: "private",
          headers: { Authorization: "private", "x-api-key": "private" },
          label: "model",
        },
      })
    ).toEqual({
      model: {
        hasApiKey: true,
        headers: { Authorization: "[redacted]", "x-api-key": "[redacted]" },
        label: "model",
      },
    });
  });
});
describe("layout evidence", () => {
  it("bounds an active recording and restores the recent geometry after a document reload", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<div class="sessions-list"><div>private-conversation-title</div></div>';
    const element = document.querySelector<HTMLElement>(".sessions-list")!;
    const recorder = new LayoutRecorder();
    recorder.start();
    for (let i = 0; i < 620; i++) {
      element.scrollTop = i;
      recorder.sample();
    }
    const before = recorder.mark();
    expect(before.entries).toHaveLength(600);
    expect(before.dropped).toBeGreaterThan(0);
    expect(JSON.stringify(before)).not.toContain("private-conversation-title");
    recorder.stop(false);
    const reloaded = new LayoutRecorder();
    reloaded.start();
    expect(
      reloaded
        .read()
        .entries.some(
          (entry) =>
            entry.kind === "layout" &&
            JSON.stringify(entry.data).includes('"top":619')
        )
    ).toBe(true);
    reloaded.stop();
    expect(sessionStorage.length).toBe(0);
  });
});
