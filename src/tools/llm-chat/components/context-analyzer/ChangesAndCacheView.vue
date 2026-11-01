<template>
  <section class="changes-view" aria-label="实发请求变化与缓存">
    <!-- ========== 顶部：对比导航栏 ========== -->
    <header class="compare-bar">
      <div class="compare-flow">
        <label class="selector-field">
          <span class="field-label">对照基准</span>
          <el-select
            v-model="baselineId"
            placeholder="选择对照请求"
            clearable
            :disabled="!selected"
            :loading="loading"
            class="select-control"
          >
            <el-option
              v-for="attempt in baselineOptions"
              :key="attempt.attemptId"
              :value="attempt.attemptId"
              :label="attemptLabel(attempt)"
            >
              <div class="attempt-option">
                <span class="opt-order">#{{ orderOf(attempt) }}</span>
                <span class="opt-time">{{
                  formatTime(attempt.startedAt)
                }}</span>
                <span class="opt-model">{{ attempt.route.actualModelId }}</span>
                <span class="opt-count">{{ attempt.messages.length }} 条</span>
                <el-tag size="small" :type="statusTagType(attempt.status)">
                  {{ statusLabel(attempt.status) }}
                </el-tag>
              </div>
            </el-option>
          </el-select>
        </label>

        <el-icon class="flow-arrow"><Right /></el-icon>

        <label class="selector-field">
          <span class="field-label">本次请求</span>
          <el-select
            v-model="selectedId"
            placeholder="选择已记录请求"
            clearable
            :loading="loading"
            class="select-control"
          >
            <el-option
              v-for="attempt in attempts"
              :key="attempt.attemptId"
              :value="attempt.attemptId"
              :label="attemptLabel(attempt)"
            >
              <div class="attempt-option">
                <span class="opt-order">#{{ orderOf(attempt) }}</span>
                <span class="opt-time">{{
                  formatTime(attempt.startedAt)
                }}</span>
                <span class="opt-model">{{ attempt.route.actualModelId }}</span>
                <span class="opt-count">{{ attempt.messages.length }} 条</span>
                <el-tag size="small" :type="statusTagType(attempt.status)">
                  {{ statusLabel(attempt.status) }}
                </el-tag>
                <span v-if="attempt.attemptIndex > 1" class="opt-retry"
                  >尝试 {{ attempt.attemptIndex }}</span
                >
              </div>
            </el-option>
          </el-select>
        </label>

        <el-button
          v-if="previousRetry"
          size="small"
          :icon="RefreshLeft"
          @click="baselineId = previousRetry?.attemptId ?? ''"
          >对比前次重试</el-button
        >
      </div>

      <div class="compare-meta">
        <el-tag v-if="isAutoLinked" size="small" type="info" effect="plain"
          >已关联当前消息</el-tag
        >
        <el-tag v-if="crossBranch" size="small" type="warning"
          >跨分支比较</el-tag
        >
        <el-popover placement="bottom-end" :width="360" trigger="click">
          <template #reference>
            <el-button text :icon="Setting">
              {{ captureSummary }}
            </el-button>
          </template>
          <div class="settings-panel">
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
            <p class="settings-desc">
              摘要记录结构、来源与用量；文本预览从开启后的新请求生效，可读内容仍可能包含私人语境。
            </p>
            <p class="settings-meta">
              每个会话保留最近 10 次发送，最多 4 MiB。
            </p>
            <p class="settings-path">
              {{ storagePath || "正在读取存储位置…" }}
            </p>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="!sessionDetail || clearing"
              :loading="clearing"
              @click="clearRecords"
              >清空当前会话记录</el-button
            >
          </div>
        </el-popover>
        <el-button
          circle
          :icon="Refresh"
          :loading="loading"
          title="刷新"
          @click="refresh"
        />
      </div>
    </header>

    <el-alert
      v-if="localError || snapshotStorageError"
      :title="localError || snapshotStorageError"
      type="warning"
      :closable="false"
      show-icon
    />

    <!-- ========== 无可比对记录时的引导 ========== -->
    <InfoCard v-if="!selected" class="empty-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">尚未记录实发请求</span>
        </div>
      </template>
      <div class="empty-state">
        <el-icon class="empty-icon"><DataAnalysis /></el-icon>
        <p class="empty-title">
          {{
            snapshotSettings.enabled
              ? "在当前会话发送一次消息后，这里会自动记录实发请求"
              : "「记录请求摘要」当前已关闭"
          }}
        </p>
        <p class="empty-desc">
          记录开启后，可在相邻轮次之间对比消息前缀、定位缓存断裂点，并查看上游上报的缓存读写量。
        </p>
        <el-button
          v-if="!snapshotSettings.enabled"
          type="primary"
          size="small"
          @click="enableRecording"
          >开启记录请求摘要</el-button
        >
      </div>
    </InfoCard>

    <template v-else>
      <!-- ========== 概览区：诊断 + 缓存账单 ========== -->
      <div class="overview-grid">
        <InfoCard class="diagnosis-card">
          <template #header>
            <div class="card-head">
              <span class="card-title">变化诊断</span>
              <el-tag
                v-if="selected"
                size="small"
                :type="statusTagType(selected.status)"
                >{{ statusLabel(selected.status) }}</el-tag
              >
            </div>
          </template>

          <template v-if="diagnosis">
            <div class="diagnosis-head" :class="`tone-${diagnosis.tone}`">
              <el-icon class="diagnosis-icon">
                <component :is="diagnosis.icon" />
              </el-icon>
              <div class="diagnosis-text">
                <p class="diagnosis-title">{{ diagnosis.title }}</p>
                <p class="diagnosis-desc">{{ diagnosis.desc }}</p>
              </div>
            </div>

            <div
              v-if="comparison?.partDiff.prefixQuality !== 'unavailable'"
              class="prefix-chip"
            >
              <el-icon><Connection /></el-icon>
              <span>
                变化块内
                {{
                  comparison?.partDiff.prefixQuality === "lowerBound"
                    ? "已确认至少"
                    : ""
                }}
                {{
                  (comparison?.partDiff.commonCharacters ?? 0).toLocaleString()
                }}
                个公共前缀字符
              </span>
            </div>

            <div
              v-if="comparison?.configurationChanges.length"
              class="diagnosis-section"
            >
              <p class="section-label">配置变化</p>
              <div class="tag-row">
                <el-tag
                  v-for="change in comparison.configurationChanges"
                  :key="change"
                  size="small"
                  type="warning"
                  effect="plain"
                  >{{ change }}</el-tag
                >
              </div>
            </div>

            <div v-if="comparison?.causes.length" class="diagnosis-section">
              <p class="section-label">变化来源</p>
              <ul class="cause-list">
                <li v-for="cause in comparison.causes" :key="cause">
                  {{ cause }}
                </li>
              </ul>
            </div>
            <p v-else-if="comparison" class="muted">
              {{
                comparison.kind === "equal"
                  ? "所记录的输入完全一致。"
                  : "来源信息不足，变化原因待确认。"
              }}
            </p>

            <div v-if="comparison?.sources.length" class="diagnosis-section">
              <p class="section-label">关联来源</p>
              <div class="tag-row">
                <el-tag
                  v-for="source in comparison.sources"
                  :key="source.sourceKey"
                  size="small"
                  effect="plain"
                >
                  {{ sourceLabel(source.sourceType)
                  }}{{ source.sourceName ? ` · ${source.sourceName}` : "" }}
                </el-tag>
              </div>
            </div>

            <div
              v-if="selected.transformations?.length"
              class="diagnosis-section"
            >
              <p class="section-label">本次组装的处理步骤</p>
              <ul class="cause-list">
                <li
                  v-for="(step, index) in selected.transformations"
                  :key="index"
                >
                  {{ step.name
                  }}<span v-if="step.removedSourceIds.length" class="muted">
                    · 移除 {{ step.removedSourceIds.length }} 条历史来源</span
                  >
                </li>
              </ul>
            </div>

            <p v-if="comparison?.summaryOnly" class="muted">
              详细内容因容量预算已精简，仅保留整体摘要用于比较。
            </p>
            <p
              v-if="
                !selected.route.cacheScopeFingerprint ||
                !baseline?.route.cacheScopeFingerprint
              "
              class="muted"
            >
              缓存共享范围未知，渠道配置身份仅作线索。
            </p>
          </template>
          <p v-else class="muted">选择一条对照请求以查看变化诊断。</p>
        </InfoCard>

        <InfoCard class="usage-card">
          <template #header>
            <div class="card-head">
              <span class="card-title">服务端缓存与用量</span>
              <el-tag size="small" :type="usageStatusType">
                {{ usageStatusLabel }}
              </el-tag>
            </div>
          </template>

          <div v-if="usageBreakdown" class="usage-bar">
            <div
              v-for="segment in usageBreakdown.segments"
              :key="segment.key"
              class="usage-bar-segment"
              :class="`seg-${segment.type}`"
              :style="{ width: `${segment.pct}%` }"
              :title="`${segment.label} ${segment.value.toLocaleString()} tokens（${segment.pct.toFixed(1)}%）`"
            />
          </div>
          <div v-if="usageBreakdown" class="usage-legend">
            <span
              v-for="segment in usageBreakdown.segments"
              :key="segment.key"
              class="legend-item"
            >
              <span class="legend-dot" :class="`dot-${segment.type}`" />
              {{ segment.label }} {{ segment.pct.toFixed(1) }}%
            </span>
          </div>

          <div class="usage-grid">
            <div class="usage-cell">
              <span class="usage-label">输入总量</span>
              <strong>{{
                usageNumber(
                  selected.providerUsage?.promptTokens,
                  hasReportedInput
                )
              }}</strong>
            </div>
            <div class="usage-cell">
              <span class="usage-label">缓存读取</span>
              <strong>{{
                usageNumber(
                  selected.providerUsage?.promptTokensDetails?.cachedTokens
                )
              }}</strong>
            </div>
            <div class="usage-cell">
              <span class="usage-label">读取占比</span>
              <strong>{{
                readRatio === undefined
                  ? "—"
                  : `${(readRatio * 100).toFixed(1)}%`
              }}</strong>
            </div>
            <div class="usage-cell">
              <span class="usage-label">缓存写入</span>
              <strong>{{
                usageNumber(
                  selected.providerUsage?.promptTokensDetails?.cacheWriteTokens
                )
              }}</strong>
            </div>
          </div>

          <p v-if="hasCacheWriteBreakdown" class="muted">
            写入细分：5 分钟
            {{
              usageNumber(
                selected.providerUsage?.promptTokensDetails?.cacheWrite5mTokens
              )
            }}
            · 1 小时
            {{
              usageNumber(
                selected.providerUsage?.promptTokensDetails?.cacheWrite1hTokens
              )
            }}
          </p>
          <p v-if="selected.estimatedUsage" class="muted">
            本地补算：输入
            {{ selected.estimatedUsage.promptTokens.toLocaleString() }} / 输出
            {{ selected.estimatedUsage.completionTokens.toLocaleString() }}
            tokens
          </p>
          <p v-if="selected.processingScope === 'server'" class="muted">
            含服务端内部处理，分段用量单独归属。
          </p>
        </InfoCard>
      </div>

      <!-- ========== 核心区：消息序列前缀命中图谱 ========== -->
      <InfoCard v-if="comparison" class="prefix-card">
        <template #header>
          <div class="card-head">
            <span class="card-title">前缀命中图谱</span>
            <div v-if="!comparison.summaryOnly" class="prefix-legend">
              <span class="legend-item"
                ><span class="legend-dot dot-success" />稳定前缀</span
              >
              <span class="legend-item"
                ><span class="legend-dot dot-warning" />变化断裂点</span
              >
              <span class="legend-item"
                ><span class="legend-dot dot-neutral" />受牵连</span
              >
              <span class="legend-item"
                ><span class="legend-dot dot-primary" />新增</span
              >
              <span class="legend-item"
                ><span class="legend-dot dot-removed" />已移除</span
              >
            </div>
          </div>
        </template>

        <p v-if="comparison.summaryOnly" class="muted" role="status">
          当前对比包含仅保留整体摘要的记录，消息序列明细已精简。
        </p>
        <div v-else class="prefix-track">
          <button
            v-for="block in prefixBlocks"
            :key="block.key"
            type="button"
            class="prefix-block"
            :class="[
              `role-${block.role}`,
              `status-${block.status}`,
              { 'is-active': activeBlock?.key === block.key },
            ]"
            :title="`${block.label} · ${block.partCount} 块 · ${block.charLength.toLocaleString()} 字符`"
            :aria-label="`${block.label} · ${roleTag(block.role)} · ${prefixStatusLabel(block.status)}`"
            :aria-pressed="activeBlock?.key === block.key"
            @click="focusBlock(block)"
          >
            <span v-if="block.status === 'stable'" class="block-badge">
              <el-icon><Check /></el-icon>
            </span>
            <span
              v-else-if="block.status === 'breakpoint'"
              class="block-badge badge-warning"
            >
              <el-icon><WarningFilled /></el-icon>
            </span>
            <span
              v-else-if="block.status === 'removed'"
              class="block-badge badge-removed"
              >−</span
            >
            <span v-else-if="block.status === 'added'" class="block-badge"
              >+</span
            >
            <span class="block-label">{{ block.label }}</span>
            <span class="block-role">{{ roleTag(block.role) }}</span>
            <span class="block-chars">{{
              compactNumber(block.charLength)
            }}</span>
          </button>
        </div>

        <div v-if="activeBlock" class="block-detail">
          <div class="detail-head">
            <span class="detail-title">
              {{
                activeBlock.index === -1
                  ? "顶层 System 指令"
                  : `第 ${activeBlock.index + 1} 条消息`
              }}
              <el-tag size="small" effect="plain">{{
                roleTag(activeBlock.role)
              }}</el-tag>
            </span>
            <div class="detail-meta">
              <el-tag size="small" type="info" effect="plain"
                >{{ activeBlock.partCount }} 个内容块</el-tag
              >
              <el-tag size="small" type="info" effect="plain"
                >{{ activeBlock.charLength.toLocaleString() }} 字符</el-tag
              >
            </div>
          </div>

          <div v-if="activeBlockSources.length" class="detail-sources">
            <span
              v-for="source in activeBlockSources"
              :key="source.sourceKey"
              class="source-chip"
            >
              {{ sourceLabel(source.sourceType)
              }}{{ source.sourceName ? ` · ${source.sourceName}` : "" }}
              <span v-if="source.executedMacros?.length" class="macro-hint"
                >· {{ source.executedMacros.length }} 个宏</span
              >
            </span>
          </div>
          <p v-else class="muted">该位置的来源待确认。</p>
        </div>
      </InfoCard>

      <!-- ========== 底部：差异对比 ========== -->
      <InfoCard v-if="comparison" class="diff-card">
        <template #header>
          <div class="card-head">
            <span class="card-title">
              差异对比
              <span class="muted diff-scope">{{ diffScopeLabel }}</span>
            </span>
            <el-radio-group
              v-if="hasTextPreview"
              v-model="diffMode"
              size="small"
            >
              <el-radio-button value="inline">内联</el-radio-button>
              <el-radio-button value="split">分栏</el-radio-button>
            </el-radio-group>
          </div>
        </template>

        <template v-if="hasTextPreview">
          <p v-if="previewNotice" class="muted" role="status">
            {{ previewNotice }}
          </p>
          <!-- 内联模式 -->
          <div
            v-if="diffMode === 'inline'"
            class="diff-inline"
            role="region"
            aria-label="请求文本差异"
          >
            <div
              v-for="(line, index) in visualDiffLines"
              :key="index"
              class="diff-line"
              :class="{
                'is-added': line.type === 'add',
                'is-removed': line.type === 'remove',
                'is-context': line.type === 'context',
              }"
            >
              <span class="line-no">{{ line.oldLineNo ?? "" }}</span>
              <span class="line-no">{{ line.newLineNo ?? "" }}</span>
              <span class="line-content">
                <template v-if="line.parts">
                  <span
                    v-for="(part, pIndex) in line.parts"
                    :key="pIndex"
                    :class="{
                      'word-added': part.added,
                      'word-removed': part.removed,
                    }"
                    >{{ part.value }}</span
                  >
                </template>
                <template v-else>{{ line.content }}</template>
              </span>
            </div>
          </div>

          <!-- 分栏模式 -->
          <div
            v-else
            class="diff-split"
            role="region"
            aria-label="请求文本差异"
          >
            <div class="diff-column">
              <h4>对照请求</h4>
              <pre>{{ activePartDiff?.left?.textPreview }}</pre>
            </div>
            <div class="diff-column">
              <h4>本次请求</h4>
              <pre>{{ activePartDiff?.right?.textPreview }}</pre>
            </div>
          </div>
        </template>

        <div
          v-else-if="isIdentical || activeBlockUnchanged"
          class="identical-hint"
        >
          <el-icon class="identical-icon"><Check /></el-icon>
          <span>{{
            isIdentical
              ? "两次请求的输入完全一致，没有可对比的文本差异。"
              : "当前消息与对照请求一致。"
          }}</span>
        </div>

        <div v-else-if="previewMissing" class="preview-guide">
          <el-icon class="guide-icon"><InfoFilled /></el-icon>
          <div class="guide-text">
            <p class="guide-title">已精确定位变化位置，但未保存具体文本</p>
            <p class="guide-desc">
              当前内容块的文本预览未留存。开启「保存去敏文本预览」后，新发送的请求可在此高亮显示具体差异。
            </p>
            <el-button
              v-if="!snapshotSettings.saveTextPreview"
              size="small"
              type="primary"
              :loading="savingSettings"
              @click="enableTextPreview"
              >立即开启文本预览（从下次发送生效）</el-button
            >
          </div>
        </div>

        <p v-else class="muted">
          {{
            comparison?.summaryOnly
              ? "记录已精简为整体摘要，无可用文本块对比。"
              : "该变化位置没有可对比的内容块。"
          }}
        </p>
      </InfoCard>
    </template>

    <!-- ========== 调试明细 ========== -->
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
import {
  Right,
  Refresh,
  RefreshLeft,
  Setting,
  Check,
  WarningFilled,
  InfoFilled,
  DataAnalysis,
  Connection,
} from "@element-plus/icons-vue";
import { diffLines, diffWordsWithSpace, type Change } from "diff";
import InfoCard from "@/components/common/InfoCard.vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatSessionDetail } from "../../types/session";
import type {
  ChatRequestAttemptSnapshot,
  SnapshotSource,
} from "../../types/requestSnapshot";
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
  compareSnapshotParts,
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
const diffMode = ref<"inline" | "split">("inline");
const focusKey = ref<string | null>(null);
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
const isAutoLinked = computed(() => {
  if (!selected.value || !props.nodeId) return false;
  return (
    selected.value.assistantNodeIds.includes(props.nodeId) ||
    selected.value.triggerNodeId === props.nodeId
  );
});

