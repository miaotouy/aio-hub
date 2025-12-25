<template>
  <div class="json-formatter-container">
    <div class="tool-wrapper">
      <!-- 固定顶栏工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button @click="pasteToJson" size="small" type="primary">
            <el-icon>
              <DocumentCopy />
            </el-icon>
            粘贴
          </el-button>
          <el-button @click="copyFormattedJson" size="small">
            <el-icon>
              <CopyDocument />
            </el-icon>
            复制
          </el-button>
          <el-button @click="sendToChat" size="small" type="success" plain>
            <el-icon>
              <ChatDotRound />
            </el-icon>
            发送到聊天
          </el-button>
          <el-tooltip
            :content="isClipboardListening ? '关闭剪贴板监听' : '开启剪贴板监听 (自动识别 JSON)'"
            placement="bottom"
          >
            <el-button
              @click="toggleClipboardMonitor"
              size="small"
              :type="isClipboardListening ? 'warning' : 'info'"
              :plain="!isClipboardListening"
            >
              <el-icon>
                <component :is="isClipboardListening ? Connection : Close" />
              </el-icon>
              {{ isClipboardListening ? "监听中" : "监听关" }}
            </el-button>
          </el-tooltip>
        </div>

        <div class="toolbar-center">
          <span class="expand-label">展开层级:</span>
          <el-slider
            v-model="defaultExpandDepth"
            :min="1"
            :max="10"
            :step="1"
            :show-tooltip="false"
            class="expand-slider"
            @change="handleFormatJson"
          />
          <el-input-number
            v-model="defaultExpandDepth"
            :min="1"
            :max="10"
            size="small"
            controls-position="right"
            class="expand-number"
            @change="handleFormatJson"
          />
        </div>

        <div class="toolbar-right">
          <el-button @click="clearAll" size="small" type="danger" plain>
            <el-icon>
              <Delete />
            </el-icon>
            清空
          </el-button>
        </div>
      </div>

      <!-- 主编辑区域 -->
      <div class="editor-container" ref="editorContainer">
        <!-- 输入区域 -->
        <div class="editor-panel input-panel" ref="inputPanel">
          <div class="panel-header">
            <span class="panel-title">输入 JSON</span>
            <div v-if="rawJsonInput" class="char-count">{{ rawJsonInput.length }} 字符</div>
          </div>
          <div
            class="editor-content"
            @dragover.prevent="handleDragOver"
            @drop.prevent="handleDrop"
            @dragenter="handleDragEnter"
            @dragleave="handleDragLeave"
          >
            <div v-if="isDragging" class="drag-overlay">
              <el-icon>
                <Upload />
              </el-icon>
              <p>拖拽文件到此处</p>
            </div>
            <RichCodeEditor
              v-model="rawJsonInput"
              language="json"
              @update:modelValue="handleFormatJson"
              class="input-editor"
            />
          </div>
        </div>

        <!-- 分割线，用于左右布局时的视觉分隔和拖拽调整 -->
        <div class="divider" @mousedown="startResize"></div>

        <!-- 输出区域 -->
        <div class="editor-panel output-panel" ref="outputPanel">
          <div class="panel-header">
            <span class="panel-title">{{ outputTitle }}</span>
          </div>
          <div class="editor-content">
            <div v-if="jsonError" class="error-message">
              <el-icon>
                <WarningFilled />
              </el-icon>
              <span>{{ jsonError }}</span>
            </div>
            <RichCodeEditor
              v-else
              v-model="formattedJsonOutput"
              language="json"
              :read-only="true"
              class="output-editor"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  WarningFilled,
  DocumentCopy,
  CopyDocument,
  Delete,
  Upload,
  ChatDotRound,
  Connection,
  Close,
} from "@element-plus/icons-vue";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ElNotification } from "element-plus";
import debounce from "lodash/debounce";
import RichCodeEditor from "@components/common/RichCodeEditor.vue";
import { toolRegistryManager } from "@/services/registry";
import type JsonFormatterRegistry from "./jsonFormatter.registry";
import { useSendToChat } from "@/composables/useSendToChat";

// 获取服务实例
const jsonFormatterRegistry = toolRegistryManager.getRegistry<JsonFormatterRegistry>("json-formatter");
const errorHandler = createModuleErrorHandler("JsonFormatter");

// 获取发送到聊天功能
const { sendCodeToChat } = useSendToChat();

