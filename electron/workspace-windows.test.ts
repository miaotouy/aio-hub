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
import { WorkspaceWindows } from "./workspace-windows";

const config = {
  id: "component-tester:sync-demo",
  displayName: "同步窗口",
  type: "component",
  width: 800,
  height: 600,
  disableNativeResize: true,
};
function fixture() {
  let manager: WorkspaceWindows;
  const events: { event: string; payload: unknown; target?: string }[] = [];
  function native(label: string) {
    const state = {
      destroyed: false,
      minimized: false,
      visible: false,
      title: "",
      ignore: false,
      skipTaskbar: true,
      shadow: false,
      top: false,
      resizable: true,
      focused: false,
    };
    return {
      state,
      isDestroyed: () => state.destroyed,
      isMinimized: () => state.minimized,
      restore: () => {
        state.minimized = false;
      },
      show: () => {
        state.visible = true;
      },
      focus: () => {
        state.focused = true;
      },
      destroy: () => {
        state.destroyed = true;
        windows.delete(label);
        manager.closed(label);
      },
      close: () => {
        state.destroyed = true;
        windows.delete(label);
        manager.closed(label);
      },
      setTitle: (v: string) => {
        state.title = v;
      },
      setIgnoreMouseEvents: (v: boolean) => {
        state.ignore = v;
      },
      setSkipTaskbar: (v: boolean) => {
        state.skipTaskbar = v;
      },
      setHasShadow: (v: boolean) => {
        state.shadow = v;
      },
      setAlwaysOnTop: (v: boolean) => {
        state.top = v;
      },
      setResizable: (v: boolean) => {
        state.resizable = v;
      },
      setPosition: vi.fn(),
      getBounds: () => ({ x: 100, y: 100, width: 800, height: 600 }),
    };
  }
  const windows = new Map<string, ReturnType<typeof native>>();
  const create = vi.fn(
    async (label: string, _options: Record<string, unknown>) => {
      windows.set(label, native(label));
    }
  );
  manager = new WorkspaceWindows({
    windows,
    create,
    emit: (event, payload, target) => {
      events.push({ event, payload, target });
    },
    transparent: true,
    sessionTimeoutMs: 1000,
  });
  return { manager, windows, events, create, native };
}
afterEach(() => vi.useRealTimers());
describe("业务窗口生命周期", () => {
  it("finalizes a component with its route and public metadata, then reattaches once on actual native close", async () => {
    const { manager, windows, events, create } = fixture();
    const label = await manager.begin(10, config),
      win = windows.get(label)!;
    expect(manager.detached.size).toBe(0);
    expect(win.state.ignore).toBe(true);
    const route = new URL(
      create.mock.calls[0][1].url as string,
      "https://app.local"
    );
    expect(route.pathname).toBe("/detached-component/" + config.id);
    expect(JSON.parse(route.searchParams.get("config")!).id).toBe(config.id);
    await manager.finalize(10, label, true);
    expect(win.state).toMatchObject({
      ignore: false,
      skipTaskbar: false,
      top: true,
      resizable: false,
      visible: true,
      title: config.displayName,
    });
    const info = { label, id: config.id, type: "component" };
    expect([...manager.detached.values()]).toEqual([info]);
    expect(events).toContainEqual({
      event: "window-detached",
      payload: info,
      target: undefined,
    });
    await manager.finalize(10, label, true);
    expect(events.filter((e) => e.event === "window-detached")).toHaveLength(1);
    win.close();
    manager.closed(label);
    expect(manager.detached.size).toBe(0);
    expect(
      events.filter((e) => e.event === "window-attached").map((e) => e.payload)
    ).toEqual([info]);
  });
  it("coalesces duplicate begins, rejects another owner's session controls, and cancels without a detach event", async () => {
    const { manager, windows, events, create } = fixture();
    const first = manager.begin(10, config),
      second = manager.begin(10, config);
    const label = await first;
    expect(await second).toBe(label);
    expect(create).toHaveBeenCalledTimes(1);
    expect(() => manager.begin(20, config)).toThrow();
    await expect(manager.finalize(20, label, true)).rejects.toThrow();
    expect(() => manager.updatePosition(20, label, 200, 300)).toThrow();
    manager.updatePosition(10, label, 500, 400);
    expect(windows.get(label)!.setPosition).toHaveBeenCalledWith(100, 100);
    manager.updateStatus(10, label, true);
    expect(events).toContainEqual({
      event: "detach-status-update",
      payload: { canDetach: true },
      target: label,
    });
    await manager.finalize(10, label, false);
    expect(windows.size).toBe(0);
    expect(
      events.some(
        (e) => e.event === "window-detached" || e.event === "window-attached"
      )
    ).toBe(false);
  });
  it("cleans abandoned previews on expiry or owner loss and allows retry after creation fails", async () => {
    vi.useFakeTimers();
    const { manager, windows, create } = fixture();
    const label = await manager.begin(10, config);
    await vi.advanceTimersByTimeAsync(1001);
    expect(windows.has(label)).toBe(false);
    create.mockRejectedValueOnce(Error("load failed"));
    await expect(manager.begin(10, config)).rejects.toThrow("load failed");
    const retry = await manager.begin(10, config);
    manager.disposeOwner(20);
    expect(windows.has(retry)).toBe(true);
    manager.disposeOwner(10);
    expect(windows.has(retry)).toBe(false);
  });
  it("does not register or leave an orphan when the owner leaves during window loading", async () => {
    const { manager, windows, create, native } = fixture();
    let complete!: () => void;
    create.mockImplementationOnce(async (label) => {
      windows.set(label, native(label));
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    });
    const pending = manager.begin(10, config);
    await Promise.resolve();
    manager.disposeOwner(10);
    expect(windows.size).toBe(0);
    expect(() => manager.begin(10, config)).toThrow();
    complete();
    await expect(pending).rejects.toThrow();
    expect(windows.size).toBe(0);
    const next = await manager.begin(10, config);
    await manager.finalize(10, next, true);
    manager.disposeOwner(10);
    expect(windows.has(next)).toBe(true);
  });
  it("keeps tool routes and reattachment metadata stable for button and existing tool creation", async () => {
    const { manager, windows, create, events } = fixture();
    const label = await manager.begin(10, {
      ...config,
      id: "jsonFormatter",
      displayName: "",
      type: "tool",
      disableNativeResize: false,
    });
    expect(create.mock.calls[0][1].url).toBe("/detached-window/json-formatter");
    await manager.finalize(10, label, true);
    expect(windows.get(label)!.state).toMatchObject({
      title: "AIO Hub",
      shadow: true,
      top: false,
      resizable: true,
    });
    manager.registerTool("legacy-tool");
    manager.registerTool("legacy-tool");
    expect(events.filter((e) => e.event === "window-detached")).toHaveLength(2);
    windows.get(label)!.close();
  });
  it("deduplicates Canvas creation, restores an existing minimized window, and publishes native-close events independently", async () => {
    const { manager, windows, events, create } = fixture(),
      args = { canvasId: "cp_20261104_abc123", title: "画布预览" };
    const first = manager.createCanvas(args),
      second = manager.createCanvas(args);
    const label = await first;
    expect(await second).toBe(label);
    expect(create).toHaveBeenCalledTimes(1);
    expect(manager.detached.size).toBe(0);
    const win = windows.get(label)!;
    win.state.minimized = true;
    await manager.createCanvas(args);
    expect(win.state).toMatchObject({
      minimized: false,
      visible: true,
      focused: true,
    });
    expect([...manager.canvases.values()]).toEqual([
      { label, canvasId: args.canvasId, title: args.title },
    ]);
    manager.closeCanvas(args.canvasId);
    expect(manager.canvases.size).toBe(0);
    expect(
      events.filter((e) => e.event === "canvas-window-closed")
    ).toHaveLength(1);
    expect(events.some((e) => e.event === "window-attached")).toBe(false);
    await manager.createCanvas(args);
    await manager.createCanvas({ ...args, canvasId: "cp_20261104_xyz456" });
    expect(manager.closeAllCanvases()).toBe(2);
    expect(manager.canvases.size).toBe(0);
  });
  it("rejects unsafe IDs before creating windows and retries Canvas after a synchronous native creation failure", async () => {
    const { manager, create } = fixture();
    expect(() => manager.begin(10, { ...config, id: "../other" })).toThrow();
    expect(() =>
      manager.createCanvas({ canvasId: "../outside", title: "test" })
    ).toThrow();
    expect(create).not.toHaveBeenCalled();
    create.mockImplementationOnce(() => {
      throw Error("native create failed");
    });
    const args = { canvasId: "cp_20261104_abc123", title: "Canvas" };
    await expect(manager.createCanvas(args)).rejects.toThrow(
      "native create failed"
    );
    expect(await manager.createCanvas(args)).toBe(
      "canvas-win-" + args.canvasId
    );
    manager.closeAllCanvases();
  });
});
