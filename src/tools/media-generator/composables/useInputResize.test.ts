// Copyright 2025-2026 miaotouy(Github@miaotouy)

import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { useInputResize } from "./useInputResize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

async function createInputResize() {
  const textarea = document.createElement("textarea");
  let contentHeight = 72;
  Object.defineProperties(textarea, {
    offsetHeight: { get: () => 100 },
    scrollHeight: { get: () => contentHeight },
  });
  const extraHeight = ref(0);
  let resize!: ReturnType<typeof useInputResize>;
  const wrapper = mount(
    defineComponent({
      setup() {
        resize = useInputResize({ textareaRef: ref(textarea), extraHeight });
        return () => null;
      },
    })
  );
  cleanups.push(() => wrapper.unmount());
  await nextTick();
  return {
    resize,
    extraHeight,
    setContentHeight: (height: number) => {
      contentHeight = height;
    },
  };
}

// Protect expanded sizing with attachments/panels and restoration of automatic
// or manually resized input heights across user interactions.
describe("媒体生成输入框展开", () => {
  it("展开填满可用高度，随面板调整预算，收起后按最新草稿恢复自适应", async () => {
    const { resize, extraHeight, setContentHeight } = await createInputResize();
    expect(resize.editorHeight.value).toBe(72);

    resize.isExpanded.value = true;
    await nextTick();
    const expandedHeight = Math.max(40, window.innerHeight * 0.7 - 60);
    expect(resize.editorHeight.value).toBe(expandedHeight);
    expect(resize.editorMaxHeight.value).toBe(`${expandedHeight}px`);

    extraHeight.value = 180;
    const reducedHeight = Math.max(40, expandedHeight - 180);
    expect(resize.editorHeight.value).toBe(reducedHeight);
    expect(resize.editorMaxHeight.value).toBe(`${reducedHeight}px`);

    setContentHeight(132);
    resize.adjustHeight();
    expect(resize.editorHeight.value).toBe(reducedHeight);

    resize.isExpanded.value = false;
    await nextTick();
    await nextTick();
    expect(resize.editorHeight.value).toBe(132);
    expect(resize.editorMaxHeight.value).toBe(
      `${Math.max(40, window.innerHeight * 0.4 - 180)}px`
    );
  });

  it("收起恢复手动高度，拖拽退出展开，双击恢复自适应", async () => {
    const { resize } = await createInputResize();
    const drag = () => {
      resize.handleInputResizeStart(
        new MouseEvent("mousedown", { clientY: 300 })
      );
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
      document.dispatchEvent(new MouseEvent("mouseup"));
    };
    drag();
    expect(resize.editorHeight.value).toBe(150);

    resize.isExpanded.value = true;
    expect(resize.editorHeight.value).toBeGreaterThan(150);
    resize.isExpanded.value = false;
    expect(resize.editorHeight.value).toBe(150);
    expect(resize.editorMaxHeight.value).toBe(150);

    resize.isExpanded.value = true;
    drag();
    expect(resize.isExpanded.value).toBe(false);
    expect(resize.editorHeight.value).toBe(150);

    resize.isExpanded.value = true;
    resize.handleResizeDoubleClick();
    await nextTick();
    await nextTick();
    expect(resize.isExpanded.value).toBe(false);
    expect(resize.editorHeight.value).toBe(72);
  });
});
