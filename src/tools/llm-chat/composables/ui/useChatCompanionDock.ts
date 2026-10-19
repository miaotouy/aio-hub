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
import { computed, readonly, ref } from "vue";
import { useResizable } from "@/composables/useResizable";

const MIN_DOCK_WIDTH = 360;
const MAX_DOCK_WIDTH = 720;
const DEFAULT_DOCK_WIDTH = 420;
const MIN_CHAT_WIDTH = 480;

const isDockOpen = ref(false);
const hostWidth = ref(0);
const preferredWidth = useLocalStorage<number>(
  "llm-chat:companion-dock-width",
  DEFAULT_DOCK_WIDTH
);
const activeDockSource = ref<string | null>(null);
const canDock = computed(
  () => hostWidth.value >= MIN_CHAT_WIDTH + MIN_DOCK_WIDTH
);
const dockWidth = computed(() =>
  canDock.value
    ? Math.min(
        clampDockWidth(preferredWidth.value),
        hostWidth.value - MIN_CHAT_WIDTH
      )
    : 0
);
const isDockVisible = computed(() => isDockOpen.value && canDock.value);

function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_DOCK_WIDTH;
  return Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, width));
}
preferredWidth.value = clampDockWidth(preferredWidth.value);

/** 宿主只管理可用几何和占用互斥，消费方通过槽位提供内容。 */
export function useChatCompanionDockResize() {
  return useResizable({
    size: computed({
      get: () => dockWidth.value,
      set: (width) => {
        preferredWidth.value = Math.min(
          clampDockWidth(width),
          Math.max(MIN_DOCK_WIDTH, hostWidth.value - MIN_CHAT_WIDTH)
        );
      },
    }),
    minSize: MIN_DOCK_WIDTH,
    maxSize: MAX_DOCK_WIDTH,
    direction: "right",
  });
}

export function useChatCompanionDock() {
  function openDock(sourceId: string, width?: number): void {
    activeDockSource.value = sourceId;
    if (width !== undefined) preferredWidth.value = clampDockWidth(width);
    isDockOpen.value = true;
  }
  function closeDock(sourceId?: string): void {
    if (!sourceId || activeDockSource.value === sourceId) {
      isDockOpen.value = false;
      activeDockSource.value = null;
    }
  }
  function setHostWidth(width: number): void {
    hostWidth.value = Number.isFinite(width) ? Math.max(0, width) : 0;
  }
  function setDockWidth(width: number): void {
    preferredWidth.value = clampDockWidth(width);
  }
  return {
    isDockOpen: readonly(isDockOpen),
    isDockVisible,
    canDock,
    dockWidth,
    activeDockSource: readonly(activeDockSource),
    openDock,
    closeDock,
    setDockWidth,
    setHostWidth,
  };
}
