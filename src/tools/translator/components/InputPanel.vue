<template>
  <section class="input-panel">
    <!-- 工具条：粘贴 / 读文件 / 清空 · · · 字数 -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <el-tooltip content="从剪贴板粘贴" placement="bottom">
          <el-button
            class="tool-button"
            :icon="ClipboardPaste"
            :disabled="store.isTranslating"
            @click="handlePasteFromClipboard"
          />
        </el-tooltip>
        <el-tooltip
          content="从文件读取（txt/md/json/srt/vtt）"
          placement="bottom"
        >
          <el-button
            class="tool-button"
            :icon="FolderOpen"
            :disabled="store.isTranslating"
            @click="handleReadFromFile"
          />
        </el-tooltip>
        <el-tooltip content="清空" placement="bottom">
          <el-button
            class="tool-button"
            :icon="Trash2"
            :disabled="store.isTranslating || !store.inputText"
            @click="store.clearInput"
          />
        </el-tooltip>
      </div>
      <div class="toolbar-right">
        <span class="counter">
          {{ charCount }} 字
          <span v-if="wordCount !== charCount"> · {{ wordCount }} 词</span>
          <span v-if="estimatedOutputTokens > 0" class="counter-tokens">
            · ~{{ formatTokens(estimatedOutputTokens) }} tokens 预估
          </span>
        </span>
      </div>
    </div>

    <!-- 编辑器：CodeMirror 翻译输入框（带文件拖放） -->
    <div class="editor-wrapper">
      <TranslatorEditor
        v-model:value="store.inputText"
        :disabled="store.isTranslating"
        placeholder="粘贴要翻译的文本，Ctrl/Cmd+Enter 翻译，Ctrl+F 搜索"
        @submit="handleSubmit"
      />
      <!-- 兄弟节点覆盖层：平时穿透，拖拽时捕获并显示提示层 -->
      <DropZone
        overlay
        hide-content
        show-overlay-on-drag
        file-only
        :multiple="false"
        :accept="DROP_ACCEPT_EXTENSIONS"
        :disabled="store.isTranslating"
        @drop="handleEditorDrop"
      />
    </div>

    <!-- 超限预警 Banner：仅在渠道区折叠且有风险时显示，避免与展开态信息重复 -->
    <div
      v-if="
        store.overallRisk.shouldWarn && store.settings.channelSectionCollapsed
      "
      class="overflow-banner"
      :class="`severity-${store.overallRisk.severity}`"
    >
      <AlertTriangle class="banner-icon" />
      <div class="banner-text">
        <strong>{{ store.overallRisk.title }}</strong>
        <span>{{ store.overallRisk.description }}</span>
      </div>
      <el-button
        text
        size="small"
        class="banner-action"
        @click="expandChannelSection"
      >
        展开渠道
      </el-button>
    </div>

    <!-- 渠道区：可折叠 -->
    <section class="channel-section">
      <button
        type="button"
        class="section-header"
        :disabled="store.isTranslating"
        @click="toggleCollapsed"
      >
        <ChevronDown
          class="chev"
          :class="{ rotated: store.settings.channelSectionCollapsed }"
        />
        <span class="section-title">渠道</span>
        <span class="badge">{{ store.activeChannels.length }}</span>

        <!-- 风险统计 chip：仅在统计>0 时显示，danger 优先级高于 warning -->
        <span
          v-if="store.riskSummary.danger > 0"
          class="risk-chip danger"
          :title="`${store.riskSummary.danger} 个渠道预计输出会被截断`"
        >
          {{ store.riskSummary.danger }} 危险
        </span>
        <span
          v-else-if="store.riskSummary.warning > 0"
          class="risk-chip warning"
          :title="`${store.riskSummary.warning} 个渠道接近模型上限`"
        >
          {{ store.riskSummary.warning }} 警告
        </span>

        <span class="spacer" />
        <el-button
          class="icon-button add-channel"
          :icon="Plus"
          :disabled="store.activeChannels.length >= 4 || store.isTranslating"
          @click.stop="store.addChannel"
        />
      </button>

      <!-- 折叠态：紧凑徽章行 -->
      <div v-if="store.settings.channelSectionCollapsed" class="channel-pills">
        <span
          v-for="ch in store.activeChannels"
          :key="ch.id"
          class="pill"
          :class="pillRiskClass(ch.id)"
          :title="pillRiskTooltip(ch)"
        >
          {{ ch.displayName }}
        </span>
        <span v-if="store.activeChannels.length === 0" class="pill empty">
          未配置渠道
        </span>
      </div>

      <!-- 展开态：完整渠道列表 -->
      <div v-else class="channel-list">
        <template
          v-for="(channel, index) in store.activeChannels"
          :key="channel.id"
        >
          <div class="channel-item">
            <span class="channel-index">{{ index + 1 }}</span>
            <LlmModelSelector
              :model-value="`${channel.profileId}:${channel.modelId}`"
              :capabilities="modelCapabilities"
              :disabled="store.isTranslating"
              placeholder="选择文本模型"
              popper-class="translator-model-select"
              @update:model-value="
                (value) => handleChannelModelChange(channel.id, value)
              "
            />
            <el-button
              class="icon-button"
              :icon="X"
              :disabled="
                store.activeChannels.length <= 1 || store.isTranslating
              "
              @click="store.removeChannel(channel.id)"
            />
          </div>
          <div
            v-if="
              estimationOf(channel.id) &&
              estimationOf(channel.id)!.risk !== 'safe' &&
              estimationOf(channel.id)!.risk !== 'unknown'
            "
            class="channel-estimation"
            :class="`risk-${estimationOf(channel.id)!.risk}`"
          >
            {{ estimationLabel(channel.id) }}
          </div>
        </template>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardPaste,
  FolderOpen,
  Plus,
  Trash2,
  X,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import DropZone from "@/components/common/DropZone.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ModelCapabilities } from "@/types/llm-profiles";
