<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="response-structured-view">
    <!-- 顶部信息条 + 子视图切换 -->
    <div class="top-bar">
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

      <!-- 子视图切换：可视化 / 标准化 JSON -->
      <div class="sub-view-toggle">
        <button
          class="sub-view-btn"
          :class="{ active: subView === 'visual' }"
          @click="subView = 'visual'"
          title="可视化渲染"
        >
          <Sparkles :size="12" />
          <span>可视化</span>
        </button>
        <button
          class="sub-view-btn"
          :class="{ active: subView === 'json' }"
          @click="subView = 'json'"
          :title="
            isStreamingActive || isStreamingResponse
              ? '合并 SSE 为标准化 JSON'
              : '查看响应 JSON'
          "
        >
          <Braces :size="12" />
          <span>标准化 JSON</span>
          <span
            v-if="isStreamingActive || isStreamingResponse"
            class="json-stream-hint"
            title="流式 SSE 已合并"
          >
            <Layers :size="10" />
          </span>
        </button>
      </div>
    </div>

    <!-- 流式实时接收提示（仅在可视化子视图下展示） -->
    <div
      v-if="isStreamingActive && subView === 'visual'"
      class="streaming-banner"
    >
      <Circle :size="8" fill="currentColor" class="live-dot" />
      <span>
        正在实时接收 · 正文 {{ renderData?.mainText.length || 0 }} 字符
        <template v-if="renderData?.reasoningText.length">
          · 思维链 {{ renderData.reasoningText.length }} 字符
        </template>
      </span>
    </div>

    <!-- 占位 -->
    <div
      v-if="subView === 'visual' && !renderData"
      class="response-placeholder"
    >
      <Hourglass :size="14" />
      <span>{{
        isStreamingActive ? "等待流式数据到达…" : "响应体尚未到达"
      }}</span>
    </div>

    <!-- 解析失败提示（非流式 + 完全解析不出来时） -->
    <div
      v-else-if="subView === 'visual' && parseErrorMessage"
      class="response-note"
    >
      <Info :size="13" />
      <span>{{ parseErrorMessage }}</span>
    </div>

    <!-- ===== 可视化子视图 ===== -->
    <template v-else-if="subView === 'visual' && renderData">
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

    <!-- ===== 标准化 JSON 子视图 ===== -->
    <template v-if="subView === 'json'">
      <!-- 流式合并的提示条 -->
      <div
        v-if="
          (isStreamingActive || isStreamingResponse) &&
          standardizedJsonResult?.merged
        "
        class="json-banner json-banner-merged"
      >
        <Layers :size="12" />
        <span class="banner-main">
          已将 SSE 合并为厂商原生非流式响应结构 ·
          <strong>{{ standardizedJsonResult.eventCount }}</strong> 个事件
        </span>
        <span v-if="isStreamingActive" class="banner-live">
          <Circle :size="6" fill="currentColor" class="live-dot" />
          实时刷新中
        </span>
      </div>

      <!-- 合并警告 -->
      <div
        v-if="standardizedJsonResult?.warnings.length && standardizedJsonText"
        class="json-banner json-banner-warning"
      >
        <AlertTriangle :size="12" />
        <span>{{ standardizedJsonResult.warnings.join(" · ") }}</span>
      </div>

      <!-- JSON 编辑器 -->
      <div v-if="standardizedJsonText" class="json-editor-section">
        <div class="json-editor-header">
          <div class="section-title">
            <FileJson :size="14" />
            <span>{{
              isStreamingActive || isStreamingResponse
                ? "合并后的非流式 JSON"
                : "响应 JSON"
            }}</span>
            <span class="size-hint">
              {{ formatSize(standardizedJsonText.length) }}
            </span>
          </div>
          <button
            @click="copyStandardizedJson"
            class="btn-copy-small"
            title="复制 JSON"
          >
            <Copy :size="14" />
          </button>
        </div>
        <div class="json-editor-shell">
          <RichCodeEditor
            :model-value="standardizedJsonText"
            language="json"
            :read-only="true"
            editor-type="codemirror"
          />
        </div>
      </div>

      <!-- 空状态 / 合并失败 -->
      <div v-else class="response-placeholder">
        <Hourglass :size="14" />
        <span>
          {{
            isStreamingActive
              ? "等待流式数据到达…"
              : standardizedJsonResult?.warnings.join(" · ") || "响应体尚未到达"
          }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  Circle,
  Code2,
  Copy,
  Cpu,
  FileJson,
  Flag,
  Hourglass,
  Info,
  Layers,
  Sparkles,
  Wrench,
} from "lucide-vue-next";
import { ElAlert } from "element-plus";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import LlmThinkNode from "@/tools/rich-text-renderer/components/nodes/LlmThinkNode.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { parseResponseMessages } from "../../../core/messageParser";
import { copyToClipboard, formatSize, isJson } from "../../../core/utils";
import { detectApiFormat } from "../../../core/apiFormat";
import { mergeStreamToFinalJson } from "../../../core/streamMerger";
import { useRecordDetail } from "../../../composables/useRecordDetail";
import { useInspectorStreamStore } from "../../../stores/inspectorStreamStore";
import { customMessage } from "@/utils/customMessage";
import type {
  CombinedRecord,
  ParsedMessage,
  ParsedMessageBlock,
  ResponseParseResult,
} from "../../../types";

