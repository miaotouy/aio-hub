<template>
  <div class="complete-step">
    <CircleCheckBig :size="54" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="snapshot.removedPaths" class="cleanup-result">
      已清理 {{ snapshot.removedPaths.length }} 个受管旧目录。
    </div>
    <div v-else class="cleanup-result muted">
      旧数据目录保持不变，可在确认迁移完全通过后再手动清理。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CircleCheckBig } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";
const props = defineProps<{ context: UpgradeFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const report = computed(() => snapshot.value.report);
const title = computed(() =>
  report.value?.mainStatus === "completed"
    ? "知识库迁移流程已完成"
    : "迁移报告已保存"
);
const description = computed(() =>
  report.value?.mainStatus === "completed"
    ? "新的 Recall 主数据已经可用；待重建向量和问题项已保留在报告中。"
    : "主数据尚未完整迁移，此事项会继续保持待处理状态，可稍后重新检测并重试。"
);
</script>

<style scoped>
.complete-step {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 26px 18px;
  text-align: center;
}
.complete-step > svg {
  color: var(--el-color-success);
}
h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 22px;
}
p {
  max-width: 520px;
  margin: 0;
  color: var(--text-color-secondary);
  line-height: 1.7;
}
.cleanup-result {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  font-size: 13px;
}
.cleanup-result.muted {
  background: var(--el-fill-color-light);
  color: var(--text-color-secondary);
}
</style>
