<template>
  <div class="json-formatter-container">
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
      </div>

      <div class="toolbar-center">
        <span class="indent-label">缩进层级:</span>
        <el-slider v-model="indentSpaces" :min="0" :max="8" :step="1" :show-tooltip="false" @input="formatJson"
          class="indent-slider" />
        <el-input-number v-model="indentSpaces" :min="0" :max="8" size="small" controls-position="right"
          @change="formatJson" class="indent-number" />
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
          <div v-if="rawJsonInput" class="char-count">
            {{ rawJsonInput.length }} 字符
          </div>
        </div>
        <div class="editor-content" @dragover.prevent="handleDragOver" @drop.prevent="handleDrop"
          @dragenter="handleDragEnter" @dragleave="handleDragLeave">
          <div v-if="isDragging" class="drag-overlay">
            <el-icon>
              <Upload />
            </el-icon>
            <p>拖拽文件到此处</p>
          </div>
          <el-input v-model="rawJsonInput" type="textarea" placeholder="请输入 JSON 字符串或拖拽文件到此处..." @input="formatJson"
            class="json-editor" resize="none" />
        </div>
      </div>

      <!-- 分割线，用于左右布局时的视觉分隔和拖拽调整 -->
      <div class="divider" @mousedown="startResize"></div>

      <!-- 输出区域 -->
      <div class="editor-panel output-panel" ref="outputPanel">
        <div class="panel-header">
          <span class="panel-title">格式化输出</span>
          <div class="output-info">
            <span v-if="jsonError" class="error-indicator">
              <el-icon>
                <WarningFilled />
              </el-icon>
              错误
            </span>
            <span v-else-if="parsedJsonData && !jsonError" class="success-indicator">
              <el-icon>
                <CircleCheckFilled />
              </el-icon>
              有效 JSON
            </span>
          </div>
        </div>
        <div class="editor-content">
          <div v-if="jsonError" class="error-message">
            <el-icon>
              <WarningFilled />
            </el-icon>
            <span>{{ jsonError }}</span>
          </div>
          <div v-else class="json-output-wrapper">
            <!-- 当缩进层级 > 0 时使用 VueJsonPretty，否则使用 textarea 进行压缩输出 -->
            <VueJsonPretty v-if="parsedJsonData && indentSpaces > 0" :data="parsedJsonData" :showIcon="true"
              :showLine="true" :showSelectBox="false" :highlightSelectedNode="false" :showLength="true"
              :showDoubleQuotes="true" :editable="false" class="vue-json-pretty" />
            <el-input v-else-if="parsedJsonData && indentSpaces === 0" v-model="formattedJsonOutput" type="textarea"
              readonly placeholder="压缩后的 JSON 将显示在这里..." class="json-editor output-editor" resize="none" />
            <el-input v-else v-model="formattedJsonOutput" type="textarea" readonly placeholder="格式化后的 JSON 将显示在这里..."
              class="json-editor output-editor" resize="none" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  WarningFilled,
  CircleCheckFilled,
  DocumentCopy,
  CopyDocument,
  Delete,
  Upload // 引入 Upload 图标
} from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import debounce from 'lodash/debounce';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';

const rawJsonInput = ref('');
const isDragging = ref(false); // 新增拖拽状态
const formattedJsonOutput = ref('');
const parsedJsonData = ref<any>(null);
const jsonError = ref('');
const indentSpaces = ref(2); // 默认缩进空格数

const formatJson = debounce(() => {
  jsonError.value = '';
  if (!rawJsonInput.value.trim()) {
    formattedJsonOutput.value = '';
    parsedJsonData.value = null;
    return;
  }

  try {
    const parsed = JSON.parse(rawJsonInput.value);
    parsedJsonData.value = parsed;

    // 当缩进层级为 0 时，视为压缩模式
    if (indentSpaces.value === 0) {
      formattedJsonOutput.value = JSON.stringify(parsed);
    } else {
      formattedJsonOutput.value = JSON.stringify(parsed, null, indentSpaces.value);
    }
  } catch (e: any) {
    jsonError.value = `JSON 解析错误: ${e.message}`;
    parsedJsonData.value = null;
    formattedJsonOutput.value = '';
  }
}, 300);

const pasteToJson = async () => {
  try {
    const text = await readText();
    rawJsonInput.value = text;
    formatJson();
    ElMessage.success('已从剪贴板粘贴内容');
  } catch (error: any) {
    ElMessage.error(`粘贴失败: ${error.message}`);
  }
};

