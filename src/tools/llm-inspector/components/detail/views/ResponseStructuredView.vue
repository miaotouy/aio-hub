<template>
  <div class="response-structured-view">
    <!-- 顶部信息条 -->
    <div class="info-bar">
      <span class="info-chip">
        <Code2 :size="12" />
        <span class="info-label">格式：</span>
        <span class="info-value">{{ apiFormat }}</span>
      </span>
      <span v-if="responseParseResult?.model" class="info-chip">
        <Cpu :size="12" />
        <span class="info-label">模型：</span>
        <span class="info-value">{{ responseParseResult.model }}</span>
      </span>
      <span v-if="responseParseResult?.stopReason" class="info-chip">
        <Flag :size="12" />
        <span class="info-label">停止原因：</span>
        <span class="info-value">{{ responseParseResult.stopReason }}</span>
      </span>
    </div>

    <!-- 流式实时接收提示 -->
    <div v-if="isStreamingActive" class="streaming-banner">
      <Circle :size="8" fill="currentColor" class="live-dot" />
      <span>
        正在实时接收 · 正文 {{ renderData?.mainText.length || 0 }} 字符
        <template v-if="renderData?.reasoningText.length">
          · 思维链 {{ renderData.reasoningText.length }} 字符
        </template>
      </span>
    </div>

    <!-- 占位 -->
    <div v-if="!renderData" class="response-placeholder">
      <Hourglass :size="14" />
      <span>{{
        isStreamingActive ? "等待流式数据到达…" : "响应体尚未到达"
      }}</span>
    </div>

    <!-- 解析失败提示（非流式 + 完全解析不出来时） -->
    <div v-else-if="parseErrorMessage" class="response-note">
      <Info :size="13" />
      <span>{{ parseErrorMessage }}</span>
    </div>

    <template v-else>
      <!-- 多 Candidate Tab（仅非流式且 >1 时显示） -->
      <div v-if="renderData.candidates.length > 1" class="candidate-tabs">
        <button
          v-for="(_, i) in renderData.candidates"
          :key="i"
          :class="{ active: activeCandidate === i }"
          class="candidate-tab"
          @click="activeCandidate = i"
        >
          候选 {{ i + 1 }}
        </button>
      </div>

      <!-- 🧠 思维链卡片 -->
      <LlmThinkNode
        v-if="renderData.reasoningText"
        raw-tag-name="reasoning"
        rule-id="inspector-reasoning"
        display-name="深度思考"
        :is-thinking="isReasoningActive"
        :collapsed-by-default="false"
        :raw-content="renderData.reasoningText"
      >
        <RichTextRenderer
          :content="renderData.reasoningText"
          :version="RendererVersion.V2_CUSTOM_PARSER"
          :is-streaming="isStreamingActive"
          :smoothing-enabled="true"
        />
      </LlmThinkNode>

      <!-- 📝 主正文 -->
      <div v-if="renderData.mainText" class="main-content">
        <RichTextRenderer
          :content="renderData.mainText"
          :version="RendererVersion.V2_CUSTOM_PARSER"
          :is-streaming="isStreamingActive"
          :smoothing-enabled="true"
        />
      </div>

      <!-- 🔧 工具调用 chip 列表（仅非流式） -->
      <div v-if="renderData.toolCalls.length" class="tool-calls-section">
        <div class="section-title">
          <Wrench :size="14" />
          <span>工具调用 ({{ renderData.toolCalls.length }})</span>
        </div>
        <div
          v-for="(block, i) in renderData.toolCalls"
          :key="i"
          class="tool-call-chip"
        >
          <div class="chip-header" @click="toggleExpand(i)">
            <code class="tool-name">{{ block.toolName || "unknown" }}</code>
            <code v-if="block.toolCallId" class="tool-id">
              {{ shortId(block.toolCallId) }}
            </code>
            <ChevronDown
              :size="12"
              class="chip-chevron"
              :class="{ rotated: !!expanded[i] }"
            />
          </div>
          <pre v-show="expanded[i]" class="chip-body">{{
            formatArgsForDisplay(block.toolArguments)
          }}</pre>
        </div>
      </div>

      <!-- ⚠️ Refusal 警告 -->
      <el-alert
        v-for="(block, i) in renderData.refusals"
        :key="`refusal-${i}`"
        type="warning"
        :title="`模型拒绝响应：${block.text || ''}`"
        :closable="false"
        show-icon
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import {
  ChevronDown,
  Circle,
  Code2,
  Cpu,
  Flag,
  Hourglass,
  Info,
  Wrench,
} from "lucide-vue-next";
import { ElAlert } from "element-plus";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import LlmThinkNode from "@/tools/rich-text-renderer/components/nodes/LlmThinkNode.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { parseResponseMessages } from "../../../core/messageParser";
import { detectApiFormat } from "../../../core/utils";
import { useRecordDetail } from "../../../composables/useRecordDetail";
import type {
  CombinedRecord,
  ParsedMessage,
  ParsedMessageBlock,
  ResponseParseResult,
} from "../../../types";

