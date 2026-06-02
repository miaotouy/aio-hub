<template>
  <div class="overview-tab">
    <!-- 请求摘要 -->
    <section class="section">
      <h4>
        <ArrowUpFromLine :size="14" />
        <span>请求摘要</span>
      </h4>
      <div class="info-grid">
        <div class="info-item">
          <label>方法</label>
          <span class="method-badge">{{ record.request.method }}</span>
        </div>
        <div class="info-item">
          <label>大小</label>
          <span>{{ formatSize(record.request.request_size) }}</span>
        </div>
        <div class="info-item full-row">
          <label>URL</label>
          <span class="url-full">{{ record.request.url }}</span>
        </div>
        <div class="info-item full-row">
          <label>时间</label>
          <span
            class="time-display"
            :title="formatFullIso(record.request.timestamp)"
          >
            <span class="time-iso">{{
              formatLocalTime(record.request.timestamp)
            }}</span>
            <span class="time-relative">{{
              formatRelativeTime(record.request.timestamp)
            }}</span>
          </span>
        </div>
      </div>

      <div class="subsection">
        <button
          class="collapse-header"
          @click="requestHeadersExpanded = !requestHeadersExpanded"
        >
          <ChevronRight
            :size="14"
            class="collapse-icon"
            :class="{ expanded: requestHeadersExpanded }"
          />
          <span class="collapse-title">
            请求头
            <span class="count-badge">{{ requestHeaderCount }}</span>
          </span>
          <button
            v-if="requestHeadersExpanded"
            @click.stop="copyRequestHeaders"
            class="btn-copy-small"
            title="复制请求头"
          >
            <Copy :size="13" />
          </button>
        </button>
        <div v-if="requestHeadersExpanded" class="headers-list">
          <div
            v-for="(value, key) in record.request.headers"
            :key="key"
            class="header-item"
          >
            <span class="header-key">{{ key }}:</span>
            <span class="header-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 响应摘要 -->
    <section v-if="record.response || isStreamingActive" class="section">
      <h4>
        <ArrowDownToLine :size="14" />
        <span>响应摘要</span>
      </h4>
      <div v-if="record.response" class="info-grid">
        <div class="info-item">
          <label>状态码</label>
          <span
            :class="['status-badge', getStatusClass(record.response.status)]"
          >
            {{ record.response.status }}
          </span>
        </div>
        <div class="info-item">
          <label>耗时</label>
          <span>{{ record.response.duration_ms }}ms</span>
        </div>
        <div class="info-item">
          <label>大小</label>
          <span>{{ formatSize(record.response.response_size) }}</span>
        </div>
        <div class="info-item" v-if="streamMode">
          <label>流式</label>
          <span class="stream-flag" :title="streamMode.tooltip">
            <Activity :size="12" />
            <span>{{ streamMode.label }}</span>
          </span>
        </div>
      </div>
      <div v-else-if="isStreamingActive" class="info-grid">
        <div class="info-item">
          <label>状态</label>
          <span class="streaming-status">
            <LoaderCircle :size="13" class="spin-icon" />
            接收中...
          </span>
        </div>
      </div>

      <div class="subsection" v-if="record.response">
        <button
          class="collapse-header"
          @click="responseHeadersExpanded = !responseHeadersExpanded"
        >
          <ChevronRight
            :size="14"
            class="collapse-icon"
            :class="{ expanded: responseHeadersExpanded }"
          />
          <span class="collapse-title">
            响应头
            <span class="count-badge">{{ responseHeaderCount }}</span>
          </span>
          <button
            v-if="responseHeadersExpanded"
            @click.stop="copyResponseHeaders"
            class="btn-copy-small"
            title="复制响应头"
          >
            <Copy :size="13" />
          </button>
        </button>
        <div v-if="responseHeadersExpanded" class="headers-list">
          <div
            v-for="(value, key) in record.response.headers"
            :key="key"
            class="header-item"
          >
            <span class="header-key">{{ key }}:</span>
            <span class="header-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Token 卡（服务端 usage 自动展示 + 客户端估算按需触发） -->
    <section v-if="hasTokenInfo || canTriggerClientEstimate" class="section">
      <h4>
        <Calculator :size="14" />
        <span>Token</span>
        <span v-if="isEstimating" class="estimating-tag" title="正在估算中...">
          <LoaderCircle :size="11" class="spin-icon" />
        </span>
        <span
          v-if="
            requestEstimate?.algorithm && requestEstimate.algorithm !== 'none'
          "
          class="tokenizer-tag"
          :title="`使用的 tokenizer: ${requestEstimate.algorithm}${requestEstimate.isEstimated ? ' (粗略估算)' : ''}`"
        >
          {{ requestEstimate.algorithm }}
          <span v-if="requestEstimate.isEstimated" class="estimate-mark"
            >~</span
          >
        </span>
        <!-- 重新估算按钮（仅在已估算后显示） -->
        <button
          v-if="hasClientEstimate"
          class="btn-recompute"
          :disabled="isEstimating"
          :title="
            isEstimating
              ? '正在估算中...'
              : '清除缓存并重新估算客户端 Token（如刚切换 tokenizer 偏好）'
          "
          @click="handleRecompute"
        >
          <RefreshCw :size="12" :class="{ 'spin-icon': isEstimating }" />
        </button>
      </h4>

      <!-- 估算结果 / 服务端 usage 对照表 -->
      <div class="token-grid">
        <div class="token-col">
          <div class="token-col-title">
            <ArrowUpFromLine :size="11" />
            <span>请求 (Prompt)</span>
          </div>
          <div class="token-row" v-if="serverUsage">
            <label>服务端 usage</label>
            <span class="token-value mono">
              {{ formatTokenCount(serverUsage.promptTokens) }}
            </span>
          </div>
          <div class="token-row" v-if="hasClientEstimate">
            <label>客户端估算</label>
            <span class="token-value">{{
              formatTokenCount(requestEstimate?.total)
            }}</span>
          </div>
          <div
            v-if="promptDeviation"
            class="token-deviation"
            :class="deviationClass(promptDeviation.deltaPercent)"
            :title="deviationTooltip(promptDeviation.deltaPercent)"
          >
            <component
              :is="deviationIcon(promptDeviation.deltaPercent)"
              :size="11"
            />
            <span
              >偏差 {{ formatDeviation(promptDeviation.deltaPercent) }}</span
            >
          </div>
        </div>

        <div
          class="token-col"
          v-if="
            (hasClientEstimate && responseEstimate) ||
            serverUsage?.completionTokens
          "
        >
          <div class="token-col-title">
            <ArrowDownToLine :size="11" />
            <span>响应 (Completion)</span>
          </div>
          <div class="token-row" v-if="serverUsage">
            <label>服务端 usage</label>
            <span class="token-value mono">
              {{ formatTokenCount(serverUsage.completionTokens) }}
            </span>
          </div>
          <div class="token-row" v-if="hasClientEstimate">
            <label>客户端估算</label>
            <span class="token-value">
              {{ formatTokenCount(responseEstimate?.total) }}
            </span>
          </div>
          <div
            v-if="completionDeviation"
            class="token-deviation"
            :class="deviationClass(completionDeviation.deltaPercent)"
            :title="deviationTooltip(completionDeviation.deltaPercent)"
          >
            <component
              :is="deviationIcon(completionDeviation.deltaPercent)"
              :size="11"
            />
            <span
              >偏差
              {{ formatDeviation(completionDeviation.deltaPercent) }}</span
            >
          </div>
        </div>

        <div class="token-col token-col-total" v-if="serverUsage">
          <div class="token-col-title">
            <Sigma :size="11" />
            <span>总计</span>
          </div>
          <div class="token-row">
            <label>服务端 total</label>
            <span class="token-value mono total-highlight">
              {{ formatTokenCount(serverUsage.totalTokens) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 手动触发客户端估算入口 -->
      <div v-if="canTriggerClientEstimate" class="token-trigger-row">
        <button
          class="btn-trigger-estimate"
          :disabled="isEstimating"
          :title="
            isEstimating
              ? '正在估算中...'
              : '运行本地 tokenizer 估算请求/响应的 Token 数（首次加载 tokenizer 需要数秒）'
          "
          @click="handleComputeClient"
        >
          <Calculator v-if="!isEstimating" :size="13" />
          <LoaderCircle v-else :size="13" class="spin-icon" />
          <span>
            {{
              isEstimating
                ? "估算中..."
                : serverUsage
                  ? "运行客户端估算（对比服务端 usage）"
                  : "运行客户端估算"
            }}
          </span>
        </button>
        <span class="token-trigger-hint">
          客户端估算需要加载本地 tokenizer，仅在需要校对偏差时手动触发即可。
        </span>
      </div>

      <!-- 错误提示 -->
      <div v-if="estimateError" class="token-error" :title="estimateError">
        <AlertTriangle :size="11" />
        <span>客户端估算失败：{{ estimateError }}</span>
      </div>

      <!-- 附件 Token 占位提示（A3 stub） -->
      <div
        v-if="hasAttachmentBlocks"
        class="token-hint"
        title="多模态附件 Token 估算待 F3 实装"
      >
        <Info :size="11" />
        <span>检测到附件，附件 Token 暂未计入估算</span>
      </div>
    </section>

    <!-- Inspector 元数据（仅 internal 来源） -->
    <section v-if="hasInspectorMetadata" class="section">
      <h4>
        <Sparkles :size="14" />
        <span>Inspector 元数据</span>
        <span class="source-badge" :class="record.source">
          {{ record.source === "internal" ? "内部" : "外部" }}
        </span>
      </h4>
      <div class="info-grid">
        <div v-if="record.inspectorMetadata?.toolName" class="info-item">
          <label>工具</label>
          <span class="meta-value">{{
            record.inspectorMetadata.toolName
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.purpose" class="info-item">
          <label>用途</label>
          <span class="meta-value">{{ record.inspectorMetadata.purpose }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.profileId" class="info-item">
          <label>Profile ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.profileId
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.modelId" class="info-item">
          <label>Model ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.modelId
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.sessionId" class="info-item">
          <label>Session ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.sessionId
          }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, markRaw } from "vue";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  Check,
  ChevronRight,
  Copy,
  Info,
  LoaderCircle,
  RefreshCw,
  Sigma,
  Sparkles,
  TriangleAlert,
} from "lucide-vue-next";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useRecordDetail } from "../../composables/useRecordDetail";
import { useTokenEstimate } from "../../composables/useTokenEstimate";
import type { CombinedRecord } from "../../types";
const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
  /** 是否在响应到达后自动执行客户端估算（来自全局设置） */
  autoEstimateTokens?: boolean;
}>();