const hasCacheWriteBreakdown = computed(
  () =>
    selected.value?.providerUsage?.promptTokensDetails?.cacheWrite5mTokens !==
      undefined ||
    selected.value?.providerUsage?.promptTokensDetails?.cacheWrite1hTokens !==
      undefined
);

const captureSummary = computed(() => {
  if (!snapshotSettings.enabled) return "记录已关闭";
  return snapshotSettings.saveTextPreview ? "摘要 + 预览" : "仅记录摘要";
});

const usageStatusLabel = computed(() => {
  switch (selected.value?.providerUsageStatus) {
    case "reported":
      return "上游实报";
    case "partial":
      return "部分上报";
    default:
      return "上游未报";
  }
});

const usageStatusType = computed<"success" | "warning" | "info">(() => {
  switch (selected.value?.providerUsageStatus) {
    case "reported":
      return "success";
    case "partial":
      return "warning";
    default:
      return "info";
  }
});

interface UsageSegment {
  key: string;
  label: string;
  value: number;
  pct: number;
  type: "success" | "warning" | "info";
}

const usageBreakdown = computed<{ segments: UsageSegment[] } | null>(() => {
  const usage = selected.value?.providerUsage;
  const total = usage?.promptTokens ?? 0;
  if (!usage || total <= 0) return null;
  const cached = usage.promptTokensDetails?.cachedTokens;
  const write = usage.promptTokensDetails?.cacheWriteTokens;
  if (cached === undefined && write === undefined) return null;
  const cachedValue = cached ?? 0;
  const writeValue = write ?? 0;
  const remaining = Math.max(total - cachedValue - writeValue, 0);
  const segments: UsageSegment[] = [
    {
      key: "cached",
      label: "缓存读取",
      value: cachedValue,
      pct: (cachedValue / total) * 100,
      type: "success",
    },
    {
      key: "write",
      label: "缓存写入",
      value: writeValue,
      pct: (writeValue / total) * 100,
      type: "warning",
    },
    {
      key: "normal",
      label: "未缓存",
      value: remaining,
      pct: (remaining / total) * 100,
      type: "info",
    },
  ];
  return { segments: segments.filter((segment) => segment.value > 0) };
});

