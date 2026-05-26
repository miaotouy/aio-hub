<template>
  <div class="sketch-toolbar-wrapper">
    <!-- 左侧：返回按钮 -->
    <div class="toolbar-left">
      <el-tooltip content="返回草图列表" placement="bottom" :show-after="300">
        <button class="tool-btn" @click="handleBack">
          <ArrowLeft :size="18" />
        </button>
      </el-tooltip>
    </div>

    <!-- 中间：工具按钮条 -->
    <div class="toolbar-center">
      <div class="tool-group">
        <el-tooltip content="选择工具 (V)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'select' }" @click="selectTool('select')">
            <MousePointer :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="抓手工具 (H) - 拖拽画布" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'hand' }" @click="selectTool('hand')">
            <Hand :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="铅笔 (B)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'pencil' }" @click="selectTool('pencil')">
            <Pencil :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="马克笔 (M)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'marker' }" @click="selectTool('marker')">
            <Highlighter :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="橡皮擦 (E)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'eraser' }" @click="selectTool('eraser')">
            <Eraser :size="18" />
          </button>
        </el-tooltip>
      </div>

      <div class="tool-divider" />

      <div class="tool-group">
        <el-tooltip content="矩形 (R)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'rect' }" @click="selectTool('rect')">
            <Square :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="圆形 (O)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'ellipse' }" @click="selectTool('ellipse')">
            <Circle :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="线段 (L)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'line' }" @click="selectTool('line')">
            <Minus :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="箭头 (A)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'arrow' }" @click="selectTool('arrow')">
            <ArrowUpRight :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="文字 (T)" placement="bottom" :show-after="300">
          <button class="tool-btn" :class="{ active: activeTool === 'text' }" @click="selectTool('text')">
            <Type :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="导入图片 (I)" placement="bottom" :show-after="300">
          <button class="tool-btn" @click="handleImportImage">
            <ImageIcon :size="18" />
          </button>
        </el-tooltip>
      </div>

      <div class="tool-divider" />

      <div class="tool-group">
        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom" :show-after="300">
          <button class="tool-btn" :disabled="!canUndo" @click="handleUndo">
            <Undo2 :size="18" />
          </button>
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Y)" placement="bottom" :show-after="300">
          <button class="tool-btn" :disabled="!canRedo" @click="handleRedo">
            <Redo2 :size="18" />
          </button>
        </el-tooltip>
      </div>

      <div class="tool-divider" />

      <el-tooltip content="重置视图 (Ctrl+0)" placement="bottom" :show-after="300">
        <button class="tool-btn" @click="handleResetView">
          <Maximize :size="18" />
        </button>
      </el-tooltip>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="toolbar-right">
      <el-tooltip content="保存草图 (Ctrl+S)" placement="bottom" :show-after="300">
        <button class="action-btn" :class="{ 'has-changes': isDirty }" @click="handleSave">
          <Save :size="16" />
          <span>保存</span>
          <span v-if="isDirty" class="dirty-dot" />
        </button>
      </el-tooltip>
      <el-dropdown trigger="click" @command="handleExportCommand">
        <div>
          <el-tooltip content="导出" placement="bottom" :show-after="300">
            <button class="action-btn">
              <Download :size="16" />
              <span>导出</span>
              <ChevronDown :size="12" />
            </button>
          </el-tooltip>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="aiosk">
              <FileArchive :size="14" />
              <span>导出为项目文件 (.aiosk)</span>
            </el-dropdown-item>
            <el-dropdown-item divided command="png">
              <ImageIcon :size="14" />
              <span>导出为 PNG (透明背景)</span>
            </el-dropdown-item>
            <el-dropdown-item command="jpg">
              <ImageIcon :size="14" />
              <span>导出为 JPG</span>
            </el-dropdown-item>
            <el-dropdown-item command="webp">
              <ImageIcon :size="14" />
              <span>导出为 WebP</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="发送到 AI 对话附件" placement="bottom" :show-after="300">
        <button class="action-btn accent" @click="handleSendToChat">
          <Send :size="16" />
          <span>发送</span>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import {
  ArrowLeft,
  MousePointer,
  Hand,
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
  ChevronDown,
  FileArchive,
} from "lucide-vue-next";
import { useEditorSession } from "../composables/useEditorSession";
import type { ToolType } from "../constants";
import type { SketchPadContext } from "../SketchPad.vue";

const { state, runtime, actions } = useEditorSession();
const ctx = inject<SketchPadContext>("sketchPadContext")!;

// 直接读状态
const activeTool = state.activeTool;
const canUndo = state.canUndo;
const canRedo = state.canRedo;
const isDirty = state.isDirty;

export type ExportFormat = "aiosk" | "png" | "jpg" | "webp";

function selectTool(tool: ToolType) {
  actions.selectTool(tool);
}

function handleBack() {
  ctx.lifecycle.goBack(ctx.exportActions.handleSave);
}

function handleUndo() {
  actions.undo();
}

function handleRedo() {
  actions.redo();
}

function handleResetView() {
  runtime.capabilities.resetView();
}

function handleSave() {
  ctx.exportActions.handleSave();
}

function handleExportCommand(command: string | number | object) {
  ctx.exportActions.handleExport(command as ExportFormat);
}

function handleSendToChat() {
  ctx.exportActions.handleSendToChat();
}

function handleImportImage() {
  ctx.exportActions.handleImportImage();
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
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 10px;
  padding: 6px 8px;
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
  background: var(--border-color);
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
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(var(--primary-color-rgb), 0.08);
  color: var(--el-text-color-primary);
}

.tool-btn.active {
  background: var(--primary-color);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.4);
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
  background: rgba(var(--primary-color-rgb), 0.06);
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
  white-space: nowrap;
}

.action-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.12);
  color: var(--el-text-color-primary);
}

.action-btn.accent {
  background: rgba(var(--primary-color-rgb), 0.8);
  color: #fff;
}

.action-btn.accent:hover {
  background: var(--primary-color);
}

.action-btn.has-changes {
  position: relative;
  background: rgba(var(--primary-color-rgb), 0.1);
}

.dirty-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-color);
  opacity: 0.7;
}

/* 导出下拉菜单样式 */
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
</style>
