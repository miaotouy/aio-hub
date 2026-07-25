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
import { computed } from "vue";
import { Calendar, CollectionTag, Warning } from "@element-plus/icons-vue";
import { releaseNotesRegistry } from "../releaseNotesRegistry";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();

const manifests = computed(() =>
  props.context.releaseVersions
    .map((version) => releaseNotesRegistry.get(version))
    .filter((manifest) => manifest !== undefined)
);
const contributionCount = computed(
  () => Object.keys(props.context.contributions).length
);
const transitionLabel = computed(() => {
  switch (props.context.transition) {
    case "upgrade":
      return props.context.previousLaunchedVersion
        ? `从 ${props.context.previousLaunchedVersion} 升级到 ${props.context.currentVersion}`
        : `已升级到 ${props.context.currentVersion}`;
    case "downgrade":
      return `当前运行版本 ${props.context.currentVersion}`;
    case "same-version":
      return `继续查看 ${props.context.currentVersion} 的升级信息`;
    default:
      return `首次记录当前版本 ${props.context.currentVersion}`;
  }
});
</script>

<template>
  <div class="upgrade-overview">
    <div class="hero-card">
      <span class="version-badge">v{{ context.currentVersion }}</span>
      <h3>{{ transitionLabel }}</h3>
      <p>
        本流程包含 {{ manifests.length }} 份本地版本说明<span
          v-if="contributionCount"
          >，以及 {{ contributionCount }} 个需要确认的升级事项</span
        >。
      </p>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <el-icon><Calendar /></el-icon>
        <div>
          <strong>本地可用</strong>
          <span>无需联网即可查看版本说明</span>
        </div>
      </div>
      <div class="summary-item">
        <el-icon><CollectionTag /></el-icon>
        <div>
          <strong>可恢复</strong>
          <span>稍后关闭会保留当前进度</span>
        </div>
      </div>
      <div v-if="contributionCount" class="summary-item warning">
        <el-icon><Warning /></el-icon>
        <div>
          <strong>包含升级事项</strong>
          <span>执行前会再次展示影响和确认信息</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upgrade-overview {
  display: grid;
  gap: 18px;
}

.hero-card {
  padding: 22px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 12%, transparent),
    color-mix(in srgb, var(--bg-color) 94%, transparent)
  );
}

.version-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  font-size: 12px;
  font-weight: 700;
}

h3 {
  margin: 14px 0 8px;
  color: var(--text-color);
  font-size: 22px;
}

p {
  margin: 0;
  color: var(--text-color-secondary);
  line-height: 1.7;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.summary-item {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
}

.summary-item .el-icon {
  margin-top: 2px;
  color: var(--el-color-primary);
  font-size: 20px;
}

.summary-item.warning .el-icon {
  color: var(--el-color-warning);
}

.summary-item div {
  display: grid;
  gap: 5px;
}

.summary-item strong {
  color: var(--text-color);
}

.summary-item span {
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
