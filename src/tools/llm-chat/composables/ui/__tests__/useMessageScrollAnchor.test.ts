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

function createScroller(
  resolveMessageOffset?: (id: string) => number | undefined
) {
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
    resolveMessageOffset,
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

  // 保护嵌套滚轮与新增消息的公开阅读契约；通过真实事件路径模拟归属。
  it.each([-80, 80])(
    "内部查看器滚轮 %s 保留外层暂停状态，后续布局补偿也不会恢复跟随",
    (deltaY) => {
      const { element, anchor, resize } = createScroller();
      anchor.pauseFollowing();
      element.scrollTop = 1440;
      anchor.onScroll();
      const viewer = document.createElement("div");
      viewer.style.overflowY = "auto";
      Object.defineProperties(viewer, {
        clientHeight: { value: 300 },
        scrollHeight: { value: 1500 },
        scrollTop: { value: 100, writable: true },
      });
      const content = document.createElement("span");
      viewer.append(content);
      element.append(viewer);
      element.addEventListener("wheel", anchor.onWheel);
      content.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true }));
      expect(anchor.shouldStickToBottom.value).toBe(false);
      // 内部滚轮后，浏览器向下补偿外层位置仍属于布局变化。
      element.scrollTop = 1450;
      anchor.onScroll();
      resize(3000);
      anchor.followBottom();
      expect(element.scrollTop).toBe(1450);
      expect(anchor.shouldStickToBottom.value).toBe(false);
    }
  );

  it("查看器取消滚轮默认行为后，后续布局变化保持暂停", () => {
    const { element, anchor, resize } = createScroller();
    anchor.pauseFollowing();
    element.scrollTop = 1440;
    anchor.onScroll();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: 20 }));
    const viewer = document.createElement("div");
    viewer.addEventListener("wheel", (event) => event.preventDefault());
    element.append(viewer);
    element.addEventListener("wheel", anchor.onWheel);
    viewer.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true })
    );
    element.scrollTop = 1450;
    anchor.onScroll();
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(1450);
  });

  it("内部查看器上翻保留外层已有的底部跟随", () => {
    const { element, anchor, resize } = createScroller();
    const viewer = document.createElement("div");
    viewer.style.overflowY = "auto";
    Object.defineProperties(viewer, {
      clientHeight: { value: 300 },
      scrollHeight: { value: 1500 },
      scrollTop: { value: 100 },
    });
    element.append(viewer);
    element.addEventListener("wheel", anchor.onWheel);
    viewer.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -80, bubbles: true })
    );
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(2500);
  });

  it("近底部的外层向下滚轮等待实际滚动，再恢复跟随", () => {
    const { element, anchor, resize } = createScroller();
    anchor.pauseFollowing();
    element.scrollTop = 1440;
    anchor.onScroll();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: 20 }));
    anchor.followBottom();
    expect(element.scrollTop).toBe(1440);
    expect(anchor.shouldStickToBottom.value).toBe(false);
    element.scrollTop = 1460;
    anchor.onScroll();
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(2500);
  });

  it.each([
    ["auto", 1500],
    ["contain", 1500],
    ["none", 1500],
    ["contain", 300],
  ] as const)(
    "内部查看器触底时遵循 %s 滚动链（内容高 %s）",
    (overscroll, height) => {
      const { element, anchor, resize } = createScroller();
      anchor.pauseFollowing();
      element.scrollTop = 1440;
      anchor.onScroll();
      const viewer = document.createElement("div");
      viewer.style.overflowY = "auto";
      viewer.style.overscrollBehaviorY = overscroll;
      Object.defineProperties(viewer, {
        clientHeight: { value: 300 },
        scrollHeight: { value: height },
        scrollTop: { value: height - 300 },
      });
      element.append(viewer);
      element.addEventListener("wheel", anchor.onWheel);
      viewer.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 20, bubbles: true })
      );
      expect(anchor.shouldStickToBottom.value).toBe(false);
      element.scrollTop = 1460;
      anchor.onScroll();
      resize(3000);
      anchor.followBottom();
      expect(element.scrollTop).toBe(overscroll === "auto" ? 2500 : 1460);
    }
  );

  it("外层已经触底且暂停时，继续下滚可恢复后续跟随", () => {
    const { element, anchor, resize } = createScroller();
    anchor.pauseFollowing();
    anchor.onWheel(new WheelEvent("wheel", { deltaY: 20 }));
    resize(3000);
    anchor.followBottom();
    expect(element.scrollTop).toBe(2500);
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

// Recovery must survive a temporary height clamp and stop as soon as the reader scrolls.
it("停用期间忽略滚动重置，返回后随异步高度恢复历史位置", () => {
  const { element, anchor, resize } = createScroller();
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -800 }));
  element.scrollTop = 1100;
  anchor.onScroll();
  anchor.suspend();
  resize(700);
  element.scrollTop = 0;
  anchor.onScroll();
  expect(anchor.lastKnownScrollTop.value).toBe(1100);
  anchor.resume();
  expect(element.scrollTop).toBe(200);
  anchor.onScroll();
  resize(2500);
  anchor.followBottom();
  expect(element.scrollTop).toBe(1100);
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -50 }));
  element.scrollTop = 1050;
  anchor.onScroll();
  resize(3000);
  anchor.followBottom();
  expect(element.scrollTop).toBe(1050);
});

