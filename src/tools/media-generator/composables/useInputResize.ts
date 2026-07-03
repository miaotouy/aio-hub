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

import { ref, computed, onMounted, onUnmounted, nextTick, type Ref } from "vue";

interface UseInputResizeOptions {
  textareaRef: Ref<any>;
  extraHeight?: Ref<number>;
}

export function useInputResize(options: UseInputResizeOptions) {
  const isResizing = ref(false);
  const startY = ref(0);
  const startHeight = ref(0);
  const customHeight = ref<string | number>("auto");
  const customMaxHeight = ref<string | number | null>(null);
  const autoHeight = ref<number | null>(null);

  const editorHeight = computed(() => {
    if (customHeight.value !== "auto") return customHeight.value;
    return autoHeight.value ?? "auto";
  });

  const editorMaxHeight = computed(() => {
    const extra = options.extraHeight?.value || 0;
    if (typeof customMaxHeight.value === "number") {
      return customMaxHeight.value;
    }
    return `calc(40vh - ${extra}px)`;
  });

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value || !options.textareaRef.value) return;

    const deltaY = startY.value - e.clientY;
    const newHeight = startHeight.value + deltaY;

    const minHeight = 40;
    const extra = options.extraHeight?.value || 0;
    const maxHeight = Math.max(
      minHeight,
      window.innerHeight * 0.7 - extra - 60
    );
    const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    customHeight.value = finalHeight;
    customMaxHeight.value = finalHeight;
  };

  const handleMouseUp = () => {
    isResizing.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleInputResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isResizing.value = true;
    startY.value = e.clientY;

    if (options.textareaRef.value) {
      const el = options.textareaRef.value.$el || options.textareaRef.value;
      startHeight.value = el?.offsetHeight || 0;
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleResizeDoubleClick = () => {
    customHeight.value = "auto";
    customMaxHeight.value = null;
    nextTick(() => {
      adjustHeight();
    });
  };

  const adjustHeight = () => {
    if (customHeight.value !== "auto" || !options.textareaRef.value) return;

    const el = options.textareaRef.value.$el || options.textareaRef.value;
    if (!el) return;

    el.style.height = "auto";
    autoHeight.value = el.scrollHeight;
    el.style.height = `${autoHeight.value}px`;
  };

  onMounted(() => {
    nextTick(() => {
      adjustHeight();
    });
  });

  onUnmounted(() => {
    if (isResizing.value) {
      handleMouseUp();
    }
  });

  return {
    editorHeight,
    editorMaxHeight,
    handleInputResizeStart,
    handleResizeDoubleClick,
    adjustHeight,
  };
}