// UI 状态
const rawJsonInput = ref("");
const isDragging = ref(false);
const formattedJsonOutput = ref("");
const parsedJsonData = ref<any>(null);
const jsonError = ref("");
const defaultExpandDepth = ref(3);
const isClipboardListening = ref(false);
let unlistenClipboard: UnlistenFn | null = null;

// 剪贴板监听逻辑
const setupClipboardMonitor = async () => {
  try {
    // 启动后端监听服务
    await invoke("start_clipboard_monitor");

    // 监听前端事件
    unlistenClipboard = await listen("clipboard-changed", async (event: { payload: string }) => {
      const content = event.payload;
      // 避免处理自己的复制操作（简单的防抖/循环检测）
      if (content === formattedJsonOutput.value || content === rawJsonInput.value) {
        return;
      }

      try {
        // 调用 Tauri 命令识别剪贴板内容类型
        const contentType: string = await invoke("get_clipboard_content_type", { content });

        if (contentType === "json") {
          // 如果当前输入框为空，直接填入
          if (!rawJsonInput.value.trim()) {
            rawJsonInput.value = content;
            handleFormatJson();
            customMessage.success("已自动检测并粘贴 JSON 内容");
          } else {
            // 如果不为空，提示用户
            ElNotification({
              title: "检测到新 JSON",
              message: "剪贴板中有新的 JSON 内容，是否替换当前内容？",
              type: "info",
              duration: 5000,
              position: "bottom-right",
              onClick: () => {
                rawJsonInput.value = content;
                handleFormatJson();
                customMessage.success("已替换为剪贴板内容");
              },
            });
          }
        }
      } catch (error) {
        console.error("Clipboard check failed:", error);
      }
    });

    isClipboardListening.value = true;
    customMessage.success("剪贴板监听已开启");
  } catch (error) {
    errorHandler.error(error, "无法启动剪贴板监听");
    isClipboardListening.value = false;
  }
};

const stopClipboardMonitor = async () => {
  try {
    if (unlistenClipboard) {
      unlistenClipboard();
      unlistenClipboard = null;
    }
    await invoke("stop_clipboard_monitor");
    isClipboardListening.value = false;
    customMessage.info("剪贴板监听已关闭");
  } catch (error) {
    console.error(error);
  }
};

const toggleClipboardMonitor = () => {
  if (isClipboardListening.value) {
    stopClipboardMonitor();
  } else {
    setupClipboardMonitor();
  }
};

// 计算输出标题
const outputTitle = computed(() => {
  if (jsonError.value) {
    return "格式化输出 - 错误";
  } else if (parsedJsonData.value) {
    return "格式化输出 - 有效 JSON";
  }
  return "格式化输出";
});

// 格式化 JSON（调用服务）
const formatJsonInternal = () => {
  jsonError.value = "";
  if (!rawJsonInput.value.trim()) {
    formattedJsonOutput.value = "";
    parsedJsonData.value = null;
    return;
  }

  const result = jsonFormatterRegistry.formatJson(rawJsonInput.value, {
    expandDepth: defaultExpandDepth.value,
  });

  if (result.success) {
    formattedJsonOutput.value = result.formatted;
    parsedJsonData.value = result.parsed;
  } else {
    jsonError.value = result.error || "格式化失败";
    parsedJsonData.value = null;
    formattedJsonOutput.value = "";
  }
};

const handleFormatJson = debounce(formatJsonInternal, 300);

const pasteToJson = async () => {
  try {
    const text = await readText();
    rawJsonInput.value = text;
    handleFormatJson();
    customMessage.success("已从剪贴板粘贴内容");
  } catch (error: any) {
    errorHandler.error(error, "粘贴失败");
  }
};

const copyFormattedJson = async () => {
  if (!formattedJsonOutput.value) {
    customMessage.warning("没有可复制的内容");
    return;
  }
  try {
    await writeText(formattedJsonOutput.value);
    customMessage.success("已复制到剪贴板");
  } catch (error: any) {
    errorHandler.error(error, "复制失败");
  }
};

const sendToChat = () => {
  sendCodeToChat(formattedJsonOutput.value, "json", {
    successMessage: "已将格式化的 JSON 发送到聊天",
  });
};

const clearAll = () => {
  rawJsonInput.value = "";
  formattedJsonOutput.value = "";
  parsedJsonData.value = null;
  jsonError.value = "";
};

// 分割线拖拽功能
const editorContainer = ref<HTMLElement | null>(null);
const inputPanel = ref<HTMLElement | null>(null);
const outputPanel = ref<HTMLElement | null>(null);

let isResizing = false;
let startX = 0;
let initialInputWidth = 0;
let initialOutputWidth = 0;