type DiagnosisTone = "success" | "warning" | "info" | "neutral";

interface Diagnosis {
  tone: DiagnosisTone;
  title: string;
  desc: string;
  icon: typeof Check;
}

const diagnosis = computed<Diagnosis | null>(() => {
  const cmp = comparison.value;
  const sel = selected.value;
  if (!cmp || !sel) return null;

  if (cmp.summaryOnly) {
    const equal = cmp.kind === "equal";
    return {
      tone: equal ? "success" : "neutral",
      icon: equal ? Check : InfoFilled,
      title: equal ? "输入整体摘要一致" : "输入已变化（明细已精简）",
      desc: "部分记录因容量预算仅保留整体摘要，消息位置与文本明细已精简。",
    };
  }

  if (
    cmp.boundaryEqual &&
    !cmp.systemChanged &&
    cmp.configurationChanges.length
  ) {
    return {
      tone: "warning",
      icon: WarningFilled,
      title: "消息保持一致，请求配置已变化",
      desc: "顶层指令与消息正文保持一致，配置变化详见下方；实际缓存读取量以上游用量为准。",
    };
  }

  if (cmp.kind === "equal" && !cmp.systemChanged) {
    return {
      tone: "success",
      icon: Check,
      title: "输入完全一致",
      desc: "所记录的请求输入与配置一致；实际缓存读取量以上游用量为准。",
    };
  }

  if (cmp.kind === "append") {
    const stable = cmp.firstDiffIndex;
    const added = sel.messages.length - stable;
    return {
      tone: "success",
      icon: Check,
      title: `正常追加对话（前 ${stable} 条消息完全稳定）`,
      desc: `仅在尾部新增了 ${added} 条消息，前面的稳定前缀可完整复用缓存。`,
    };
  }

  if (cmp.kind === "shorten") {
    return {
      tone: "info",
      icon: InfoFilled,
      title: `尾部消息被裁剪（前 ${cmp.firstDiffIndex} 条消息保持稳定）`,
      desc: "前半部分未受影响，末尾消息减少，常见于回退或上下文裁剪。",
    };
  }

  if (cmp.systemChanged) {
    return {
      tone: "warning",
      icon: WarningFilled,
      title: "顶层 System 指令发生变化",
      desc: "上游抽取的顶层系统指令已改变，缓存会从指令处开始断裂。",
    };
  }

  const position = cmp.firstDiffIndex + 1;
  const role = sel.messages[cmp.firstDiffIndex]?.role;
  const roleText = role ? `（${roleTag(role)}）` : "";
  return {
    tone: "warning",
    icon: WarningFilled,
    title: `前缀在第 ${position} 条消息处发生断裂`,
    desc: `前 ${cmp.firstDiffIndex} 条完整消息一致，从第 ${position} 条${roleText}开始发生变化。`,
  };
});

