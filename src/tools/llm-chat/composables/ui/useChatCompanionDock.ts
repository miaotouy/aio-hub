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

import { useLocalStorage } from "@vueuse/core";
import { readonly, ref } from "vue";
import { useResizable } from "@/composables/useResizable";

const MIN_DOCK_WIDTH = 360;
const MAX_DOCK_WIDTH = 720;
const DEFAULT_DOCK_WIDTH = 420;

const isDockOpen = ref(false);
const dockWidth = useLocalStorage<number>(
  "llm-chat:companion-dock-width",
  DEFAULT_DOCK_WIDTH
);
const activeDockSource = ref<string | null>(null);

function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_DOCK_WIDTH;
  }
  return Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, width));
}

dockWidth.value = clampDockWidth(dockWidth.value);

const { isResizing, startResize } = useResizable({
  size: dockWidth,
  minSize: MIN_DOCK_WIDTH,
  maxSize: MAX_DOCK_WIDTH,
  direction: "right",
});

/**
 * Chat 工作区伴生分栏的宿主状态。
 *
 * 该控制器只负责容器几何和占用互斥；内容由各消费方通过
 * #chat-companion-dock-slot 自行 Teleport 挂载，避免宿主依赖具体功能模块。
 */
export function useChatCompanionDock() {
  function openDock(sourceId: string, preferredWidth?: number): void {
    activeDockSource.value = sourceId;
    if (preferredWidth !== undefined) {
      dockWidth.value = clampDockWidth(preferredWidth);
    }
    isDockOpen.value = true;
  }

  function closeDock(sourceId?: string): void {
    if (!sourceId || activeDockSource.value === sourceId) {
      isDockOpen.value = false;
      activeDockSource.value = null;
    }
  }

  function setDockWidth(width: number): void {
    dockWidth.value = clampDockWidth(width);
  }

  return {
    isDockOpen: readonly(isDockOpen),
    dockWidth: readonly(dockWidth),
    activeDockSource: readonly(activeDockSource),
    isResizing: readonly(isResizing),
    openDock,
    closeDock,
    setDockWidth,
    startResize,
  };
}
