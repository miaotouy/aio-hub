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

interface ReadingAnchor {
  id: string;
  offset: number;
}

interface MessageScrollAnchorOptions {
  container: Ref<HTMLElement | null>;
  autoScroll: () => boolean;
  threshold: () => number;
  /** 当前消息行相对滚动视口的偏移；目标尚未挂载时返回 undefined。 */
  resolveMessageOffset?: (id: string) => number | undefined;
}

/** 阅读位置与底部跟随分别由浏览器锚定和显式滚动意图维护。 */
export function useMessageScrollAnchor(options: MessageScrollAnchorOptions) {
  const shouldStickToBottom = ref(true);
  const isNearBottom = ref(true);
  const lastKnownScrollTop = ref(0);
  let canResumeOnScroll = false;
  let active = true;
  let resumeTop: number | null = null;
  let readingAnchor: ReadingAnchor | null = null;
  let resumeAnchor: ReadingAnchor | null = null;
  const rememberReadingAnchor = (anchor: ReadingAnchor | null) => {
    if (active && resumeTop === null) readingAnchor = anchor;
  };
  const cancelResume = () => {
    if (resumeTop !== null && options.container.value)
      lastKnownScrollTop.value = options.container.value.scrollTop;
    resumeTop = null;
    resumeAnchor = null;
  };

  const pauseFollowing = () => {
    cancelResume();
    shouldStickToBottom.value = false;
    canResumeOnScroll = false;
  };

  const onScroll = () => {
    const container = options.container.value;
    if (!container || !active) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const previousTop = lastKnownScrollTop.value;
    const distance = Math.max(0, scrollHeight - clientHeight - scrollTop);
    if (resumeTop === null) lastKnownScrollTop.value = scrollTop;
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
    const container = options.container.value;
    if (!container || !active || !event.deltaY) return;
    if (event.defaultPrevented || event.ctrlKey) {
      canResumeOnScroll = false;
      return;
    }

    // 内部查看器消费滚轮时保留外层阅读状态；到边界后按原生滚动链交接。
    for (const target of event.composedPath()) {
      if (target === container) break;
      if (!(target instanceof HTMLElement) || target.clientHeight <= 0)
        continue;
      const maxTop = target.scrollHeight - target.clientHeight;
      const style = getComputedStyle(target);
      if (!/^(auto|scroll|overlay)$/.test(style.overflowY)) continue;
      const consumes =
        event.deltaY < 0 ? target.scrollTop > 0 : target.scrollTop < maxTop - 1;
      if (consumes || ["contain", "none"].includes(style.overscrollBehaviorY)) {
        canResumeOnScroll = false;
        return;
      }
    }

    cancelResume();
    if (event.deltaY < 0) pauseFollowing();
    else if (event.deltaY > 0) {
      canResumeOnScroll = true;
      // 已触底时可能没有新的 scroll；其余情况等外层实际下滚再恢复。
      if (
        container.scrollHeight - container.clientHeight - container.scrollTop <=
        1
      )
        shouldStickToBottom.value = true;
    }
  };

  const onPointerdown = (event: PointerEvent) => {
    const container = options.container.value;
    if (!container || event.button !== 0) return;
    cancelResume();
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
      [
        "ArrowUp",
        "PageUp",
        "Home",
        "ArrowDown",
        "PageDown",
        "End",
        " ",
      ].includes(event.key)
    )
      cancelResume();
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
    if (!container || !active) return;
    if (resumeTop !== null) {
      const offset = resumeAnchor
        ? options.resolveMessageOffset?.(resumeAnchor.id)
        : undefined;
      const target =
        offset !== undefined && Number.isFinite(offset)
          ? container.scrollTop + offset - resumeAnchor!.offset
          : resumeTop;
      container.scrollTop = Math.max(
        0,
        Math.min(target, container.scrollHeight - container.clientHeight)
      );
      return;
    }
    if (!shouldStickToBottom.value || !options.autoScroll()) return;
    // 渐进渲染既会增高也会缩短列表，锁定期间始终对齐实际底部。
    container.scrollTop = container.scrollHeight;
  };

  /** Explicit navigation keeps its target stable while previously skipped rows resolve. */
  const navigateToMessage = (anchor: ReadingAnchor) => {
    const container = options.container.value;
    if (!container || !active) return;
    pauseFollowing();
    readingAnchor = anchor;
    resumeAnchor = anchor;
    resumeTop = container.scrollTop;
    followBottom();
  };

  const suspend = () => {
    active = false;
  };
  const resume = () => {
    active = true;
    resumeTop =
      shouldStickToBottom.value && options.autoScroll()
        ? null
        : lastKnownScrollTop.value;
    resumeAnchor = resumeTop === null ? null : readingAnchor;
    followBottom();
  };

  return {
    suspend,
    resume,
    cancelResume,
    rememberReadingAnchor,
    navigateToMessage,
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
