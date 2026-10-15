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

import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";
import { useMessageScrollAnchor } from "../useMessageScrollAnchor";

function createScroller() {
  const element = document.createElement("div");
  let height = 2000;
  let top = 1500;
  Object.defineProperties(element, {
    clientHeight: { value: 500 },
    clientWidth: { value: 600 },
    scrollHeight: { get: () => height },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, height - 500));
      },
    },
  });
  let enabled = true;
  const anchor = useMessageScrollAnchor({
    container: shallowRef(element),
    autoScroll: () => enabled,
    threshold: () => 100,
  });
  anchor.onScroll();
  return {
    element,
    anchor,
    resize: (value: number) => {
      height = value;
    },
    disable: () => {
      enabled = false;
    },
  };
}

describe("消息阅读位置与底部跟随", () => {
  it("流式内容突然增高并先触发 scroll 时仍跟随到底", () => {
    const { element, anchor, resize } = createScroller();
    resize(3200);
    anchor.onScroll();
    expect(anchor.isNearBottom.value).toBe(false);
    anchor.followBottom();
    expect(element.scrollTop).toBe(2700);
    resize(3600);
    anchor.onScroll();
    anchor.followBottom();
    expect(element.scrollTop).toBe(3100);
  });

  it("占位内容缩短后再次增高，浏览器夹紧位置也保持跟随", () => {
    const { element, anchor, resize } = createScroller();
    resize(1700);
    element.scrollTop = 1500;
    // scroll 事件可能晚于下一次内容增高送达。
    resize(2600);
    anchor.onScroll();
    anchor.followBottom();
    expect(element.scrollTop).toBe(2100);
  });

  it("上翻在滚动发生前暂停跟随，在底部阈值内也保留阅读位置", () => {
    const { element, anchor, resize } = createScroller();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: -30 }));
    anchor.followBottom();
    expect(anchor.shouldStickToBottom.value).toBe(false);
    element.scrollTop = 1470;
    anchor.onScroll();
    expect(anchor.isNearBottom.value).toBe(true);
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(1470);
  });

  it("阅读历史期间内容变化保持位置，下滚回底部后恢复跟随", () => {
    const { element, anchor, resize } = createScroller();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: -800 }));
    element.scrollTop = 700;
    anchor.onScroll();
    resize(2400);
    anchor.followBottom();
    expect(element.scrollTop).toBe(700);
    anchor.onWheel(new WheelEvent("wheel", { deltaY: 1150 }));
    element.scrollTop = 1850;
    anchor.onScroll();
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(2500);
  });

  it("浏览器锚定在底部阈值内补偿位置时保持暂停状态", () => {
    const { element, anchor, resize } = createScroller();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: -30 }));
    element.scrollTop = 1470;
    anchor.onScroll();
    resize(2600);
    element.scrollTop = 2070;
    anchor.onScroll();
    anchor.followBottom();
    expect(element.scrollTop).toBe(2070);
    expect(anchor.shouldStickToBottom.value).toBe(false);
  });

  it("键盘上翻与滚动条操作暂停跟随", () => {
    for (const key of ["ArrowUp", "PageUp", "Home"]) {
      const { element, anchor, resize } = createScroller();
      anchor.onKeydown(new KeyboardEvent("keydown", { key }));
      resize(3000);
      anchor.followBottom();
      expect(element.scrollTop).toBe(1500);
    }
    const { element, anchor, resize } = createScroller();
    anchor.onPointerdown({
      button: 0,
      clientX: 605,
      pointerType: "mouse",
    } as PointerEvent);
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(1500);
  });

  it("关闭自动滚动时内容增长保留位置", () => {
    const { element, anchor, resize, disable } = createScroller();
    disable();
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(1500);
  });
});
