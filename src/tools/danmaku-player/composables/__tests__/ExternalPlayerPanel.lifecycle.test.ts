// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { flushPromises, shallowMount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { expect, it, vi } from "vitest";
import type {
  DanmakuConfig,
  ExternalPlayerConfig,
  ParsedDanmaku,
} from "../../types";

const effects = vi.hoisted(() => ({
  start: vi.fn(),
  init: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../useExternalPlayer", async () => {
  const { ref, reactive } = await import("vue");
  return {
    useExternalPlayer: () => ({
      isSupported: true,
      playerWindows: ref([]),
      scanning: ref(false),
      playerConfig: reactive<ExternalPlayerConfig>({
        playerType: "mpc-be",
        webPort: 13579,
        mpvIpcPath: "",
        vlcPassword: "",
        offsetTop: 0,
        offsetBottom: 0,
        fullscreenOffsetTop: 0,
        fullscreenOffsetBottom: 0,
        enableFullscreenBoost: true,
      }),
      overlayState: reactive({
        connected: true,
        targetHwnd: 123,
        overlayCreated: false,
        playbackState: "Playing",
        currentFile: "",
        currentPosition: 0,
        totalDuration: 0,
      }),
      scanPlayerWindows: async () => [{ hwnd: 123 }],
      testConnection: vi.fn(),
      selectPlayerWindow: vi.fn(),
      startStatusPreview: vi.fn(),
      stopStatusPreview: vi.fn(),
    }),
  };
});
vi.mock("../useDanmakuOverlay", async () => {
  const { ref } = await import("vue");
  return {
    useDanmakuOverlay: () => {
      const overlayActive = ref(false);
      return {
        overlayActive,
        createOverlay: async () => {
          overlayActive.value = true;
          return "danmaku-overlay";
        },
        closeOverlay: vi.fn(),
        initOverlay: effects.init,
        syncConfig: vi.fn(),
        syncDanmakus: vi.fn(),
        startPositionSync: effects.start,
      };
    },
  };
});
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: effects.success,
    error: effects.error,
    warning: vi.fn(),
  },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: effects.error }),
}));
import ExternalPlayerPanel from "../../components/ExternalPlayerPanel.vue";

// 面板在初始化 IPC 返回前关闭，应终止启动续跑，避免旧页面重新启动窗口跟随。
it("stops the startup continuation when the panel unmounts during initialization", async () => {
  let resolveInit!: () => void;
  effects.init.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveInit = resolve;
      })
  );
  const config: DanmakuConfig = {
    version: "1.0.0",
    enabled: true,
    showScroll: true,
    showFixed: true,
    showColored: true,
    displayArea: 50,
    opacity: 84,
    fontScale: 100,
    speed: 1,
    density: 100,
    preventSubtitleOverlap: false,
    fontFamily: "sans-serif",
    isBold: true,
    borderType: "shadow",
    blockKeywords: [],
  };
  const danmaku: ParsedDanmaku = {
    id: "fixture",
    startTime: 0,
    endTime: 5,
    text: "fixture",
    type: "scroll",
    color: "#ffffff",
    fontSize: 24,
    isBold: false,
    x1: 0,
    y1: 0,
  };
  const wrapper = shallowMount(ExternalPlayerPanel, {
    global: { plugins: [ElementPlus] },
    props: {
      danmakus: [danmaku],
      scriptInfo: { playResX: 1920, playResY: 1080 },
      config,
    },
  });
  try {
    await flushPromises();
    effects.success.mockClear();
    await wrapper
      .get('.cover-action el-button-stub[type="success"]')
      .trigger("click");
    await flushPromises();
    expect(effects.init).toHaveBeenCalledOnce();
    wrapper.unmount();
    resolveInit();
    await flushPromises();
    expect(effects.start).not.toHaveBeenCalled();
    expect(effects.success).not.toHaveBeenCalled();
    expect(effects.error).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});
