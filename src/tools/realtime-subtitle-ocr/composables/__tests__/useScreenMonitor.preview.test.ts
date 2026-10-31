// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref, watch } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePageActivity } from "@/composables/usePageActivity";
import { useScreenMonitor } from "../useScreenMonitor";
const bus = vi.hoisted(() => ({
  geometry: null as null | ((payload: unknown) => void),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({
    onMessage: (_type: unknown, cb: (p: unknown) => void) => {
      bus.geometry = cb;
      return vi.fn();
    },
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: async () => 1 }),
}));
vi.mock("@/utils/nativeDesktopCapabilities", () => ({
  getNativeDesktopCapabilities: () => ({ screenCapture: true }),
}));
vi.mock("@/tools/smart-ocr/platform", () => ({
  migrateOcrEngineConfig: (x: unknown) => x,
  useOcrRunner: () => ({ ensureReady: async () => {} }),
}));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: (options: { createDefault: () => unknown }) => ({
    load: async () => options.createDefault(),
    saveDebounced: vi.fn(),
  }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: async (fn: () => unknown) => fn(),
    handle: vi.fn(),
  }),
}));
afterEach(() => vi.useRealTimers());
it("subscribes idle screenshots only for visible screen workbenches and keeps explicit OCR monitoring running", async () => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockResolvedValue({ changed: false, imageBytes: null });
  const visible = ref(true);
  let shell!: ReturnType<typeof useScreenMonitor>;
  const Probe = defineComponent({
    setup() {
      const monitor = useScreenMonitor();
      watch(usePageActivity(), monitor.setPreviewActive, {
        immediate: true,
        flush: "sync",
      });
      return () => h("div");
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        shell = useScreenMonitor();
        return () =>
          h(KeepAlive, null, {
            default: () => (visible.value ? h(Probe) : null),
          });
      },
    })
  );
  const count = () =>
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "capture_screen_rect")
      .length;
  try {
    bus.geometry?.({
      stateType: "realtime-subtitle-ocr:monitor-box-geometry",
      data: { x: 0, y: 0, width: 500, height: 300 },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000);
    expect(count()).toBeGreaterThan(0);
    visible.value = false;
    await nextTick();
    const paused = count();
    await vi.advanceTimersByTimeAsync(3000);
    expect(count()).toBe(paused);
    visible.value = true;
    await nextTick();
    await flushPromises();
    expect(count()).toBeGreaterThan(paused);
    await shell.start();
    await flushPromises();
    expect(shell.status.value).toBe("running");
    visible.value = false;
    await nextTick();
    const running = count();
    await vi.advanceTimersByTimeAsync(2000);
    expect(count()).toBeGreaterThan(running);
    expect(shell.status.value).toBe("running");
    shell.stop();
    const stopped = count();
    await vi.advanceTimersByTimeAsync(2000);
    expect(count()).toBe(stopped);
  } finally {
    wrapper.unmount();
  }
});
