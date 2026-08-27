<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->

<template>
  <div class="notification-settings-page">
    <!-- 顶部 Header -->
    <div class="settings-header">
      <div class="header-title">
        <Bell class="header-icon" :size="20" />
        <div>
          <h2>通知设置</h2>
          <p>控制 VCP 消息是否显示浮动提示、写入通知中心，或同时发送。</p>
        </div>
      </div>
      <el-button
        size="small"
        type="danger"
        plain
        @click="resetOverrides"
        :disabled="!hasOverrides"
      >
        <template #icon>
          <Trash2 :size="14" />
        </template>
        清除分类覆盖
      </el-button>
    </div>

    <!-- 主设置卡片 -->
    <div class="settings-card">
      <!-- 1. 全局总设置 -->
      <div class="global-settings-section">
        <div class="section-info">
          <div class="section-title-row">
            <span class="section-badge">默认</span>
            <h3>通知总设置</h3>
          </div>
          <p class="section-desc">未单独配置的消息类型将默认使用此设置</p>
        </div>
        <div class="global-control">
          <el-radio-group
            :model-value="store.config.notificationMode"
            size="small"
            @update:model-value="setGlobalMode"
          >
            <el-radio-button
              v-for="option in modeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 极简说明条 -->
      <div class="global-guide-bar">
        <span class="guide-label">选项说明：</span>
        <span class="guide-item"
          ><span class="guide-dot off"></span>关闭 (不发送)</span
        >
        <span class="guide-item"
          ><span class="guide-dot floating"></span>仅浮动 (即时气泡)</span
        >
        <span class="guide-item"
          ><span class="guide-dot center"></span>通知中心 (系统通知)</span
        >
        <span class="guide-item"
          ><span class="guide-dot both"></span>同时 (气泡+系统通知)</span
        >
      </div>

      <!-- 分割线 -->
      <div class="settings-divider"></div>

      <!-- 2. 按消息类型设置 -->
      <div class="type-settings-section">
        <div class="section-header">
          <h3>按消息类型设置</h3>
          <p class="section-desc">覆盖总设置后，该类型将使用专属的通知策略</p>
        </div>

        <div class="type-list">
          <div v-for="item in messageTypes" :key="item.value" class="type-row">
            <div class="type-info">
              <div
                class="type-icon-wrapper"
                :style="{
                  color: item.color,
                  backgroundColor: `color-mix(in srgb, ${item.color} 10%, transparent)`,
                }"
              >
                <component :is="item.icon" :size="16" />
              </div>
              <div class="type-text">
                <span class="type-label">{{ item.label }}</span>
                <span class="type-desc">{{ item.description }}</span>
              </div>
            </div>
            <div class="type-control">
              <span class="effective-mode">
                当前：<span
                  class="mode-tag"
                  :class="getEffectiveMode(item.value)"
                  >{{ modeLabel(getEffectiveMode(item.value)) }}</span
                >
              </span>
              <el-select
                :model-value="getSelectedMode(item.value)"
                size="small"
                style="width: 130px"
                :aria-label="`${item.label} 通知方式`"
                @update:model-value="setTypeMode(item.value, $event)"
              >
                <el-option
                  v-for="option in inheritModeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from "vue";
import { useVcpStore } from "../stores/vcpConnectorStore";
import type { VcpMessageType, VcpNotificationMode } from "../types/protocol";
import {
  Bell,
  Trash2,
  Database,
  GitBranch,
  Bot,
  Brain,
  Cpu,
  Terminal,
} from "lucide-vue-next";

type VcpMessageTypeWithoutUnknown = Exclude<VcpMessageType, "UNKNOWN">;
type SelectMode = VcpNotificationMode | "inherit";

const store = useVcpStore();

const modeOptions: Array<{
  value: VcpNotificationMode;
  label: string;
  description: string;
}> = [
  { value: "off", label: "关闭", description: "不显示也不写入通知中心" },
  { value: "floating", label: "仅浮动", description: "显示即时浮动提示" },
  { value: "center", label: "通知中心", description: "保存到通知中心" },
  { value: "both", label: "同时", description: "浮动提示和通知中心都发送" },
];

const inheritModeOptions = [
  { value: "inherit", label: "跟随总设置" },
  ...modeOptions,
] as Array<{ value: SelectMode; label: string }>;

