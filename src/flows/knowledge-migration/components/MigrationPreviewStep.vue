<template>
  <div class="migration-preview">
    <section>
      <header class="success">
        <CircleCheck :size="18" />
        <h3>保留</h3>
      </header>
      <ul>
        <li v-for="item in snapshot.preview.preservedFields" :key="item">
          {{ item }}
        </li>
      </ul>
    </section>
    <section>
      <header class="warning">
        <RefreshCw :size="18" />
        <h3>需要重建</h3>
      </header>
      <ul>
        <li v-for="item in snapshot.preview.rebuiltFields" :key="item">
          {{ item }}
        </li>
      </ul>
    </section>
    <section>
      <header class="danger">
        <TriangleAlert :size="18" />
        <h3>无法自动处理</h3>
      </header>
      <ul>
        <li v-for="item in snapshot.preview.unsupportedFields" :key="item">
          {{ item }}
        </li>
      </ul>
    </section>
    <div class="target-card">
      <span>迁移目标</span
      ><strong>{{ snapshot.preview.targetDescription }}</strong>
    </div>
    <el-alert
      v-for="warning in snapshot.preview.warnings"
      :key="warning"
      :closable="false"
      type="warning"
      show-icon
      :title="warning"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
</script>

<style scoped>
.migration-preview {
  display: grid;
  gap: 12px;
}
section {
  padding: 15px 17px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
}
header.success {
  color: var(--el-color-success);
}
header.warning {
  color: var(--el-color-warning);
}
header.danger {
  color: var(--el-color-danger);
}
h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
}
ul {
  margin: 10px 0 0;
  padding-left: 20px;
  color: var(--text-color-secondary);
  line-height: 1.8;
}
.target-card {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}
.target-card span {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.target-card strong {
  color: var(--text-color);
}
</style>
