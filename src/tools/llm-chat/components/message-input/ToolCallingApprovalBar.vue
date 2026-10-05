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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Play,
  X,
  ShieldCheck,
  Terminal,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Volume2,
  VolumeX,
} from "lucide-vue-next";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { execute } from "@/services/executor";
import { describeArbitration } from "@/services/decision-arbiter";

const toolCallingStore = useToolCallingStore();
const llmChatStore = useLlmChatStore();

/**
 * 本次消息的静默执行开关 (单次状态)
 */
const isSilent = ref(false);
const countdownNow = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  countdownTimer = setInterval(() => {
    countdownNow.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

function formatApprovalWait(expiresAt: number | null): string {
  if (expiresAt === null) return "等待人工审批 · 不会自动超时";
  const seconds = Math.max(
    0,
    Math.ceil((expiresAt - countdownNow.value) / 1000)
  );
  return seconds > 0 ? `剩余 ${seconds} 秒 · 超时将自动拒绝` : "正在超时拒绝";
}

const currentSessionPendingRequests = computed(() => {
  return toolCallingStore.pendingRequests.filter(
    (r) => r.sessionId === llmChatStore.currentSessionId || !!r.externalId
  );
});

// ----- JEV 仲裁建议展示（§3.1：仅 escalate 后出现，默认折叠） -----
const expandedArbiterIds = ref<Set<string>>(new Set());

/**
 * 审批浮窗只展示 JEV 来源的仲裁建议；展示判定统一由 describeArbitration 产出，
 * 与消息卡片保持同一套 action 语义（escalate 不得被当作 approve）。
 */
function getPresentation(requestId: string) {
  const presentation = describeArbitration(
    toolCallingStore.getAuditRecord?.(requestId)
  );
  return presentation?.kind === "jev" ? presentation : null;
}

function toggleArbiterDetail(requestId: string): void {
  if (expandedArbiterIds.value.has(requestId)) {
    expandedArbiterIds.value.delete(requestId);
  } else {
    expandedArbiterIds.value.add(requestId);
  }
}

// 当有新的请求进入时，尝试同步节点的静默状态到 UI
watch(
  () => currentSessionPendingRequests.value[0]?.request.requestId,
  () => {
    const detail = llmChatStore.currentSessionDetail;
    if (!detail?.nodes) return;

    // 查找当前正在等待审批的工具节点
    const pendingNode = Object.values(detail.nodes).find(
      (node) =>
        node.role === "tool" &&
        node.status === "generating" &&
        node.metadata?.toolCalls?.some(
          (tc) => tc.status === "awaiting_approval"
        )
    );

    if (pendingNode?.metadata?.isSilent !== undefined) {
      isSilent.value = !!pendingNode.metadata.isSilent;
    } else {
      isSilent.value = false;
    }
  },
  { immediate: true }
);

// 监听静默开关，同步到相关的工具节点元数据中
watch(isSilent, (val) => {
  const sessionId = llmChatStore.currentSessionId;
  const detail = llmChatStore.currentSessionDetail;
  if (!sessionId || !detail || !detail.nodes) return;

  // 找到当前正在等待审批的工具节点 (通常是活动路径上的最后一个 role: 'tool' 节点)
  const pendingNodeId =
    currentSessionPendingRequests.value[0]?.request.requestId;
  if (!pendingNodeId) return;

  // 遍历节点找到对应的工具消息节点
  Object.values(detail.nodes).forEach((node) => {
    if (
      node.role === "tool" &&
      node.status === "generating" &&
      node.metadata?.toolCalls?.some((tc) => tc.status === "awaiting_approval")
    ) {
      if (!node.metadata) node.metadata = {};
      node.metadata.isSilent = val || undefined;
    }
  });
});

const hasRequests = computed(
  () => currentSessionPendingRequests.value.length > 0
);

const hasExternalRequests = computed(() =>
  currentSessionPendingRequests.value.some((r) => !!r.externalId)
);
const hasLocalRequests = computed(() =>
  currentSessionPendingRequests.value.some((r) => !r.externalId)
);

const handleApprove = (id: string) => {
  execute({
    service: "tool-calling",
    method: "approveRequest",
    params: { requestId: id },
  });
};

const handleReject = (id: string) => {
  execute({
    service: "tool-calling",
    method: "rejectRequest",
    params: { requestId: id },
  });
};

/**
 * 全部允许 / 全部拒绝
 *
 * 基于 UI 当前可见的请求列表（currentSessionPendingRequests），
 * 同时覆盖本地会话请求和 VCP 等外部广播过来的请求。
 *
 * 不能用 approveAll(sessionId)：外部请求的 sessionId 是 `vcp-${maid}`，
 * 跟当前 llm-chat sessionId 不一致，会被精确匹配漏掉。
 */
const handleApproveAll = () => {
  const ids = currentSessionPendingRequests.value.map((r) => r.id);
  if (ids.length === 0) return;
  execute({
    service: "tool-calling",
    method: "approveByIds",
    params: { ids },
  });
};

const handleRejectAll = () => {
  const ids = currentSessionPendingRequests.value.map((r) => r.id);
  if (ids.length === 0) return;
  execute({
    service: "tool-calling",
    method: "rejectByIds",
    params: { ids },
  });
};
</script>

<template>
  <transition name="slide-up">
    <div v-if="hasRequests" class="tool-approval-bar">
      <div class="bar-header">
        <div class="header-left">
          <ShieldCheck :size="16" class="security-icon" />
          <span class="header-title">工具调用申请</span>
          <span class="request-count"
            >{{ currentSessionPendingRequests.length }} 个待处理</span
          >
        </div>
        <div class="header-actions">
          <el-button-group size="small">
            <el-button type="primary" plain @click="handleApproveAll">
              <template #icon><Play :size="14" /></template>
              全部允许
            </el-button>
            <el-button type="danger" plain @click="handleRejectAll">
              <template #icon><X :size="14" /></template>
              全部拒绝
            </el-button>
          </el-button-group>

          <div class="divider"></div>

          <el-tooltip
            :content="
              isSilent
                ? '静默模式：执行完后停止循环'
                : '常规模式：执行完后继续循环'
            "
            placement="top"
          >
            <el-button
              size="small"
              :type="isSilent ? 'warning' : 'info'"
              :plain="!isSilent"
              class="silent-toggle"
              @click="isSilent = !isSilent"
            >
              <template #icon>
                <component :is="isSilent ? VolumeX : Volume2" :size="14" />
              </template>
              {{ isSilent ? "静默执行" : "常规循环" }}
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div class="request-list">
        <div
          v-for="item in currentSessionPendingRequests"
          :key="item.id"
          class="request-item"
        >
          <div class="item-info">
            <div class="item-main">
              <div
                class="tool-tag"
                :class="{
                  'is-invalid': item.request.validation?.isValid === false,
                }"
              >
                <Terminal :size="12" />
                {{ item.request.methodDisplayName || item.request.toolName }}
                <AlertCircle
                  v-if="item.request.validation?.isValid === false"
                  :size="12"
                  class="error-icon"
                />
              </div>
              <!-- JEV 仲裁结果微标签（§3.1） -->
              <div
                v-if="getPresentation(item.request.requestId)"
                class="jev-badge"
                :class="{
                  'is-degraded': getPresentation(item.request.requestId)?.degraded,
                }"
              >
                <span class="jev-dot"></span>
                <template v-if="getPresentation(item.request.requestId)?.degraded">
                  Jev 离线 · 安全兜底
                </template>
                <template v-else>
                  Jev 建议: 需人工确认
                  <template
                    v-if="getPresentation(item.request.requestId)?.riskPercent != null"
                  >
                    · 风险 {{ getPresentation(item.request.requestId)?.riskPercent }}%
                  </template>
                  <template
                    v-if="getPresentation(item.request.requestId)?.intentPercent != null"
                  >
                    · 意图 {{ getPresentation(item.request.requestId)?.intentPercent }}%
                  </template>
                </template>
              </div>
              <div
                v-if="item.request.validation?.isValid === false"
                class="validation-error"
              >
                {{ item.request.validation.reason || "解析或验证错误" }}
              </div>
            </div>
            <div class="item-args" v-if="item.request.args">
              <ChevronRight :size="12" />
              <span class="args-preview">
                {{
                  Object.entries(item.request.args)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                }}
              </span>
            </div>
            <!-- 可折叠仲裁证据面板（§3.1） -->
            <button
              v-if="getPresentation(item.request.requestId)"
              class="arbiter-detail-toggle"
              @click.stop="toggleArbiterDetail(item.request.requestId)"
            >
              <component
                :is="
                  expandedArbiterIds.has(item.request.requestId)
                    ? ChevronDown
                    : ChevronRight
                "
                :size="11"
              />
              Jev 仲裁详情
              {{ getPresentation(item.request.requestId)?.model || "" }}
              <template
                v-if="getPresentation(item.request.requestId)?.durationMs != null"
              >
                · {{ getPresentation(item.request.requestId)?.durationMs }}ms
              </template>
              · System One
            </button>
            <div
              v-if="
                expandedArbiterIds.has(item.request.requestId) &&
                getPresentation(item.request.requestId)
              "
              class="arbiter-detail-panel"
            >
              <div class="arbiter-meter">
                <span class="meter-label">风险评估</span>
                <div class="meter-track">
                  <div
                    class="meter-fill risk"
                    :style="{
                      width: `${getPresentation(item.request.requestId)?.riskPercent ?? 0}%`,
                    }"
                  ></div>
                </div>
                <span class="meter-value"
                  >{{ getPresentation(item.request.requestId)?.riskPercent }}%</span
                >
              </div>
              <div class="arbiter-meter">
                <span class="meter-label">意图置信</span>
                <div class="meter-track">
                  <div
                    class="meter-fill intent"
                    :style="{
                      width: `${getPresentation(item.request.requestId)?.intentPercent ?? 0}%`,
                    }"
                  ></div>
                </div>
                <span class="meter-value"
                  >{{ getPresentation(item.request.requestId)?.intentPercent }}%</span
                >
              </div>
              <div
                v-if="getPresentation(item.request.requestId)?.reason"
                class="arbiter-reason"
              >
                裁决原因:
                {{ getPresentation(item.request.requestId)?.reason }}
              </div>
            </div>
            <div class="approval-countdown">
              {{ formatApprovalWait(item.expiresAt) }}
            </div>
          </div>
          <div class="item-actions">
            <el-tooltip
              v-if="item.request.validation?.isValid === false"
              content="该工具调用可能存在错误，是否仍要尝试执行？"
              placement="top"
            >
              <el-button
                size="small"
                circle
                type="warning"
                @click="handleApprove(item.id)"
              >
                <template #icon><Play :size="12" /></template>
              </el-button>
            </el-tooltip>
            <el-tooltip v-else content="允许" placement="top">
              <el-button
                size="small"
                circle
                type="primary"
                @click="handleApprove(item.id)"
              >
                <template #icon><Play :size="12" /></template>
              </el-button>
            </el-tooltip>

            <el-tooltip content="拒绝" placement="top">
              <el-button
                size="small"
                circle
                type="danger"
                @click="handleReject(item.id)"
              >
                <template #icon><X :size="12" /></template>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>

      <div class="bar-footer">
        <AlertCircle :size="12" />
        <span v-if="hasExternalRequests && hasLocalRequests">
          包含本地和远程工具调用请求，请确认安全后再允许。
        </span>
        <span v-else-if="hasExternalRequests">
          这些工具将在远程 VCP 节点执行，请确认安全后再允许。
        </span>
        <span v-else>
          这些工具将以你的身份在本地执行，请确认安全后再允许。
        </span>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.tool-approval-bar {
  margin: 0 8px 12px;
  padding: 14px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid rgba(var(--el-color-primary-rgb), 0.3);
  border-radius: 14px;
  box-shadow:
    0 8px 24px -4px rgba(0, 0, 0, 0.1),
    var(--el-box-shadow-light);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 100;
  position: relative;
  overflow: hidden;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  opacity: 0.5;
}

