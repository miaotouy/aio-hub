<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->
<script setup lang="ts">
import { computed } from "vue";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import {
  getKnowledgeMigrationSnapshot,
  isKnowledgeMigrationReportComplete,
} from "../types";
import MigrationExecuteStep from "./MigrationExecuteStep.vue";
import MigrationVerifyStep from "./MigrationVerifyStep.vue";

const props = defineProps<{ context: UpgradeFlowContext }>();
const report = computed(
  () => getKnowledgeMigrationSnapshot(props.context).report
);
const isComplete = computed(() =>
  isKnowledgeMigrationReportComplete(report.value)
);
</script>

<template>
  <div class="migration-result" data-testid="migration-result">
    <MigrationExecuteStep v-if="!report" :context="context" />

    <template v-else>
      <el-alert
        :closable="false"
        :type="isComplete ? 'success' : 'warning'"
        show-icon
        :title="isComplete ? '迁移与校验已完成' : '迁移仅部分完成'"
        description="下面是本次执行保存的结构化校验报告。"
      />
      <MigrationVerifyStep :context="context" />
    </template>
  </div>
</template>

<style scoped>
.migration-result {
  display: grid;
  gap: 16px;
}
</style>
