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

/** 后台任务跨窗口同步：数据宿主持有执行与写盘权，分离组件接收快照并转发叫停。 */

import { computed, onUnmounted, ref } from "vue";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { backgroundTaskRegistry } from "@/services/background-tasks";

/** 任务执行方推送权威快照，分离组件窗口仅消费；复用窗口同步总线的初始握手和重连。 */
export function useBackgroundTaskSync(): void {
  const bus = useWindowSyncBus();
  const observerOnly = bus.windowType === "detached-component";
  const snapshots = ref(backgroundTaskRegistry.listTasks());
  if (!observerOnly) {
    void backgroundTaskRegistry.loadFromPersistence().then(() => {
      snapshots.value = backgroundTaskRegistry.listTasks();
    });
    const unsubscribe = backgroundTaskRegistry.subscribe(() => {
      snapshots.value = backgroundTaskRegistry.listTasks();
    });
    const stopInitial = bus.onInitialStateRequest(async () => {
      await backgroundTaskRegistry.loadFromPersistence();
      snapshots.value = backgroundTaskRegistry.listTasks();
    });
    onUnmounted(() => {
      unsubscribe();
      stopInitial();
    });
  }
  const state = computed({
    get: () => snapshots.value,
    set: (value) => {
      if (observerOnly && Array.isArray(value))
        backgroundTaskRegistry.applyObservedSnapshots(value);
      snapshots.value = value;
    },
  });
  useStateSyncEngine(state, {
    stateKey: "sub-agent:background-tasks",
    autoPush: !observerOnly,
    autoReceive: observerOnly,
    enableDelta: false,
    debounce: 100,
    requestOnMount: observerOnly,
  });
  if (!observerOnly) {
    const off = bus.onActionRequest(
      "background-tasks",
      async (action, params) => {
        if (action === "cancel")
          return backgroundTaskRegistry.cancelTask(
            params.taskId,
            params.reason
          );
        return null;
      }
    );
    onUnmounted(off);
  }
}

/** 分离组件的叫停动作由任务执行方处理。 */
export async function cancelBackgroundTask(
  taskId: string,
  reason: string
): Promise<boolean> {
  const bus = useWindowSyncBus();
  return bus.windowType === "detached-component"
    ? bus.requestAction("background-tasks:cancel", { taskId, reason })
    : backgroundTaskRegistry.cancelTask(taskId, reason);
}
