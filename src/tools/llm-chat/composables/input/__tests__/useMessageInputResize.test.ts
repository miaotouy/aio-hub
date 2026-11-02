// Copyright 2025-2026 miaotouy(Github@miaotouy)

import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { useMessageInputResize } from "../useMessageInputResize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function createInputResize() {
  const isExpanded = ref(false);
  const extraHeight = ref(0);
  let resize!: ReturnType<typeof useMessageInputResize>;
  const wrapper = mount(
    defineComponent({
      setup() {
        resize = useMessageInputResize({
          isDetached: false,
          textareaRef: ref({ $el: { offsetHeight: 100 } }),
          isExpanded,
          extraHeight,
        });
        return () => null;
      },
    })
  );
  cleanups.push(() => wrapper.unmount());
  return { resize, isExpanded, extraHeight };
}

describe("输入框展开高度", () => {
  it("展开即填满高度预算，附件与面板变化后继续填满，收起恢复自适应", () => {
    const { resize, isExpanded, extraHeight } = createInputResize();
    expect(resize.editorHeight.value).toBe("auto");

    isExpanded.value = true;
    expect(resize.editorHeight.value).toBe("max(40px, calc(70vh - 0px))");
    expect(resize.editorMaxHeight.value).toBe(resize.editorHeight.value);

    extraHeight.value = 180;
    expect(resize.editorHeight.value).toBe("max(40px, calc(70vh - 180px))");
    expect(resize.editorMaxHeight.value).toBe(resize.editorHeight.value);

    isExpanded.value = false;
    expect(resize.editorHeight.value).toBe("auto");
    expect(resize.editorMaxHeight.value).toBe("max(40px, calc(40vh - 180px))");
  });

  it("手动调整高度后仍可展开到最大，收起恢复手动高度", () => {
    const { resize, isExpanded } = createInputResize();
    resize.handleInputResizeStart(
      new MouseEvent("mousedown", { clientY: 300 })
    );
    document.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(resize.editorHeight.value).toBe(150);

    isExpanded.value = true;
    expect(resize.editorHeight.value).toBe("max(40px, calc(70vh - 0px))");
    expect(resize.editorMaxHeight.value).toBe(resize.editorHeight.value);

    isExpanded.value = false;
    expect(resize.editorHeight.value).toBe(150);
    expect(resize.editorMaxHeight.value).toBe(150);
  });
});
