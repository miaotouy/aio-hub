<script setup lang="ts">
import { computed, ref } from "vue";
import { DatabaseZap, Square } from "lucide-vue-next";
import { customDialog, customMessage } from "@/utils/feedback";
import ValidationCaseRow from "../components/ValidationCaseRow.vue";
import ValidationRunHeader from "../components/ValidationRunHeader.vue";
import ValidationStepList from "../components/ValidationStepList.vue";
import { useValidationRuns } from "../composables/useValidationRuns";
import {
  cancelSqliteValidation,
  prepareSqliteCrashValidation,
  resetSqliteValidationDatabase,
  runSqliteScenario,
  type SqlitePreset,
  type SqliteScenario,
} from "../services/sqliteValidation";

const { runs, runAutomated, createManualRun, setResumeRun } =
  useValidationRuns();
const preset = ref<SqlitePreset>("1k");
const faultPoint = ref<"before-commit" | "after-write">("after-write");
const suiteRuns = computed(() =>
  runs.value.filter((run) => run.suiteId === "sqlite")
);
const suiteTotals = computed(() => ({
  passed: suiteRuns.value.filter((run) => run.status === "passed").length,
  failed: suiteRuns.value.filter((run) => run.status === "failed").length,
  pending: suiteRuns.value.filter((run) => run.status === "manualPending")
    .length,
}));
const latestRun = computed(() => suiteRuns.value[0]);
const running = computed(() =>
  suiteRuns.value.some((run) => run.status === "running")
);

const cases: Array<{ id: SqliteScenario; title: string; description: string }> =
  [
    {
      id: "environment",
      title: "环境检查",
      description:
        "SQLite 版本、compile options、FTS5 能力和固定数据库路径类型。",
    },
    {
      id: "connection",
      title: "连接烟测",
      description: "创建、关闭、重开、并发读取和写锁等待。",
    },
    {
      id: "migration",
      title: "Migration",
      description: "空库升级、失败回滚和高版本拒写。",
    },
    {
      id: "codec",
      title: "Codec round-trip",
      description: "结构化消息、未知 metadata、可选时间戳与附件快照。",
    },
    {
      id: "transaction-recovery",
      title: "事务恢复",
      description: "固定 fault point 中断，检查半提交、外键和 integrity。",
    },
    {
      id: "fts-query",
      title: "FTS 查询语义",
      description: "中日英、emoji、引号、连字符及短词查询。",
    },
    {
      id: "benchmark",
      title: "数据规模基准",
      description: "记录建库、索引、冷/热查询、加载、删除、体积和峰值估算。",
    },
  ];

function statusFor(caseId: string) {
  return suiteRuns.value.find((run) => run.caseId === caseId)?.status ?? "idle";
}

async function runCase(scenario: SqliteScenario): Promise<void> {
  if (scenario === "transaction-recovery") {
    const confirmed = await customDialog({
      title: "执行事务强杀恢复验证",
      message:
        "该操作会在固定事务注入点直接终止应用进程。重启后验证台将自动检查半提交、外键与 integrity。",
      confirmButtonText: "保存状态并强杀",
      cancelButtonText: "取消",
    });
    if (!confirmed) return;
    const run = createManualRun("sqlite", "transaction-recovery", {
      faultPoint: faultPoint.value,
    });
    await setResumeRun(run);
    await prepareSqliteCrashValidation(faultPoint.value);
    return;
  }
  if (scenario === "benchmark" && preset.value === "100k") {
    const confirmed = await customDialog({
      title: "运行 10 万条基准",
      message: "该场景可能长时间占用设备 CPU 与存储空间，仅操作独立测试库。",
      confirmButtonText: "继续运行",
      cancelButtonText: "取消",
    });
    if (!confirmed) return;
  }
  await runAutomated("sqlite", scenario, { preset: preset.value }, () =>
    runSqliteScenario(scenario, preset.value)
  );
}

async function cancel(): Promise<void> {
  await cancelSqliteValidation();
  customMessage("已发送停止请求，当前批次结束后会取消", "info");
}

async function reset(action: "rebuild" | "delete"): Promise<void> {
  const confirmed = await customDialog({
    title: action === "rebuild" ? "重建测试库" : "删除测试库",
    message:
      "该操作只允许作用于 ui_tester_validation.db。Rust 侧会再次校验文件名。",
    confirmButtonText: action === "rebuild" ? "重建" : "删除",
    cancelButtonText: "取消",
  });
  if (!confirmed) return;
  await runAutomated("sqlite", `database-${action}`, {}, () =>
    resetSqliteValidationDatabase(action)
  );
}
</script>

<template>
  <section class="validation-page">
    <ValidationRunHeader
      :passed="suiteTotals.passed"
      :failed="suiteTotals.failed"
      :pending="suiteTotals.pending"
      :running="running"
      phase="Rust 正在生成或检查测试数据"
    />
    <div class="sqlite-toolbar">
      <label for="benchmark-preset">数据规模</label>
      <select id="benchmark-preset" v-model="preset" :disabled="running">
        <option value="1k">1 千条</option>
        <option value="10k">1 万条</option>
        <option value="100k">10 万条</option>
      </select>
      <label for="fault-point">事务注入点</label>
      <select id="fault-point" v-model="faultPoint" :disabled="running">
        <option value="before-commit">提交前</option>
        <option value="after-write">写入后</option>
      </select>
      <var-button v-if="running" type="warning" size="small" @click="cancel"
        ><Square :size="15" />停止</var-button
      >
    </div>

    <ValidationCaseRow
      v-for="item in cases"
      :key="item.id"
      :title="item.title"
      :description="item.description"
      :status="statusFor(item.id)"
      :disabled="running"
      @run="runCase(item.id)"
    />

    <div class="database-actions">
      <var-button size="small" :disabled="running" @click="reset('rebuild')"
        ><DatabaseZap :size="16" />重建测试库</var-button
      >
      <var-button
        type="danger"
        size="small"
        :disabled="running"
        @click="reset('delete')"
        ><DatabaseZap :size="16" />删除测试库</var-button
      >
    </div>

    <ValidationStepList v-if="latestRun" :steps="latestRun.steps" />
    <div
      v-if="latestRun && Object.keys(latestRun.metrics).length"
      class="metrics-table-wrap"
    >
      <table class="metrics-table">
        <tbody>
          <tr v-for="(value, key) in latestRun.metrics" :key="key">
            <th>{{ key }}</th>
            <td>{{ value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="latestRun?.error" class="error-text">
      {{ latestRun.error.phase }}：{{ latestRun.error.message }}
    </p>
  </section>
</template>

<style scoped>
.validation-page {
  padding-bottom: 28px;
}
.sqlite-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 0 8px;
}
.sqlite-toolbar label {
  font-size: 13px;
  font-weight: 600;
}
.sqlite-toolbar select {
  min-width: 110px;
  min-height: 36px;
  padding: 0 10px;
  color: var(--text-primary);
  background: var(--input-bg);
  border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25));
  border-radius: 6px;
}
.database-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 18px 0;
}
.metrics-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  margin-top: 18px;
}
.metrics-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.metrics-table th,
.metrics-table td {
  padding: 8px;
  border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.18));
  text-align: left;
  overflow-wrap: anywhere;
}
.metrics-table th {
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}
.error-text {
  color: var(--color-danger, #c23b3b);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
</style>
