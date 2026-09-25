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

<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import { ElMessageBox } from "element-plus";
import {
  Ban,
  ChevronRight,
  ExternalLink,
  PanelRight,
  PictureInPicture2,
  MessageSquarePlus,
  Send,
} from "lucide-vue-next";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import {
  backgroundTaskRegistry,
  type BackgroundTaskActivity,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import { toolRegistryManager } from "@/services/registry";
import type SubAgentRegistry from "../sub-agent.registry";
import Avatar from "@/components/common/Avatar.vue";
import { customMessage } from "@/utils/customMessage";
import { formatRelativeTime } from "@/utils/time";
import { createModuleLogger } from "@/utils/logger";
import {
  useCompanionSession,
  type CompanionSessionMode,
} from "../composables/useCompanionSession";
import {
  getActivityActorName,
  getOriginDisplayName,
  getTaskStatePresentation,
  getTaskSummary,
  isActiveTaskState,
} from "./backgroundTaskPresentation";

const logger = createModuleLogger("background-task-dispatch-link");

const props = defineProps<{
  message: ChatMessageNode;
  screenshotMode?: boolean;
}>();
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
const { isOpen, targetTaskId, mode, toggleCompanion } = useCompanionSession();

/** 透视：同一任务、同一形态再次点击会收起，切换任务时保持当前形态。 */
function handlePeek(
  task: BackgroundTaskSnapshot,
  requestedMode: CompanionSessionMode
): void {
  toggleCompanion({
    taskId: task.taskId,
    childSessionId: task.childSessionId,
    mode: requestedMode,
  });
}

function isPeekActive(
  task: BackgroundTaskSnapshot,
  requestedMode: CompanionSessionMode
): boolean {
  return (
    isOpen.value &&
    targetTaskId.value === task.taskId &&
    mode.value === requestedMode
  );
}

// 只接受工具执行器写入的结构化关系；消息正文中出现的 ID 不作为跳转依据。
const links = computed(() => {
  const calls =
    props.message.metadata?.toolCalls ??
    (props.message.metadata?.toolCall ? [props.message.metadata.toolCall] : []);
  const unique = new Map<string, string>();
  for (const call of calls) {
    const link = call.resultMetadata?.backgroundTask;
    if (!link || typeof link !== "object") continue;
    const candidate = link as Record<string, unknown>;
    if (
      typeof candidate.taskId === "string" &&
      typeof candidate.childSessionId === "string"
    ) {
      unique.set(candidate.taskId, candidate.childSessionId);
    }
  }
  return unique;
});

const tasks = shallowRef<BackgroundTaskSnapshot[]>([]);
function refresh(): void {
  tasks.value = [...links.value]
    .map(([taskId]) => backgroundTaskRegistry.getSnapshot(taskId))
    .filter(
      (task): task is BackgroundTaskSnapshot =>
        !!task && links.value.get(task.taskId) === task.childSessionId
    );
}

let unsubscribe: (() => void) | undefined;
let mounted = false;
function subscribeIfLinked(): void {
  if (!mounted || links.value.size === 0 || unsubscribe) return;
  unsubscribe = backgroundTaskRegistry.subscribe(refresh);
  void backgroundTaskRegistry.loadFromPersistence().then(refresh);
}
onMounted(() => {
  mounted = true;
  refresh();
  subscribeIfLinked();
});
onUnmounted(() => {
  mounted = false;
  unsubscribe?.();
});
watch(links, () => {
  refresh();
  subscribeIfLinked();
});

function callerAvatarSrc(task: BackgroundTaskSnapshot): string | null {
  const agent =
    task.callerAgent.actorId && task.callerAgent.kind === "agent"
      ? agentStore.getAgentById(task.callerAgent.actorId)
      : undefined;
  return resolveAgentAvatarPath(agent);
}

function avatarSrc(task: BackgroundTaskSnapshot): string | null {
  const agent = task.targetAgent.actorId
    ? agentStore.getAgentById(task.targetAgent.actorId)
    : undefined;
  return resolveAgentAvatarPath(agent);
}

async function openChild(task: BackgroundTaskSnapshot): Promise<void> {
  try {
    await chatStore.switchSession(task.childSessionId);
  } catch {
    customMessage.error("打开子会话失败，请从任务中心重试");
  }
}

/** 活动流水倒序：最新在上，与任务中心详情保持一致 */
function recentActivities(
  task: BackgroundTaskSnapshot
): BackgroundTaskActivity[] {
  return [...task.recentActivity].reverse();
}

function hasActivity(task: BackgroundTaskSnapshot): boolean {
  return task.recentActivity.length > 0;
}

/** 单行 Ticker 展示最近一条活动摘要；无活动时回落到状态摘要 */
function tickerSummary(task: BackgroundTaskSnapshot): string {
  const latest = task.recentActivity[task.recentActivity.length - 1];
  const summary = latest?.summary?.trim();
  return summary || getTaskSummary(task);
}

const expandedTaskIds = ref<Set<string>>(new Set());

function isTickerOpen(taskId: string): boolean {
  return expandedTaskIds.value.has(taskId);
}

function toggleTicker(taskId: string): void {
  const next = new Set(expandedTaskIds.value);
  if (next.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
  }
  expandedTaskIds.value = next;
}

const whisperDrafts = reactive<Record<string, string>>({});
const whisperOpenTaskId = ref<string | null>(null);
const whisperSendingTaskId = ref<string | null>(null);

function toggleWhisper(taskId: string): void {
  if (whisperOpenTaskId.value === taskId) {
    whisperOpenTaskId.value = null;
    return;
  }
  if (!(taskId in whisperDrafts)) {
    whisperDrafts[taskId] = "";
  }
  whisperOpenTaskId.value = taskId;
}

/**
 * 叫停后台任务：二次确认后调用 registry.cancelTask。
 *
 * 与任务中心一致——任务进入终态时 registry 幂等返回 false，这里给中性提示。
 */
async function handleHalt(task: BackgroundTaskSnapshot): Promise<void> {
  if (!isActiveTaskState(task.state)) return;

  try {
    await ElMessageBox.confirm(
      `确定要叫停「${getOriginDisplayName(task.targetAgent)}」的后台任务吗？叫停后子会话的生成会被立即中止。`,
      "叫停后台任务",
      {
        type: "warning",
        confirmButtonText: "叫停任务",
        cancelButtonText: "保留任务",
        lockScroll: false,
      }
    );
  } catch {
    // 用户放弃叫停
    return;
  }

  const cancelled = backgroundTaskRegistry.cancelTask(
    task.taskId,
    "用户从派遣卡片取消"
  );

  if (cancelled) {
    logger.info("用户从派遣卡片叫停了后台任务", { taskId: task.taskId });
    customMessage.success("已叫停后台任务");
  } else {
    customMessage.warning("任务已结束，无需叫停");
  }
}

/**
 * 插话 Whisper：append-only 追加到子会话，不触发下一轮生成。
 */
async function sendWhisper(task: BackgroundTaskSnapshot): Promise<void> {
  const message = (whisperDrafts[task.taskId] ?? "").trim();
  if (
    !isActiveTaskState(task.state) ||
    !message ||
    whisperSendingTaskId.value
  ) {
    return;
  }

  whisperSendingTaskId.value = task.taskId;
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
    whisperDrafts[task.taskId] = "";
    whisperOpenTaskId.value = null;
    customMessage.success("已追加到子会话，可在后续对话中查看");
  } catch (error) {
    logger.warn("从派遣卡片向子会话追加指导失败", {
      taskId: task.taskId,
      error,
    });
    customMessage.error(
      error instanceof Error ? error.message : "追加失败，请打开子会话后重试"
    );
  } finally {
    whisperSendingTaskId.value = null;
  }
}
</script>

