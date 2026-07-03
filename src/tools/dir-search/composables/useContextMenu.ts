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

import { ref, onUnmounted } from "vue";

export interface ContextMenuItem {
  /** 菜单项标识 */
  id: string;
  /** 显示文本 */
  label: string;
  /** 图标组件名（可选） */
  icon?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为分隔线 */
  separator?: boolean;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** 附加数据，用于回调时识别上下文 */
  context: Record<string, unknown>;
}

export function useContextMenu() {
  const state = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
    context: {},
  });

  function show(
    event: MouseEvent,
    items: ContextMenuItem[],
    context: Record<string, unknown> = {}
  ) {
    event.preventDefault();
    event.stopPropagation();

    // 计算位置，确保菜单不超出视口
    const x = event.clientX;
    const y = event.clientY;

    state.value = {
      visible: true,
      x,
      y,
      items,
      context,
    };
  }

  function hide() {
    state.value.visible = false;
  }

  // 点击外部关闭
  function onDocumentClick() {
    if (state.value.visible) {
      hide();
    }
  }

  // 按 Escape 关闭
  function onDocumentKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && state.value.visible) {
      hide();
    }
  }

  // 注册全局事件
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);

  onUnmounted(() => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return {
    state,
    show,
    hide,
  };
}
