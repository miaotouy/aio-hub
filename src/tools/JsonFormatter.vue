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
        <span class="expand-label">展开层级:</span>
        <el-slider v-model="defaultExpandDepth" :min="1" :max="10" :step="1" :show-tooltip="false"
          class="expand-slider" @change="formatJson" />
        <el-input-number v-model="defaultExpandDepth" :min="1" :max="10" size="small" controls-position="right"
          class="expand-number" @change="formatJson" />
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
          <RichCodeEditor
            v-model="rawJsonInput"
            language="json"
            @update:modelValue="formatJson"
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
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  WarningFilled,
  DocumentCopy,
  CopyDocument,
  Delete,
  Upload // 引入 Upload 图标
} from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import debounce from 'lodash/debounce';
import RichCodeEditor from '../components/common/RichCodeEditor.vue';
import { createModuleLogger } from '@utils/logger';

// 创建模块日志记录器
const logger = createModuleLogger('JsonFormatter');

const rawJsonInput = ref('');
const isDragging = ref(false); // 新增拖拽状态
const formattedJsonOutput = ref('');
const parsedJsonData = ref<any>(null);
const jsonError = ref('');
const defaultExpandDepth = ref(3); // 默认展开层级

// 计算输出标题
const outputTitle = computed(() => {
  if (jsonError.value) {
    return '格式化输出 - 错误';
  } else if (parsedJsonData.value) {
    return '格式化输出 - 有效 JSON';
  }
  return '格式化输出';
});

// 自定义 JSON 序列化器，根据展开层级控制格式
const customJsonStringify = (obj: any, expandDepth: number, currentDepth: number = 0): string => {
  if (obj === null) return 'null';
  if (typeof obj === 'undefined') return 'undefined';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  
  const indent = '  '.repeat(currentDepth);
  const nextIndent = '  '.repeat(currentDepth + 1);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    // 如果当前层级超过展开深度，使用紧凑格式（一行显示）
    if (currentDepth >= expandDepth) {
      const compactItems = obj.map(item => {
        if (typeof item === 'object' && item !== null) {
          return JSON.stringify(item); // 直接序列化为紧凑格式
        }
        return customJsonStringify(item, expandDepth, currentDepth + 1);
      });
      return `[${compactItems.join(', ')}]`;
    }
    
    const items = obj.map(item =>
      nextIndent + customJsonStringify(item, expandDepth, currentDepth + 1)
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    
    // 如果当前层级超过展开深度，使用紧凑格式（一行显示）
    if (currentDepth >= expandDepth) {
      return JSON.stringify(obj); // 直接序列化为紧凑格式
    }
    
    const items = keys.map(key => {
      const value = customJsonStringify(obj[key], expandDepth, currentDepth + 1);
      return `${nextIndent}${JSON.stringify(key)}: ${value}`;
    });
    return `{\n${items.join(',\n')}\n${indent}}`;
  }
  
  return String(obj);
};

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

    // 使用自定义序列化器，根据展开层级生成格式化输出
    formattedJsonOutput.value = customJsonStringify(parsed, defaultExpandDepth.value);
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
  logger.debug('拖放事件：dragover', { eventType: 'dragover' });
  event.preventDefault();
  event.stopPropagation();
};

const handleDragEnter = (event: DragEvent) => {
  logger.debug('拖放事件：dragenter', {
    eventType: 'dragenter',
    dragCounter: dragCounter + 1
  });
  event.preventDefault();
  event.stopPropagation();
  dragCounter++;
  isDragging.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  logger.debug('拖放事件：dragleave', {
    eventType: 'dragleave',
    dragCounter: dragCounter - 1
  });
  event.preventDefault();
  event.stopPropagation();
  dragCounter--;
  if (dragCounter === 0) {
    isDragging.value = false;
  }
};

const handleDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files;
  logger.debug('拖放事件：drop', {
    eventType: 'drop',
    filesCount: files?.length || 0,
    fileName: files?.[0]?.name
  });
  event.preventDefault();
  event.stopPropagation();
  dragCounter = 0;
  isDragging.value = false;

  if (files && files.length > 0) {
    const file = files[0];
    if (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        logger.debug('文件读取成功', {
          fileName: file.name,
          contentLength: content.length
        });
        rawJsonInput.value = content;
        formatJson();
        ElMessage.success(`成功读取文件: ${file.name}`);
      };
      reader.onerror = (e) => {
        logger.debug('文件读取失败', {
          fileName: file.name,
          error: e.target?.error?.message || '未知错误'
        });
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
  max-width: 600px;
  /* 增加中心区域最大宽度以容纳更多控件 */
}

.indent-label,
.expand-label {
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
  /* 防止换行 */
}

.indent-slider,
.expand-slider {
  width: 100px;
  /* 调整滑块宽度 */
}

.indent-number,
.expand-number {
  width: 70px;
  /* 调整数字输入框宽度 */
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
  box-sizing: border-box;
}

.empty-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-light);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
}

</style>