<template>
  <div v-if="tasks.length" class="dispatch-links" @click.stop>
    <div v-for="task in tasks" :key="task.taskId" class="dispatch-link">
      <Avatar
        :src="avatarSrc(task) || ''"
        :alt="getOriginDisplayName(task.targetAgent)"
        :size="32"
        shape="square"
        :radius="6"
      />
      <div class="dispatch-info">
        <div class="dispatch-heading">
          <Avatar
            :src="callerAvatarSrc(task) || ''"
            :alt="getOriginDisplayName(task.callerAgent)"
            :size="18"
            shape="circle"
          />
          <span>{{ getOriginDisplayName(task.callerAgent) }}</span>
          <span class="dispatch-arrow">→</span>
          <strong>{{ getOriginDisplayName(task.targetAgent) }}</strong>
          <span
            class="dispatch-state"
            :class="{ 'dispatch-state-active': isActiveTaskState(task.state) }"
          >
            <span
              v-if="isActiveTaskState(task.state)"
              class="dispatch-state-dot"
            />
            {{ getTaskStatePresentation(task.state).label }}
          </span>
        </div>
        <div class="dispatch-summary">{{ getTaskSummary(task) }}</div>

        <!-- 活动 Ticker：单行摘要，点击向下展开微抽屉时间轴 -->
        <button
          v-if="hasActivity(task)"
          type="button"
          class="dispatch-ticker"
          :class="{ 'is-open': isTickerOpen(task.taskId) }"
          :aria-expanded="isTickerOpen(task.taskId)"
          :title="tickerSummary(task)"
          @click="toggleTicker(task.taskId)"
        >
          <ChevronRight :size="12" class="dispatch-ticker-caret" />
          <span class="dispatch-ticker-text">{{ tickerSummary(task) }}</span>
        </button>
        <div v-else class="dispatch-ticker is-static">
          <span class="dispatch-ticker-text">{{ tickerSummary(task) }}</span>
        </div>
        <div
          v-if="hasActivity(task)"
          class="dispatch-drawer"
          :class="{ 'is-open': isTickerOpen(task.taskId) }"
        >
          <ol class="dispatch-drawer-inner">
            <li
              v-for="activity in recentActivities(task)"
              :key="activity.id"
              class="dispatch-activity"
            >
              <span class="dispatch-activity-dot" />
              <span class="dispatch-activity-summary">{{
                activity.summary
              }}</span>
              <span class="dispatch-activity-meta">
                {{ getActivityActorName(activity.actor) }} ·
                {{ formatRelativeTime(activity.timestamp) }}
              </span>
            </li>
          </ol>
        </div>

        <!-- 卡片内控制：透视（只读） / 叫停 / 插话（仅活动态开放后两者） -->
        <div v-if="!screenshotMode" class="dispatch-actions">
          <button
            type="button"
            class="dispatch-action dispatch-peek"
            :class="{ 'action-btn-active': isPeekActive(task, 'sheet') }"
            title="在右侧只读伴生栏中透视子会话"
            @click="handlePeek(task, 'sheet')"
          >
            <PanelRight :size="12" />
            <span>侧栏透视</span>
          </button>
          <button
            type="button"
            class="dispatch-action dispatch-peek"
            :class="{ 'action-btn-active': isPeekActive(task, 'pip') }"
            title="在悬浮只读窗口中透视子会话"
            @click="handlePeek(task, 'pip')"
          >
            <PictureInPicture2 :size="12" />
            <span>悬浮透视</span>
          </button>
          <button
            v-if="isActiveTaskState(task.state)"
            type="button"
            class="dispatch-action dispatch-halt"
            title="叫停该后台任务并中止子会话生成"
            @click="handleHalt(task)"
          >
            <Ban :size="12" />
            <span>叫停</span>
          </button>
          <button
            v-if="isActiveTaskState(task.state)"
            type="button"
            class="dispatch-action dispatch-whisper-toggle"
            :aria-expanded="whisperOpenTaskId === task.taskId"
            title="向子会话追加指导（仅追加，不触发下一轮）"
            @click="toggleWhisper(task.taskId)"
          >
            <MessageSquarePlus :size="12" />
            <span>插话</span>
          </button>
        </div>
        <div
          v-if="
            !screenshotMode &&
            isActiveTaskState(task.state) &&
            whisperOpenTaskId === task.taskId
          "
          class="dispatch-whisper"
        >
          <textarea
            v-model="whisperDrafts[task.taskId]"
            class="dispatch-whisper-input"
            rows="2"
            placeholder="写下要追加给子智能体的内容…"
            :disabled="whisperSendingTaskId === task.taskId"
            @keydown.ctrl.enter.prevent="sendWhisper(task)"
          />
          <div class="dispatch-whisper-footer">
            <span>追加到子会话供后续查看 · Ctrl+Enter 发送，回车换行</span>
            <button
              type="button"
              class="dispatch-whisper-send"
              :disabled="
                !(whisperDrafts[task.taskId] ?? '').trim() ||
                whisperSendingTaskId === task.taskId
              "
              @click="sendWhisper(task)"
            >
              <Send :size="12" />
              <span>{{
                whisperSendingTaskId === task.taskId ? "发送中…" : "发送"
              }}</span>
            </button>
          </div>
        </div>
      </div>
      <button
        v-if="!screenshotMode"
        type="button"
        class="dispatch-open"
        @click="openChild(task)"
      >
        <ExternalLink :size="14" />
        <span>打开子会话</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dispatch-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dispatch-link {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
}