interface PrefixBlock {
  key: string;
  index: number;
  role: string;
  label: string;
  charLength: number;
  partCount: number;
  status: "stable" | "breakpoint" | "affected" | "added" | "removed";
  sourceKeys: string[];
}

const prefixBlocks = computed<PrefixBlock[]>(() => {
  const cmp = comparison.value;
  const sel = selected.value;
  if (!cmp || !sel || cmp.summaryOnly) return [];
  const base = baseline.value;
  const blocks: PrefixBlock[] = [];

  const system = sel.topLevelSystem ?? base?.topLevelSystem;
  if (system) {
    const parts = system.parts;
    blocks.push({
      key: "system",
      index: -1,
      role: "system",
      label: "顶层指令",
      charLength: parts.reduce((sum, part) => sum + (part.charLength ?? 0), 0),
      partCount: parts.length,
      status: cmp.systemChanged ? "breakpoint" : "stable",
      sourceKeys: system.sourceKeys,
    });
  }

  const count = Math.max(sel.messages.length, base?.messages.length ?? 0);
  for (let index = 0; index < count; index++) {
    const message = sel.messages[index] ?? base!.messages[index];
    let status: PrefixBlock["status"];
    if (!sel.messages[index]) status = "removed";
    else if (cmp.systemChanged) {
      status = index >= (base?.messages.length ?? 0) ? "added" : "affected";
    } else if (index < cmp.firstDiffIndex) status = "stable";
    else if (index === cmp.firstDiffIndex) status = "breakpoint";
    else if (index >= (base?.messages.length ?? 0)) status = "added";
    else status = "affected";

    blocks.push({
      key: `msg-${index}`,
      index,
      role: message.role,
      label: `#${index + 1}`,
      charLength: message.parts.reduce(
        (sum, part) => sum + (part.charLength ?? 0),
        0
      ),
      partCount: message.parts.length,
      status,
      sourceKeys: message.sourceKeys,
    });
  }

  return blocks;
});

