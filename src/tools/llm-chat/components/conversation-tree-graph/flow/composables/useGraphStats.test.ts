// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGraphStats } from "./useGraphStats";
afterEach(() => vi.useRealTimers());
describe("graph HUD page lifecycle", () => {
  it("stops viewport sampling while cached or disabled and resumes on activation", async () => {
    vi.useFakeTimers();
    const visible = ref(true),
      hud = ref(true);
    const viewport = vi.fn(() => ({ zoom: 2 }));
    const Probe = defineComponent({
      setup() {
        const stats = useGraphStats(() => hud.value, viewport);
        return () => h("div", String(stats.zoom));
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
      await vi.advanceTimersByTimeAsync(50);
      expect(wrapper.text()).toBe("2");
      visible.value = false;
      await nextTick();
      const paused = viewport.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(viewport).toHaveBeenCalledTimes(paused);
      hud.value = false;
      hud.value = true;
      await nextTick();
      await vi.advanceTimersByTimeAsync(50);
      expect(viewport).toHaveBeenCalledTimes(paused);
      visible.value = true;
      await nextTick();
      await vi.advanceTimersByTimeAsync(50);
      expect(viewport.mock.calls.length).toBeGreaterThan(paused);
      hud.value = false;
      await nextTick();
      const disabled = viewport.mock.calls.length;
      await vi.advanceTimersByTimeAsync(100);
      expect(viewport).toHaveBeenCalledTimes(disabled);
    } finally {
      wrapper.unmount();
    }
    const ended = viewport.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewport).toHaveBeenCalledTimes(ended);
  });
});
