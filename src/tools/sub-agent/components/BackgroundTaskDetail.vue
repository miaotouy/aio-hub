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
  后台任务详情：查看任务、打开子会话、取消及追加指导。
  追加指导只写入子会话，后续轮次的调度由执行器另行负责。
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  Ban,
  ExternalLink,
  MessageSquarePlus,
  PanelRight,
  PictureInPicture2,
  Send,
} from "lucide-vue-next";
import {
  backgroundTaskRegistry,
  type BackgroundTaskApprovalRecord,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import {
  describeArbitration,
  type ArbitrationPresentation,
} from "@/services/decision-arbiter";
import { useToolCallingStore } from "@/tools/llm-chat/stores/toolCallingStore";
import type { ParsedToolRequest } from "@/tools/tool-calling/types";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { toolRegistryManager } from "@/services/registry";
import type SubAgentRegistry from "../sub-agent.registry";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import Avatar from "@/components/common/Avatar.vue";
import { formatDateTime, formatRelativeTime } from "@/utils/time";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import {
  useCompanionSession,
  type CompanionSessionMode,
} from "../composables/useCompanionSession";
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
const { isOpen, targetTaskId, mode, toggleCompanion } = useCompanionSession();

/** 透视：同一任务、同一形态再次点击会收起。 */
function handlePeek(requestedMode: CompanionSessionMode): void {
  const task = props.task;
  if (!task?.childSessionId) return;
  toggleCompanion({
    taskId: task.taskId,
    childSessionId: task.childSessionId,
    mode: requestedMode,
  });
}

function isPeekActive(requestedMode: CompanionSessionMode): boolean {
  const task = props.task;
  return (
    !!task &&
    isOpen.value &&
    targetTaskId.value === task.taskId &&
    mode.value === requestedMode
  );
}

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
    { label: "调度方", value: callerAgentName.value },
    { label: "创建时间", value: formatTime(task.createdAt) },
    { label: "开始时间", value: formatTime(task.startedAt) },
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

// ----- P4：任务级工具审批（逐项批准 / 拒绝 + 仲裁记录回放） -----
const toolCallingStore = useToolCallingStore();

/** 当前任务未决的审批请求（由 store 按 taskId 关联）。 */
const pendingApprovals = computed(() => {
  const taskId = props.task?.taskId;
  if (!taskId) return [];
  return toolCallingStore.pendingRequests.filter((r) => r.taskId === taskId);
});

/** 已结算的审批审计记录（最新在上）。 */
const settledApprovals = computed<BackgroundTaskApprovalRecord[]>(() =>
  [...(props.task?.approvals ?? [])].reverse()
);

const APPROVAL_ORIGIN_LABELS: Record<string, string> = {
  rule: "规则自动放行",
  jev: "JEV 仲裁",
  manual: "人工确认",
  timeout: "审批超时",
  cancelled: "已取消",
};

function approvalOriginLabel(origin: string): string {
  return APPROVAL_ORIGIN_LABELS[origin] ?? origin;
}

function approvalRiskText(record: BackgroundTaskApprovalRecord): string {
  if (record.risk === null || record.risk === undefined) return "";
  return `风险 ${Math.round(Math.min(1, Math.max(0, record.risk)) * 100)}%`;
}

/** 待审批请求的参数预览（批准前确认实际操作内容）。 */
function approvalArgsText(request: ParsedToolRequest): string {
  const entries = Object.entries(request.args ?? {});
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

/** 待审批请求的解析 / 验证错误提示。 */
function approvalValidationError(request: ParsedToolRequest): string {
  if (request.validation?.isValid !== false) return "";
  return request.validation.reason || "解析或验证错误";
}

/** 待审批请求此前 escalate 保留的 JEV 仲裁证据。 */
function arbitrationFor(requestId: string): ArbitrationPresentation | null {
  const presentation = describeArbitration(
    toolCallingStore.getAuditRecord(requestId)
  );
  return presentation?.kind === "jev" ? presentation : null;
}

interface PendingApprovalView {
  id: string;
  request: ParsedToolRequest;
  argsText: string;
  validationError: string;
  jev: ArbitrationPresentation | null;
}

/** 待审批项视图：附带参数、验证错误与 JEV 仲裁意见，供批准前核对。 */
const pendingApprovalViews = computed<PendingApprovalView[]>(() =>
  pendingApprovals.value.map((item) => ({
    id: item.id,
    request: item.request,
    argsText: approvalArgsText(item.request),
    validationError: approvalValidationError(item.request),
    jev: arbitrationFor(item.request.requestId),
  }))
);

function approveTaskApproval(id: string): void {
  toolCallingStore.approveRequest(id);
}

function rejectTaskApproval(id: string): void {
  toolCallingStore.rejectRequest(id);
}

const showAppendInput = ref(false);
const appendDraft = ref("");
const isAppending = ref(false);
const canAppend = computed(
  () => !!props.task && isActiveTaskState(props.task.state)
);

watch(
  () => props.task?.taskId,
  () => {
    showAppendInput.value = false;
    appendDraft.value = "";
  }
);

async function handleAppendMessage(): Promise<void> {
  const task = props.task;
  const message = appendDraft.value.trim();
  if (!task || !canAppend.value || !message || isAppending.value) return;

  isAppending.value = true;
  try {
    const registry =
      toolRegistryManager.getRegistry<SubAgentRegistry>("sub-agent");
    const result = JSON.parse(
      await registry.send_task_message({ taskId: task.taskId, message })
    ) as { appended: boolean; message?: string };
    if (!result.appended) {
      customMessage.warning(
        result.message || "任务已结束，请打开子会话继续对话"
      );
      return;
    }
    if (props.task?.taskId === task.taskId) {
      appendDraft.value = "";
      showAppendInput.value = false;
    }
    customMessage.success("已追加到子会话，可在后续对话中查看");
  } catch (error) {
    logger.warn("向子会话追加指导失败", { taskId: task.taskId, error });
    customMessage.error(
      error instanceof Error ? error.message : "追加失败，请打开子会话后重试"
    );
  } finally {
    isAppending.value = false;
  }
}

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
              data-testid="task-detail-state"
              :data-task-state="props.task.state"
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

      <!-- 任务操作：透视 / 打开子会话 / 取消任务（终态隐藏） -->
      <div class="detail-actions">
        <button
          type="button"
          class="peek-child-button"
          :class="{ 'action-btn-active': isPeekActive('sheet') }"
          :disabled="!canOpenChild"
          :title="
            canOpenChild
              ? '在右侧只读伴生栏中透视子会话'
              : '该任务没有可透视的子会话'
          "
          @click="handlePeek('sheet')"
        >
          <PanelRight :size="14" />
          <span>侧栏透视</span>
        </button>
        <button
          type="button"
          class="peek-child-button"
          :class="{ 'action-btn-active': isPeekActive('pip') }"
          :disabled="!canOpenChild"
          :title="
            canOpenChild
              ? '在悬浮只读窗口中透视子会话'
              : '该任务没有可透视的子会话'
          "
          @click="handlePeek('pip')"
        >
          <PictureInPicture2 :size="14" />
          <span>悬浮透视</span>
        </button>

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
          v-if="canAppend"
          type="button"
          class="append-task-button"
          :aria-expanded="showAppendInput"
          @click="showAppendInput = !showAppendInput"
        >
          <MessageSquarePlus :size="14" />
          <span>追加指导</span>
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

      <div v-if="showAppendInput && canAppend" class="append-composer">
        <label class="append-label" for="task-append-message"
          >补充给子智能体</label
        >
        <textarea
          id="task-append-message"
          v-model="appendDraft"
          class="append-textarea"
          rows="3"
          placeholder="写下补充要求…"
          :disabled="isAppending"
          @keydown.ctrl.enter.prevent="handleAppendMessage"
        />
        <div class="append-footer">
          <span>写入子会话供后续对话查看 · Ctrl+Enter 追加</span>
          <button
            type="button"
            class="append-submit"
            :disabled="!appendDraft.trim() || isAppending"
            @click="handleAppendMessage"
          >
            <Send :size="14" />
            <span>{{ isAppending ? "追加中…" : "追加" }}</span>
          </button>
        </div>
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

      <!-- 工具审批：逐项批准 / 拒绝与仲裁记录 -->
      <section
        v-if="pendingApprovals.length > 0 || settledApprovals.length > 0"
        class="detail-section"
      >
        <h4 class="detail-section-title">
          工具审批
          <span v-if="pendingApprovals.length > 0" class="detail-section-hint">
            {{ pendingApprovals.length }} 项待处理
          </span>
        </h4>

        <div
          v-for="item in pendingApprovalViews"
          :key="item.id"
          class="approval-item"
          data-testid="task-pending-approval"
        >
          <div class="approval-item-main">
            <div class="approval-item-head">
              <span class="approval-item-tool">
                {{ item.request.methodDisplayName || item.request.toolName }}
              </span>
              <span class="approval-item-desc">
                {{ item.request.toolId }}.{{ item.request.methodName }}
              </span>
            </div>
            <div v-if="item.validationError" class="approval-item-error">
              {{ item.validationError }}
            </div>
            <div
              v-if="item.argsText"
              class="approval-item-args"
              :title="item.argsText"
            >
              {{ item.argsText }}
            </div>
            <div
              v-if="item.jev"
              class="approval-item-jev"
              :class="{ 'is-degraded': item.jev.degraded }"
              data-testid="task-approval-jev"
            >
              <span class="approval-item-jev-dot" />
              <template v-if="item.jev.degraded">
                Jev 离线 · 安全兜底
              </template>
              <template v-else>
                Jev 建议人工确认
                <template v-if="item.jev.riskPercent != null">
                  · 风险 {{ item.jev.riskPercent }}%
                </template>
                <template v-if="item.jev.intentPercent != null">
                  · 意图 {{ item.jev.intentPercent }}%
                </template>
              </template>
            </div>
            <div v-if="item.jev?.reason" class="approval-item-jev-reason">
              {{ item.jev.reason }}
            </div>
          </div>
          <div class="approval-item-actions">
            <button
              type="button"
              class="approval-approve"
              data-testid="task-approval-approve"
              @click="approveTaskApproval(item.id)"
            >
              允许
            </button>
            <button
              type="button"
              class="approval-reject"
              data-testid="task-approval-reject"
              @click="rejectTaskApproval(item.id)"
            >
              拒绝
            </button>
          </div>
        </div>

        <ul v-if="settledApprovals.length > 0" class="approval-history">
          <li
            v-for="record in settledApprovals"
            :key="record.requestId"
            class="approval-history-item"
            data-testid="task-approval-record"
          >
            <span
              class="approval-history-dot"
              :class="
                record.decision === 'approved'
                  ? 'is-approved'
                  : 'is-rejected'
              "
            />
            <span class="approval-history-tool">
              {{ record.toolName || record.methodName }}
            </span>
            <span class="approval-history-origin">
              {{ approvalOriginLabel(record.origin) }}
            </span>
            <span v-if="record.jevAction" class="approval-history-jev">
              JEV {{ record.jevAction }}
            </span>
            <span v-if="approvalRiskText(record)" class="approval-history-risk">
              {{ approvalRiskText(record) }}
            </span>
          </li>
        </ul>
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

.peek-child-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-color);
  background-color: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  transition: background-color 0.2s;
}

