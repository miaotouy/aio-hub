<script setup lang="ts">
import { Copy, Download, Trash2 } from "lucide-vue-next";
import { customDialog, customMessage } from "@/utils/feedback";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createValidationReport, exportValidationReport } from "../services/validationReport";
import type { ValidationRun } from "../types/validation";

const props = defineProps<{ runs: readonly ValidationRun[] }>();
const emit = defineEmits<{ clear: [] }>();
const errorHandler = createModuleErrorHandler("ui-tester/report-actions");

async function exportReport(): Promise<void> {
  try {
    const exported = await exportValidationReport([...props.runs]);
    if (exported) customMessage("验证报告已导出", "success");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "验证报告导出失败",
      showToUser: true,
    });
  }
}

async function copySummary(): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(createValidationReport([...props.runs]), null, 2),
    );
    customMessage("脱敏报告已复制", "success");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "复制报告失败",
      showToUser: true,
    });
  }
}

async function clear(): Promise<void> {
  const confirmed = await customDialog({
    title: "清理验证记录",
    message: "这会删除最近运行记录与跨重启恢复标记，不会修改业务数据。",
    confirmButtonText: "清理",
    cancelButtonText: "取消",
  });
  if (confirmed) emit("clear");
}
</script>

<template>
  <div class="report-actions">
    <var-button size="small" :disabled="!runs.length" @click="copySummary">
      <Copy :size="16" />复制摘要
    </var-button>
    <var-button size="small" type="primary" :disabled="!runs.length" @click="exportReport">
      <Download :size="16" />导出报告
    </var-button>
    <var-button size="small" type="danger" :disabled="!runs.length" @click="clear">
      <Trash2 :size="16" />清理记录
    </var-button>
  </div>
</template>

<style scoped>
.report-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
