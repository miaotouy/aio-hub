<template>
  <section class="changes-view" aria-label="实发请求变化与缓存">
    <header class="capture-toolbar">
      <div class="capture-controls">
        <el-switch
          v-model="snapshotSettings.enabled"
          active-text="记录请求摘要"
          :disabled="savingSettings"
          @change="updateSettings"
        />
        <el-switch
          v-model="snapshotSettings.saveTextPreview"
          active-text="保存去敏文本预览"
          :disabled="savingSettings"
          @change="updateSettings"
        />
        <el-popover placement="bottom-start" width="380" trigger="click">
          <template #reference><el-button text>留存说明</el-button></template>
          <p>
            摘要与用量保存在本机。文本预览从开启后的新请求生效，包含正文、推理、工具结果与宏输出；去敏覆盖已识别的凭据、联系方式和路径，可读内容仍可能包含私人语境。
          </p>
          <p>每个会话保留最近 10 次发送，最多 4 MiB。</p>
          <p class="storage-path">{{ storagePath || "正在读取存储位置…" }}</p>
        </el-popover>
      </div>
      <div class="toolbar-actions">
        <el-button :loading="loading" @click="refresh">刷新</el-button>
        <el-button
          :disabled="!sessionDetail || clearing"
          :loading="clearing"
          @click="clearRecords"
          >清空当前会话记录</el-button
        >
      </div>
    </header>
    <el-alert
      v-if="localError || snapshotStorageError"
      :title="localError || snapshotStorageError"
      type="warning"
      :closable="false"
      show-icon
    />
    <div class="request-selectors">
      <label
        >本次请求
        <el-select
          v-model="selectedId"
          placeholder="选择已记录请求"
          clearable
          :loading="loading"
        >
          <el-option
            v-for="attempt in attempts"
            :key="attempt.attemptId"
            :value="attempt.attemptId"
            :label="attemptLabel(attempt)"
          />
        </el-select>
      </label>
      <label
        >对照请求
        <el-select
          v-model="baselineId"
          placeholder="选择对照请求"
          clearable
          :disabled="!selected"
        >
          <el-option
            v-for="attempt in baselineOptions"
            :key="attempt.attemptId"
            :value="attempt.attemptId"
            :label="attemptLabel(attempt)"
          />
        </el-select>
      </label>
      <el-button
        :disabled="!previousRetry"
        @click="baselineId = previousRetry?.attemptId ?? ''"
        >对比前次尝试</el-button
      >
    </div>
    <div class="analysis-workspace">
      <section class="usage-panel panel">
        <h3>
          服务端用量 <span class="muted">tokens</span>
          <el-tag
            v-if="selected"
            size="small"
            :type="selected.status === 'completed' ? 'success' : 'info'"
            >{{ statusLabel(selected.status) }}</el-tag
          >
        </h3>
        <div class="usage-grid">
          <div>
            <span>输入总量</span
            ><strong>{{
              usageNumber(
                selected?.providerUsage?.promptTokens,
                hasReportedInput
              )
            }}</strong>
          </div>
          <div>
            <span>缓存读取</span
            ><strong>{{
              usageNumber(
                selected?.providerUsage?.promptTokensDetails?.cachedTokens
              )
            }}</strong>
          </div>
          <div>
            <span>读取占比</span
            ><strong>{{
              readRatio === undefined ? "—" : `${(readRatio * 100).toFixed(1)}%`
            }}</strong>
          </div>
          <div>
            <span>缓存写入</span
            ><strong>{{
              usageNumber(
                selected?.providerUsage?.promptTokensDetails?.cacheWriteTokens
              )
            }}</strong>
          </div>
        </div>
        <p v-if="selected" class="muted">
          {{
            selected.providerUsageStatus === "reported"
              ? "上游已上报输入与输出用量"
              : selected.providerUsageStatus === "partial"
                ? "上游部分上报，用量以已收到的字段为准"
                : "上游未上报用量"
          }}<template v-if="selected.processingScope === 'server'">
            · 含服务端内部处理，分段用量单独归属</template
          >
        </p>
        <p v-else class="muted">选择请求后显示服务端缓存读写量。</p>
        <p
          v-if="
            selected?.providerUsage?.promptTokensDetails?.cacheWrite5mTokens !==
              undefined ||
            selected?.providerUsage?.promptTokensDetails?.cacheWrite1hTokens !==
              undefined
          "
          class="muted"
        >
          写入细分：5 分钟
          {{
            usageNumber(
              selected?.providerUsage?.promptTokensDetails?.cacheWrite5mTokens
            )
          }}
          · 1 小时
          {{
            usageNumber(
              selected?.providerUsage?.promptTokensDetails?.cacheWrite1hTokens
            )
          }}
        </p>
        <p v-if="selected?.estimatedUsage" class="muted">
          本地补算：输入
          {{ selected.estimatedUsage.promptTokens.toLocaleString() }} / 输出
          {{ selected.estimatedUsage.completionTokens.toLocaleString() }} tokens
        </p>
      </section>
      <section class="panel structure-panel">
        <h3>
          输入变化
          <el-tag v-if="crossBranch" size="small" type="warning"
            >跨分支比较</el-tag
          >
        </h3>
        <template v-if="comparison">
          <p class="change-result">{{ changeTitle }}</p>
          <ul
            v-if="comparison.configurationChanges.length"
            class="explanations"
          >
            <li v-for="change in comparison.configurationChanges" :key="change">
              {{ change }}
            </li>
          </ul>
          <p v-if="comparison.systemChanged">顶层指令发生变化。</p>
          <p v-if="!comparison.summaryOnly && !comparison.boundaryEqual">
            首个变化消息：第 {{ comparison.firstDiffIndex + 1 }} 条，前
            {{ comparison.firstDiffIndex }} 条完整消息一致。
          </p>
          <p
            v-if="
              comparison.partDiff.left &&
              comparison.partDiff.right &&
              comparison.partDiff.left.contentHash !==
                comparison.partDiff.right.contentHash
            "
          >
            首个变化内容块：第 {{ comparison.partDiff.firstPart + 1 }} 块。
          </p>
          <p v-if="comparison.partDiff.prefixQuality !== 'unavailable'">
            变化块内{{
              comparison.partDiff.prefixQuality === "lowerBound"
                ? "已确认至少"
                : ""
            }}
            {{ comparison.partDiff.commonCharacters.toLocaleString() }}
            个公共前缀字符{{
              comparison.partDiff.prefixQuality === "lowerBound"
                ? "（预览留存范围内）"
                : ""
            }}。
          </p>
          <p v-else-if="comparison.kind !== 'equal'" class="muted">
            详细内容未记录或已去敏，具体文本位置受留存范围限制。
          </p>
          <p class="muted">
            公共前缀描述输入相似程度；服务端缓存读取量以上游用量为准。
          </p>
          <p
            v-if="
              !selected?.route.cacheScopeFingerprint ||
              !baseline?.route.cacheScopeFingerprint
            "
            class="muted"
          >
            缓存共享范围未知，渠道配置身份仅作线索。
          </p>
        </template>
        <div v-else class="inline-placeholder">
          <p>
            {{
              selected
                ? "选择一条对照请求以查看变化。"
                : attempts.length
                  ? "当前消息暂无关联记录，可从上方选择已记录请求。"
                  : snapshotSettings.enabled
                    ? "下一次发送后，这里将显示实发请求记录。"
                    : "开启“记录请求摘要”后发送消息，即可查看变化与缓存用量。"
            }}
          </p>
        </div>
      </section>
      <section class="panel sources-panel">
        <h3>来源解释</h3>
        <template v-if="comparison">
          <ul v-if="comparison.causes.length" class="explanations">
            <li v-for="cause in comparison.causes" :key="cause">{{ cause }}</li>
          </ul>
          <p v-else class="muted">
            {{
              comparison.kind === "equal"
                ? "所记录的输入一致。"
                : "来源信息不足，变化原因待确认。"
            }}
          </p>
          <div v-if="comparison.sources.length" class="source-tags">
            <el-tag
              v-for="source in comparison.sources"
              :key="source.sourceKey"
              size="small"
              >{{ sourceLabel(source.sourceType)
              }}{{ source.sourceName ? ` · ${source.sourceName}` : "" }}</el-tag
            >
          </div>
          <details v-if="selected?.transformations?.length">
            <summary>本次组装中产生变化的步骤</summary>
            <ul>
              <li
                v-for="(step, index) in selected.transformations"
                :key="index"
              >
                {{ step.name
                }}<span v-if="step.removedSourceIds.length">
                  · 移除 {{ step.removedSourceIds.length }} 条历史来源</span
                >
              </li>
            </ul>
            <p class="muted">
              步骤记录说明本次组装的转换过程；跨请求原因结合上方来源变化判断。
            </p>
          </details>
        </template>
        <p v-else class="muted">
          比较后显示宏、检索注入、消息合并与历史来源变化。
        </p>
      </section>
      <section class="panel preview-panel">
        <h3>预览差异</h3>
        <details v-if="comparison">
          <summary>展开首个变化块</summary>
          <div class="preview-columns">
            <div>
              <h4>对照请求</h4>
              <pre>{{
                comparison.partDiff.left?.textPreview ?? "详细内容未记录"
              }}</pre>
            </div>
            <div>
              <h4>本次请求</h4>
              <pre>{{
                comparison.partDiff.right?.textPreview ?? "详细内容未记录"
              }}</pre>
            </div>
          </div>
        </details>
        <p v-else class="muted">文本预览开启后，新请求可按留存范围展开。</p>
      </section>
    </div>
    <details
      v-if="selected"
      class="debug-details"
      @toggle="debugOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary>调试明细</summary>
      <pre v-if="debugOpen">{{
        JSON.stringify(
          { selected, baselineAttemptId: baseline?.attemptId },
          null,
          2
        )
      }}</pre>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import type { ChatSessionDetail } from "../../types/session";
