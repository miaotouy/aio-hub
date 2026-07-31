<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { ArrowLeft, Right } from "@element-plus/icons-vue";
import { useGuidedFlowStepControls } from "@/services/guided-flow/stepControls";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { executeKnowledgeMigration } from "../knowledgeMigrationOperations";
import {
  canCompleteKnowledgeMigration,
  getKnowledgeMigrationSnapshot,
  isKnowledgeMigrationReportComplete,
} from "../types";
import MigrationCleanupStep from "./MigrationCleanupStep.vue";
import MigrationExecuteStep from "./MigrationExecuteStep.vue";
import MigrationPlanStep from "./MigrationPlanStep.vue";
import MigrationVerifyStep from "./MigrationVerifyStep.vue";

type MigrationSubStep = "plan" | "executing" | "verify";

const props = defineProps<{
  context: UpgradeFlowContext;
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();

const controls = useGuidedFlowStepControls<UpgradeFlowContext>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const subStep = ref<MigrationSubStep>(
  snapshot.value.report &&
    (snapshot.value.report.mainStatus === "completed" ||
      (snapshot.value.backupConfirmed && snapshot.value.riskConfirmed))
    ? "verify"
    : "plan"
);
const canStart = computed(
  () =>
    snapshot.value.preview.mainStatus === "completed" ||
    (snapshot.value.backupConfirmed && snapshot.value.riskConfirmed)
);
const canFinish = computed(() => canCompleteKnowledgeMigration(snapshot.value));
const canRetry = computed(
  () => snapshot.value.report?.mainStatus !== "completed"
);
const reportComplete = computed(() =>
  isKnowledgeMigrationReportComplete(snapshot.value.report)
);
const canCleanup = reportComplete;
const startLabel = computed(() =>
  snapshot.value.executionStatus === "failed"
    ? "重新尝试迁移"
    : "确认并开始迁移"
);

async function startMigration() {
  if (!canStart.value || controls.isBusy.value) return;
  subStep.value = "executing";
  await nextTick();
  try {
    await controls.runAction("执行旧知识库数据迁移", (context) =>
      executeKnowledgeMigration(context)
    );
    subStep.value = "verify";
  } catch {
    subStep.value = snapshot.value.report ? "verify" : "plan";
    // Guided Flow Manager 已记录错误并将可理解的信息写入流程状态。
  }
}

function showPlan() {
  if (!controls.isBusy.value) subStep.value = "plan";
}

function retryMigration() {
  void startMigration();
}
</script>

<template>
  <div class="migration-step" :data-sub-step="subStep">
    <div class="sub-stepper" aria-label="迁移进度">
      <span :class="{ active: subStep === 'plan' }">确认方案</span>
      <i aria-hidden="true" />
      <span :class="{ active: subStep === 'executing' }">执行迁移</span>
      <i aria-hidden="true" />
      <span :class="{ active: subStep === 'verify' }">校验与清理</span>
    </div>

    <MigrationPlanStep
      v-if="subStep === 'plan'"
      :context="context"
      :update-context="updateContext"
    />

    <MigrationExecuteStep
      v-else-if="subStep === 'executing'"
      :context="context"
      force-running
    />

    <div v-else class="verify-stage">
      <el-alert
        :closable="false"
        :type="reportComplete ? 'success' : 'warning'"
        show-icon
        :title="
          reportComplete
            ? '迁移校验已完成'
            : canFinish
              ? '主数据迁移完成，仍有后续事项'
              : '迁移仍有待处理内容'
        "
        description="以下报告会保留在升级事项中，旧目录默认不会删除。"
      />
      <MigrationVerifyStep :context="context" />

      <section v-if="canCleanup" class="cleanup-section">
        <h3>旧数据处理</h3>
        <MigrationCleanupStep
          :context="context"
          :update-context="updateContext"
        />
      </section>
    </div>

    <footer class="step-actions">
      <el-button
        v-if="controls.canGoBack.value && subStep === 'plan'"
        :disabled="controls.isBusy.value"
        @click="controls.requestBack"
      >
        <el-icon><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-button
        v-else-if="subStep === 'verify'"
        :disabled="controls.isBusy.value"
        @click="showPlan"
      >
        <el-icon><ArrowLeft /></el-icon>
        查看方案
      </el-button>
      <span v-else />

      <el-button
        v-if="subStep === 'plan'"
        data-testid="migration-start"
        type="primary"
        :disabled="!canStart || controls.isBusy.value"
        :loading="controls.isBusy.value"
        @click="startMigration"
      >
        {{ startLabel }}
        <el-icon class="el-icon--right"><Right /></el-icon>
      </el-button>
      <el-button
        v-else-if="subStep === 'verify' && canRetry"
        data-testid="migration-retry"
        type="primary"
        :disabled="!canStart || controls.isBusy.value"
        :loading="controls.isBusy.value"
        @click="retryMigration"
      >
        重试迁移
      </el-button>
      <el-button
        v-else-if="subStep === 'verify'"
        data-testid="migration-finish"
        type="primary"
        :disabled="!canFinish || controls.isBusy.value"
        :loading="controls.isBusy.value"
        @click="controls.requestNext"
      >
        完成迁移事项
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.migration-step {
  display: grid;
  gap: 22px;
}

.sub-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.sub-stepper span {
  transition: color 160ms ease;
}

.sub-stepper span.active {
  color: var(--text-color);
  font-weight: 600;
}

.sub-stepper i {
  width: 24px;
  height: 1px;
  background: var(--border-color);
}

.verify-stage {
  display: grid;
  gap: 18px;
}

.cleanup-section {
  display: grid;
  gap: 14px;
  border-top: 1px solid var(--border-color);
  padding-top: 18px;
}

.cleanup-section > h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.step-actions {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

@media (max-width: 560px) {
  .sub-stepper {
    gap: 7px;
  }

  .sub-stepper i {
    width: 14px;
  }

  .step-actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .step-actions :deep(.el-button) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sub-stepper span {
    transition: none;
  }
}
</style>