.silent-toggle {
  transition: all 0.3s ease;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.security-icon {
  color: var(--el-color-primary);
  filter: drop-shadow(0 0 4px rgba(var(--el-color-primary-rgb), 0.4));
}

.header-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-color-primary);
  letter-spacing: 0.5px;
}

.request-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  padding: 2px 10px;
  border-radius: 20px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.1);
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

/* 自定义滚动条 */
.request-list::-webkit-scrollbar {
  width: 4px;
}

.request-list::-webkit-scrollbar-track {
  background: transparent;
}

.request-list::-webkit-scrollbar-thumb {
  background: rgba(var(--el-text-color-secondary-rgb), 0.2);
  border-radius: 10px;
}

.request-list::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-text-color-secondary-rgb), 0.4);
}

.request-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(var(--el-fill-color-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 10px;
  border: var(--border-width) solid var(--border-color);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

/* 状态侧边条 */
.request-item::after {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--el-color-primary);
  opacity: 0.8;
}

.request-item:has(.is-invalid)::after {
  background: var(--el-color-danger);
}

.request-item:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.4);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
  transform: translateX(2px);
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tool-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--el-color-primary);
  white-space: nowrap;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 2px 8px;
  border-radius: 6px;
}

.tool-tag.is-invalid {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
}

.error-icon {
  color: var(--el-color-danger);
}