const activeBlock = computed(() => {
  const blocks = prefixBlocks.value;
  if (!blocks.length) return null;
  if (focusKey.value) {
    const found = blocks.find((block) => block.key === focusKey.value);
    if (found) return found;
  }
  const breakpoint = blocks.find((block) => block.status === "breakpoint");
  return breakpoint ?? blocks[blocks.length - 1];
});

const activeBlockSources = computed<SnapshotSource[]>(() => {
  const block = activeBlock.value;
  const snapshot =
    block?.index === -1
      ? selected.value?.topLevelSystem
        ? selected.value
        : baseline.value
      : block && selected.value?.messages[block.index]
        ? selected.value
        : baseline.value;
  if (!block || !snapshot) return [];
  const byKey = new Map(
    snapshot.sources.map((source) => [source.sourceKey, source])
  );
  const visited = new Set<string>();
  const result: SnapshotSource[] = [];
  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const source = byKey.get(key);
    if (!source) return;
    if (source.parentSourceKeys?.length) {
      source.parentSourceKeys.forEach(visit);
    } else {
      result.push(source);
    }
  };
  block.sourceKeys.forEach(visit);
  return result;
});

interface VisualDiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
  parts?: Change[];
}

function buildDiffLines(left: string, right: string): VisualDiffLine[] {
  const rawOps = diffLines(left, right)
    .map((part) => {
      const lines = part.value.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      return {
        type: (part.added ? "add" : part.removed ? "remove" : "common") as
          "add" | "remove" | "common",
        lines,
      };
    })
    .filter((op) => op.lines.length > 0);

  const result: VisualDiffLine[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;
  let cursor = 0;

  while (cursor < rawOps.length) {
    const op = rawOps[cursor];
    if (op.type === "common") {
      op.lines.forEach((line) => {
        result.push({
          type: "context",
          content: line,
          oldLineNo: oldLineNo++,
          newLineNo: newLineNo++,
        });
      });
      cursor++;
      continue;
    }

    const next = rawOps[cursor + 1];
    if (op.type === "remove" && next && next.type === "add") {
      const max = Math.max(op.lines.length, next.lines.length);
      for (let i = 0; i < max; i++) {
        const removed = op.lines[i];
        const added = next.lines[i];
        if (removed !== undefined && added !== undefined) {
          if (removed === added) {
            result.push({
              type: "context",
              content: removed,
              oldLineNo: oldLineNo++,
              newLineNo: newLineNo++,
            });
          } else {
            const wordDiff = diffWordsWithSpace(removed, added);
            result.push({
              type: "remove",
              content: removed,
              oldLineNo: oldLineNo++,
              parts: wordDiff.filter((part) => !part.added),
            });
            result.push({
              type: "add",
              content: added,
              newLineNo: newLineNo++,
              parts: wordDiff.filter((part) => !part.removed),
            });
          }
        } else if (removed !== undefined) {
          result.push({
            type: "remove",
            content: removed,
            oldLineNo: oldLineNo++,
          });
        } else if (added !== undefined) {
          result.push({ type: "add", content: added, newLineNo: newLineNo++ });
        }
      }
      cursor += 2;
      continue;
    }

    op.lines.forEach((line) => {
      if (op.type === "remove") {
        result.push({ type: "remove", content: line, oldLineNo: oldLineNo++ });
      } else {
        result.push({ type: "add", content: line, newLineNo: newLineNo++ });
      }
    });
    cursor++;
  }

  return result;
}

const activeMessages = computed(() => {
  const block = activeBlock.value;
  if (!block) return undefined;
  return block.index === -1
    ? {
        left: baseline.value?.topLevelSystem,
        right: selected.value?.topLevelSystem,
      }
    : {
        left: baseline.value?.messages[block.index],
        right: selected.value?.messages[block.index],
      };
});

const activePartDiff = computed(() => {
  const pair = activeMessages.value;
  if (!pair || comparison.value?.summaryOnly) return undefined;
  return compareSnapshotParts(pair.left?.parts ?? [], pair.right?.parts ?? []);
});

const diffScopeLabel = computed(() => {
  const block = activeBlock.value;
  const part = activePartDiff.value;
  if (comparison.value?.summaryOnly) return "· 明细已精简";
  if (!block) return "· 无可用内容块";
  const scope =
    block.index === -1
      ? "顶层 System 指令"
      : `第 ${block.index + 1} 条消息（${roleTag(block.role)}）`;
  return `· ${scope}${part && (part.left || part.right) ? ` 第 ${part.firstPart + 1} 个内容块` : ""}`;
});

const isIdentical = computed(
  () =>
    comparison.value?.kind === "equal" &&
    !comparison.value.summaryOnly &&
    !comparison.value.systemChanged
);
const activeBlockUnchanged = computed(() => {
  const pair = activeMessages.value;
  return (
    !!pair?.left && !!pair.right && pair.left.wireHash === pair.right.wireHash
  );
});

const previewMissing = computed(() => {
  const part = activePartDiff.value;
  return (
    !!part &&
    [part.left, part.right].some(
      (side) => side !== undefined && side.textPreview === undefined
    )
  );
});

const hasTextPreview = computed(() => {
  const part = activePartDiff.value;
  return (
    !previewMissing.value &&
    !!part &&
    (part.left?.textPreview !== undefined ||
      part.right?.textPreview !== undefined)
  );
});

const previewNotice = computed(() => {
  const part = activePartDiff.value;
  if (!part || !hasTextPreview.value) return "";
  const states = [part.left?.textState, part.right?.textState];
  const notes: string[] = [];
  if (states.includes("truncated"))
    notes.push("预览已截断，差异仅覆盖留存文本");
  if (states.includes("redacted"))
    notes.push("预览已去敏，部分原始差异可能已隐藏");
  if ((part.left?.textPreview ?? "") === (part.right?.textPreview ?? ""))
    notes.push("内容块已变化，当前留存预览一致");
  return notes.join("；");
});

const visualDiffLines = computed<VisualDiffLine[]>(() => {
  const part = activePartDiff.value;
  if (!part || !hasTextPreview.value) return [];
  return buildDiffLines(
    part.left?.textPreview ?? "",
    part.right?.textPreview ?? ""
  );
});

watch(
  () => comparison.value,
  (cmp) => {
    focusKey.value = cmp?.summaryOnly
      ? null
      : cmp?.systemChanged
        ? "system"
        : cmp && !cmp.boundaryEqual
          ? `msg-${cmp.firstDiffIndex}`
          : null;
  },
  { immediate: true }
);

const prefixStatusLabel = (status: PrefixBlock["status"]) =>
  ({
    stable: "稳定前缀",
    breakpoint: "变化断裂点",
    affected: "受牵连",
    added: "新增",
    removed: "已移除",
  })[status];

function focusBlock(block: PrefixBlock) {
  focusKey.value = block.key;
}

function orderOf(attempt: ChatRequestAttemptSnapshot) {
  return (
    attempts.value.findIndex((item) => item.attemptId === attempt.attemptId) + 1
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function attemptLabel(attempt: ChatRequestAttemptSnapshot) {
  const parts = [
    `#${orderOf(attempt)}`,
    formatTime(attempt.startedAt),
    attempt.route.actualModelId || "未知模型",
    `${attempt.messages.length} 条消息`,
  ];
  const ratio = usageReadRatio(attempt.providerUsage);
  if (ratio !== undefined) parts.push(`缓存 ${(ratio * 100).toFixed(0)}%`);
  if (attempt.attemptIndex > 1) parts.push(`尝试 ${attempt.attemptIndex}`);
  parts.push(statusLabel(attempt.status));
  return parts.join(" · ");
}

const statusLabel = (status: string) =>
  ({ completed: "已完成", error: "发送失败", aborted: "已取消" })[status] ??
  status;

const statusTagType = (status: string): "success" | "danger" | "info" =>
  status === "completed" ? "success" : status === "error" ? "danger" : "info";

const roleTag = (role: string) =>
  ({ system: "SYS", user: "USER", assistant: "AI" })[role] ??
  role.toUpperCase();

const compactNumber = (value: number) =>
  value >= 10000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();

const usageNumber = (value: number | undefined, known = true) =>
  known && value !== undefined ? value.toLocaleString() : "未上报";

const sourceLabel = (type?: string) =>
  ({
    agent_preset: "预设",
    session_history: "历史消息",
    depth_injection: "深度注入",
    anchor_injection: "锚点注入",
    recall: "Recall",
    recall_placeholder: "Recall 占位符",
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

async function enableRecording() {
  snapshotSettings.enabled = true;
  await updateSettings();
  if (snapshotSettings.enabled) customMessage.success("已开启请求记录");
}

async function enableTextPreview() {
  snapshotSettings.saveTextPreview = true;
  await updateSettings();
  if (snapshotSettings.saveTextPreview)
    customMessage.success("已开启文本预览，从下次发送生效");
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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--el-text-color-primary);
  box-sizing: border-box;
}

/* ========== 顶部对比导航栏 ========== */
.compare-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, var(--el-border-color-lighter));
}

.compare-flow {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.flow-arrow {
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.selector-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 220px;
  max-width: 380px;
}

.field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.select-control {
  width: 100%;
}

.attempt-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.opt-order {
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.opt-time {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.opt-model {
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.opt-count,
.opt-retry {
  color: var(--el-text-color-secondary);
}

.compare-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ========== 记录设置面板 ========== */
.settings-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.settings-desc,
.settings-meta,
.settings-path {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.settings-path {
  overflow-wrap: anywhere;
  color: var(--el-text-color-placeholder);
}

/* ========== 卡片通用头部 ========== */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

/* ========== 空状态 ========== */
.empty-card {
  margin-top: 4px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 32px 16px;
}

.empty-icon {
  font-size: 36px;
  color: var(--el-text-color-placeholder);
}

.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.empty-desc {
  margin: 0;
  max-width: 460px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

/* ========== 概览区 ========== */
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: stretch;
}

.diagnosis-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color, var(--el-border-color-lighter));
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.06)
  );
}

.diagnosis-head.tone-success {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
  border-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.35)
  );
}

.diagnosis-head.tone-warning {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  border-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
}

.diagnosis-head.tone-info {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.35)
  );
}

