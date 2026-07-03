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

<template>
  <div class="charts-container">
    <el-row :gutter="12">
      <el-col :span="12">
        <InfoCard title="提交频率">
          <template #headerExtra>
            <el-segmented
              v-model="frequencyGranularity"
              :options="frequencyGranularityOptions"
              size="small"
              class="frequency-granularity"
            />
          </template>
          <div ref="frequencyChart" class="chart"></div>
        </InfoCard>
      </el-col>
      <el-col :span="12">
        <InfoCard title="贡献者统计">
          <div ref="contributorChart" class="chart"></div>
        </InfoCard>
      </el-col>
    </el-row>
    <el-row :gutter="12" style="margin-top: 20px">
      <el-col :span="24">
        <InfoCard title="提交热力图">
          <div ref="heatmapChart" class="chart"></div>
        </InfoCard>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import type { CommitFrequencyGranularity } from "../types";

const frequencyGranularity = defineModel<CommitFrequencyGranularity>(
  "frequencyGranularity",
  {
    default: "day",
  }
);

const frequencyGranularityOptions: Array<{
  label: string;
  value: CommitFrequencyGranularity;
}> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "年", value: "year" },
];

// DOM 引用
const frequencyChart = ref<HTMLElement>();
const contributorChart = ref<HTMLElement>();
const heatmapChart = ref<HTMLElement>();

// 暴露 DOM 引用给父组件
defineExpose({
  frequencyChart,
  contributorChart,
  heatmapChart,
});
</script>

<style scoped>
.charts-container {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  min-height: 0;
}

.chart {
  height: 300px;
  min-height: 300px;
}

:deep(.info-card) {
  background: var(--container-bg);
  border-color: var(--border-color-light);
}

:deep(.el-card__header) {
  background: var(--card-bg);
  border-bottom-color: var(--border-color-light);
}

.frequency-granularity {
  min-width: 152px;
}

@media (max-width: 768px) {
  .frequency-granularity {
    min-width: 136px;
  }
}
</style>