const {
  isStreamingActive,
  isStreamingResponse,
  copyRequestHeaders,
  copyResponseHeaders,
  formatSize,
  getStatusClass,
} = useRecordDetail(props);

// Token：服务端 usage 自动 + 客户端估算按需
const recordRef = toRef(props, "record");
const autoEstimateRef = computed(() => props.autoEstimateTokens === true);
const {
  requestEstimate,
  responseEstimate,
  serverUsage,
  isEstimating,
  estimateError,
  hasClientEstimate,
  promptDeviation,
  completionDeviation,
  computeClient,
  recompute,
} = useTokenEstimate(recordRef, { autoEstimate: autoEstimateRef });

async function handleRecompute() {
  if (isEstimating.value) return;
  await recompute();
}

async function handleComputeClient() {
  if (isEstimating.value) return;
  await computeClient();
}

/** 是否可以触发客户端估算（请求体存在、未估算、未在估算中） */
const canTriggerClientEstimate = computed(() => {
  if (isEstimating.value) return false;
  if (hasClientEstimate.value) return false;
  return Boolean(props.record.request.body);
});

// 折叠状态（默认折叠）
const requestHeadersExpanded = ref(false);
const responseHeadersExpanded = ref(false);

// Header 数量
const requestHeaderCount = computed(
  () => Object.keys(props.record.request.headers || {}).length
);
const responseHeaderCount = computed(
  () => Object.keys(props.record.response?.headers || {}).length
);

