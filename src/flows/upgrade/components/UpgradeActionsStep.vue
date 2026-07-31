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
import { CircleCheck, Warning } from "@element-plus/icons-vue";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const contributions = computed(() =>
  Object.entries(props.context.contributions)
);
</script>

<template>
  <div class="upgrade-actions">
    <article v-for="[id, item] in contributions" :key="id" class="action-card">
      <el-icon :class="item.blockingScope === 'none' ? 'ok' : 'warning'">
        <CircleCheck v-if="item.blockingScope === 'none'" />
        <Warning v-else />
      </el-icon>
      <div>
        <h3>{{ item.title }}</h3>
        <p v-if="item.description">{{ item.description }}</p>
        <span>影响范围：{{ item.blockingScope }}</span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.upgrade-actions {
  display: grid;
  gap: 12px;
}

.action-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
}

.el-icon {
  margin-top: 2px;
  font-size: 22px;
}

.el-icon.ok {
  color: var(--el-color-success);
}

.el-icon.warning {
  color: var(--el-color-warning);
}

h3 {
  margin: 0 0 6px;
  color: var(--text-color);
}

p,
span {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
</style>
