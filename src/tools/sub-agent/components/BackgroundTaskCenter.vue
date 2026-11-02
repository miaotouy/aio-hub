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
import SubagentControlPanel from "./SubagentControlPanel.vue";
import {
  backgroundTaskRegistry,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  useBackgroundTaskCenter,
} from "../composables/useBackgroundTaskCenter";
import { Bot, Activity } from "lucide-vue-next";

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
const agentStore = useAgentStore();
const {
  activeTab,
  setActiveTab,
  focusedTaskId,
  clearFocusedTask,
} = useBackgroundTaskCenter();

/** 可用子智能体数量统计 */
const availableSubagentCount = computed(
  () =>
    agentStore.agents.filter(
      (a) => a.subAgentConfig?.enabled === true
    ).length
);

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

  const requestedTaskId = focusedTaskId.value;
  if (
    requestedTaskId &&
    tasks.value.some((task) => task.taskId === requestedTaskId)
  ) {
    selectedTaskId.value = requestedTaskId;
    clearFocusedTask();
    return;
  }

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

watch(focusedTaskId, () => {
  if (props.modelValue) {
    refreshTasks();
  }
});

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
        <div class="center-title-group">
          <h3 class="center-title">任务与子智能体中心</h3>
          <span v-if="activeTab === 'tasks'" class="center-count">
            进行中 {{ activeCount }} / 共 {{ tasks.length }}
          </span>
        </div>

        <!-- 顶部 Tab 切换胶囊 -->
        <div class="center-nav-tabs">
          <button
            type="button"
            class="nav-tab-btn"
            :class="{ 'is-active': activeTab === 'tasks' }"
            @click="setActiveTab('tasks')"
          >
            <Activity :size="14" />
            <span>后台任务</span>
            <span v-if="activeCount > 0" class="tab-badge is-active">
              {{ activeCount }}
            </span>
          </button>

          <button
            type="button"
            class="nav-tab-btn"
            :class="{ 'is-active': activeTab === 'subagents' }"
            @click="setActiveTab('subagents')"
          >
            <Bot :size="14" />
            <span>子智能体管理</span>
            <span class="tab-badge">
              {{ availableSubagentCount }}
            </span>
          </button>
        </div>
      </div>
    </template>

    <div class="center-main-wrapper">
      <!-- 视图 1：后台任务执行流 -->
      <div v-show="activeTab === 'tasks'" class="center-body">
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

      <!-- 视图 2：子智能体配置管理 -->
      <div v-show="activeTab === 'subagents'" class="center-subagent-view">
        <SubagentControlPanel />
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
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.center-title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.center-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  letter-spacing: 0.2px;
}

.center-count {
  font-size: 12px;
  color: var(--text-color-light);
  font-variant-numeric: tabular-nums;
}

/* 顶部选项卡药丸切换 */
.center-nav-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background-color: var(--el-fill-color-light);
  border: var(--border-width) solid var(--border-color);
}

.nav-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-light);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-tab-btn:hover {
  color: var(--text-color);
}

.nav-tab-btn.is-active {
  background-color: var(--card-bg);
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  background-color: var(--el-fill-color);
  color: var(--text-color-light);
}

.tab-badge.is-active {
  background-color: var(--primary-color);
  color: #fff;
}

.center-main-wrapper {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.center-body {
  display: flex;
  height: 100%;
  min-height: 0;
}

.center-subagent-view {
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