.dispatch-info {
  flex: 1;
  min-width: 0;
}

.dispatch-heading {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-color);
}

.dispatch-heading strong,
.dispatch-heading > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dispatch-arrow {
  color: var(--text-color-light);
}

.dispatch-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 4px;
  color: var(--primary-color);
}

/* 呼吸圆点：定宽尺寸 + transform/opacity，避免聊天列表 reflow */
.dispatch-state-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: currentColor;
}

.dispatch-state-active .dispatch-state-dot {
  animation: dispatch-state-pulse 1.4s ease-in-out infinite;
}

@keyframes dispatch-state-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dispatch-state-active .dispatch-state-dot {
    animation: none;
  }
}

.dispatch-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-color-light);
}

.dispatch-open {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  margin-top: 1px;
  gap: 5px;
  flex-shrink: 0;
  padding: 5px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
}

.dispatch-open:hover {
  background-color: color-mix(
    in srgb,
    var(--primary-color) 12%,
    var(--container-bg)
  );
}

/* ---------- 活动 Ticker 与微抽屉 ---------- */
.dispatch-ticker {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-color-light);
  text-align: left;
  cursor: pointer;
}

.dispatch-ticker.is-static {
  cursor: default;
}

.dispatch-ticker:not(.is-static):hover {
  background-color: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.dispatch-ticker-caret {
  flex-shrink: 0;
  color: var(--primary-color);
  transition: transform 0.18s ease;
}

.dispatch-ticker.is-open .dispatch-ticker-caret {
  transform: rotate(90deg);
}

.dispatch-ticker-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dispatch-drawer {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.22s ease,
    opacity 0.22s ease;
}

.dispatch-drawer.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.dispatch-drawer-inner {
  overflow: hidden;
  list-style: none;
  margin: 0;
  padding: 0;
}

.dispatch-activity {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color);
}