type SubView = "visual" | "json";

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

// 子视图切换：可视化 / 标准化 JSON
const subView = ref<SubView>("visual");

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

// ===== 标准化 JSON 视图 =====
const streamStore = useInspectorStreamStore();

/**
 * 流式累积的原始 SSE 文本（不含美化），优先取 streamStore 的缓冲，
 * 流结束后退回到 record.response.body。
 *
 * Pinia setup store 把 `shallowRef` 暴露为自动 unwrap 的属性，因此直接访问
 * `streamStore.streamBuffer` 即可拿到 `StreamBuffer` 对象（不需要 `.value`），
 * computed 依然能感知到 triggerRef 触发的更新。
 */
const streamRawBody = computed(() => {
  if (!props.record) return "";
  return (
    streamStore.streamBuffer[props.record.id] ||
    props.record.response?.body ||
    ""
  );
});

/**
 * 标准化 JSON 计算结果：
 * - 流式响应：把 SSE 合并为厂商原生非流式 JSON 结构
 * - 非流式响应：解析并美化原始 JSON
 */
const standardizedJsonResult = computed(() => {
  const rec = props.record;
  if (!rec) return null;

  // 流式：合并 SSE
  if (isStreamingActive.value || isStreamingResponse.value) {
    const buffer = streamRawBody.value;
    if (!buffer) {
      return { merged: null, warnings: ["等待流式数据到达…"], eventCount: 0 };
    }
    return mergeStreamToFinalJson(buffer, apiFormat.value);
  }

  // 非流式：直接解析原始 JSON
  const body = rec.response?.body;
  if (!body) return null;
  if (!isJson(body)) {
    return {
      merged: null,
      warnings: ["响应体不是合法 JSON"],
      eventCount: 0,
    };
  }
  try {
    return {
      merged: JSON.parse(body),
      warnings: [],
      eventCount: 0,
    };
  } catch (error) {
    return {
      merged: null,
      warnings: [`JSON 解析失败：${(error as Error).message}`],
      eventCount: 0,
    };
  }
});

/** 美化输出的 JSON 字符串 */
const standardizedJsonText = computed(() => {
  const result = standardizedJsonResult.value;
  if (!result?.merged) return "";
  try {
    return JSON.stringify(result.merged, null, 2);
  } catch {
    return "";
  }
});

// 复制 JSON
async function copyStandardizedJson() {
  const text = standardizedJsonText.value;
  if (!text) {
    customMessage.warning("尚无可复制的 JSON");
    return;
  }
  try {
    await copyToClipboard(text);
    customMessage.success("标准化 JSON 已复制");
  } catch {
    customMessage.error("复制失败");
  }
}
</script>

<style scoped>
.response-structured-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 顶栏（信息条 + 子视图切换） === */
.top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

/* === 子视图切换 === */
.sub-view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  flex-shrink: 0;
}

.sub-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s ease;
  position: relative;
}

.sub-view-btn:hover {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.08));
}

.sub-view-btn.active {
  background: var(--primary-color);
  color: #ffffff;
}

.json-stream-hint {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  color: var(--el-color-danger, #f56c6c);
}

.sub-view-btn.active .json-stream-hint {
  color: #ffffff;
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

/* === 标准化 JSON 视图 === */
.json-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  align-self: flex-start;
  max-width: 100%;
}

.json-banner-merged {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) solid
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.25));
  color: var(--text-color);
}

.json-banner-merged .banner-main {
  color: var(--text-color);
}

.json-banner-merged strong {
  color: var(--primary-color);
  font-family: "Courier New", monospace;
}

.json-banner-merged .banner-live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border-radius: 8px;
  color: var(--el-color-danger, #f56c6c);
  font-size: 11px;
  font-weight: 600;
}

.json-banner-warning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border: var(--border-width) solid
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.3));
  color: var(--el-color-warning, #e6a23c);
}

.json-editor-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  flex: 1;
}

.json-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 4px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.size-hint {
  font-size: 11px;
  font-weight: normal;
  color: var(--text-color-light);
  font-family: "Courier New", monospace;
  margin-left: 4px;
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
  background: var(--card-bg);
  opacity: 1;
}

.json-editor-shell {
  min-height: 320px;
  max-height: 70vh;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.json-editor-shell :deep(.rich-code-editor-wrapper) {
  flex: 1;
  min-height: 0;
  height: 100%;
}
</style>
