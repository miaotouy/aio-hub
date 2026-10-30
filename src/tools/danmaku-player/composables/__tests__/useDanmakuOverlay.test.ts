// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalPlayerConfig } from "../../types";

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: native.emit }));
vi.mock("@/utils/nativeDesktopCapabilities", () => ({
  getNativeDesktopCapabilities: () => ({ externalPlayerOverlay: true }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: native.error, handle: vi.fn() }),
}));
import { useDanmakuOverlay } from "../useDanmakuOverlay";

const wrappers: VueWrapper[] = [];
function workspace() {
  let overlay!: ReturnType<typeof useDanmakuOverlay>;
  const wrapper = mount(
    defineComponent({
      setup() {
        overlay = useDanmakuOverlay();
        return () => h("div");
      },
    })
  );
  wrappers.push(wrapper);
  return { wrapper, overlay };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const playerConfig: ExternalPlayerConfig = {
  playerType: "mpc-be",
  webPort: 13579,
  mpvIpcPath: "",
  vlcPassword: "",
  offsetTop: 0,
  offsetBottom: 0,
  fullscreenOffsetTop: 0,
  fullscreenOffsetBottom: 0,
  enableFullscreenBoost: true,
};
beforeEach(() => {
  native.invoke.mockReset();
  native.emit.mockReset();
  native.error.mockReset();
  native.invoke.mockImplementation(async (command: string) =>
    command === "create_danmaku_overlay_window" ? "danmaku-overlay" : undefined
  );
});
afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  await flushPromises();
  vi.useRealTimers();
});

describe("danmaku overlay workspace lifecycle", () => {
  it("closes an active overlay when the workspace unmounts", async () => {
    const { wrapper, overlay } = workspace();
    expect(await overlay.createOverlay(123)).toBe("danmaku-overlay");
    expect(overlay.overlayActive.value).toBe(true);
    wrapper.unmount();
    await flushPromises();
    expect(native.emit).toHaveBeenCalledWith("danmaku-overlay:stop");
    expect(native.invoke).toHaveBeenCalledWith("close_danmaku_overlay_window");
    expect(overlay.overlayActive.value).toBe(false);
  });

  it("reclaims a late creation result and prevents subsequent startup after unmount", async () => {
    const creation = deferred<string>();
    native.invoke.mockImplementation((command: string) =>
      command === "create_danmaku_overlay_window"
        ? creation.promise
        : Promise.resolve()
    );
    const { wrapper, overlay } = workspace();
    const pending = overlay.createOverlay(123);
    await flushPromises();
    expect(native.invoke).toHaveBeenCalledWith(
      "create_danmaku_overlay_window",
      { targetHwnd: 123 }
    );
    wrapper.unmount();
    creation.resolve("danmaku-overlay");
    expect(await pending).toBeNull();
    await flushPromises();
    expect(native.invoke).toHaveBeenCalledWith("close_danmaku_overlay_window");
    expect(overlay.overlayActive.value).toBe(false);
    expect(overlay.overlayLabel.value).toBeNull();
    native.invoke.mockClear();
    expect(await overlay.createOverlay(123)).toBeNull();
    overlay.startPositionSync(123, playerConfig);
    expect(native.invoke).not.toHaveBeenCalled();
  });

  it("finishes stale cleanup before creating a replacement and preserves the new owner's window", async () => {
    const creation = deferred<string>();
    native.invoke.mockImplementation(
      (command: string, args?: { targetHwnd: number }) => {
        if (command === "create_danmaku_overlay_window")
          return args?.targetHwnd === 1
            ? creation.promise
            : Promise.resolve("danmaku-overlay");
        return Promise.resolve();
      }
    );
    const oldWorkspace = workspace();
    const oldRequest = oldWorkspace.overlay.createOverlay(1);
    await flushPromises();
    oldWorkspace.wrapper.unmount();
    const replacement = workspace();
    const newRequest = replacement.overlay.createOverlay(2);
    await flushPromises();
    expect(
      native.invoke.mock.calls.filter(
        ([command]) => command === "create_danmaku_overlay_window"
      )
    ).toHaveLength(1);
    creation.resolve("danmaku-overlay");
    expect(await oldRequest).toBeNull();
    expect(await newRequest).toBe("danmaku-overlay");
    expect(native.invoke.mock.calls.map(([command]) => command)).toEqual([
      "create_danmaku_overlay_window",
      "close_danmaku_overlay_window",
      "create_danmaku_overlay_window",
    ]);
    await oldWorkspace.overlay.closeOverlay();
    expect(
      native.invoke.mock.calls.filter(
        ([command]) => command === "close_danmaku_overlay_window"
      )
    ).toHaveLength(1);
    expect(replacement.overlay.overlayActive.value).toBe(true);
    await replacement.overlay.closeOverlay();
  });

  it("allows a new workspace to create an overlay after an abandoned request fails", async () => {
    const creation = deferred<string>();
    native.invoke.mockImplementationOnce(() => creation.promise);
    const oldWorkspace = workspace();
    const oldRequest = oldWorkspace.overlay.createOverlay(1);
    await flushPromises();
    oldWorkspace.wrapper.unmount();
    creation.reject(new Error("window creation failed"));
    expect(await oldRequest).toBeNull();
    expect(native.error).not.toHaveBeenCalled();
    const replacement = workspace();
    expect(await replacement.overlay.createOverlay(2)).toBe("danmaku-overlay");
  });

  it("stops an in-flight position update when the workspace closes", async () => {
    vi.useFakeTimers();
    const validation = deferred<boolean>();
    native.invoke.mockImplementation((command: string) => {
      if (command === "create_danmaku_overlay_window")
        return Promise.resolve("danmaku-overlay");
      if (command === "is_window_valid") return validation.promise;
      return Promise.resolve();
    });
    const { wrapper, overlay } = workspace();
    await overlay.createOverlay(123);
    overlay.startPositionSync(123, playerConfig);
    expect(native.invoke).toHaveBeenCalledWith("is_window_valid", {
      hwnd: 123,
    });
    wrapper.unmount();
    await flushPromises();
    validation.resolve(true);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      native.invoke.mock.calls.filter(
        ([command]) => command === "is_window_valid"
      )
    ).toHaveLength(1);
    expect(
      native.invoke.mock.calls.some(
        ([command]) => command === "get_player_window_rect"
      )
    ).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