.diagnosis-icon {
  font-size: 20px;
  margin-top: 1px;
  flex-shrink: 0;
}

.tone-success .diagnosis-icon {
  color: var(--el-color-success);
}

.tone-warning .diagnosis-icon {
  color: var(--el-color-warning);
}

.tone-info .diagnosis-icon {
  color: var(--el-color-primary);
}

.tone-neutral .diagnosis-icon {
  color: var(--el-text-color-secondary);
}

.diagnosis-text {
  min-width: 0;
}

.diagnosis-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.diagnosis-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.prefix-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  border: 1px solid
    rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.35));
}

.diagnosis-section {
  margin-top: 14px;
}

.section-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.cause-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  margin: 8px 0 0;
}

/* ========== 用量卡 ========== */
.usage-bar {
  display: flex;
  width: 100%;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--el-fill-color-light);
  margin-bottom: 8px;
}

.usage-bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.seg-success {
  background-color: var(--el-color-success);
}

.seg-warning {
  background-color: var(--el-color-warning);
}

.seg-info {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.5)
  );
}

.usage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-success {
  background-color: var(--el-color-success);
}

.dot-warning {
  background-color: var(--el-color-warning);
}

.dot-info {
  background-color: var(--el-color-info);
}

.dot-neutral {
  background-color: var(--el-text-color-placeholder);
}

