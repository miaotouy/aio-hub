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
  后台任务详情（只读）

  对应设计文档 §6 的伴生透视：展示任务快照完整元信息与最近活动流水，
  并提供「打开子会话」入口。Phase 2 开放「取消任务」（经 registry.cancelTask
  打通 assistant.ask 的中止逻辑）；暂停/恢复等语义待 Phase 4。
-->

<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import { Ban, ExternalLink } from "lucide-vue-next";
import {
  backgroundTaskRegistry,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import Avatar from "@/components/common/Avatar.vue";
import { formatDateTime, formatRelativeTime } from "@/utils/time";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import {
  getActivityActorName,
  getOriginDisplayName,
  getStaleReasonLabel,
  getTaskStatePresentation,
  isActiveTaskState,
} from "./backgroundTaskPresentation";

const logger = createModuleLogger("background-task-detail");

interface Props {
  /** 当前选中的任务快照；为空时展示占位 */
  task: BackgroundTaskSnapshot | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "open-child", task: BackgroundTaskSnapshot): void;
}>();

const agentStore = useAgentStore();

const statePresentation = computed(() =>
  getTaskStatePresentation(props.task?.state ?? "created")
);

const targetAgentName = computed(() => {
  if (!props.task) return "";
  return getOriginDisplayName(props.task.targetAgent);
});

const callerAgentName = computed(() => {
  if (!props.task) return "";
  return getOriginDisplayName(props.task.callerAgent);
});

const avatarSrc = computed(() => {
  const agentId = props.task?.targetAgent.actorId;
  const agent = agentId ? agentStore.getAgentById(agentId) : undefined;
  return resolveAgentAvatarPath(agent);
});

/** 元信息行 */
interface MetaRow {
  label: string;
  value: string;
  title?: string;
}

function formatTime(iso?: string): string {
  if (!iso) {
    return "—";
  }
  const absolute = formatDateTime(iso, "yyyy-MM-dd HH:mm:ss");
  return `${absolute}（${formatRelativeTime(iso)}）`;
}

const metaRows = computed<MetaRow[]>(() => {
  const task = props.task;
  if (!task) return [];
  return [
    { label: "任务 ID", value: task.taskId, title: task.taskId },
    {
      label: "对话句柄",
      value: task.conversationId || "—",
      title: task.conversationId,
    },
    {
      label: "调度会话",
      value: task.parentSessionId || "—",
      title: task.parentSessionId,
    },
    {
      label: "子会话",
      value: task.childSessionId || "—",
      title: task.childSessionId,
    },
    { label: "调度方", value: callerAgentName.value },
    {
      label: "父任务",
      value: task.parentTaskId || "—",
      title: task.parentTaskId,
    },
    { label: "运行时代次", value: String(task.runtimeGeneration) },
    { label: "阶段", value: task.phase || "—" },
    { label: "创建时间", value: formatTime(task.createdAt) },
    { label: "开始时间", value: formatTime(task.startedAt) },
    { label: "更新时间", value: formatTime(task.updatedAt) },
    { label: "最近进展", value: formatTime(task.lastProgressAt) },
  ];
});

/** 活动流水：最新在上 */
const activities = computed(() => {
  const list = props.task?.recentActivity ?? [];
  return [...list].reverse();
});

const canOpenChild = computed(() => !!props.task?.childSessionId);

/** 仅非终态任务可取消；终态任务隐藏取消按钮 */
const canCancel = computed(
  () => !!props.task && isActiveTaskState(props.task.state)
);

/**
 * 取消后台任务。
 *
 * 二次确认后调用 registry.cancelTask；取消成功会触发任务 state_changed，
 * assistant.ask 的订阅随之中止子会话生成（Phase 1 已打通）。
 * 任务已进入终态时 registry 幂等返回 false，这里给出中性提示。
 */
