<template>
  <div class="single-preview">
    <el-row :gutter="16" class="editor-row">
      <!-- 左栏：输入 -->
      <el-col :span="12" class="editor-col">
        <div class="editor-card">
          <div class="card-header">
            <span class="header-title">输入内容</span>
            <div class="header-actions">
              <el-button v-if="input" type="danger" link size="small" :icon="Trash2" @click="clearInput">
                清空
              </el-button>
              <el-button type="primary" link size="small" :icon="Clipboard" @click="pasteFromClipboard">
                粘贴
              </el-button>
            </div>
          </div>
          <div class="editor-container">
            <RichCodeEditor
              v-model="input"
              :language="fromFormat"
              editor-type="codemirror"
              placeholder="请在此处输入或粘贴配置文件内容..."
            />
          </div>
        </div>
      </el-col>

      <!-- 右栏：输出 -->
      <el-col :span="12" class="editor-col">
        <div class="editor-card">
          <div class="card-header">
            <span class="header-title">转换结果</span>
            <div class="header-actions">
              <el-button v-if="output" type="success" link size="small" :icon="Send" @click="sendToChat">
                发送到聊天
              </el-button>
              <el-button v-if="output" type="primary" link size="small" :icon="Copy" @click="copyOutput">
                复制
              </el-button>
            </div>
          </div>
          <div class="editor-container">
            <RichCodeEditor
              :model-value="output"
              :language="toFormat"
              read-only
              editor-type="codemirror"
              placeholder="转换后的内容将实时显示在这里..."
            />
          </div>

          <!-- 错误提示 -->
          <div v-if="error" class="error-panel">
            <el-icon class="error-icon"><WarningFilled /></el-icon>
            <span class="error-text">{{ error }}</span>
          </div>

          <!-- 警告提示 -->
          <div v-else-if="warnings.length > 0" class="warning-panel">
            <div class="warning-header">
              <el-icon class="warning-icon"><InfoFilled /></el-icon>
              <span class="warning-title">转换警告 ({{ warnings.length }})</span>
            </div>
            <ul class="warning-list">
              <li v-for="(warn, idx) in warnings" :key="idx" class="warning-item">
                {{ warn }}
              </li>
            </ul>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Trash2, Clipboard, Copy, Send } from "lucide-vue-next";
import { WarningFilled, InfoFilled } from "@element-plus/icons-vue";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from "@/utils/customMessage";
import { useSendToChat } from "@/composables/useSendToChat";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import type { ConfigFormat } from "../types";

const props = defineProps<{
  modelValue: string;
  output: string;
  fromFormat: ConfigFormat;
  toFormat: ConfigFormat;
  error?: string;
  warnings: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const { sendCodeToChat } = useSendToChat();

const input = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

/**
 * 清空输入
 */
const clearInput = () => {
  input.value = "";
};

/**
 * 从剪贴板粘贴
 */
const pasteFromClipboard = async () => {
  try {
    const text = await readText();
    if (text) {
      input.value = text;
      customMessage.success("已从剪贴板粘贴内容");
    } else {
      customMessage.warning("剪贴板内容为空");
    }
  } catch (error) {
    customMessage.error("无法读取剪贴板");
  }
};

/**
 * 复制输出内容
 */
const copyOutput = async () => {
  if (!props.output) return;
  try {
    await writeText(props.output);
    customMessage.success("转换结果已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
  }
};

/**
 * 发送到聊天
 */
const sendToChat = () => {
  if (!props.output) return;
  sendCodeToChat(props.output, props.toFormat, {
    successMessage: `已将转换后的 ${props.toFormat.toUpperCase()} 配置发送到聊天`,
  });
};
</script>

<style scoped>
.single-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-row {
  height: 100%;
  flex: 1;
}

.editor-col {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
  position: relative;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.02));
  flex-shrink: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.editor-container {
  flex: 1;
  overflow: hidden;
  padding: 12px;
}

:deep(.rich-code-editor-wrapper) {
  border: none !important;
  height: 100%;
}

.error-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
  border-top: 1px solid var(--el-color-danger-light-3);
  padding: 12px 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  z-index: 5;
  max-height: 120px;
  overflow-y: auto;
}

.error-icon {
  color: var(--el-color-danger);
  font-size: 16px;
  margin-top: 2px;
  flex-shrink: 0;
}

.error-text {
  font-size: 13px;
  color: var(--el-color-danger);
  line-height: 1.4;
}

.warning-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(var(--el-color-warning-rgb), 0.08);
  border-top: 1px solid var(--el-color-warning-light-3);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 5;
  max-height: 150px;
  overflow-y: auto;
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.warning-icon {
  color: var(--el-color-warning);
  font-size: 16px;
}

.warning-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-warning);
}

.warning-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--el-color-warning-dark-2);
  line-height: 1.5;
}

.warning-item {
  margin-bottom: 4px;
}
</style>