.peek-child-button:hover:not(:disabled) {
  background-color: var(--fill-color);
}

.peek-child-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.peek-child-button.action-btn-active {
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 16%, transparent);
  border-color: var(--primary-color);
}

.append-task-button,
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

.append-task-button {
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-color: var(--primary-color);
}

.append-task-button:hover {
  background-color: color-mix(in srgb, var(--primary-color) 16%, transparent);
}

.cancel-task-button:hover {
  background-color: color-mix(in srgb, var(--danger-color) 16%, transparent);
}

.append-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
}

.append-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.append-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 72px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.append-textarea:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.append-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--text-color-light);
}

.append-submit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 0;
  border-radius: 6px;
  background-color: var(--primary-color);
  color: var(--button-text-color, white);
  cursor: pointer;
  white-space: nowrap;
}

.append-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* ---------- 工具审批 ---------- */
.approval-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  border: var(--border-width) solid
    color-mix(in srgb, var(--warning-color) 50%, var(--border-color));
  background-color: color-mix(in srgb, var(--warning-color) 8%, var(--card-bg));
}

.approval-item + .approval-item {
  margin-top: 6px;
}

.approval-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.approval-item-tool {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-item-desc {
  font-size: 11px;
  color: var(--text-color-light);
  font-family: var(--font-mono, monospace);
}

.approval-item-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.approval-item-error {
  font-size: 11px;
  color: var(--danger-color);
  word-break: break-word;
}

.approval-item-args {
  font-size: 11px;
  color: var(--text-color-light);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.approval-item-jev {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--warning-color);
  background-color: color-mix(in srgb, var(--warning-color) 14%, transparent);
}

.approval-item-jev.is-degraded {
  color: var(--info-color);
  background-color: color-mix(in srgb, var(--info-color) 14%, transparent);
}

.approval-item-jev-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.approval-item-jev-reason {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color-light);
  word-break: break-word;
}

.approval-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.approval-approve,
.approval-reject {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

.approval-approve {
  color: var(--success-color);
  background-color: color-mix(in srgb, var(--success-color) 10%, transparent);
  border-color: var(--success-color);
}

.approval-approve:hover {
  background-color: color-mix(in srgb, var(--success-color) 20%, transparent);
}

.approval-reject {
  color: var(--danger-color);
  background-color: color-mix(in srgb, var(--danger-color) 10%, transparent);
  border-color: var(--danger-color);
}

.approval-reject:hover {
  background-color: color-mix(in srgb, var(--danger-color) 20%, transparent);
}

.approval-history {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.approval-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px;
  font-size: 12px;
  color: var(--text-color-light);
}

.approval-history-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: var(--info-color);
}

.approval-history-dot.is-approved {
  background-color: var(--success-color);
}

.approval-history-dot.is-rejected {
  background-color: var(--danger-color);
}

.approval-history-tool {
  color: var(--text-color);
  font-weight: 500;
}

.approval-history-jev,
.approval-history-risk {
  font-variant-numeric: tabular-nums;
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

.activity-dot.kind-approval_requested {
  background-color: var(--warning-color);
}

.activity-dot.kind-approval_resolved {
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
