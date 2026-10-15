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

import { ref, type Ref } from "vue";

interface MessageScrollAnchorOptions {
  container: Ref<HTMLElement | null>;
  autoScroll: () => boolean;
  threshold: () => number;
}

/** 阅读位置与底部跟随分别由浏览器锚定和显式滚动意图维护。 */
export function useMessageScrollAnchor(options: MessageScrollAnchorOptions) {
  const shouldStickToBottom = ref(true);
  const isNearBottom = ref(true);
  const lastKnownScrollTop = ref(0);
  let canResumeOnScroll = false;

  const pauseFollowing = () => {
    shouldStickToBottom.value = false;
    canResumeOnScroll = false;
  };

  const onScroll = () => {
    const container = options.container.value;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const previousTop = lastKnownScrollTop.value;
    const distance = Math.max(0, scrollHeight - clientHeight - scrollTop);
    lastKnownScrollTop.value = scrollTop;
    isNearBottom.value = distance < options.threshold();

    // 布局变化也会触发 scroll，解除跟随只由输入事件和显式导航负责。
    // 用户下滚回到底部附近后恢复跟随。
    if (
      canResumeOnScroll &&
      scrollTop > previousTop + 0.5 &&
      isNearBottom.value
    ) {
      shouldStickToBottom.value = true;
    }
  };

  // 在原生滚动和 ResizeObserver 之前响应上翻意图，避免同帧被拉回。
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) pauseFollowing();
    else if (event.deltaY > 0) {
      canResumeOnScroll = true;
      if (isNearBottom.value) shouldStickToBottom.value = true;
    }
  };

  const onPointerdown = (event: PointerEvent) => {
    const container = options.container.value;
    if (!container || event.button !== 0) return;
    const left = container.getBoundingClientRect().left + container.clientLeft;
    // 滚动条拖拽和触屏浏览同样交还阅读位置控制权。
    if (
      event.pointerType === "touch" ||
      event.clientX >= left + container.clientWidth ||
      event.clientX < left
    ) {
      pauseFollowing();
      canResumeOnScroll = true;
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("input, textarea, [contenteditable=true], .cm-editor")
    )
      return;
    if (
      ["ArrowUp", "PageUp", "Home"].includes(event.key) ||
      (event.key === " " && event.shiftKey)
    ) {
      pauseFollowing();
    } else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) {
      canResumeOnScroll = true;
    }
  };

  const followBottom = () => {
    const container = options.container.value;
    if (!container || !shouldStickToBottom.value || !options.autoScroll())
      return;
    // 渐进渲染既会增高也会缩短列表，锁定期间始终对齐实际底部。
    container.scrollTop = container.scrollHeight;
  };

  return {
    shouldStickToBottom,
    isNearBottom,
    lastKnownScrollTop,
    onScroll,
    onWheel,
    onKeydown,
    onPointerdown,
    followBottom,
    pauseFollowing,
  };
}