.validation-error {
  font-size: 11px;
  font-weight: 500;
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.1));
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(var(--el-color-danger-rgb), 0.2);
  display: inline-block;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-args {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-secondary);
  min-width: 0;
  flex: 1;
  opacity: 0.85;
}

.args-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono);
  background: rgba(var(--el-fill-color-rgb), 0.5);
  padding: 1px 4px;
  border-radius: 3px;
}

.approval-countdown {
  width: fit-content;
  font-size: 11px;
  color: var(--el-color-warning);
  font-variant-numeric: tabular-nums;
}

/* ----- JEV 仲裁建议（§3.1 视觉规范） ----- */
.jev-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-warning);
}

.jev-badge.is-degraded {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-info);
}

.jev-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.arbiter-detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: 11px;
  font-family: var(--font-family-mono);
  color: var(--text-color-secondary);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}

.arbiter-detail-toggle:hover {
  color: var(--el-color-primary);
}

.arbiter-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: rgba(var(--el-fill-color-rgb), calc(var(--card-opacity) * 0.2));
}

.arbiter-meter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meter-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  width: 52px;
  flex-shrink: 0;
}

.meter-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(var(--el-fill-color-rgb), 0.8);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.meter-fill.risk {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--el-color-warning) 70%, transparent),
    var(--el-color-danger)
  );
}

.meter-fill.intent {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--el-color-primary) 70%, transparent),
    var(--el-color-success)
  );
}

.meter-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-color-secondary);
  width: 36px;
  text-align: right;
}

.arbiter-reason {
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.item-actions {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

.bar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-color-secondary);
  background: rgba(var(--el-fill-color-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