.dot-primary {
  background-color: var(--el-color-primary);
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.usage-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid var(--el-border-color-lighter);
  min-width: 0;
}

.usage-cell:last-child {
  border-right: 0;
  padding-right: 0;
}

.usage-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.usage-cell strong {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* ========== 前缀命中图谱 ========== */
.prefix-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-weight: normal;
}

.prefix-track {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0 12px;
}

.prefix-block {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  background-color: var(--card-bg, var(--el-fill-color-blank));
  border: 1px solid var(--border-color, var(--el-border-color-lighter));
  color: var(--el-text-color-primary);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.prefix-block:hover {
  border-color: var(--el-color-primary);
}

.prefix-block.is-active {
  box-shadow: 0 0 0 2px
    rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.4));
}

/* 状态：稳定前缀 */
.prefix-block.status-stable {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  border-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.35)
  );
}

/* 状态：断裂点 —— 强语义，使用固定 2px 左边线 + 警告色 */
.prefix-block.status-breakpoint {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.14)
  );
  border-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.55)
  );
  border-left-width: 2px;
  border-left-color: var(--el-color-warning);
  font-weight: 600;
}

/* 状态：受牵连 */
.prefix-block.status-affected {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.07)
  );
  border-style: dashed;
  color: var(--el-text-color-secondary);
}

