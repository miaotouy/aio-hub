<template>
  <div class="verify-step" data-testid="migration-verify">
    <template v-if="report">
      <section class="result-banner" :data-complete="isComplete">
        <span class="result-icon">
          <CircleCheckBig v-if="isComplete" :size="22" />
          <TriangleAlert v-else :size="22" />
        </span>
        <div>
          <span>迁移结果</span>
          <h3>{{ resultTitle }}</h3>
          <p>{{ resultDescription }}</p>
        </div>
      </section>

      <div class="status-grid" data-testid="migration-report">
        <div>
          <span>集合</span>
          <strong
            >{{ report.migratedCollections }} /
            {{ report.sourceCollections }}</strong
          >
        </div>
        <div>
          <span>条目</span>
          <strong
            >{{ report.migratedEntries }} / {{ report.sourceEntries }}</strong
          >
        </div>
        <div>
          <span>向量</span>
          <strong
            >{{ report.migratedVectors }} / {{ report.sourceVectors }}</strong
          >
        </div>
        <div>
          <span>待重建</span>
          <strong>{{ report.pendingVectors }}</strong>
        </div>
      </div>

      <el-collapse v-if="report.issues.length" class="report-collapse">
        <el-collapse-item
          :title="`问题明细（${report.issues.length}）`"
          name="issues"
        >
          <ul class="issues">
            <li
              v-for="issue in report.issues"
              :key="`${issue.path}:${issue.message}`"
            >
              <strong>{{ issue.message }}</strong
              ><span>{{ issue.path }}</span>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>

      <el-collapse
        v-if="report.recoveryInstructions.length"
        class="report-collapse"
      >
        <el-collapse-item title="恢复与重试建议" name="recovery">
          <ul class="recovery-list">
            <li v-for="item in report.recoveryInstructions" :key="item">
              {{ item }}
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>
    </template>
    <el-empty v-else description="尚无迁移报告，请返回方案并重新执行迁移。" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CircleCheckBig, TriangleAlert } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import {
  getKnowledgeMigrationSnapshot,
  isKnowledgeMigrationReportComplete,
} from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const report = computed(
  () => getKnowledgeMigrationSnapshot(props.context).report
);
const isComplete = computed(() =>
  isKnowledgeMigrationReportComplete(report.value)
);
const resultTitle = computed(() => {
  if (isComplete.value) return "旧知识库数据迁移完成";
  if (report.value?.mainStatus === "completed")
    return "主数据已迁移，仍有后续事项";
  return "迁移未完整完成";
});
const resultDescription = computed(() => {
  if (isComplete.value)
    return "所有主数据与向量均已通过校验，旧目录仍为保留状态。";
  if (report.value?.mainStatus === "completed") {
    return "主数据已可用，请按报告处理待重建向量或问题明细。";
  }
  return "请查看问题明细，修复旧数据后可重新尝试迁移。";
});
</script>

<style scoped>
.verify-step {
  display: grid;
  gap: 11px;
}

.result-banner {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px;
  border: 1px solid
    color-mix(in srgb, var(--el-color-warning) 30%, var(--border-color));
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-warning) 7%, var(--card-bg));
}

.result-banner[data-complete="true"] {
  border-color: color-mix(
    in srgb,
    var(--el-color-success) 30%,
    var(--border-color)
  );
  background: color-mix(in srgb, var(--el-color-success) 7%, var(--card-bg));
}

.result-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  color: var(--el-color-warning);
}

.result-banner[data-complete="true"] .result-icon {
  background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
  color: var(--el-color-success);
}

.result-banner span:not(.result-icon) {
  color: var(--text-color-secondary);
  font-size: 10px;
}

.result-banner h3 {
  margin: 2px 0 3px;
  color: var(--text-color);
  font-size: 15px;
}

.result-banner p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.status-grid div {
  display: grid;
  gap: 3px;
  padding: 10px 8px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  text-align: center;
}

.status-grid span {
  color: var(--text-color-secondary);
  font-size: 10px;
}

.status-grid strong {
  color: var(--text-color);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.report-collapse :deep(.el-collapse) {
  border: 0;
}

.report-collapse :deep(.el-collapse-item) {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 9px;
}

.report-collapse :deep(.el-collapse-item__header) {
  height: 39px;
  padding: 0 11px;
  border-bottom: 0;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 11px;
}

.report-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}

.report-collapse :deep(.el-collapse-item__content) {
  padding: 0 11px 11px;
}

.issues,
.recovery-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
  list-style: none;
}

.issues li {
  display: grid;
  gap: 3px;
  padding: 8px;
  border-radius: 7px;
  background: var(--el-fill-color-light);
}

.issues strong {
  color: var(--el-color-danger);
}

.issues span {
  overflow-wrap: anywhere;
}

.recovery-list {
  padding-left: 16px;
  list-style: disc;
}

@media (max-width: 520px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