it("停用后继续生成，返回时延续底部跟随意图", () => {
  const { element, anchor, resize } = createScroller();
  anchor.suspend();
  resize(4000);
  element.scrollTop = 0;
  anchor.onScroll();
  anchor.resume();
  expect(element.scrollTop).toBe(3500);
  resize(4500);
  anchor.followBottom();
  expect(element.scrollTop).toBe(4000);
});

// Protect the reading message when restored history above it changes height.
it("按消息偏移补偿重建高度，恢复期间保持原锚点，用户滚动后交还控制", () => {
  let messageTop = 650;
  const { element, anchor, resize } = createScroller((id) =>
    id === "reading" ? messageTop - element.scrollTop : undefined
  );
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -30 }));
  element.scrollTop = 700;
  anchor.onScroll();
  anchor.rememberReadingAnchor({ id: "reading", offset: -50 });
  anchor.suspend();
  messageTop = 1100;
  element.scrollTop = 0;
  anchor.resume();
  expect(element.scrollTop).toBe(1150);
  // 布局夹紧引发的 scroll / 可见索引更新不能覆盖待恢复的阅读锚点。
  anchor.onScroll();
  anchor.rememberReadingAnchor({ id: "different", offset: 200 });
  messageTop = 1350;
  resize(3000);
  anchor.followBottom();
  expect(element.scrollTop).toBe(1400);
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -50 }));
  element.scrollTop = 1350;
  anchor.onScroll();
  messageTop = 1500;
  resize(3500);
  anchor.followBottom();
  expect(element.scrollTop).toBe(1350);
});

it("恢复目标尚未出现时沿用滚动距离，目标挂载后校准消息偏移", () => {
  let messageTop: number | undefined = 1050;
  const { element, anchor, resize } = createScroller((id) =>
    id === "reading" && messageTop !== undefined
      ? messageTop - element.scrollTop
      : undefined
  );
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -30 }));
  element.scrollTop = 1100;
  anchor.onScroll();
  anchor.rememberReadingAnchor({ id: "reading", offset: -50 });
  anchor.suspend();
  messageTop = undefined;
  resize(700);
  element.scrollTop = 0;
  anchor.resume();
  expect(element.scrollTop).toBe(200);
  messageTop = 1200;
  resize(2500);
  anchor.followBottom();
  expect(element.scrollTop).toBe(1250);
});

// Search/navigation must resolve the selected row as estimated rows acquire their real heights.
it("显式消息跳转随异步行高校准目标，滚动输入立即交还控制", () => {
  let messageTop = 650;
  const { element, anchor, resize } = createScroller((id) =>
    id === "search-result" ? messageTop - element.scrollTop : undefined
  );
  anchor.navigateToMessage({ id: "search-result", offset: 120 });
  expect(element.scrollTop).toBe(530);
  expect(anchor.shouldStickToBottom.value).toBe(false);
  resize(4000);
  messageTop = 2250;
  anchor.onScroll();
  anchor.rememberReadingAnchor({ id: "passing-row", offset: 10 });
  anchor.followBottom();
  expect(element.scrollTop).toBe(2130);
  anchor.onWheel(new WheelEvent("wheel", { deltaY: -100 }));
  element.scrollTop = 2030;
  anchor.onScroll();
  messageTop = 2400;
  anchor.followBottom();
  expect(element.scrollTop).toBe(2030);
});