// 是否有 Inspector 元数据
const hasInspectorMetadata = computed(() => {
  const meta = props.record.inspectorMetadata;
  if (!meta) return false;
  return Boolean(
    meta.toolName ||
    meta.purpose ||
    meta.profileId ||
    meta.modelId ||
    meta.sessionId
  );
});

// Token 卡片是否显示（任意数据源有内容就显示）
const hasTokenInfo = computed(() => {
  return Boolean(
    requestEstimate.value?.total ||
    responseEstimate.value?.total ||
    serverUsage.value
  );
});

// 是否检测到附件（当前 stub 始终 0，未来 F3 接入真实图像计数后自动生效）
const hasAttachmentBlocks = computed(() => {
  const reqAttach = requestEstimate.value?.attachment ?? 0;
  const resAttach = responseEstimate.value?.attachment ?? 0;
  return reqAttach > 0 || resAttach > 0;
});

// Token 数字格式化（千分位）
function formatTokenCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US");
}

// === F2 偏差对比工具 ===
// 偏差阈值：< 5% 视为正常，5%-15% 警告，> 15% 严重
const DEV_WARN = 5;
const DEV_DANGER = 15;

const DeviationOk = markRaw(Check);
const DeviationWarn = markRaw(TriangleAlert);
const DeviationDanger = markRaw(AlertTriangle);