async function handleCancelTask(): Promise<void> {
  const task = props.task;
  if (!task || !canCancel.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定要取消「${targetAgentName.value}」的后台任务吗？取消后子会话的生成会被立即中止。`,
      "取消后台任务",
      {
        type: "warning",
        confirmButtonText: "取消任务",
        cancelButtonText: "保留任务",
        lockScroll: false,
      }
    );
  } catch {
    // 用户放弃取消
    return;
  }

  const cancelled = backgroundTaskRegistry.cancelTask(
    task.taskId,
    "用户从任务中心取消"
  );

  if (cancelled) {
    logger.info("用户取消了后台任务", { taskId: task.taskId });
    customMessage.success("已取消后台任务");
  } else {
    customMessage.warning("任务已结束，无需取消");
  }
}
</script>

<template>
  <div class="task-detail">
    <template v-if="props.task">
      <!-- 任务头部 -->
      <header class="detail-header">
        <Avatar
          :src="avatarSrc || ''"
          :alt="targetAgentName"
          :size="40"
          shape="square"
          :radius="8"
          class="detail-avatar"
        />
        <div class="detail-header-main">
          <div class="detail-title-row">
            <span class="detail-title" :title="targetAgentName">
              {{ targetAgentName }}
            </span>
            <span
              class="state-badge"
              :class="`state-${statePresentation.tone}`"
            >
              <span class="state-dot" />
              {{ statePresentation.label }}
            </span>
            <span v-if="props.task.stale" class="stale-badge">
              {{ getStaleReasonLabel(props.task.staleReason) }}
            </span>
          </div>
          <div
            v-if="props.task.lastOperationSummary"
            class="detail-summary"
            :title="props.task.lastOperationSummary"
          >
            {{ props.task.lastOperationSummary }}
          </div>
        </div>
      </header>

      <!-- 任务操作：打开子会话 / 取消任务（终态隐藏） -->
      <div class="detail-actions">
        <button
          type="button"
          class="open-child-button"
          :disabled="!canOpenChild"
          :title="
            canOpenChild ? '在聊天区打开该子会话' : '该任务没有可打开的子会话'
          "
          @click="props.task && emit('open-child', props.task)"
        >
          <ExternalLink :size="14" />
          <span>打开子会话</span>
        </button>

        <button
          v-if="canCancel"
          type="button"
          class="cancel-task-button"
          title="取消该后台任务并中止子会话生成"
          @click="handleCancelTask"
        >
          <Ban :size="14" />
          <span>取消任务</span>
        </button>
      </div>

      <!-- 元信息 -->
      <section class="detail-section">
        <h4 class="detail-section-title">任务信息</h4>
        <dl class="meta-grid">
          <div v-for="row in metaRows" :key="row.label" class="meta-row">
            <dt class="meta-label">{{ row.label }}</dt>
            <dd class="meta-value" :title="row.title || row.value">
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- 结果 / 错误 -->
      <section
        v-if="props.task.result || props.task.error"
        class="detail-section"
      >
        <h4 class="detail-section-title">执行结果</h4>
        <div v-if="props.task.result" class="result-block result-success">
          <span class="result-label">完成摘要</span>
          <span class="result-text">{{ props.task.result.summary }}</span>
        </div>
        <div v-if="props.task.error" class="result-block result-error">
          <span class="result-label">
            错误{{
              props.task.error.code ? `（${props.task.error.code}）` : ""
            }}
          </span>
          <span class="result-text">{{ props.task.error.message }}</span>
        </div>
      </section>

      <!-- 活动流水 -->
      <section class="detail-section">
        <h4 class="detail-section-title">
          最近活动
          <span class="detail-section-hint">最近 8 条</span>
        </h4>
        <ol v-if="activities.length > 0" class="activity-list">
          <li
            v-for="activity in activities"
            :key="activity.id"
            class="activity-item"
          >
            <span class="activity-dot" :class="`kind-${activity.kind}`" />
            <div class="activity-body">
              <div class="activity-summary">{{ activity.summary }}</div>
              <div class="activity-meta">
                <span class="activity-actor">
                  {{ getActivityActorName(activity.actor) }}
                </span>
                <span class="activity-time">
                  {{ formatRelativeTime(activity.timestamp) }}
                </span>
              </div>
            </div>
          </li>
        </ol>
        <div v-else class="activity-empty">暂无活动记录</div>
      </section>
    </template>

    <!-- 空态：内联占位 -->
    <div v-else class="detail-empty">
      <div class="detail-empty-title">未选择任务</div>
      <div class="detail-empty-desc">
        在左侧列表中选择一个后台任务，即可查看它的状态与最近活动。
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-detail {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

/* ---------- 头部 ---------- */
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.detail-avatar {
  flex-shrink: 0;
}

.detail-header-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-summary {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---------- 状态徽标 ---------- */
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

.stale-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  background-color: color-mix(in srgb, var(--warning-color) 14%, transparent);
  color: var(--warning-color);
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

/* ---------- 操作 ---------- */
.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.open-child-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border: 1px solid var(--primary-color);
  transition:
    background-color 0.2s,
    opacity 0.2s;
}

.open-child-button:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--primary-color) 16%, transparent);
}

.open-child-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cancel-task-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--danger-color);
  background-color: color-mix(in srgb, var(--danger-color) 8%, transparent);
  border: 1px solid var(--danger-color);
  transition: background-color 0.2s;
}

.cancel-task-button:hover {
  background-color: color-mix(in srgb, var(--danger-color) 16%, transparent);
}

/* ---------- 分区 ---------- */
.detail-section {
  margin-top: 18px;
}

.detail-section-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.detail-section-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-color-light);
}

/* ---------- 元信息 ---------- */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 0;
}

.meta-row {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background-color: var(--container-bg);
}

.meta-label {
  flex-shrink: 0;
  width: 72px;
  font-size: 12px;
  color: var(--text-color-light);
}

.meta-value {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-color);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---------- 结果 ---------- */
.result-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
}

.result-block + .result-block {
  margin-top: 8px;
}

.result-label {
  font-size: 11px;
  color: var(--text-color-light);
}

.result-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.result-success {
  border-color: color-mix(in srgb, var(--success-color) 50%, transparent);
}

.result-error {
  border-color: color-mix(in srgb, var(--danger-color) 50%, transparent);
}

/* ---------- 活动流水 ---------- */
.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  display: flex;
  gap: 10px;
  padding: 6px 4px;
}

.activity-dot {
  flex-shrink: 0;
  margin-top: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--info-color);
}

.activity-dot.kind-llm_started,
.activity-dot.kind-llm_progress {
  background-color: var(--primary-color);
}

.activity-dot.kind-tool_started,
.activity-dot.kind-tool_progress,
.activity-dot.kind-tool_finished {
  background-color: var(--warning-color);
}

.activity-dot.kind-error {
  background-color: var(--danger-color);
}

.activity-dot.kind-state_changed {
  background-color: var(--success-color);
}

.activity-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
  word-break: break-word;
}

.activity-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-color-light);
}

.activity-time {
  font-variant-numeric: tabular-nums;
}

.activity-empty {
  padding: 12px 4px;
  font-size: 12px;
  color: var(--text-color-light);
}

/* ---------- 空态 ---------- */
.detail-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
  box-sizing: border-box;
}

.detail-empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.detail-empty-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-light);
  max-width: 260px;
}
</style>