const copyFormattedJson = async () => {
  if (!formattedJsonOutput.value) {
    ElMessage.warning('没有可复制的内容');
    return;
  }
  try {
    await writeText(formattedJsonOutput.value);
    ElMessage.success('已复制到剪贴板');
  } catch (error: any) {
    ElMessage.error(`复制失败: ${error.message}`);
  }
};

const clearAll = () => {
  rawJsonInput.value = '';
  formattedJsonOutput.value = '';
  parsedJsonData.value = null;
  jsonError.value = '';
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
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e: MouseEvent) => {
  if (!isResizing || !editorContainer.value || !inputPanel.value || !outputPanel.value) return;

  const dx = e.clientX - startX;
  const containerWidth = editorContainer.value.offsetWidth;

  let newInputWidth = initialInputWidth + dx;
  let newOutputWidth = initialOutputWidth - dx;

  // 限制最小宽度
  const minWidth = 100; // 调整为合适的值
  if (newInputWidth < minWidth) {
    newInputWidth = minWidth;
    newOutputWidth = containerWidth - minWidth;
  }
  if (newOutputWidth < minWidth) {
    newOutputWidth = minWidth;
    newInputWidth = containerWidth - minWidth;
  }

  inputPanel.value.style.flexBasis = `${newInputWidth}px`;
  inputPanel.value.style.flexGrow = '0';
  outputPanel.value.style.flexBasis = `${newOutputWidth}px`;
  outputPanel.value.style.flexGrow = '0';
};

const onMouseUp = () => {
  isResizing = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};

// 拖拽文件处理
let dragCounter = 0; // 用于跟踪拖拽进入/离开的次数

const handleDragOver = (event: DragEvent) => {
  console.log('DragOver triggered');
  event.preventDefault();
  event.stopPropagation();
};

const handleDragEnter = (event: DragEvent) => {
  console.log('DragEnter triggered', dragCounter);
  event.preventDefault();
  event.stopPropagation();
  dragCounter++;
  isDragging.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  console.log('DragLeave triggered', dragCounter);
  event.preventDefault();
  event.stopPropagation();
  dragCounter--;
  if (dragCounter === 0) {
    isDragging.value = false;
  }
};

const handleDrop = (event: DragEvent) => {
  console.log('Drop triggered', event.dataTransfer?.files);
  event.preventDefault();
  event.stopPropagation();
  dragCounter = 0;
  isDragging.value = false;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('FileReader onload', e.target?.result);
        const content = e.target?.result as string;
        rawJsonInput.value = content;
        formatJson();
        ElMessage.success(`成功读取文件: ${file.name}`);
      };
      reader.onerror = (e) => {
        console.log('FileReader error', e.target?.error);
        ElMessage.error(`读取文件失败: ${file.name} - ${e.target?.error}`);
      };
      reader.readAsText(file);
    } else {
      ElMessage.warning('请拖拽 JSON 或文本文件。');
    }

  }
};

onMounted(() => {
  formatJson(); // 初始格式化，以防有默认值
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});
</script>

<style scoped>
.json-formatter-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 使用100%而不是100vh，避免超出父容器 */
  width: 100%;
  /* 使用100%而不是100vw，避免超出父容器 */
  overflow: hidden;
  /* 防止内容溢出产生滚动条 */
  background-color: var(--bg-color);
  box-sizing: border-box;
}

/* 固定顶栏工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  /* 轻微阴影 */
  z-index: 10;
  flex-shrink: 0;
  /* 不参与伸缩 */
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
  /* 占据中心剩余空间 */
  justify-content: center;
  max-width: 400px;
  /* 限制中心区域最大宽度 */
}

.indent-label {
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
  /* 防止换行 */
}

.indent-slider {
  width: 120px;
  /* 固定滑块宽度 */
}

.indent-number {
  width: 80px;
  /* 固定数字输入框宽度 */
}

/* 主编辑区域 */
.editor-container {
  display: flex;
  flex: 1;
  /* 撑满剩余垂直空间 */
  overflow: hidden;
  /* 内部滚动，外部不滚动 */
}

.editor-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  /* 初始平分空间 */
  min-width: 100px;
  /* 面板最小宽度 */
  overflow: hidden;
  /* 确保内部内容滚动，而不是面板滚动 */
}

.input-panel {
  border-right: 1px solid var(--border-color);
  /* 输入面板右侧边框 */
}

