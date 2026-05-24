<template>
  <div class="sketch-toolbar-wrapper">
    <!-- 左侧：返回按钮 -->
    <div class="toolbar-left">
      <button class="tool-btn" title="返回草图列表" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
    </div>

    <!-- 中间：工具按钮条 -->
    <div class="toolbar-center">
      <div class="tool-group">
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'select' }"
          title="选择工具 (V)"
          @click="selectTool('select')"
        >
          <MousePointer :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'pencil' }"
          title="铅笔 (B)"
          @click="selectTool('pencil')"
        >
          <Pencil :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'marker' }"
          title="马克笔 (M)"
          @click="selectTool('marker')"
        >
          <Highlighter :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'eraser' }"
          title="橡皮擦 (E)"
          @click="selectTool('eraser')"
        >
          <Eraser :size="18" />
        </button>
      </div>

      <div class="tool-divider" />

      <div class="tool-group">
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'rect' }"
          title="矩形 (R)"
          @click="selectTool('rect')"
        >
          <Square :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'ellipse' }"
          title="圆形 (O)"
          @click="selectTool('ellipse')"
        >
          <Circle :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'line' }"
          title="线段 (L)"
          @click="selectTool('line')"
        >
          <Minus :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'arrow' }"
          title="箭头 (A)"
          @click="selectTool('arrow')"
        >
          <ArrowUpRight :size="18" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: activeTool === 'text' }"
          title="文字 (T)"
          @click="selectTool('text')"
        >
          <Type :size="18" />
        </button>
        <button class="tool-btn" title="导入图片 (I)" @click="$emit('import-image')">
          <ImageIcon :size="18" />
        </button>
      </div>

      <div class="tool-divider" />

      <div class="tool-group">
        <button class="tool-btn" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="$emit('undo')">
          <Undo2 :size="18" />
        </button>
        <button class="tool-btn" :disabled="!canRedo" title="重做 (Ctrl+Y)" @click="$emit('redo')">
          <Redo2 :size="18" />
        </button>
      </div>

      <div class="tool-divider" />

      <button class="tool-btn" title="重置视图 (Ctrl+0)" @click="$emit('reset-view')">
        <Maximize :size="18" />
      </button>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="toolbar-right">
      <button class="action-btn" title="保存草图 (Ctrl+S)" @click="$emit('save')">
        <Save :size="16" />
        <span>保存</span>
      </button>
      <button class="action-btn" title="导出为 .aiosk 文件" @click="$emit('export')">
        <Download :size="16" />
        <span>导出</span>
      </button>
      <button class="action-btn accent" title="发送到 AI 对话附件" @click="$emit('send-to-chat')">
        <Send :size="16" />
        <span>发送</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  MousePointer,
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Type,
  ImagePlus as ImageIcon,
  Undo2,
  Redo2,
  Save,
  Download,
  Send,
  Maximize,
} from "lucide-vue-next";
import type { ToolType } from "../constants";

defineProps<{
  activeTool: ToolType;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "select-tool", tool: ToolType): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "reset-view"): void;
  (e: "save"): void;
  (e: "export"): void;
  (e: "send-to-chat"): void;
  (e: "import-image"): void;
}>();

function selectTool(tool: ToolType) {
  emit("select-tool", tool);
}
</script>

<style scoped>
.sketch-toolbar-wrapper {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 100;
  pointer-events: none;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.toolbar-center {
  flex: 0 1 auto;
  margin: 0 auto;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tool-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 6px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tool-btn.active {
  background: var(--el-color-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--el-color-primary-rgb), 0.4);
}

.tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
  white-space: nowrap;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.action-btn.accent {
  background: rgba(var(--el-color-primary-rgb), 0.8);
  color: #fff;
}

.action-btn.accent:hover {
  background: var(--el-color-primary);
}
</style>
