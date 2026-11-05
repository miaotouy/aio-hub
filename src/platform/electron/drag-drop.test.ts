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

import { afterEach, describe, expect, it, vi } from "vitest";
import { onDragDropEvent } from "./drag-drop";
import type { NativeDragDrop } from "../../../electron/drag-drop";
const remote = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("./events", () => ({ listen: remote.listen }));
afterEach(() => {
  delete (window as any).aiohub;
  vi.clearAllMocks();
});
describe("Electron drag subscriptions", () => {
  it("uses the native preload stream and releases it once with physical position methods intact", async () => {
    let callback!: (event: NativeDragDrop) => void;
    const stop = vi.fn(),
      received: any[] = [];
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        metadata: { label: "main" },
        subscribeDragDrop: (handler: typeof callback) => {
          callback = handler;
          return stop;
        },
      },
    });
    const unlisten = await onDragDropEvent("main", (event) =>
      received.push(event)
    );
    callback({ type: "drop", paths: ["C:/a"], position: { x: 150, y: 75 } });
    expect(received[0].payload.position.toLogical(1.5)).toMatchObject({
      x: 100,
      y: 50,
    });
    expect(received[0].payload.paths).toEqual(["C:/a"]);
    unlisten();
    unlisten();
    callback({ type: "leave" });
    expect(received).toHaveLength(1);
    expect(stop).toHaveBeenCalledOnce();
    expect(remote.listen).not.toHaveBeenCalled();
  });
  it("releases partial cross-window subscriptions when a later registration fails", async () => {
    Object.assign(window, {
      aiohub: { platform: "electron", metadata: { label: "main" } },
    });
    const stop = vi.fn();
    remote.listen
      .mockResolvedValueOnce(stop)
      .mockRejectedValueOnce(new Error("window closed"));
    await expect(onDragDropEvent("child", () => {})).rejects.toThrow(
      "window closed"
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(remote.listen.mock.calls[0][2]).toEqual({
      target: { kind: "Window", label: "child" },
    });
  });
});