import TranslatorEditor from "./TranslatorEditor.vue";
import { useTranslatorStore } from "../composables/useTranslatorStore";
import type { ChannelEstimation, TranslationChannel } from "../types";

const store = useTranslatorStore();
const errorHandler = createModuleErrorHandler("tools/translator/input-panel");

const LARGE_FILE_CHAR_THRESHOLD = 200_000;

/** 拖放/选择文件接受的扩展名（与工具条按钮保持一致） */
const DROP_ACCEPT_EXTENSIONS = [
  ".txt",
  ".md",
  ".json",
  ".srt",
  ".vtt",
  ".log",
  ".csv",
];

const modelCapabilities: Partial<ModelCapabilities> = {
  embedding: false,
  rerank: false,
  imageGeneration: false,
  videoGeneration: false,
  audioGeneration: false,
  musicGeneration: false,
};

const canTranslate = computed(
  () =>
    store.inputText.trim().length > 0 &&
    store.hasConfiguredChannels &&
    !store.isTranslating
);

const charCount = computed(() => {
  // 用 Array.from 处理 emoji / 代理对
  return Array.from(store.inputText).length;
});

const wordCount = computed(() => {
  const trimmed = store.inputText.trim();
  if (!trimmed) return 0;
  // CJK 直接按字符计；带空格的拉丁文按空白切分
  return trimmed.split(/\s+/).filter(Boolean).length;
});

/**
 * 输入文本的输出 token 预估（与渠道无关，基于全局 outputExpansionFactor）。
 * 取所有渠道估算项的最大值（同输入下不同渠道结果一致）；空输入时返回 0。
 */
const estimatedOutputTokens = computed(() => {
  const list = store.channelEstimations;
  if (list.length === 0) return 0;
  return Math.max(...list.map((est) => est.estimatedOutputTokens));
});

function formatTokens(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return value.toLocaleString();
}

function estimationOf(channelId: string): ChannelEstimation | undefined {
  return store.channelEstimations.find((est) => est.channelId === channelId);
}

function pillRiskClass(channelId: string): string {
  const est = estimationOf(channelId);
  if (!est) return "";
  if (est.risk === "danger") return "risk-danger";
  if (est.risk === "warning") return "risk-warning";
  return "";
}

