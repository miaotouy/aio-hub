<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { CircleCheckFilled } from "@element-plus/icons-vue";
import { ChevronDown, Info, Play } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";
import MigrationBackupStep from "./MigrationBackupStep.vue";
import MigrationDiscoveryStep from "./MigrationDiscoveryStep.vue";
import MigrationPreviewStep from "./MigrationPreviewStep.vue";

const props = defineProps<{
  context: UpgradeFlowContext;
  busy?: boolean;
  canStart?: boolean;
  startLabel?: string;
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();

const emit = defineEmits<{
  start: [];
}>();

const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const expandedDetails = ref<string[]>([]);
const requiresConfirmation = computed(
  () => snapshot.value.preview.mainStatus !== "completed"
);
</script>

<template>
  <div class="migration-plan" data-testid="migration-plan">
    <MigrationDiscoveryStep :context="context" />

    <el-collapse v-model="expandedDetails" class="detail-collapse">
      <el-collapse-item name="details">
        <template #title>
          <div class="detail-title">
            <Info :size="16" />
            <span>查看数据迁移详情与兼容性说明</span>
            <small>保留、重建及不兼容项</small>
            <ChevronDown :size="16" class="detail-arrow" />
          </div>
        </template>
        <MigrationPreviewStep :context="context" />
      </el-collapse-item>
    </el-collapse>

    <MigrationBackupStep
      v-if="requiresConfirmation"
      :context="context"
      :update-context="updateContext"
    />

    <div v-else class="completed-note">
      <CircleCheckFilled />
      <span>
        <strong>此来源的主数据已经迁移</strong>
        <small>无需再次确认写入，可以直接查看已保存的校验报告。</small>
      </span>
    </div>

    <div v-if="requiresConfirmation" class="start-action">
      <el-button
        data-testid="migration-start"
        type="primary"
        :disabled="!props.canStart || props.busy"
        @click="emit('start')"
      >
        <Play :size="15" />
        {{ props.startLabel ?? "开始迁移" }}
      </el-button>
      <small v-if="!props.canStart" class="start-hint">
        请先确认已备份旧数据并同意开始迁移。
      </small>
    </div>
  </div>
</template>

<style scoped>
.migration-plan {
  display: grid;
  gap: 12px;
}

.detail-collapse :deep(.el-collapse) {
  border: 0;
}

.detail-collapse :deep(.el-collapse-item) {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}

.detail-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 0;
  background: transparent;
  line-height: normal;
}

.detail-collapse :deep(.el-collapse-item__arrow) {
  display: none;
}

.detail-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}

.detail-collapse :deep(.el-collapse-item__content) {
  padding: 0 12px 12px;
}

.detail-title {
  display: grid;
  width: 100%;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: var(--text-color);
  font-size: 12px;
  text-align: left;
}

.detail-title > svg:first-child {
  color: var(--primary-color);
}

.detail-title small {
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 11px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-arrow {
  color: var(--text-color-secondary);
  transition: transform 160ms ease;
}

.detail-collapse
  :deep(.el-collapse-item.is-active)
  .detail-title
  .detail-arrow {
  transform: rotate(180deg);
}

.completed-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--el-color-success) 8%, transparent);
  color: var(--el-color-success);
}

.completed-note > span {
  display: grid;
  gap: 3px;
}

.completed-note strong {
  color: var(--text-color);
  font-size: 12px;
}

.completed-note small {
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.start-action {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}

.start-hint {
  color: var(--text-color-secondary);
  font-size: 11px;
}

@media (max-width: 520px) {
  .detail-title {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .detail-title small {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .detail-arrow {
    transition: none;
  }
}
</style>
