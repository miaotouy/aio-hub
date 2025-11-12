<template>
  <div class="charts-container">
    <el-row :gutter="12">
      <el-col :span="12">
        <InfoCard title="提交频率">
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
</style>