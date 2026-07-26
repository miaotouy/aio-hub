<template>
  <div class="verify-step" data-testid="migration-verify">
    <template v-if="report">
      <div class="status-grid" data-testid="migration-report">
        <div>
          <span>主数据</span
          ><el-tag
            :type="report.mainStatus === 'completed' ? 'success' : 'warning'"
            >{{ report.mainStatus }}</el-tag
          >
        </div>
        <div>
          <span>向量</span
          ><el-tag
            :type="report.vectorStatus === 'completed' ? 'success' : 'warning'"
            >{{ report.vectorStatus }}</el-tag
          >
        </div>
        <div>
          <span>集合</span
          ><strong
            >{{ report.migratedCollections }} /
            {{ report.sourceCollections }}</strong
          >
        </div>
        <div>
          <span>条目</span
          ><strong
            >{{ report.migratedEntries }} / {{ report.sourceEntries }}</strong
          >
        </div>
        <div>
          <span>向量</span
          ><strong
            >{{ report.migratedVectors }} / {{ report.sourceVectors }}</strong
          >
        </div>
        <div>
          <span>待重建</span><strong>{{ report.pendingVectors }}</strong>
        </div>
      </div>
      <el-alert
        v-if="!isComplete && report.mainStatus !== 'completed'"
        :closable="false"
        type="error"
        show-icon
        title="主数据迁移尚未完整完成"
        description="流程完成后仍会保留为待处理事项；请根据问题明细修复源数据后重试。"
      />
      <el-alert
        v-else-if="!isComplete"
        :closable="false"
        type="warning"
        show-icon
        title="迁移尚未完全通过校验"
        :description="`${report.pendingVectors} 个向量未通过迁移校验，或报告包含待处理问题。`"
      />
      <el-collapse v-if="report.issues.length">
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
      <div class="recovery">
        <h3>恢复建议</h3>
        <ul>
          <li v-for="item in report.recoveryInstructions" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>
    </template>
    <el-empty v-else description="尚无迁移报告，请返回并重试执行步骤。" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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
</script>

<style scoped>
.verify-step {
  display: grid;
  gap: 14px;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.status-grid div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 13px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}
.status-grid span {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.status-grid strong {
  color: var(--text-color);
}
.issues {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.issues li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.issues strong {
  color: var(--el-color-danger);
  font-size: 13px;
}
.issues span {
  color: var(--text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.recovery {
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
h3 {
  margin: 0 0 8px;
  color: var(--text-color);
  font-size: 14px;
}
ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-color-secondary);
  line-height: 1.7;
}
@media (max-width: 600px) {
  .status-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
