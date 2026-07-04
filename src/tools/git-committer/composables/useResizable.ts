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

interface ResizableOptions {
  initialWidth: Ref<number>;
  minWidth: number;
  maxWidth: number;
  getOffset?: () => number; // 用于左侧栏，需要减去 RepoBar 的宽度
  isRight?: boolean; // 是否是右侧栏拖拽
}

export function useResizable(options: ResizableOptions) {
  const isResizing = ref(false);

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    isResizing.value = true;
    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizing.value) return;
    let newWidth = 0;
    if (options.isRight) {
      newWidth = window.innerWidth - e.clientX;
    } else {
      const offset = options.getOffset ? options.getOffset() : 0;
      newWidth = e.clientX - offset;
    }

    if (newWidth >= options.minWidth && newWidth <= options.maxWidth) {
      options.initialWidth.value = newWidth;
    }
  };

  const stopResize = () => {
    isResizing.value = false;
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  };

  const resetWidth = (defaultWidth: number) => {
    options.initialWidth.value = defaultWidth;
  };

  onUnmounted(() => {
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  });

  return {
    isResizing,
    startResize,
    resetWidth,
  };
}
