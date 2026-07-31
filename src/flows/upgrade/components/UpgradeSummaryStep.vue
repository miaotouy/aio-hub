<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->
<script setup lang="ts">
import { computed } from "vue";
import type { UpgradeFlowContext } from "../types";
import UpgradeActionsStep from "./UpgradeActionsStep.vue";
import UpgradeOverviewStep from "./UpgradeOverviewStep.vue";
import UpgradeReleaseNotesStep from "./UpgradeReleaseNotesStep.vue";

const props = defineProps<{ context: UpgradeFlowContext }>();

const hasReleaseNotes = computed(
  () => props.context.releaseVersions.length > 0
);
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

    <section v-if="hasReleaseNotes" class="summary-section">
      <h3 class="section-title">版本说明</h3>
      <UpgradeReleaseNotesStep :context="context" />
    </section>

    <section v-if="hasContributions" class="summary-section">
      <h3 class="section-title">待处理事项</h3>
      <UpgradeActionsStep :context="context" />
    </section>
  </div>
</template>

<style scoped>
.upgrade-summary {
  display: grid;
  gap: 24px;
}

.summary-section {
  display: grid;
  gap: 14px;
  min-width: 0;
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.section-title {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}
</style>
