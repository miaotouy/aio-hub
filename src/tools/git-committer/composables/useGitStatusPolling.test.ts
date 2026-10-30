// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStatusPolling } from "./useGitStatusPolling";
import {
  autoRefreshInterval,
  currentRepoPath,
  enableAutoRefresh,
  isRefreshing,
  loadRepositories,
} from "./useGitCommitterState";
import { refreshAllStatuses } from "./useGitCommitterRunner";

vi.mock("./useGitCommitterState", async () => {
  const { ref } = await import("vue");
  return {
    autoRefreshInterval: ref(3),
    currentRepoPath: ref("E:/repos/demo"),
    enableAutoRefresh: ref(true),
    isRefreshing: ref(false),
    loadRepositories: vi.fn(),
  };
});
vi.mock("./useGitCommitterRunner", () => ({ refreshAllStatuses: vi.fn() }));

const Probe = defineComponent({
  setup() {
    useGitStatusPolling();
    return () => h("div");
  },
});
const mountCached = () => {
  const visible = ref(true);
  const Host = defineComponent({
    setup: () => () =>
      h(KeepAlive, null, { default: () => (visible.value ? h(Probe) : null) }),
  });
  return { visible, wrapper: mount(Host) };
};

describe("useGitStatusPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(loadRepositories).mockReset().mockResolvedValue(undefined);
    vi.mocked(refreshAllStatuses).mockReset().mockResolvedValue(undefined);
    enableAutoRefresh.value = true;
    autoRefreshInterval.value = 3;
    currentRepoPath.value = "E:/repos/demo";
    isRefreshing.value = false;
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("pauses timer and focus refreshes while cached and resumes a single timer on return", async () => {
    const { visible, wrapper } = mountCached();
    try {
      await flushPromises();
      expect(refreshAllStatuses).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3000);
      expect(refreshAllStatuses).toHaveBeenCalledTimes(2);
      visible.value = false;
      await nextTick();
      autoRefreshInterval.value = 4;
      await nextTick();
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(12000);
      expect(refreshAllStatuses).toHaveBeenCalledTimes(2);
      visible.value = true;
      await nextTick();
      expect(refreshAllStatuses).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(4000);
      expect(refreshAllStatuses).toHaveBeenCalledTimes(4);
      window.dispatchEvent(new Event("focus"));
      expect(refreshAllStatuses).toHaveBeenCalledTimes(5);
      enableAutoRefresh.value = false;
      await nextTick();
      await vi.advanceTimersByTimeAsync(8000);
      expect(refreshAllStatuses).toHaveBeenCalledTimes(5);
    } finally {
      wrapper.unmount();
    }
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(8000);
    expect(refreshAllStatuses).toHaveBeenCalledTimes(5);
  });

  it.each(["cached", "unmounted"])(
    "does not start background work when repository loading finishes after being %s",
    async (state) => {
      let resolveLoad!: () => void;
      vi.mocked(loadRepositories).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveLoad = resolve;
          })
      );
      const { visible, wrapper } = mountCached();
      if (state === "unmounted") wrapper.unmount();
      else {
        visible.value = false;
        await nextTick();
      }
      try {
        resolveLoad();
        await flushPromises();
        window.dispatchEvent(new Event("focus"));
        await vi.advanceTimersByTimeAsync(12000);
        expect(refreshAllStatuses).not.toHaveBeenCalled();
        if (state === "cached") {
          visible.value = true;
          await nextTick();
          expect(refreshAllStatuses).toHaveBeenCalledTimes(1);
        }
      } finally {
        if (state === "cached") wrapper.unmount();
      }
    }
  );
});
