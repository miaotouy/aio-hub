// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPageDescription } from "./page-description";
import { resizeWindow } from "./page-actions";

const identity = {
  protocolVersion: 1,
  instanceId: "electron-test",
  startupId: "current-startup",
  windowLabel: "main",
  pid: 1234,
};
afterEach(() => vi.unstubAllGlobals());

describe("Electron page control contracts", () => {
  it("retains a native handshake while the application bridge is unavailable", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: identity });
    vi.stubGlobal("window", { aiohub: { request } });
    expect(await readPageDescription()).toMatchObject({
      ...identity,
      ready: false,
      bridgeAvailable: false,
    });
    expect(request).toHaveBeenCalledWith("command", {
      command: "dev_control_identity",
    });
    request.mockResolvedValue({ ok: true, value: null });
    expect(await readPageDescription()).toBeNull();
  });

  it("uses the live application description once its bridge is ready", async () => {
    const request = vi.fn();
    vi.stubGlobal("window", {
      aiohub: { request },
      __AIO_DEV_CONTROL__: {
        describe: () => ({ ...identity, route: "/settings", ready: true }),
      },
    });
    expect(await readPageDescription()).toEqual({
      ...identity,
      route: "/settings",
      ready: true,
      bridgeAvailable: true,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("restores fullscreen and maximized state before confirming the requested native viewport", async () => {
    let fullscreen = true,
      maximized = true;
    const request = vi.fn(
      async (_operation: string, args: Record<string, unknown>) => {
        switch (args.method) {
          case "isFullscreen":
            return { ok: true, value: fullscreen };
          case "isMaximized":
            return { ok: true, value: maximized };
          case "setFullscreen":
            fullscreen = false;
            break;
          case "unmaximize":
            maximized = false;
            break;
          case "setSize": {
            const size = args.value as { width: number; height: number };
            if (fullscreen || maximized)
              throw new Error("Resize before restore");
            vi.stubGlobal("innerWidth", size.width);
            vi.stubGlobal("innerHeight", size.height);
            break;
          }
          case "innerSize":
            return { ok: true, value: { width: 1440, height: 1080 } };
          case "scaleFactor":
            return { ok: true, value: 1.5 };
        }
        return { ok: true };
      }
    );
    vi.stubGlobal("window", {
      aiohub: { request },
      __AIO_DEV_CONTROL__: { describe: () => identity },
    });
    const result = await resizeWindow({
      width: 960,
      height: 720,
      timeoutMs: 1000,
    });
    expect(result.actual).toMatchObject({
      viewport: { width: 960, height: 720 },
      fullscreen: false,
      maximized: false,
      scaleFactor: 1.5,
    });
    expect(request).toHaveBeenCalledWith("window.call", {
      label: "main",
      method: "setSize",
      value: { type: "Logical", width: 960, height: 720 },
    });
  });
});