const startResize = (e: MouseEvent) => {
  isResizing = true;
  startX = e.clientX;
  if (inputPanel.value && outputPanel.value) {
    initialInputWidth = inputPanel.value.offsetWidth;
    initialOutputWidth = outputPanel.value.offsetWidth;
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (e: MouseEvent) => {
  if (!isResizing || !editorContainer.value || !inputPanel.value || !outputPanel.value) return;

  const dx = e.clientX - startX;
  const containerWidth = editorContainer.value.offsetWidth;

  let newInputWidth = initialInputWidth + dx;
  let newOutputWidth = initialOutputWidth - dx;

  // 限制最小宽度
  const minWidth = 100;
  if (newInputWidth < minWidth) {
    newInputWidth = minWidth;
    newOutputWidth = containerWidth - minWidth;
  }
  if (newOutputWidth < minWidth) {
    newOutputWidth = minWidth;
    newInputWidth = containerWidth - minWidth;
  }

  inputPanel.value.style.flexBasis = `${newInputWidth}px`;
  inputPanel.value.style.flexGrow = "0";
  outputPanel.value.style.flexBasis = `${newOutputWidth}px`;
  outputPanel.value.style.flexGrow = "0";
};

const onMouseUp = () => {
  isResizing = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};

// 拖拽文件处理
let dragCounter = 0;

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter++;
  isDragging.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter--;
  if (dragCounter === 0) {
    isDragging.value = false;
  }
};

const handleDrop = async (event: DragEvent) => {
  const files = event.dataTransfer?.files;
  event.preventDefault();
  event.stopPropagation();
  dragCounter = 0;
  isDragging.value = false;

  if (files && files.length > 0) {
    const file = files[0];
    const result = await jsonFormatterRegistry.readFile(file);

    if (result.success) {
      rawJsonInput.value = result.content;
      handleFormatJson();
      customMessage.success(`成功读取文件: ${result.fileName}`);
    } else {
      errorHandler.error(result.error || "读取文件失败");
    }
  }
};

onMounted(() => {
  handleFormatJson();
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  // 组件销毁时停止监听
  if (isClipboardListening.value) {
    stopClipboardMonitor();
  }
});
</script>

<style scoped>
.json-formatter-container {
  display: flex;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  padding: 20px;
}

.tool-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

/* 固定顶栏工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: transparent;
  border-bottom: 1px solid var(--border-color);
  z-index: 10;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
  max-width: 600px;
}

.indent-label,
.expand-label {
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
}

.indent-slider,
.expand-slider {
  width: 100px;
}

.indent-number,
.expand-number {
  width: 70px;
}

/* 主编辑区域 */
.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  /* 背景由 .tool-wrapper 提供 */
}

.editor-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
}

.input-panel {
  border-right: 1px solid var(--border-color);
}

/* 窄屏时的上下布局 */
@media (max-width: 768px) {
  .editor-container {
    flex-direction: column;
  }

  .input-panel {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .divider {
    width: 100%;
    height: 4px;
    cursor: row-resize;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: transparent;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.char-count {
  font-size: 12px;
  color: var(--text-color-light);
  background-color: var(--border-color-light);
  padding: 2px 6px;
  border-radius: 3px;
}

.output-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.error-indicator {
  color: #f56c6c;
  display: flex;
  align-items: center;
  gap: 4px;
}

.success-indicator {
  color: #67c23a;
  display: flex;
  align-items: center;
  gap: 4px;
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.input-editor,
.output-editor {
  flex: 1;
  height: 100%;
}

.input-editor :deep(.rich-code-editor-wrapper) {
  height: 100%;
  border: none;
}

.output-editor :deep(.rich-code-editor-wrapper) {
  height: 100%;
  border: none;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 122, 204, 0.2);
  border: 2px dashed var(--primary-color);
  border-radius: var(--el-border-radius-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
  color: var(--primary-color);
  font-size: 20px;
  pointer-events: none;
}

.drag-overlay .el-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.drag-overlay p {
  margin: 0;
  font-size: 18px;
}

.divider {
  width: 4px;
  background-color: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
}

.divider:hover {
  background-color: var(--primary-color);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #f56c6c;
  background-color: rgba(245, 108, 108, 0.1);
  border: 1px solid #f56c6c;
  border-radius: var(--el-border-radius-base);
  margin: 16px;
  font-size: 14px;
}

.json-output-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background-color: var(--card-bg);
  box-sizing: border-box;
}

.empty-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-light);
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 14px;
}
</style>