/* 窄屏时的上下布局 */
@media (max-width: 768px) {
  .editor-container {
    flex-direction: column;
    /* 垂直布局 */
  }

  .input-panel {
    border-right: none;
    /* 移除右侧边框 */
    border-bottom: 1px solid var(--border-color);
    /* 添加底部边框 */
  }

  .divider {
    width: 100%;
    /* 垂直分割线宽度设为100% */
    height: 4px;
    /* 垂直分割线高度 */
    cursor: row-resize;
    /* 垂直拖拽光标 */
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  /* 不参与伸缩 */
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.char-count {
  font-size: 12px;
  color: var(--text-color-light);
}

.output-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.error-indicator {
  color: #f56c6c;
  /* 错误提示颜色 */
  display: flex;
  align-items: center;
  gap: 4px;
}

.success-indicator {
  color: #67c23a;
  /* 成功提示颜色 */
  display: flex;
  align-items: center;
  gap: 4px;
}

.editor-content {
  flex: 1;
  /* 撑满剩余空间 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 隐藏超出部分 */
  position: relative;
  /* 为拖拽覆盖层设置定位上下文 */
}

.json-editor {
  flex: 1;
  /* 确保 textarea 撑满 */
  width: 100%;
  /* 确保 textarea 宽度100% */
  height: 100%;
  /* 确保 textarea 高度100% */
}

.json-editor :deep(.el-textarea__inner) {
  height: 100% !important;
  /* 强制 textarea 内部元素高度100% */
  border: none !important;
  /* 移除边框 */
  border-radius: 0 !important;
  /* 移除圆角 */
  background-color: var(--input-bg);
  color: var(--text-color);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  /* 禁止手动调整大小 */
  padding: 16px;
  /* 统一填充 */
  box-sizing: border-box;
  /* 边框和内边距包含在尺寸内 */
}

.json-editor :deep(.el-textarea__inner):focus {
  box-shadow: none !important;
  /* 移除聚焦时的阴影 */
}

.output-editor :deep(.el-textarea__inner) {
  background-color: var(--card-bg);
  /* 输出区域的背景色 */
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 122, 204, 0.2);
  /* 蓝色半透明背景 */
  border: 2px dashed var(--primary-color);
  border-radius: var(--el-border-radius-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
  /* 确保在 textarea 上层 */
  color: var(--primary-color);
  font-size: 20px;
  pointer-events: none;
  /* 允许事件穿透到下层元素 */
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
  /* 默认垂直分割线宽度 */
  background-color: var(--border-color);
  cursor: col-resize;
  /* 左右拖拽光标 */
  flex-shrink: 0;
  /* 不参与伸缩 */
}

.divider:hover {
  background-color: var(--primary-color);
  /* 悬停时改变颜色 */
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #f56c6c;
  /* 错误消息颜色 */
  background-color: rgba(245, 108, 108, 0.1);
  /* 错误消息背景 */
  border: 1px solid #f56c6c;
  border-radius: var(--el-border-radius-base);
  margin: 16px;
  /* 外部边距 */
  font-size: 14px;
}

.json-output-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  /* 内部内容滚动 */
  background-color: var(--card-bg);
  /* 移除此处 padding，由 json-editor 内部的 textarea 负责 */
  box-sizing: border-box;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
}

/* VueJsonPretty 样式调整 */
.vue-json-pretty {
  flex: 1;
  /* 覆盖 VueJsonPretty 内部样式 */
  background-color: var(--card-bg) !important;
}

.vue-json-pretty :deep(.vjs-tree) {
  color: var(--text-color) !important;
  background-color: var(--card-bg) !important;
}

.vue-json-pretty :deep(.vjs-key) {
  color: var(--text-color) !important;
}

.vue-json-pretty :deep(.vjs-value) {
  color: var(--text-color-light) !important;
}

/* 针对特定类型的值调整颜色 */
.vue-json-pretty :deep(.vjs-value__string) {
  color: #c94e4e !important;
  /* 字符串颜色 */
}

.vue-json-pretty :deep(.vjs-value__number) {
  color: #3b8a3b !important;
  /* 数字颜色 */
}

.vue-json-pretty :deep(.vjs-value__boolean) {
  color: #925cff !important;
  /* 布尔值颜色 */
}

.vue-json-pretty :deep(.vjs-value__null) {
  color: #808080 !important;
  /* null 颜色 */
}
</style>