/* 状态：移除 */
.prefix-block.status-removed {
  border-style: dashed;
  border-color: var(--el-color-danger);
  color: var(--el-text-color-secondary);
}

.badge-removed {
  color: var(--el-color-danger);
}

.dot-removed {
  background-color: var(--el-color-danger);
}

/* 状态：新增 */
.prefix-block.status-added {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.35)
  );
}

.block-badge {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-success);
  font-size: 13px;
}

.badge-warning {
  color: var(--el-color-warning);
}

.block-label {
  font-family: var(--el-font-family-monospace);
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.block-role {
  font-weight: 600;
  letter-spacing: 0.3px;
}

.prefix-block.role-system .block-role {
  color: var(--el-color-info);
}

.prefix-block.role-user .block-role {
  color: var(--el-color-success);
}

.prefix-block.role-assistant .block-role {
  color: var(--el-color-primary);
}

.block-chars {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.block-detail {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.detail-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.detail-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 9px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
  border: 1px solid
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity, 1) * 0.25));
}

.macro-hint {
  color: var(--el-color-warning);
}

/* ========== Diff 卡 ========== */
.diff-scope {
  font-weight: normal;
}

.diff-inline {
  font-family: var(--el-font-family-monospace);
  font-size: 12px;
  line-height: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: auto;
  max-height: 420px;
  background-color: var(--input-bg, var(--el-fill-color-blank));
}

.diff-line {
  display: flex;
  min-width: max-content;
}

.line-no {
  width: 40px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-lighter);
  border-right: 1px solid var(--el-border-color-lighter);
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.line-content {
  padding: 0 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  flex: 1;
}

.diff-line.is-added {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}

.diff-line.is-removed {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}

.diff-line.is-context {
  color: var(--el-text-color-regular);
}

.word-added {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.3)
  );
  border-radius: 2px;
}

.word-removed {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity, 1) * 0.3)
  );
  text-decoration: line-through;
  border-radius: 2px;
}

.diff-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.diff-column {
  min-width: 0;
}

.diff-column h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.diff-column pre {
  margin: 0;
  padding: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
  background-color: var(--input-bg, var(--el-fill-color-blank));
  font-family: var(--el-font-family-monospace);
}

.identical-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-color-success);
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
  border: 1px solid
    rgba(var(--el-color-success-rgb), calc(var(--card-opacity, 1) * 0.35));
}

.identical-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.preview-guide {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.06)
  );
  border: 1px dashed
    rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.35));
}

.guide-icon {
  font-size: 20px;
  color: var(--el-color-primary);
  flex-shrink: 0;
  margin-top: 1px;
}

.guide-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
}

.guide-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.guide-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

/* ========== 调试明细 ========== */
.debug-details {
  border-top: 1px solid var(--el-border-color-lighter);
}

.debug-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px 0;
  user-select: none;
}

.debug-details pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  font-size: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

@media (max-width: 900px) {
  .overview-grid,
  .diff-split {
    grid-template-columns: 1fr;
  }

  .usage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .usage-cell:nth-child(2) {
    border-right: 0;
  }
}
</style>
