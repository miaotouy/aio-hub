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

import { inject, onUnmounted, provide, ref, type Ref } from "vue";
import type { GitContextMenuItem } from "../contextMenus";

/** 右键菜单运行时状态（由 GitCommitter 持有单例） */
export interface GitContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: GitContextMenuItem[];
  /** 附加数据，用于回调时识别右键目标 */
  context: GitContextMenuContext;
}

/** 菜单上下文：由打开菜单的区域组件提供动作分发函数 */
export interface GitContextMenuContext {
  /** 按 item.id 执行对应动作 */
  dispatch?: (itemId: string) => void;
  [key: string]: unknown;
}

export interface GitContextMenuController {
  state: Ref<GitContextMenuState>;
  /** 在鼠标位置打开菜单；同时替换掉已打开的旧菜单 */
  show: (
    event: MouseEvent,
    items: GitContextMenuItem[],
    context?: GitContextMenuContext
  ) => void;
  hide: () => void;
}

const CONTEXT_MENU_KEY = Symbol("git-committer-context-menu");

export function provideGitContextMenu(): GitContextMenuController {
  const controller = createGitContextMenuController();
  provide(CONTEXT_MENU_KEY, controller);
  return controller;
}

export function useGitContextMenu(): GitContextMenuController {
  const injected = inject<GitContextMenuController | null>(
    CONTEXT_MENU_KEY,
    null
  );
  return injected ?? createGitContextMenuController();
}

function createGitContextMenuController(): GitContextMenuController {
  const state = ref<GitContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
    context: {},
  });

  function show(
    event: MouseEvent,
    items: GitContextMenuItem[],
    context: GitContextMenuContext = {}
  ) {
    event.preventDefault();
    event.stopPropagation();
    state.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items,
      context,
    };
  }

  function hide() {
    state.value.visible = false;
  }

  // 点击其他区域或右键其他目标时关闭；show() 内部 stopPropagation
  // 保证「右键新目标」先完成替换，不会被 document 监听提前关闭。
  const onDocumentContextMenu = () => hide();
  const onDocumentClick = () => {
    if (state.value.visible) hide();
  };
  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && state.value.visible) hide();
  };

  document.addEventListener("contextmenu", onDocumentContextMenu);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);

  onUnmounted(() => {
    document.removeEventListener("contextmenu", onDocumentContextMenu);
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return { state, show, hide };
}