function pillRiskTooltip(channel: TranslationChannel): string {
  const est = estimationOf(channel.id);
  if (!est || est.risk === "safe" || est.risk === "unknown") {
    return channel.displayName;
  }
  const lines: string[] = [channel.displayName];
  if (est.modelOutputLimit) {
    lines.push(
      `预估输出 ${est.estimatedOutputTokens.toLocaleString()} tokens · 模型上限 ${est.modelOutputLimit.toLocaleString()}`
    );
  } else if (est.modelContextLimit) {
    lines.push(
      `输入 ${est.estimatedInputTokens.toLocaleString()} tokens · context ${est.modelContextLimit.toLocaleString()}`
    );
  }
  lines.push(
    est.risk === "danger" ? "建议缩短输入或切换大模型" : "接近上限，注意截断"
  );
  return lines.join("\n");
}

function estimationLabel(channelId: string): string {
  const est = estimationOf(channelId);
  if (!est) return "";
  const reason = est.reasons[0];
  switch (reason) {
    case "output-exceeds":
      return `预估输出 ~${est.estimatedOutputTokens.toLocaleString()} / 上限 ${est.modelOutputLimit?.toLocaleString() ?? "?"}（输出会被截断 ⚠）`;
    case "near-output-limit":
      return `预估输出 ~${est.estimatedOutputTokens.toLocaleString()} / 上限 ${est.modelOutputLimit?.toLocaleString() ?? "?"}（接近上限，可能截断）`;
    case "input-exceeds-context":
      return `输入 ~${est.estimatedInputTokens.toLocaleString()} tokens / context ${est.modelContextLimit?.toLocaleString() ?? "?"}（输入超过 context 窗口 ⚠）`;
    case "input-near-context":
      return `输入 ~${est.estimatedInputTokens.toLocaleString()} tokens / context ${est.modelContextLimit?.toLocaleString() ?? "?"}（接近 context 窗口）`;
    default:
      return "";
  }
}

function toggleCollapsed() {
  store.settings.channelSectionCollapsed =
    !store.settings.channelSectionCollapsed;
}

function expandChannelSection() {
  store.settings.channelSectionCollapsed = false;
}

function handleChannelModelChange(channelId: string, value: string) {
  const [profileId, modelId] = parseModelCombo(value);
  if (!profileId || !modelId) return;
  store.updateChannelModel(channelId, profileId, modelId);
}

function handleSubmit() {
  if (store.isTranslating) {
    store.abortAll();
    return;
  }
  if (!canTranslate.value) return;
  store.translate();
}

// ---- 工具条：剪贴板粘贴 ----
async function handlePasteFromClipboard() {
  const text = await errorHandler.wrapAsync(
    async () => {
      const result = await readClipboardText();
      return result ?? "";
    },
    {
      userMessage: "读取剪贴板失败",
    }
  );
  if (text === null) return;
  if (!text) {
    customMessage.warning("剪贴板为空或无文本内容");
    return;
  }
  if (store.inputText.trim()) {
    try {
      const action = await ElMessageBox.confirm(
        "当前输入框已有内容，是否追加到末尾？取消则覆盖。",
        "粘贴剪贴板",
        {
          confirmButtonText: "追加",
          cancelButtonText: "覆盖",
          distinguishCancelAndClose: true,
          type: "info",
          lockScroll: false,
        }
      );
      if (action === "confirm") {
        const sep = store.inputText.endsWith("\n") ? "" : "\n\n";
        store.inputText = `${store.inputText}${sep}${text}`;
      }
    } catch (action) {
      if (action === "cancel") {
        store.inputText = text;
      }
      // close: 啥也不做
      return;
    }
  } else {
    store.inputText = text;
  }
  customMessage.success("已从剪贴板粘贴");
}

// ---- 工具条 / 拖放共享：按路径加载文本到输入框 ----
async function loadTextFromPath(filePath: string) {
  const content = await errorHandler.wrapAsync(
    async () => readTextFile(filePath),
    {
      userMessage: "读取文件失败，请确认文件编码为 UTF-8",
    }
  );
  if (content === null) return;

  if (content.length > LARGE_FILE_CHAR_THRESHOLD) {
    try {
      await ElMessageBox.confirm(
        `文件较大（${content.length.toLocaleString()} 字符），可能导致翻译耗时与费用增加，是否继续？`,
        "文件较大",
        {
          confirmButtonText: "继续",
          cancelButtonText: "取消",
          type: "warning",
          lockScroll: false,
        }
      );
    } catch {
      return;
    }
  }

  if (store.inputText.trim()) {
    try {
      await ElMessageBox.confirm("当前输入框已有内容，是否覆盖？", "读取文件", {
        confirmButtonText: "覆盖",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      });
    } catch {
      return;
    }
  }

  store.inputText = content;
  customMessage.success("文件内容已载入");
}

