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

import { createApp, defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useExternalPlayer } from "../useExternalPlayer";
const os = vi.hoisted(() => ({ name: "linux" }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => os.name }));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: async () => ({}),
    saveDebounced: vi.fn(),
  }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn(), handle: vi.fn() }),
}));

// 保护平台调用边界：Linux/macOS 的外部模式避免未注册 IPC 和持续无效轮询。
describe("外部播放器的平台能力", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["linux", "macos", "windows"])(
    "%s 的扫描、连接和状态预览",
    async (platform) => {
      os.name = platform;
      vi.useFakeTimers();
      let player!: ReturnType<typeof useExternalPlayer>;
      const app = createApp({
        setup() {
          player = useExternalPlayer();
          return () => null;
        },
      });
      app.mount(document.createElement("div"));
      try {
        vi.mocked(invoke).mockResolvedValueOnce([]);
        await player.scanPlayerWindows();
        if (platform === "windows") {
          expect(player.isSupported).toBe(true);
          expect(invoke).toHaveBeenCalledWith("find_player_windows", {
            classNames: null,
          });
          return;
        }
        expect(player.isSupported).toBe(false);
        expect(await player.testConnection()).toBe(false);
        player.startStatusPreview();
        await vi.advanceTimersByTimeAsync(2500);
        expect(invoke).not.toHaveBeenCalled();
        expect(player.overlayState.connected).toBe(false);
      } finally {
        app.unmount();
        vi.useRealTimers();
      }
    }
  );
});

it("pauses only status preview while cached and ignores a late status response", async () => {
  os.name = "windows";
  vi.useFakeTimers();
  const visible = ref(true);
  let player!: ReturnType<typeof useExternalPlayer>;
  let resolveStatus!: (value: unknown) => void;
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "get_external_player_status"
      ? new Promise((resolve) => {
          resolveStatus = resolve;
        })
      : null
  );
  const Probe = defineComponent({
    setup() {
      player = useExternalPlayer();
      player.startStatusPreview();
      return () => h("div");
    },
  });
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (visible.value ? h(Probe) : null),
        }),
    })
  );
  try {
    await flushPromises();
    visible.value = false;
    await nextTick();
    resolveStatus({
      state: "Playing",
      file: "late.mp4",
      position: 10,
      duration: 100,
    });
    await flushPromises();
    const paused = vi.mocked(invoke).mock.calls.length;
    expect(player.overlayState.connected).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(invoke).toHaveBeenCalledTimes(paused);
    vi.mocked(invoke).mockResolvedValue({
      state: "Playing",
      file: "current.mp4",
      position: 20,
      duration: 100,
    });
    visible.value = true;
    await nextTick();
    await flushPromises();
    expect(player.overlayState.currentFile).toBe("current.mp4");
    const resumed = vi.mocked(invoke).mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledTimes(resumed + 1);
    player.stopStatusPreview();
    visible.value = false;
    await nextTick();
    visible.value = true;
    await nextTick();
    const stopped = vi.mocked(invoke).mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(invoke).toHaveBeenCalledTimes(stopped);
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
  }
});