function deviationClass(delta: number): string {
  const abs = Math.abs(delta);
  if (abs < DEV_WARN) return "deviation-ok";
  if (abs < DEV_DANGER) return "deviation-warn";
  return "deviation-danger";
}

function deviationIcon(delta: number) {
  const abs = Math.abs(delta);
  if (abs < DEV_WARN) return DeviationOk;
  if (abs < DEV_DANGER) return DeviationWarn;
  return DeviationDanger;
}

function deviationTooltip(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta > 0 ? "高估" : "低估";
  if (abs < DEV_WARN) return `估算精度良好（${sign} ${abs.toFixed(1)}%）`;
  if (abs < DEV_DANGER) {
    return `估算偏差较大（${sign} ${abs.toFixed(1)}%），tokenizer profile 可能不完全匹配实际模型`;
  }
  return `估算严重偏差（${sign} ${abs.toFixed(1)}%），强烈建议检查 tokenizer 选择或模型识别是否正确`;
}

function formatDeviation(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

// === G1：时间显示 ===
function formatLocalTime(ts: number): string {
  return formatDate(new Date(ts), "yyyy-MM-dd HH:mm:ss.SSS");
}

function formatFullIso(ts: number): string {
  return new Date(ts).toISOString();
}

function formatRelativeTime(ts: number): string {
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: zhCN });
}

// === G2：流式状态来源辨析 ===
// 区分「按配置声明的流式」和「实际是流式」
const requestBodyStreamFlag = computed<boolean | null>(() => {
  if (!props.record.request.body) return null;
  try {
    const parsed = JSON.parse(props.record.request.body);
    if (typeof parsed?.stream === "boolean") return parsed.stream;
    return null;
  } catch {
    return null;
  }
});

const streamMode = computed(() => {
  const declared = requestBodyStreamFlag.value;
  const actual = isStreamingResponse.value;
  if (!declared && !actual) return null;

  if (actual && declared === true) {
    return {
      label: "是（按配置）",
      tooltip: "请求体声明 stream:true，响应也确实是 SSE 流式",
    };
  }
  if (actual && declared !== true) {
    return {
      label: "是（实际）",
      tooltip:
        "请求体未声明 stream:true，但响应实际是 SSE 流式（可能服务端默认开启或网关转换）",
    };
  }
  if (!actual && declared === true) {
    return {
      label: "声明但未生效",
      tooltip:
        "请求体声明 stream:true，但响应不是 SSE 格式（可能服务端不支持或被网关合并）",
    };
  }
  return null;
});
</script>

<style scoped>
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 6px;
}

.source-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.source-badge.internal {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--primary-color);
  border: var(--border-width) solid
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.3));
}

