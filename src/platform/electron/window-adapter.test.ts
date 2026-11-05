// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  delete (window as any).aiohub;
  vi.resetModules();
});

// Application startup and drag/drop can reach these modules in either order.
it.each(["electron-first", "native-first"])(
  "keeps the public Electron window factories callable when loaded %s",
  async (order) => {
    vi.resetModules();
    const request = vi.fn(async (operation: string) => ({
      ok: true,
      value:
        operation === "window.labels"
          ? ["main", "chat"]
          : operation === "window.monitor"
            ? { name: "screen" }
            : undefined,
    }));
    Object.assign(window, {
      aiohub: { platform: "electron", metadata: { label: "main" }, request },
    });
    if (order === "electron-first") await import("./window");
    const native = await import("../native/window");
    const current = native.getCurrentWindow();
    expect(current.label).toBe("main");
    expect((await native.getAllWindows()).map((w) => w.label)).toEqual([
      "main",
      "chat",
    ]);
    expect(await native.currentMonitor()).toEqual({ name: "screen" });
    await current.setTitle("Window contract");
    expect(request).toHaveBeenCalledWith("window.call", {
      label: "main",
      method: "setTitle",
      value: "Window contract",
    });
    expect(new native.Window("child").label).toBe("child");
  }
);