.dispatch-activity-dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--info-color);
}

.dispatch-activity-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dispatch-activity-meta {
  flex-shrink: 0;
  color: var(--text-color-light);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .dispatch-drawer,
  .dispatch-ticker-caret {
    transition: none;
  }
}

/* ---------- 卡片内控制 ---------- */
.dispatch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.dispatch-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid currentColor;
  background-color: transparent;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dispatch-halt {
  color: var(--danger-color);
}

.dispatch-halt:hover {
  background-color: color-mix(in srgb, var(--danger-color) 12%, transparent);
}

.dispatch-whisper-toggle {
  color: var(--primary-color);
}

.dispatch-whisper-toggle:hover {
  background-color: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.dispatch-peek {
  color: var(--text-color-secondary);
}

.dispatch-peek:hover {
  background-color: var(--fill-color);
}

.dispatch-action.action-btn-active {
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 16%, transparent);
  border-color: var(--primary-color);
}

.dispatch-whisper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding: 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
}

.dispatch-whisper-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 48px;
  padding: 6px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  color: var(--text-color);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
}

.dispatch-whisper-input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.dispatch-whisper-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-color-light);
}

.dispatch-whisper-send {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background-color: var(--primary-color);
  color: var(--button-text-color, white);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.dispatch-whisper-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
