<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed } from "vue";
import { CircleCheck, Clock3, TriangleAlert } from "lucide-vue-next";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const contributions = computed(() =>
  Object.entries(props.context.contributions)
);

function statusCopy(blockingScope: "none" | "module" | "application") {
  if (blockingScope === "none") return "已处理";
  if (blockingScope === "application") return "需要立即处理";
  return "可稍后处理";
}
</script>

<template>
  <div class="upgrade-actions">
    <article v-for="[id, item] in contributions" :key="id" class="action-row">
      <span class="status-icon" :data-scope="item.blockingScope">
        <CircleCheck v-if="item.blockingScope === 'none'" :size="17" />
        <TriangleAlert
          v-else-if="item.blockingScope === 'application'"
          :size="17"
        />
        <Clock3 v-else :size="17" />
      </span>
      <div class="action-copy">
        <strong>{{ item.title }}</strong>
        <p v-if="item.description">{{ item.description }}</p>
      </div>
      <span class="status-label" :data-scope="item.blockingScope">
        {{ statusCopy(item.blockingScope) }}
      </span>
    </article>
  </div>
</template>

<style scoped>
.upgrade-actions {
  display: grid;
  gap: 8px;
}

.action-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 12px 13px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}

.status-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color) 6%, transparent);
  color: var(--el-color-warning);
}

.status-icon[data-scope="none"] {
  color: var(--el-color-success);
}

.status-icon[data-scope="application"] {
  color: var(--el-color-danger);
}

.action-copy {
  min-width: 0;
}

.action-copy strong {
  color: var(--text-color);
  font-size: 13px;
}

.action-copy p {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-label {
  color: var(--el-color-warning);
  font-size: 11px;
  white-space: nowrap;
}

.status-label[data-scope="none"] {
  color: var(--el-color-success);
}

.status-label[data-scope="application"] {
  color: var(--el-color-danger);
}
</style>