import type { ChatRequestAttemptSnapshot } from "../../types/requestSnapshot";
import {
  requestSnapshots,
  loadSnapshotSettings,
  snapshotSettings,
  saveSnapshotSettings,
  snapshotStorageError,
  snapshotRevision,
  snapshotDirectory,
} from "../../services/requestSnapshots";
import {
  ancestorNodeIds,
  defaultSnapshot,
  defaultSnapshotBaseline,
  compareRequestSnapshots,
  usageReadRatio,
} from "../../services/requestSnapshotComparison";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
const logger = createModuleLogger("llm-chat/changes-and-cache");
const errorHandler = createModuleErrorHandler("llm-chat/changes-and-cache");
const props = defineProps<{
  sessionDetail: ChatSessionDetail | null;
  nodeId: string | null;
  isActive: boolean;
}>();
const attempts = ref<ChatRequestAttemptSnapshot[]>([]);
const selectedId = ref("");
const baselineId = ref("");
const loading = ref(false);
const clearing = ref(false);
const savingSettings = ref(false);
const debugOpen = ref(false);
const localError = ref("");
const storagePath = ref("");
let refreshGeneration = 0;
let savedSettings = { enabled: true, saveTextPreview: false };
const selected = computed(() =>
  attempts.value.find((attempt) => attempt.attemptId === selectedId.value)
);
const baseline = computed(() =>
  attempts.value.find((attempt) => attempt.attemptId === baselineId.value)
);
const baselineOptions = computed(() =>
  attempts.value.filter((attempt) => attempt.attemptId !== selectedId.value)
);
const previousRetry = computed(() =>
  selected.value
    ? [...attempts.value]
        .reverse()
        .find(
          (attempt) =>
            attempt.requestId === selected.value!.requestId &&
            attempt.attemptIndex < selected.value!.attemptIndex
        )
    : undefined
);
const comparison = computed(() =>
  selected.value && baseline.value
    ? compareRequestSnapshots(baseline.value, selected.value)
    : undefined
);
const readRatio = computed(() => usageReadRatio(selected.value?.providerUsage));
const hasReportedInput = computed(() =>
  Object.keys(selected.value?.reportedUsageFields ?? {}).some((key) =>
    /^(input_tokens|prompt_tokens|promptTokenCount)$/.test(key)
  )
);
const crossBranch = computed(() => {
  if (
    !selected.value ||
    !baseline.value ||
    selected.value.requestId === baseline.value.requestId
  )
    return false;
  const ancestors = ancestorNodeIds(
    props.sessionDetail,
    selected.value.triggerNodeId ?? selected.value.assistantNodeIds[0] ?? null
  );
  return !baseline.value.assistantNodeIds.some((id) => ancestors.has(id));
});
const changeTitle = computed(
  () =>
    ({
      equal: "输入投影一致",
      append: "输入仅在尾部追加消息",
      shorten: "输入尾部缩短",
      changed: "输入内容发生变化",
      summary: "整体摘要变化，详细内容已精简",
    })[comparison.value?.kind ?? "changed"]
);
const statusLabel = (status: string) =>
  ({ completed: "已完成", error: "发送失败", aborted: "已取消" })[status] ??
  status;
