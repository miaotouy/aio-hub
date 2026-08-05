<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed } from "vue";
import type { UpgradeFlowContext } from "../types";
import UpgradeActionsStep from "./UpgradeActionsStep.vue";
import UpgradeOverviewStep from "./UpgradeOverviewStep.vue";

const props = defineProps<{ context: UpgradeFlowContext }>();
const hasContributions = computed(
  () => Object.keys(props.context.contributions).length > 0
);
</script>

<template>
  <div
    class="upgrade-summary"
    :data-transition="context.transition"
    :data-current-version="context.currentVersion"
    :data-release-count="context.releaseVersions.length"
    :data-contribution-count="Object.keys(context.contributions).length"
  >
    <UpgradeOverviewStep :context="context" />

    <section v-if="hasContributions" class="summary-section">
      <div class="section-heading">
        <h3>待处理事项</h3>
        <span>后续步骤会逐项处理</span>
      </div>
      <UpgradeActionsStep :context="context" />
    </section>
  </div>
</template>

<style scoped>
.upgrade-summary {
  display: grid;
  gap: 18px;
}

.summary-section {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 650;
}

.section-heading span {
  color: var(--text-color-secondary);
  font-size: 11px;
}
</style>
