// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useScrollPagination } from "../useScrollPagination";

function setup(loadMore = vi.fn(async () => {})) {
  const visible = ref(true);
  const hasMore = ref(true);
  const Probe = defineComponent({
    setup() {
      const onScroll = useScrollPagination({
        canLoadMore: () => hasMore.value,
        loadMore,
      });
      return () => h("div", { class: "list", onScroll });
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
  const list = wrapper.find(".list");
  const size = { clientHeight: 300, scrollHeight: 1000, scrollTop: 0 };
  for (const key of Object.keys(size) as Array<keyof typeof size>)
    Object.defineProperty(list.element, key, { get: () => size[key] });
  return { wrapper, list, size, visible, hasMore, loadMore };
}

describe("scroll pagination contract", () => {
  it("does not load for mount, zero-sized content or upward scrolling and stops at the end", async () => {
    const p = setup();
    try {
      await flushPromises();
      expect(p.loadMore).not.toHaveBeenCalled();
      p.size.clientHeight = 0;
      p.size.scrollTop = 900;
      await p.list.trigger("scroll");
      p.size.clientHeight = 300;
      p.size.scrollTop = 650;
      await p.list.trigger("scroll");
      expect(p.loadMore).not.toHaveBeenCalled();
      p.size.scrollTop = 700;
      await p.list.trigger("scroll");
      expect(p.loadMore).toHaveBeenCalledTimes(1);
      p.hasMore.value = false;
      p.size.scrollTop = 710;
      await p.list.trigger("scroll");
      expect(p.loadMore).toHaveBeenCalledTimes(1);
    } finally {
      p.wrapper.unmount();
    }
  });
  it("deduplicates a pending request, pauses while cached and resumes on a new scroll", async () => {
    let resolve!: () => void;
    const load = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const p = setup(load);
    try {
      p.size.scrollTop = 650;
      await p.list.trigger("scroll");
      p.size.scrollTop = 700;
      await p.list.trigger("scroll");
      expect(load).toHaveBeenCalledTimes(1);
      p.visible.value = false;
      await nextTick();
      resolve();
      await flushPromises();
      p.size.scrollTop = 710;
      await p.list.trigger("scroll");
      expect(load).toHaveBeenCalledTimes(1);
      p.visible.value = true;
      await nextTick();
      expect(load).toHaveBeenCalledTimes(1);
      p.size.scrollTop = 720;
      await p.list.trigger("scroll");
      expect(load).toHaveBeenCalledTimes(2);
      resolve();
      await flushPromises();
    } finally {
      p.wrapper.unmount();
    }
  });
});
