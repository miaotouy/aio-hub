<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, ListChecks } from "lucide-vue-next";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const contributionCount = computed(
  () => Object.keys(props.context.contributions).length
);
const transitionLabel = computed(() => {
  switch (props.context.transition) {
    case "upgrade":
      return props.context.previousLaunchedVersion
        ? `从 ${props.context.previousLaunchedVersion} 升级后检测`
        : "版本升级后检测";
    case "downgrade":
      return "当前版本检测";
    case "same-version":
      return "待处理事项恢复";
    default:
      return "首次数据检测";
  }
});
</script>

<template>
  <section class="upgrade-overview">
    <div class="version-mark" aria-hidden="true">
      <ListChecks :size="22" />
    </div>
    <div class="overview-copy">
      <span>{{ transitionLabel }}</span>
      <div class="version-line">
        <strong>v{{ context.currentVersion }}</strong>
        <template v-if="context.previousLaunchedVersion">
          <ArrowRight :size="16" />
          <small>当前</small>
        </template>
      </div>
      <p>
        检测到
        {{ contributionCount }}
        个需要确认或执行的升级事项。版本说明已移至消息中心和“设置 → 关于”。
      </p>
    </div>
  </section>
</template>

<style scoped>
.upgrade-overview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 24%, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-color) 7%, var(--card-bg));
}

.version-mark {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: var(--primary-color);
  color: var(--el-color-white);
  box-shadow: 0 8px 20px
    color-mix(in srgb, var(--primary-color) 20%, transparent);
}

.overview-copy {
  min-width: 0;
}

.overview-copy > span {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.version-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 2px 0 4px;
}

.version-line strong {
  color: var(--text-color);
  font-size: 22px;
  line-height: 1.25;
}

.version-line svg,
.version-line small {
  color: var(--primary-color);
}

.version-line small {
  font-size: 12px;
  font-weight: 600;
}

p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.55;
}
</style>