interface RenderData {
  /** 主正文（拼接所有 text 块） */
  mainText: string;
  /** 思维链（拼接所有 thinking 块） */
  reasoningText: string;
  /** 工具调用列表（流式中为空，非流式从 ParsedMessage 提取） */
  toolCalls: ParsedMessageBlock[];
  /** Refusal 警告（流式中为空，非流式从 ParsedMessage 提取） */
  refusals: ParsedMessageBlock[];
  /** 多候选场景（Gemini 等） */
  candidates: ParsedMessage[];
}

const props = defineProps<{
  record: CombinedRecord;
}>();

const {
  isStreamingActive,
  isStreamingResponse,
  extractedContent,
  extractedReasoning,
} = useRecordDetail(props);

const apiFormat = computed(() => detectApiFormat(props.record.request.url));

// 非流式解析（仅当响应体存在且不在流式中时才有意义）
const responseParseResult = computed<ResponseParseResult | null>(() => {
  if (!props.record.response?.body) return null;
  return parseResponseMessages(props.record.response.body, apiFormat.value);
});

// 多 candidate 当前激活索引
const activeCandidate = ref(0);

// 工具调用 chip 展开状态
const expanded = reactive<Record<number, boolean>>({});

function toggleExpand(idx: number) {
  expanded[idx] = !expanded[idx];
}

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatArgsForDisplay(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// 当记录切换或 candidates 数量变化时重置激活索引
watch(
  () => [props.record.id, responseParseResult.value?.messages.length],
  () => {
    activeCandidate.value = 0;
  }
);

const renderData = computed<RenderData | null>(() => {
  // 流式分支
  if (isStreamingActive.value || isStreamingResponse.value) {
    if (!extractedContent.value && !extractedReasoning.value) return null;
    return {
      mainText: extractedContent.value,
      reasoningText: extractedReasoning.value,
      toolCalls: [],
      refusals: [],
      candidates: [],
    };
  }

  // 非流式分支
  const parseResult = responseParseResult.value;
  if (!parseResult || parseResult.messages.length === 0) return null;

  const candidates = parseResult.messages;
  const current = candidates[activeCandidate.value] ?? candidates[0];

  const textBlocks = current.blocks.filter((b) => b.type === "text");
  const thinkingBlocks = current.blocks.filter((b) => b.type === "thinking");
  const toolCalls = current.blocks.filter((b) => b.type === "tool_call");
  const refusals = current.blocks.filter((b) => b.type === "refusal");

  return {
    mainText: textBlocks.map((b) => b.text || "").join("\n\n"),
    reasoningText: thinkingBlocks.map((b) => b.text || "").join("\n\n"),
    toolCalls,
    refusals,
    candidates,
  };
});

// 思维链"思考中"状态：仅在流式中且主正文尚未开始产出时为 true
// 一旦 mainText 出现，说明 reasoning 已经收尾，思考块应当停止思考动画
const isReasoningActive = computed(() => {
  if (!isStreamingActive.value) return false;
  return !renderData.value?.mainText;
});

// 解析失败提示（非流式 + 有响应体但消息为空 + 有错误描述时）
const parseErrorMessage = computed(() => {
  if (isStreamingActive.value || isStreamingResponse.value) return null;
  if (renderData.value) return null;
  const result = responseParseResult.value;
  if (!result) return null;
  if (result.messages.length > 0) return null;
  if (result.errors.length === 0) return null;
  return result.errors.join(" · ");
});
</script>

<style scoped>
.response-structured-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 顶部信息条 === */
.info-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.06));
  border: var(--border-width) solid
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 6px;
}

.info-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-color);
}

.info-label {
  color: var(--text-color-light);
}

.info-value {
  font-family: "Courier New", monospace;
  font-weight: 600;
  color: var(--primary-color);
}

/* === 占位 / 注释 === */
.response-placeholder,
.response-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) dashed
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 13px;
}

/* === 流式实时接收提示条 === */
.streaming-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border: var(--border-width) solid
    rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 10px;
  color: var(--el-color-danger, #f56c6c);
  font-size: 11px;
  font-weight: 600;
  align-self: flex-start;
}

.live-dot {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* === 多 Candidate Tab === */
.candidate-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.candidate-tab {
  padding: 4px 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.candidate-tab:hover {
  transform: translateY(-1px);
}

.candidate-tab.active {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  border-color: var(--primary-color);
  color: var(--primary-color);
  font-weight: 600;
}

/* === 主正文容器 === */
.main-content {
  padding: 12px 14px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  backdrop-filter: blur(var(--ui-blur));
}

/* === 工具调用 chip 列表 === */
.tool-calls-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 2px;
}

.tool-call-chip {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.tool-call-chip:hover {
  border-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.5)
  );
}

.chip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}

.tool-name {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-warning, #e6a23c);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-family: "Courier New", monospace;
}

.tool-id {
  background: var(--bg-color);
  color: var(--text-color-light);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-family: "Courier New", monospace;
}

.chip-chevron {
  margin-left: auto;
  color: var(--text-color-light);
  transition: transform 0.2s ease;
}

.chip-chevron.rotated {
  transform: rotate(180deg);
}

.chip-body {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-color);
  border-top: var(--border-width) solid var(--border-color);
  color: var(--text-color);
  font-size: 12px;
  font-family: "Courier New", monospace;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
