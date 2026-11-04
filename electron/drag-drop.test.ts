// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it, vi } from "vitest";
import {
  installFileDragDrop,
  parseNativeDragDrop,
  type NativeDragDrop,
} from "./drag-drop";
function harness(consume = false) {
  const handlers = new Map<string, Array<(event: any) => void>>();
  const addEventListener = (name: string, callback: (event: any) => void) => {
    const list = handlers.get(name) ?? [];
    list.push(callback);
    handlers.set(name, list);
  };
  const document = { hidden: false, addEventListener };
  const window = { devicePixelRatio: 1.5, addEventListener };
  const events: NativeDragDrop[] = [],
    fallback = vi.fn(),
    getPath = vi.fn((file: File) =>
      file.name === "disk" ? "C:/work/file.txt" : ""
    );
  installFileDragDrop(
    document as unknown as Document,
    window as unknown as Window,
    getPath,
    (event, preventDefault) => {
      events.push(event);
      if (consume) preventDefault?.();
    },
    fallback
  );
  return {
    document,
    events,
    getPath,
    fallback,
    fire(name: string, input = {}) {
      const event = {
        isTrusted: true,
        defaultPrevented: false,
        clientX: 20,
        clientY: 30,
        preventDefault: vi.fn(),
        dataTransfer: { types: ["Files"], files: [] },
        ...input,
      };
      event.preventDefault.mockImplementation(() => {
        event.defaultPrevented = true;
      });
      for (const callback of handlers.get(name) ?? []) callback(event);
      return event;
    },
  };
}
describe("isolated preload file dragging", () => {
  it("keeps nested enter/leave in one drag and delivers deduplicated real paths at physical coordinates", () => {
    const h = harness();
    h.fire("dragenter");
    h.fire("dragenter");
    h.fire("dragleave");
    h.fire("dragover");
    expect(h.events.map((event) => event.type)).toEqual(["enter", "over"]);
    h.fire("drop", {
      dataTransfer: {
        types: ["Files"],
        files: [{ name: "disk" }, { name: "disk" }],
      },
    });
    expect(h.events.at(-1)).toEqual({
      type: "drop",
      paths: ["C:/work/file.txt"],
      position: { x: 30, y: 45 },
    });
    h.fire("dragleave");
    expect(h.events.map((event) => event.type)).toEqual([
      "enter",
      "over",
      "drop",
    ]);
  });
  it("ignores synthetic and text drags and leaves byte-only drops to the page", () => {
    const h = harness();
    const synthetic = h.fire("drop", {
      isTrusted: false,
      dataTransfer: { types: ["Files"], files: [{ name: "disk" }] },
    });
    const text = h.fire("dragover", {
      dataTransfer: { types: ["text/plain"], files: [] },
    });
    expect(synthetic.preventDefault).not.toHaveBeenCalled();
    expect(text.preventDefault).not.toHaveBeenCalled();
    expect(h.getPath).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
    h.fire("dragenter");
    h.fire("drop", {
      dataTransfer: { types: ["Files"], files: [{ name: "browser-file" }] },
    });
    expect(h.events.map((event) => event.type)).toEqual(["enter", "leave"]);
  });
  it("clears hover on focus loss or hidden documents and can accept another drag", () => {
    const h = harness();
    h.fire("dragover");
    h.fire("blur");
    h.fire("blur");
    h.fire("dragenter");
    h.document.hidden = true;
    h.fire("visibilitychange");
    expect(h.events.map((event) => event.type)).toEqual([
      "enter",
      "over",
      "leave",
      "enter",
      "leave",
    ]);
  });
  it("uses global opening only when the drop was left unclaimed", () => {
    const input = {
      dataTransfer: { types: ["Files"], files: [{ name: "disk" }] },
    };
    const outside = harness();
    outside.fire("drop", input);
    expect(outside.fallback).toHaveBeenCalledWith(["C:/work/file.txt"]);
    const nativeConsumer = harness(true);
    const event = nativeConsumer.fire("drop", input);
    expect(event.defaultPrevented).toBe(true);
    expect(nativeConsumer.fallback).not.toHaveBeenCalled();
    const domConsumer = harness();
    domConsumer.fire("drop", { ...input, defaultPrevented: true });
    expect(domConsumer.fallback).not.toHaveBeenCalled();
  });
  it("copies the event envelope and rejects invalid kinds, positions and paths", () => {
    const input = {
      type: "drop",
      position: { x: 2, y: 3 },
      paths: ["C:/a", "C:/a"],
      target: "another-window",
    };
    expect(parseNativeDragDrop(input)).toEqual({
      type: "drop",
      position: { x: 2, y: 3 },
      paths: ["C:/a"],
    });
    for (const value of [
      null,
      {},
      { ...input, type: "click" },
      { ...input, position: { x: NaN, y: 0 } },
      { ...input, paths: [1] },
      { ...input, paths: ["x\0y"] },
    ])
      expect(() => parseNativeDragDrop(value)).toThrow();
  });
});
