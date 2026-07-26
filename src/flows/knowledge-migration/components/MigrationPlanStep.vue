<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->
<script setup lang="ts">
import { computed } from "vue";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";
import MigrationBackupStep from "./MigrationBackupStep.vue";
import MigrationDiscoveryStep from "./MigrationDiscoveryStep.vue";
import MigrationPreviewStep from "./MigrationPreviewStep.vue";

const props = defineProps<{
  context: UpgradeFlowContext;
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();

const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const requiresConfirmation = computed(
  () => snapshot.value.preview.mainStatus !== "completed"
);
</script>

<template>
  <div class="migration-plan" data-testid="migration-plan">
    <MigrationDiscoveryStep :context="context" />

    <section class="plan-section">
      <h3>数据处理方案</h3>
      <MigrationPreviewStep :context="context" />
    </section>

    <section v-if="requiresConfirmation" class="plan-section confirmation">
      <h3>执行前确认</h3>
      <MigrationBackupStep :context="context" :update-context="updateContext" />
    </section>

    <el-alert
      v-else
      :closable="false"
      type="success"
      show-icon
      title="此来源的主数据迁移已经完成"
      description="无需再次确认写入；下一步会展示已保存的校验报告。"
    />
  </div>
</template>

<style scoped>
.migration-plan {
  display: grid;
  gap: 22px;
}

.plan-section {
  display: grid;
  gap: 14px;
  border-top: 1px solid var(--border-color);
  padding-top: 18px;
}

.plan-section > h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.plan-section.confirmation {
  border-top-color: color-mix(
    in srgb,
    var(--el-color-warning) 35%,
    var(--border-color)
  );
}
</style>
