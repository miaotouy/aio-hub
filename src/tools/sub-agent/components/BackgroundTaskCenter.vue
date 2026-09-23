<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<!--
  后台任务中心（只读容器）

  对应设计文档 §9 Phase 1：主窗口增加只读任务列表和任务详情，支持打开 child session。
  容器以 BaseDialog 呈现，左侧列表 + 右侧详情；订阅仅在挂载期间存在，
  卸载时取消，快照通过 backgroundTaskRegistry.listTasks() 读取。

  Phase 1 明确只读：不提供取消/暂停/插话等控制按钮。
-->

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import BackgroundTaskList from "./BackgroundTaskList.vue";
import BackgroundTaskDetail from "./BackgroundTaskDetail.vue";
import {
  backgroundTaskRegistry,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

interface Props {
  /** 是否显示任务中心（v-model） */
  modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const logger = createModuleLogger("sub-agent/background-task-center");
const errorHandler = createModuleErrorHandler(
  "sub-agent/background-task-center"
);
const store = useLlmChatStore();

/** 任务快照列表；整体替换，避免深层响应式开销 */
const tasks = shallowRef<BackgroundTaskSnapshot[]>([]);
/** 当前选中的任务 ID */
const selectedTaskId = ref<string | null>(null);

const selectedTask = computed<BackgroundTaskSnapshot | null>(
  () => tasks.value.find((task) => task.taskId === selectedTaskId.value) ?? null
);

const activeCount = computed(
  () =>
    tasks.value.filter((task) =>
      ["created", "queued", "running"].includes(task.state)
    ).length
);

/**
 * 拉取最新快照。
 *
 * registry.subscribe 只给出变更信号，这里按需重新读取 listTasks()，
 * 保证列表始终反映最新状态；刷新只替换数组，不触碰全局布局。
 */
function refreshTasks(): void {
  tasks.value = backgroundTaskRegistry.listTasks();

  if (
    selectedTaskId.value &&
    !tasks.value.some((task) => task.taskId === selectedTaskId.value)
  ) {
    selectedTaskId.value = null;
  }
  if (!selectedTaskId.value && tasks.value.length > 0) {
    selectedTaskId.value = tasks.value[0].taskId;
  }
}

let unsubscribe: (() => void) | undefined;

onMounted(() => {
  refreshTasks();
  unsubscribe = backgroundTaskRegistry.subscribe(() => refreshTasks());
  logger.debug("后台任务中心已订阅任务变更");
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = undefined;
});

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      refreshTasks();
    }
  }
);

function handleSelect(taskId: string): void {
  selectedTaskId.value = taskId;
}

/** 打开子会话：切换聊天区会话后关闭任务中心 */
async function handleOpenChild(task: BackgroundTaskSnapshot): Promise<void> {
  if (!task.childSessionId) {
    return;
  }
  try {
    await store.switchSession(task.childSessionId);
    emit("update:modelValue", false);
    logger.info("已从任务中心打开子会话", {
      taskId: task.taskId,
      childSessionId: task.childSessionId,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "打开子会话失败",
      context: { taskId: task.taskId, childSessionId: task.childSessionId },
    });
  }
}
</script>

<template>
  <BaseDialog
    :model-value="props.modelValue"
    width="920px"
    height="640px"
    content-class="task-center-content"
    :close-on-backdrop-click="true"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="center-header">
        <h3 class="center-title">后台任务中心</h3>
        <span class="center-count">
          进行中 {{ activeCount }} / 共 {{ tasks.length }}
        </span>
      </div>
    </template>

    <div class="center-body">
      <div class="center-list-pane">
        <BackgroundTaskList
          :tasks="tasks"
          :selected-task-id="selectedTaskId"
          @select="handleSelect"
        />
      </div>
      <div class="center-detail-pane">
        <BackgroundTaskDetail
          :task="selectedTask"
          @open-child="handleOpenChild"
        />
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 让两栏布局贴合对话框内容区（BaseDialog 默认内边距在此场景不需要） */
:deep(.task-center-content) {
  padding: 0;
  overflow: hidden;
}

.center-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.center-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.center-count {
  font-size: 12px;
  color: var(--text-color-light);
  font-variant-numeric: tabular-nums;
}

.center-body {
  display: flex;
  height: 100%;
  min-height: 0;
}

.center-list-pane {
  width: 300px;
  flex-shrink: 0;
  min-height: 0;
  border-right: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
  overflow: hidden;
}

.center-detail-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
