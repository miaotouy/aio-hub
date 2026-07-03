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

<template>
  <div class="vcp-role-fence" :class="[roleClass, { 'is-pending': !closed }]">
    <div class="vcp-role-badge">
      <component :is="roleIcon" class="role-icon" :size="10" />
      <span class="role-name">{{ badgeLabel }}</span>
      <div v-if="!closed" class="pending-indicator">
        <Loader2 class="spinning" :size="10" />
      </div>
    </div>
    <div
      v-if="isToolSummary && summaryItems?.length"
      class="vcp-role-content tool-summary-content"
    >
      <div class="summary-chip-list" aria-label="本轮工具调用摘要">
        <div
          v-for="(item, index) in summaryItems"
          :key="`${item.label}-${index}`"
          class="summary-chip"
          :class="`summary-chip-${item.status}`"
          :title="item.label"
        >
          <span class="summary-chip-name">{{ item.toolName }}</span>
          <span class="summary-chip-status">{{ item.statusLabel }}</span>
        </div>
      </div>
    </div>
    <div v-else class="vcp-role-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  User,
  Bot,
  ShieldCheck,
  Loader2,
  ClipboardList,
} from "lucide-vue-next";

const props = defineProps<{
  nodeId: string;
  role: "user" | "assistant" | "system";
  variant?: "tool_summary";
  summaryItems?: Array<{
    label: string;
    toolName: string;
    status: "success" | "error" | "info";
    statusLabel: string;
  }>;
  closed: boolean;
}>();

const isToolSummary = computed(() => props.variant === "tool_summary");

const roleLabel = computed(() => {
  if (isToolSummary.value) return "本轮工具调用摘要";

  switch (props.role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    default:
      return props.role;
  }
});

const badgeLabel = computed(() =>
  isToolSummary.value ? roleLabel.value : `VCP ${roleLabel.value}`
);

const roleClass = computed(() =>
  isToolSummary.value ? "role-tool-summary" : `role-${props.role}`
);

const roleIcon = computed(() => {
  if (isToolSummary.value) return ClipboardList;

  switch (props.role) {
    case "user":
      return User;
    case "assistant":
      return Bot;
    case "system":
      return ShieldCheck;
    default:
      return Bot;
  }
});
</script>

<style scoped>
.vcp-role-fence {
  position: relative;
  margin: 12px 0;
  padding-left: 12px;
  border-radius: 8px;
  border-left: 2px solid rgba(var(--el-border-color-rgb, 128, 128, 128), 0.1);
  transition: all 0.2s ease;
}

.vcp-role-badge {
  position: absolute;
  left: 12px;
  top: 0px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  background: var(--bg-color);
  border: 1px solid transparent;
  border-radius: 4px;
  user-select: none;
  z-index: 1;
}

.role-icon {
  opacity: 0.7;
}

.role-name {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
}

.pending-indicator {
  display: flex;
  align-items: center;
  color: var(--el-color-primary);
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.vcp-role-content {
  padding-top: 16px;
  max-height: 1200px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 优化嵌套在 RoleNode 中的 ToolNode 间距 */
.vcp-role-content :deep(.vcp-tool-node) {
  margin-top: 8px;
  margin-bottom: 8px;
}

.vcp-role-content :deep(.vcp-tool-node:first-child) {
  margin-top: 4px;
}

.vcp-role-content :deep(.vcp-tool-node:last-child) {
  margin-bottom: 4px;
}

/* 角色特定样式 - 仅影响侧边条和徽标颜色 */
.role-user {
  border-left-color: rgba(var(--el-color-primary-rgb), 0.3);
}
.role-user .vcp-role-badge {
  color: var(--el-color-primary);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
}

.role-assistant {
  border-left-color: rgba(var(--el-color-success-rgb), 0.3);
}
.role-assistant .vcp-role-badge {
  color: var(--el-color-success);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
}

.role-system {
  border-left-color: rgba(var(--el-color-info-rgb), 0.3);
}
.role-system .vcp-role-badge {
  color: var(--el-color-info);
  border-color: rgba(var(--el-color-info-rgb), 0.2);
}

.role-tool-summary {
  border-left-color: rgba(var(--el-color-warning-rgb), 0.35);
}
.role-tool-summary .vcp-role-badge {
  color: var(--el-color-warning);
  border-color: rgba(var(--el-color-warning-rgb), 0.25);
}
.role-tool-summary .vcp-role-content {
  color: var(--el-text-color-secondary);
}

.tool-summary-content {
  padding-top: 22px;
}

.summary-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 0 2px;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  border: 1px solid rgba(var(--el-border-color-rgb, 128, 128, 128), 0.18);
  border-radius: 999px;
  background: rgba(var(--el-fill-color-rgb, 255, 255, 255), 0.05);
  color: var(--el-text-color-primary);
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.summary-chip-name {
  padding: 5px 10px 5px 12px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-chip-status {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  border-left: 1px solid currentColor;
}

.summary-chip-success {
  border-color: rgba(var(--el-color-success-rgb), 0.35);
  background: rgba(var(--el-color-success-rgb), 0.08);
}
.summary-chip-success .summary-chip-status {
  color: var(--el-color-success);
  background: rgba(var(--el-color-success-rgb), 0.12);
}

.summary-chip-error {
  border-color: rgba(var(--el-color-danger-rgb), 0.4);
  background: rgba(var(--el-color-danger-rgb), 0.08);
}
.summary-chip-error .summary-chip-status {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.12);
}

.summary-chip-info {
  border-color: rgba(var(--el-color-info-rgb), 0.35);
  background: rgba(var(--el-color-info-rgb), 0.08);
}
.summary-chip-info .summary-chip-status {
  color: var(--el-color-info);
  background: rgba(var(--el-color-info-rgb), 0.12);
}

.is-pending {
  border-left-style: dashed;
}
</style>
