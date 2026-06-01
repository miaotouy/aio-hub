<template>
  <section class="input-panel">
    <!-- 顶部：语言行 -->
    <div class="panel-header">
      <div class="language-row">
        <LanguageSelect
          v-model="store.sourceLang"
          :custom-languages="store.settings.customLanguages"
          :disabled="store.isTranslating"
          :include-auto="true"
          placeholder="源语言"
          @add-custom="store.addCustomLanguage"
        />

        <el-button
          class="icon-button swap"
          :icon="ArrowLeftRight"
          :disabled="store.sourceLang === 'auto' || store.isTranslating"
          @click="store.swapLanguages"
        />

        <LanguageSelect
          v-model="store.targetLang"
          :custom-languages="store.settings.customLanguages"
          :disabled="store.isTranslating"
          :include-auto="false"
          placeholder="目标语言"
          @add-custom="store.addCustomLanguage"
        />
      </div>
    </div>

    <!-- 工具条：粘贴 / 读文件 · · · 字数 -->
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
        </span>
      </div>
    </div>

    <!-- 编辑器：CodeMirror 翻译输入框 -->
    <div class="editor-wrapper">
      <TranslatorEditor
        v-model:value="store.inputText"
        :disabled="store.isTranslating"
        placeholder="粘贴要翻译的文本，Ctrl/Cmd+Enter 翻译，Ctrl+F 搜索"
        @submit="handleSubmit"
      />
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
          :title="ch.displayName"
        >
          {{ ch.displayName }}
        </span>
        <span v-if="store.activeChannels.length === 0" class="pill empty">
          未配置渠道
        </span>
      </div>

      <!-- 展开态：完整渠道列表 -->
      <div v-else class="channel-list">
        <div
          v-for="(channel, index) in store.activeChannels"
          :key="channel.id"
          class="channel-item"
        >
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
            :disabled="store.activeChannels.length <= 1 || store.isTranslating"
            @click="store.removeChannel(channel.id)"
          />
        </div>
      </div>
    </section>

    <!-- 主操作按钮：满宽、显眼 -->
    <div class="primary-action">
      <el-button
        v-if="store.isTranslating"
        type="danger"
        class="translate-btn"
        size="large"
        :icon="Square"
        @click="store.abortAll"
      >
        <span class="btn-label">停止全部</span>
        <span class="btn-shortcut">Ctrl + Enter</span>
      </el-button>
      <el-button
        v-else
        type="primary"
        class="translate-btn"
        size="large"
        :icon="Languages"
        :disabled="!canTranslate"
        @click="store.translate"
      >
        <span class="btn-label">开始翻译</span>
        <span class="btn-shortcut">Ctrl + Enter</span>
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowLeftRight,
  ChevronDown,
  ClipboardPaste,
  FolderOpen,
  Languages,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { readText as readClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ModelCapabilities } from "@/types/llm-profiles";
import LanguageSelect from "./LanguageSelect.vue";
import TranslatorEditor from "./TranslatorEditor.vue";
import { useTranslatorStore } from "../composables/useTranslatorStore";

const store = useTranslatorStore();
const errorHandler = createModuleErrorHandler("tools/translator/input-panel");

const LARGE_FILE_CHAR_THRESHOLD = 200_000;

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

function toggleCollapsed() {
  store.settings.channelSectionCollapsed =
    !store.settings.channelSectionCollapsed;
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
            extensions: ["txt", "md", "json", "srt", "vtt", "log", "csv"],
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

  const content = await errorHandler.wrapAsync(
    async () => readTextFile(filePath as string),
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

.panel-header {
  padding: 14px 14px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.language-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
}

.icon-button.swap {
  margin: 0 auto;
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

/* 编辑器 */
.editor-wrapper {
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

.spacer {
  flex: 1;
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

/* 主翻译按钮 */
.primary-action {
  padding: 12px 14px;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.translate-btn {
  width: 100%;
  height: 48px;
  font-size: 15px;
  font-weight: 700;
}

.translate-btn :deep(.el-icon) {
  font-size: 18px;
}

.btn-label {
  margin-right: 12px;
}

.btn-shortcut {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.78;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.16);
  font-family: var(--font-family-mono, monospace);
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