const attemptLabel = (attempt: ChatRequestAttemptSnapshot) => {
  const order =
    attempts.value.findIndex((item) => item.attemptId === attempt.attemptId) +
    1;
  const time = new Date(attempt.startedAt).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `请求 ${order} · ${time}${attempt.attemptIndex > 1 ? ` · 尝试 ${attempt.attemptIndex}` : ""} · ${statusLabel(attempt.status)}`;
};
const usageNumber = (value: number | undefined, known = true) =>
  known && value !== undefined ? value.toLocaleString() : "未上报";
const sourceLabel = (type?: string) =>
  ({
    agent_preset: "预设",
    session_history: "历史消息",
    depth_injection: "深度注入",
    anchor_injection: "锚点注入",
    recall: "Recall",
    worldbook: "世界书",
    merged: "合并消息",
  })[type ?? ""] ?? "来源待确认";
async function refresh() {
  const id = props.sessionDetail?.id;
  const generation = ++refreshGeneration;
  if (!id) {
    attempts.value = [];
    selectedId.value = "";
    baselineId.value = "";
    return;
  }
  loading.value = true;
  localError.value = "";
  try {
    await loadSnapshotSettings();
    savedSettings = {
      enabled: snapshotSettings.enabled,
      saveTextPreview: snapshotSettings.saveTextPreview,
    };
    const records = await requestSnapshots.list(id);
    if (generation !== refreshGeneration) return;
    attempts.value = records;
    if (!records.some((attempt) => attempt.attemptId === selectedId.value))
      selectedId.value =
        defaultSnapshot(records, props.nodeId)?.attemptId ?? "";
    if (!records.some((attempt) => attempt.attemptId === baselineId.value))
      baselineId.value = selected.value
        ? (defaultSnapshotBaseline(records, selected.value, props.sessionDetail)
            ?.attemptId ?? "")
        : "";
    if (!storagePath.value)
      snapshotDirectory()
        .then((path) => {
          storagePath.value = path;
        })
        .catch((error) => logger.debug("存储目录暂不可用", error));
  } catch (error) {
    localError.value = "读取请求记录失败，请刷新或清空当前会话记录后重试";
    errorHandler.handle(error as Error, {
      userMessage: localError.value,
      showToUser: false,
    });
  } finally {
    if (generation === refreshGeneration) loading.value = false;
  }
}
watch(selectedId, () => {
  baselineId.value = selected.value
    ? (defaultSnapshotBaseline(
        attempts.value,
        selected.value,
        props.sessionDetail
      )?.attemptId ?? "")
    : "";
});
watch(
  () => [
    props.isActive,
    props.sessionDetail?.id,
    props.nodeId,
    snapshotRevision.value,
  ],
  (_, old) => {
    if (!props.isActive) return;
    if (!old?.[0]) {
      selectedId.value = "";
      baselineId.value = "";
    }
    if (
      old &&
      (old[1] !== props.sessionDetail?.id || old[2] !== props.nodeId)
    ) {
      selectedId.value = "";
      baselineId.value = "";
    }
    void refresh();
  },
  { immediate: true }
);
async function updateSettings() {
  savingSettings.value = true;
  try {
    await saveSnapshotSettings();
    savedSettings = {
      enabled: snapshotSettings.enabled,
      saveTextPreview: snapshotSettings.saveTextPreview,
    };
  } catch (error) {
    Object.assign(snapshotSettings, savedSettings);
    errorHandler.handle(error as Error, {
      userMessage: "保存记录设置失败，请重试",
    });
  } finally {
    savingSettings.value = false;
  }
}
async function clearRecords() {
  const id = props.sessionDetail?.id;
  if (!id) return;
  try {
    await ElMessageBox.confirm(
      "清空当前会话的请求摘要和文本预览？",
      "清空请求记录",
      {
        confirmButtonText: "清空",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  clearing.value = true;
  try {
    await requestSnapshots.clear(id);
    selectedId.value = "";
    baselineId.value = "";
    await refresh();
    customMessage.success("已清空当前会话记录");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "清空请求记录失败，请重试",
    });
  } finally {
    clearing.value = false;
  }
}
</script>

<style scoped>
.changes-view {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--el-text-color-primary);
}
.capture-toolbar,
.capture-controls,
.toolbar-actions,
.request-selectors {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.capture-toolbar {
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 14px;
}
.capture-controls {
  gap: 22px;
}
.toolbar-actions {
  gap: 8px;
}
.request-selectors label {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 260px;
  font-size: 13px;
}
.request-selectors .el-select {
  flex: 1;
}
.analysis-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 1fr);
  gap: 16px;
}
.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
  padding: 18px;
  min-width: 0;
}
.usage-panel,
.preview-panel {
  grid-column: 1 / -1;
}
h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
h4 {
  font-size: 13px;
  margin: 12px 0 8px;
  font-weight: 500;
}
p,
li {
  font-size: 13px;
  line-height: 1.7;
}
p {
  margin: 8px 0 0;
}
.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.usage-grid > div {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 16px;
  border-right: 1px solid var(--el-border-color-lighter);
}
.usage-grid > div:last-child {
  border: 0;
}
.usage-grid span,
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.usage-grid strong {
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.change-result {
  font-weight: 600;
}
.inline-placeholder {
  min-height: 150px;
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
}
.explanations {
  padding-left: 20px;
}
.source-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.preview-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  font-size: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
}
summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
}
.debug-details {
  border-top: 1px solid var(--el-border-color-lighter);
}
.storage-path {
  overflow-wrap: anywhere;
  color: var(--el-text-color-secondary);
}
@media (max-width: 900px) {
  .analysis-workspace,
  .preview-columns {
    grid-template-columns: 1fr;
  }
  .usage-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .usage-panel,
  .preview-panel {
    grid-column: auto;
  }
}
</style>
