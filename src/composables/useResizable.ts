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

import { ref, onUnmounted, type Ref } from "vue";

export interface UseResizableOptions {
  /**
   * 需要调整的尺寸 Ref (宽度或高度)
   */
  size: Ref<number>;
  /**
   * 最小尺寸限制
   */
  minSize: number;
  /**
   * 最大尺寸限制
   */
  maxSize: number;
  /**
   * 拖拽方向
   * - 'left': 鼠标向左移动时尺寸减小，向右增大 (常用于左侧边栏)
   * - 'right': 鼠标向左移动时尺寸增大，向右减小 (常用于右侧边栏)
   * - 'top': 鼠标向上移动时尺寸减小，向下增大 (常用于顶部面板)
   * - 'bottom': 鼠标向上移动时尺寸增大，向下减小 (常用于底部面板)
   */
  direction?: "left" | "right" | "top" | "bottom";
}

export function useResizable(options: UseResizableOptions) {
  const isResizing = ref(false);
  const dragStartPos = ref(0);
  const dragStartSize = ref(0);

  const direction = options.direction || "left";
  const isVertical = direction === "top" || direction === "bottom";

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    isResizing.value = true;
    dragStartPos.value = isVertical ? e.clientY : e.clientX;
    dragStartSize.value = options.size.value;

    document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizing.value) return;

    const currentPos = isVertical ? e.clientY : e.clientX;
    const delta = currentPos - dragStartPos.value;
    let newSize = dragStartSize.value;

    switch (direction) {
      case "left":
        newSize = dragStartSize.value + delta;
        break;
      case "right":
        newSize = dragStartSize.value - delta;
        break;
      case "top":
        newSize = dragStartSize.value + delta;
        break;
      case "bottom":
        newSize = dragStartSize.value - delta;
        break;
    }

    if (newSize >= options.minSize && newSize <= options.maxSize) {
      options.size.value = newSize;
    }
  };

  const stopResize = () => {
    isResizing.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  };

  const resetSize = (defaultSize: number) => {
    options.size.value = defaultSize;
  };

  onUnmounted(() => {
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  });

  return {
    isResizing,
    startResize,
    resetSize,
  };
}