const messageTypes: Array<{
  value: VcpMessageTypeWithoutUnknown;
  label: string;
  description: string;
  icon: any;
  color: string;
}> = [
  {
    value: "RAG_RETRIEVAL_DETAILS",
    label: "RAG",
    description: "向量检索详情",
    icon: markRaw(Database),
    color: "var(--el-color-primary)",
  },
  {
    value: "META_THINKING_CHAIN",
    label: "Chain",
    description: "元思考链过程",
    icon: markRaw(GitBranch),
    color: "var(--el-color-purple, #a855f7)",
  },
  {
    value: "AGENT_PRIVATE_CHAT_PREVIEW",
    label: "Agent",
    description: "Agent 私聊预览",
    icon: markRaw(Bot),
    color: "var(--el-color-warning)",
  },
  {
    value: "AI_MEMO_RETRIEVAL",
    label: "Memo",
    description: "AI 记忆回溯",
    icon: markRaw(Brain),
    color: "var(--el-color-success)",
  },
  {
    value: "PLUGIN_STEP_STATUS",
    label: "Plugin",
    description: "插件步骤状态",
    icon: markRaw(Cpu),
    color: "var(--el-text-color-regular)",
  },
  {
    value: "vcp_log",
    label: "Log",
    description: "运行日志和任务结果",
    icon: markRaw(Terminal),
    color: "var(--el-text-color-secondary)",
  },
];

const hasOverrides = computed(
  () => Object.keys(store.config.notificationModes ?? {}).length > 0
);

function setGlobalMode(mode: VcpNotificationMode) {
  store.updateConfig({ notificationMode: mode });
}

function getSelectedMode(type: VcpMessageTypeWithoutUnknown): SelectMode {
  return store.config.notificationModes?.[type] ?? "inherit";
}

function getEffectiveMode(
  type: VcpMessageTypeWithoutUnknown
): VcpNotificationMode {
  return (
    store.config.notificationModes?.[type] ?? store.config.notificationMode
  );
}

function setTypeMode(type: VcpMessageTypeWithoutUnknown, mode: SelectMode) {
  store.updateNotificationMode(type, mode === "inherit" ? undefined : mode);
}

function modeLabel(mode: VcpNotificationMode) {
  return modeOptions.find((option) => option.value === mode)?.label ?? mode;
}

function resetOverrides() {
  store.updateConfig({ notificationModes: {} });
}
</script>

<style scoped>
.notification-settings-page {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
  box-sizing: border-box;
  color: var(--el-text-color-primary);
}

/* Header 样式 */
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: var(--el-color-primary);
  opacity: 0.9;
}

.settings-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.settings-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 卡片容器 */
.settings-card {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 24px;
  padding: 20px;
  box-sizing: border-box;
}

/* 全局设置区域 */
.global-settings-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.section-info {
  flex: 1;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 15%,
    transparent
  );
  color: var(--el-color-primary);
}

.settings-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.section-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 极简说明条 */
.global-guide-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
  padding: 8px 12px;
  background-color: rgba(var(--el-text-color-primary-rgb), 0.02);
  border-radius: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.guide-label {
  font-weight: 500;
}

.guide-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.guide-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.guide-dot.off {
  background-color: var(--el-text-color-placeholder);
}
.guide-dot.floating {
  background-color: var(--el-color-warning);
}
.guide-dot.center {
  background-color: var(--el-color-primary);
}
.guide-dot.both {
  background-color: var(--el-color-success);
}

/* 分割线 */
.settings-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 20px 0;
}

/* 类型设置区域 */
.type-settings-section .section-header {
  margin-bottom: 16px;
}

.type-list {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 16px;
  background-color: rgba(var(--el-fill-color-blank-rgb), 0.2);
  border-bottom: var(--border-width) solid var(--border-color);
  transition: background-color 0.2s ease;
}

.type-row:hover {
  background-color: rgba(var(--el-text-color-primary-rgb), 0.02);
}

.type-row:last-child {
  border-bottom: none;
}

.type-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.type-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
}

.type-text {
  display: flex;
  flex-direction: column;
}

.type-label {
  font-size: 13px;
  font-weight: 600;
}

.type-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.type-control {
  display: flex;
  align-items: center;
  gap: 16px;
}

.effective-mode {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.mode-tag {
  font-weight: 500;
}

.mode-tag.off {
  color: var(--el-text-color-placeholder);
}
.mode-tag.floating {
  color: var(--el-color-warning);
}
.mode-tag.center {
  color: var(--el-color-primary);
}
.mode-tag.both {
  color: color-mix(in srgb, var(--el-color-success) 85%, black);
}

/* 响应式 */
@media (max-width: 760px) {
  .notification-settings-page {
    padding: 16px;
  }

  .settings-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .settings-header .el-button {
    align-self: flex-end;
  }

  .global-settings-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .global-control {
    width: 100%;
  }

  .global-control :deep(.el-radio-group) {
    width: 100%;
    display: flex;
  }

  .global-control :deep(.el-radio-button) {
    flex: 1;
  }

  .global-control :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 8px 0;
    text-align: center;
  }

  .type-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
  }

  .type-control {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
