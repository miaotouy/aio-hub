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
  后台任务列表（只读）

  对应设计文档 §6.1 的列表卡片：展示目标 Agent 头像与名称、状态徽标、
  最后操作摘要与相对时间。Phase 1 不提供任何控制按钮。
-->

<script setup lang="ts">
import { computed } from "vue";
import type {
  BackgroundTaskSnapshot,
  BackgroundTaskState,
} from "@/services/background-tasks";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import Avatar from "@/components/common/Avatar.vue";
import { formatRelativeTime } from "@/utils/time";
import {
  getOriginDisplayName,
  getStaleReasonLabel,
  getTaskStatePresentation,
  getTaskSummary,
  type BackgroundTaskTone,
} from "./backgroundTaskPresentation";

interface Props {
  /** 任务快照列表（已由容器按 updatedAt 倒序） */
  tasks: BackgroundTaskSnapshot[];
  /** 当前选中的任务 ID */
  selectedTaskId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  selectedTaskId: null,
});

const emit = defineEmits<{
  (e: "select", taskId: string): void;
}>();

const agentStore = useAgentStore();

interface TaskListItem {
  taskId: string;
  state: BackgroundTaskState;
  stateLabel: string;
  tone: BackgroundTaskTone;
  agentName: string;
  avatarSrc: string | null;
  summary: string;
  timeText: string;
  stale: boolean;
  staleText: string;
}

const items = computed<TaskListItem[]>(() => {
  return props.tasks.map((task) => {
    const presentation = getTaskStatePresentation(task.state);
    const agent = task.targetAgent.actorId
      ? agentStore.getAgentById(task.targetAgent.actorId)
      : undefined;
    return {
      taskId: task.taskId,
      state: task.state,
      stateLabel: presentation.label,
      tone: presentation.tone,
      agentName: getOriginDisplayName(task.targetAgent),
      avatarSrc: resolveAgentAvatarPath(agent),
      summary: getTaskSummary(task),
      timeText: formatRelativeTime(task.updatedAt),
      stale: task.stale === true,
      staleText: getStaleReasonLabel(task.staleReason),
    };
  });
});
</script>

<template>
  <div class="task-list">
    <ul v-if="items.length > 0" class="task-list-items">
      <li v-for="item in items" :key="item.taskId" class="task-list-row">
        <button
          type="button"
          class="task-card"
          data-testid="background-task-row"
          :data-task-id="item.taskId"
          :class="{ selected: item.taskId === props.selectedTaskId }"
          @click="emit('select', item.taskId)"
        >
          <Avatar
            :src="item.avatarSrc || ''"
            :alt="item.agentName"
            :size="32"
            shape="square"
            :radius="6"
            class="task-card-avatar"
          />

          <div class="task-card-body">
            <div class="task-card-top">
              <span class="task-card-name" :title="item.agentName">
                {{ item.agentName }}
              </span>
              <span
                class="state-badge"
                data-testid="background-task-state"
                :data-task-state="item.state"
                :class="`state-${item.tone}`"
              >
                <span class="state-dot" />
                {{ item.stateLabel }}
              </span>
            </div>
            <div class="task-card-summary" :title="item.summary">
              {{ item.summary }}
            </div>
            <div class="task-card-meta">
              <span class="task-card-time">{{ item.timeText }}</span>
              <span v-if="item.stale" class="stale-hint">
                {{ item.staleText }}
              </span>
            </div>
          </div>
        </button>
      </li>
    </ul>

    <!-- 空态：内联占位，不留空白引导页 -->
    <div v-else class="task-list-empty">
      <div class="task-list-empty-title">暂无后台任务</div>
      <div class="task-list-empty-desc">
        当主会话里的智能体调用子智能体时，任务会出现在这里。
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-list {
  height: 100%;
  overflow-y: auto;
}

.task-list-items {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-card {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  box-sizing: border-box;
  text-align: left;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition:
    border-color 0.2s,
    background-color 0.2s;
  content-visibility: auto;
  contain: content;
}

.task-card:hover {
  border-color: var(--primary-color);
}

.task-card.selected {
  border-color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 8%, var(--card-bg));
}

.task-card-avatar {
  flex-shrink: 0;
}

.task-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task-card-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-card-summary {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-color-light);
}

.task-card-time {
  font-variant-numeric: tabular-nums;
}

.stale-hint {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--warning-color) 14%, transparent);
  color: var(--warning-color);
}

/* 状态徽标：1px 边框 + 小圆点，不使用粗左线 */
.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  border: 1px solid currentColor;
}

.state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.state-running {
  color: var(--primary-color);
}

.state-running .state-dot {
  animation: state-pulse 1.4s ease-in-out infinite;
}

.state-success {
  color: var(--success-color);
}

.state-danger {
  color: var(--danger-color);
}

.state-warning {
  color: var(--warning-color);
}

.state-info {
  color: var(--info-color);
}

@keyframes state-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.75);
  }
}

.task-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  padding: 32px 24px;
  text-align: center;
  box-sizing: border-box;
}

.task-list-empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.task-list-empty-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-light);
  max-width: 240px;
}
</style>