.source-badge.external {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-info, #909399);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 16px;
}

.info-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.info-item.full-row {
  grid-column: 1 / -1;
  align-items: flex-start;
}

.info-item label {
  color: var(--text-color-light);
  flex-shrink: 0;
  min-width: 60px;
}

.info-item span {
  color: var(--text-color);
}

.method-badge {
  font-family: "Courier New", monospace;
  font-weight: 600;
  color: var(--primary-color);
  padding: 1px 8px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.12));
  border-radius: 3px;
  font-size: 12px;
}

.url-full {
  word-break: break-all;
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge.success {
  background: var(--el-color-success, #67c23a);
  color: white;
}

.status-badge.client-error {
  background: var(--el-color-warning, #e6a23c);
  color: white;
}

.status-badge.server-error {
  background: var(--el-color-danger, #f56c6c);
  color: white;
}

.stream-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--el-color-success, #67c23a);
  font-weight: 600;
}

.streaming-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-warning, #e6a23c);
  font-weight: bold;
}

.spin-icon {
  animation: spin 1.4s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.meta-value {
  color: var(--text-color);
}

.meta-value.mono {
  font-family: "Courier New", monospace;
  font-size: 12px;
  word-break: break-all;
}

/* === 折叠头部 === */
.subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color);
  text-align: left;
  transition: all 0.2s;
}

.collapse-header:hover {
  border-color: var(--primary-color);
}

.collapse-icon {
  color: var(--text-color-light);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.collapse-icon.expanded {
  transform: rotate(90deg);
}

.collapse-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.count-badge {
  padding: 0 6px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--primary-color);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  font-family: "Courier New", monospace;
}

.btn-copy-small {
  padding: 4px 8px;
  background: transparent;
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: all 0.2s;
}

.btn-copy-small:hover {
  background: var(--container-bg);
  opacity: 1;
}

.headers-list {
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  max-height: 240px;
  overflow-y: auto;
}

.header-item {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.header-item:last-child {
  margin-bottom: 0;
}

.header-key {
  color: var(--primary-color);
  font-weight: bold;
}

.header-value {
  color: var(--text-color);
  word-break: break-all;
}

/* === Token 卡片相关样式 === */
.estimating-tag {
  display: inline-flex;
  align-items: center;
  color: var(--text-color-light);
}

.tokenizer-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--primary-color);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  font-family: "Courier New", monospace;
}

.estimate-mark {
  margin-left: 2px;
  opacity: 0.7;
}

.btn-recompute {
  margin-left: auto;
  padding: 4px 6px;
  background: transparent;
  color: var(--text-color-light);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-recompute:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.btn-recompute:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.token-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.token-col-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.token-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.token-row label {
  color: var(--text-color-light);
}

.token-value {
  color: var(--text-color);
  font-weight: 600;
}

.token-value.mono {
  font-family: "Courier New", monospace;
}

.total-highlight {
  color: var(--primary-color);
  font-size: 14px;
}

.token-deviation {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  align-self: flex-start;
}

.token-deviation.deviation-ok {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-success, #67c23a);
}

.token-deviation.deviation-warn {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-warning, #e6a23c);
}

.token-deviation.deviation-danger {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-danger, #f56c6c);
}

.token-trigger-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.05));
  border: var(--border-width) dashed
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.4));
  border-radius: 6px;
}

.btn-trigger-estimate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card-bg);
  color: var(--primary-color);
  border: var(--border-width) solid var(--primary-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  align-self: flex-start;
  transition: all 0.2s;
}

.btn-trigger-estimate:hover:not(:disabled) {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.1));
}

.btn-trigger-estimate:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.token-trigger-hint {
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.token-error {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-color-danger, #f56c6c);
  border-radius: 4px;
  font-size: 11px;
  align-self: flex-start;
}

.token-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  color: var(--text-color-light);
  border-radius: 4px;
  font-size: 11px;
  align-self: flex-start;
}

/* === 时间显示样式 === */
.time-display {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-iso {
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.time-relative {
  font-size: 11px;
  color: var(--text-color-light);
}
</style>
