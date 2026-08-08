<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-vue-next";
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
  flowState?: { lastError?: string };
  updateContext?: (updates: Record<string, unknown>) => void | Promise<void>;
}>();

const controls = useGuidedFlowStepControls<UpgradeFlowContext>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
const subStep = ref<MigrationSubStep>(
  snapshot.value.report ? "verify" : "plan"
);
const canStart = computed(
  () =>
    snapshot.value.preview.mainStatus === "completed" ||
    (snapshot.value.backupConfirmed && snapshot.value.riskConfirmed)
);
const canFinish = computed(() => canCompleteKnowledgeMigration(snapshot.value));
const reportComplete = computed(() =>
  isKnowledgeMigrationReportComplete(snapshot.value.report)
);
const canRetry = computed(
  () => !reportComplete.value && snapshot.value.executionStatus !== "running"
);
const canCleanup = reportComplete;
const startLabel = computed(() =>
  snapshot.value.executionStatus === "failed" ? "重新尝试" : "开始迁移"
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
    <div class="migration-body">
      <div v-if="flowState?.lastError" class="migration-error" role="alert">
        {{ flowState.lastError }}
      </div>

      <MigrationPlanStep
        v-if="subStep === 'plan'"
        :context="context"
        :busy="controls.isBusy.value"
        :can-start="canStart"
        :start-label="startLabel"
        :update-context="updateContext"
        @start="startMigration"
      />

      <MigrationExecuteStep
        v-else-if="subStep === 'executing'"
        :context="context"
        force-running
      />

      <div v-else class="verify-stage">
        <MigrationVerifyStep :context="context" />

        <el-collapse v-if="canCleanup" class="cleanup-collapse">
          <el-collapse-item title="可选：处理旧数据目录" name="cleanup">
            <MigrationCleanupStep
              :context="context"
              :update-context="updateContext"
            />
          </el-collapse-item>
        </el-collapse>

        <div class="verify-actions">
          <el-button :disabled="controls.isBusy.value" @click="showPlan">
            <ArrowLeft :size="15" />
            查看方案
          </el-button>
          <el-button
            v-if="canRetry"
            data-testid="migration-retry"
            :disabled="!canStart || controls.isBusy.value"
            @click="retryMigration"
          >
            <RotateCcw :size="15" />
            重新迁移
          </el-button>
        </div>
      </div>
    </div>

    <footer class="migration-actions">
      <div class="action-start">
        <el-button
          v-if="controls.canGoBack.value"
          :disabled="controls.isBusy.value"
          @click="controls.requestBack"
        >
          <ArrowLeft :size="15" />
          上一步
        </el-button>
      </div>

      <div class="action-end">
        <el-button
          v-if="controls.canDefer.value"
          text
          :disabled="controls.isBusy.value"
          @click="controls.requestDefer"
        >
          稍后处理
        </el-button>
        <el-button
          data-testid="migration-finish"
          type="primary"
          :disabled="!canFinish || controls.isBusy.value"
          :loading="controls.isBusy.value && canFinish"
          @click="controls.requestNext"
        >
          下一步
          <ArrowRight :size="15" />
        </el-button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.migration-step {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.migration-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 18px 24px;
  scrollbar-gutter: stable;
}

.migration-error {
  margin-bottom: 12px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.45;
}

.verify-stage {
  display: grid;
  gap: 11px;
}

.verify-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.cleanup-collapse :deep(.el-collapse) {
  border: 0;
}

.cleanup-collapse :deep(.el-collapse-item) {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 9px;
}

.cleanup-collapse :deep(.el-collapse-item__header) {
  height: 40px;
  padding: 0 11px;
  border-bottom: 0;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 11px;
}

.cleanup-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}

.cleanup-collapse :deep(.el-collapse-item__content) {
  padding: 0 11px 11px;
}

.migration-actions {
  display: flex;
  min-height: 68px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-top: 1px solid var(--border-color);
  padding: 13px 24px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.action-start,
.action-end {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-end {
  justify-content: flex-end;
}

.migration-body::-webkit-scrollbar {
  width: 6px;
}

.migration-body::-webkit-scrollbar-track {
  background: transparent;
}

.migration-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--el-border-color-light);
}

@media (max-width: 560px) {
  .migration-body {
    padding-right: 16px;
    padding-left: 16px;
  }

  .migration-actions {
    min-height: auto;
    align-items: stretch;
    flex-direction: column-reverse;
    padding: 12px 16px;
  }

  .action-start,
  .action-end {
    width: 100%;
  }

  .action-end :deep(.el-button),
  .action-start :deep(.el-button) {
    flex: 1;
  }
}
</style>
