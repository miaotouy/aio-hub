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

import { ref, onMounted, onUnmounted, watch } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/StateConsumer");

/**
 * Canvas 状态消费者 (分离窗口使用)
 */
export function useCanvasStateConsumer() {
  const bus = useWindowSyncBus();

  // 本地状态副本
  const activeCanvasId = ref<string | null>(null);
  const lastFileChangeTimestamp = ref(0);
  const previewOverrides = ref<Record<string, string>>({});
  const previewOverridesByCanvas = ref<Record<string, Record<string, string>>>(
    {}
  );

  const engines: ReturnType<typeof useStateSyncEngine>[] = [];
  let unlistenFn: (() => void) | null = null;

  /**
   * 初始化状态同步
   * 注意：为了兼容异步 setup，此方法不使用生命周期钩子，需手动调用 cleanup
   */
  function initialize() {
    if (unlistenFn) return;

    // 只同步 canvasId
    const idEngine = useStateSyncEngine(activeCanvasId, {
      stateKey: "canvas:active-id" as any,
      autoPush: false,
      autoReceive: true,
      enableDelta: true,
    });
    engines.push(idEngine);

    // 监听文件变更通知
    unlistenFn = bus.onMessage("state-sync", (payload: any) => {
      if (
        payload.stateType === "canvas:file-changed" &&
        payload.data?.canvasId === activeCanvasId.value
      ) {
        lastFileChangeTimestamp.value = payload.data.timestamp;
        logger.info("收到文件变更通知", {
          canvasId: payload.data.canvasId,
          filepath: payload.data.filepath,
          timestamp: payload.data.timestamp,
        });
        return;
      }

      if (payload.stateType === "canvas:preview-overlay") {
        const canvasId = payload.data?.canvasId;
        const files = payload.data?.files;
        if (
          typeof canvasId === "string" &&
          files &&
          typeof files === "object" &&
          Object.values(files).every((content) => typeof content === "string")
        ) {
          previewOverridesByCanvas.value = {
            ...previewOverridesByCanvas.value,
            [canvasId]: { ...(files as Record<string, string>) },
          };
          if (canvasId === activeCanvasId.value) {
            previewOverrides.value = { ...(files as Record<string, string>) };
            lastFileChangeTimestamp.value = payload.data.timestamp;
          }
        }
      }
    });

    // 切换画布时不能保留前一个项目的候选文件。窗口刚打开时，覆盖层
    // 消息可能先于 active-id 到达，因此按画布暂存后再切换到对应内容。
    watch(activeCanvasId, (canvasId) => {
      previewOverrides.value = canvasId
        ? { ...(previewOverridesByCanvas.value[canvasId] || {}) }
        : {};
    });

    // 请求初始状态
    bus.requestInitialState();

    logger.info("Canvas 状态消费者已初始化");
  }

  function cleanup() {
    engines.forEach((e) => e.cleanup());
    engines.length = 0;
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    logger.info("Canvas 状态消费者已清理");
  }

  // 如果在 setup 期间调用，则自动挂载生命周期
  try {
    onMounted(() => initialize());
    onUnmounted(() => cleanup());
  } catch (e) {
    // 忽略在非组件上下文中的错误，由调用者手动管理
  }

  return {
    activeCanvasId,
    lastFileChangeTimestamp,
    previewOverrides,
    initialize,
    cleanup,
  };
}