// ---- 工具条：从文件读取 ----
async function handleReadFromFile() {
  const filePath = await errorHandler.wrapAsync(
    async () => {
      const result = await openDialog({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "文本文件",
            extensions: DROP_ACCEPT_EXTENSIONS.map((ext) => ext.slice(1)),
          },
          { name: "所有文件", extensions: ["*"] },
        ],
      });
      // openDialog 返回值在不同版本中可能是 string | string[] | { path } | null
      if (!result) return null;
      if (typeof result === "string") return result;
      if (Array.isArray(result)) return result[0] ?? null;
      const maybeObj = result as unknown as { path?: string };
      return maybeObj.path ?? null;
    },
    { userMessage: "打开文件失败" }
  );
  if (!filePath) return;
  await loadTextFromPath(filePath as string);
}

// ---- 编辑器拖放：复用 loadTextFromPath，DropZone 已过滤扩展名 ----
async function handleEditorDrop(paths: string[]) {
  if (!paths.length || store.isTranslating) return;
  await loadTextFromPath(paths[0]);
}
</script>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-right: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

/* 工具条 */
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px 6px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-button {
  width: 30px;
  height: 30px;
  padding: 0;
}

.counter {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.counter-tokens {
  color: var(--text-color-light);
  font-weight: 500;
}

/* 超限预警 Banner（仅在渠道区折叠态显示） */
.overflow-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 8px;
  padding: 8px 12px;
  border-radius: 7px;
  border: var(--border-width) solid transparent;
  font-size: 12px;
  line-height: 1.5;
}

.overflow-banner.severity-warning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.45)
  );
  color: var(--el-color-warning);
}

.overflow-banner.severity-danger {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.14)
  );
  border-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.5)
  );
  color: var(--el-color-danger);
}

.banner-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.banner-text strong {
  font-size: 12px;
  font-weight: 700;
}

.banner-text span {
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.banner-action {
  flex-shrink: 0;
  color: inherit;
}

/* 编辑器 */
.editor-wrapper {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 8px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.editor-wrapper:hover {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 40%,
    var(--border-color)
  );
}

.editor-wrapper:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color);
}

/* 渠道区 */
.channel-section {
  border-top: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.section-header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.section-header:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}

.section-header:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.chev {
  width: 14px;
  height: 14px;
  color: var(--text-color-secondary);
  transition: transform 0.2s ease;
}

.chev.rotated {
  transform: rotate(-90deg);
}

.section-title {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
}

/* 渠道折叠头的风险统计 chip */
.risk-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.risk-chip.warning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-warning);
}

.risk-chip.danger {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-danger);
}

.spacer {
  flex: 1;
}

.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
}

.add-channel {
  width: 26px;
  height: 26px;
}

.channel-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 12px;
}

.pill {
  display: inline-flex;
  align-items: center;
  max-width: 200px;
  padding: 3px 9px;
  border-radius: 11px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill.empty {
  color: var(--text-color-light);
  font-style: italic;
}

/* 折叠态 pill 的风险染色：整个 pill 染色，不塞 icon */
.pill.risk-warning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.5)
  );
  color: var(--el-color-warning);
}

.pill.risk-danger {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.14)
  );
  border-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.55)
  );
  color: var(--el-color-danger);
}

/* 展开态渠道列表下方的估算提示行 */
.channel-estimation {
  margin-left: 32px;
  margin-top: -2px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  font-weight: 500;
}

.channel-estimation.risk-warning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-warning);
}

.channel-estimation.risk-danger {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-danger);
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px;
}

.channel-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 32px;
  gap: 8px;
  align-items: center;
}

.channel-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  border: var(--border-width) solid var(--border-color);
}

@media (max-width: 860px) {
  .input-panel {
    height: auto;
    border-right: 0;
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .editor-wrapper {
    min-height: 240px;
  }
}
</style>
