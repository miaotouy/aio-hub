<template>
  <div class="text-diff-container">
    <!-- 工具栏 -->
    <div class="toolbar-card">
      <div class="toolbar">
        <!-- 语言选择 -->
        <div class="toolbar-group">
          <el-select v-model="language" placeholder="选择语言" size="small" style="width: 150px">
            <el-option label="纯文本" value="plaintext" />
            <el-option label="JavaScript" value="javascript" />
            <el-option label="TypeScript" value="typescript" />
            <el-option label="JSON" value="json" />
            <el-option label="HTML" value="html" />
            <el-option label="CSS" value="css" />
            <el-option label="Python" value="python" />
            <el-option label="Java" value="java" />
            <el-option label="C++" value="cpp" />
            <el-option label="Markdown" value="markdown" />
          </el-select>
        </div>

        <!-- 布局切换 -->
        <div class="toolbar-group">
          <el-radio-group v-model="renderSideBySide" size="small">
            <el-radio-button :value="true">并排</el-radio-button>
            <el-radio-button :value="false">内联</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 比对选项 -->
        <div class="toolbar-group">
          <el-checkbox v-model="ignoreWhitespace" size="small">忽略行尾空白</el-checkbox>
          <el-checkbox v-model="renderOverviewRuler" size="small">只看变更</el-checkbox>
          <el-checkbox v-model="wordWrap" size="small">自动换行</el-checkbox>
          <div class="checkbox-with-tip">
            <el-checkbox v-model="ignoreCaseInDiffComputing" size="small"> 忽略大小写 </el-checkbox>
            <el-tooltip content="实验性功能：仅影响导航计数，不改变可视差异" placement="top">
              <el-icon class="experimental-icon" :size="16" color="var(--el-color-info)">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </div>

        <!-- 差异导航 -->
        <div class="toolbar-group">
          <el-button-group size="small">
            <el-button :disabled="!canNavigate" @click="goToPreviousDiff">
              <el-icon><ArrowUp /></el-icon>
              上一处
            </el-button>
            <el-button :disabled="!canNavigate" @click="goToNextDiff">
              下一处
              <el-icon><ArrowDown /></el-icon>
            </el-button>
          </el-button-group>
          <span v-if="totalDiffs > 0" class="diff-counter">
            {{ currentDiffIndex + 1 }} / {{ totalDiffs }}
          </span>
          <span v-else class="diff-counter">无差异</span>
        </div>

        <!-- 文件操作 -->
        <div class="toolbar-group">
          <el-dropdown size="small">
            <el-button size="small">
              <el-icon><FolderOpened /></el-icon>
              文件
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openFile('left')">
                  <el-icon><Document /></el-icon>
                  打开左侧
                </el-dropdown-item>
                <el-dropdown-item @click="openFile('right')">
                  <el-icon><Document /></el-icon>
                  打开右侧
                </el-dropdown-item>
                <el-dropdown-item divided @click="saveFile('left')">保存左侧</el-dropdown-item>
                <el-dropdown-item @click="saveFile('right')">保存右侧</el-dropdown-item>
                <el-dropdown-item @click="saveFile('both')">保存两侧</el-dropdown-item>
                <el-dropdown-item divided @click="exportPatch">
                  <el-icon><Download /></el-icon>
                  导出 .patch
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 剪贴板操作 -->
        <div class="toolbar-group">
          <el-dropdown size="small">
            <el-button size="small">
              <el-icon><DocumentCopy /></el-icon>
              剪贴板
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="copyToClipboard('left')">复制左侧</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard('right')">复制右侧</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard('patch')">复制补丁</el-dropdown-item>
                <el-dropdown-item divided @click="pasteFromClipboard('left')"
                  >粘贴到左侧</el-dropdown-item
                >
                <el-dropdown-item @click="pasteFromClipboard('right')">粘贴到右侧</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 操作按钮 -->
        <div class="toolbar-group">
          <el-dropdown size="small" @command="clearTexts">
            <el-button size="small">
              <el-icon><Delete /></el-icon>
              清空
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="left">清空左侧</el-dropdown-item>
                <el-dropdown-item command="right">清空右侧</el-dropdown-item>
                <el-dropdown-item command="all" divided>清空全部</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button size="small" @click="swapTexts">交换</el-button>
        </div>
      </div>
    </div>

    <!-- 文件名显示 -->
    <div v-if="leftFileName || rightFileName" class="file-names">
      <div class="file-name-item">
        <span v-if="leftFileName" class="file-name">
          <el-icon><Document /></el-icon>
          {{ leftFileName }}
        </span>
        <span v-else class="file-name-placeholder">左侧：未命名</span>
      </div>
      <div class="file-name-item">
        <span v-if="rightFileName" class="file-name">
          <el-icon><Document /></el-icon>
          {{ rightFileName }}
        </span>
        <span v-else class="file-name-placeholder">右侧：未命名</span>
      </div>
    </div>

    <!-- Diff 编辑器 - 一体化输入和对比 -->
    <div class="diff-editor-card">
      <div class="editor-container">
        <!-- 左侧拖放区域 -->
        <div
          ref="leftDropZone"
          class="drop-zone left-drop-zone"
          :class="{ 'drop-zone--active': isLeftDragging }"
        >
          <div class="drop-hint">
            <el-icon><FolderOpened /></el-icon>
            <span>拖放文件到左侧</span>
          </div>
        </div>

        <!-- 右侧拖放区域 -->
        <div
          ref="rightDropZone"
          class="drop-zone right-drop-zone"
          :class="{ 'drop-zone--active': isRightDragging }"
        >
          <div class="drop-hint">
            <el-icon><FolderOpened /></el-icon>
            <span>拖放文件到右侧</span>
          </div>
        </div>

        <!-- RichCodeEditor for Diff -->
        <RichCodeEditor
          ref="richCodeEditorRef"
          :diff="true"
          :original="textA"
          :modified="textB"
          :language="language"
          :options="editorOptions"
          editor-type="monaco"
          class="diff-editor"
          @update:original="textA = $event"
          @update:modified="textB = $event"
          @mount="handleEditorMounted"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import RichCodeEditor from "@components/common/RichCodeEditor.vue";
import {
  ArrowUp,
  ArrowDown,
  QuestionFilled,
  FolderOpened,
  DocumentCopy,
  Download,
  Document,
  Delete,
} from "@element-plus/icons-vue";
import { useFileDrop } from "@composables/useFileDrop";
import { useTextDiff } from "./composables/useTextDiff";

// 编辑器引用
const richCodeEditorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

// 拖放区域引用
const leftDropZone = ref<HTMLElement>();
const rightDropZone = ref<HTMLElement>();

// 使用 Composable 获取所有状态和逻辑
const {
  textA,
  textB,
  language,
  leftFileName,
  rightFileName,
  renderSideBySide,
  ignoreWhitespace,
  renderOverviewRuler,
  wordWrap,
  ignoreCaseInDiffComputing,
  currentDiffIndex,
  totalDiffs,
  editorOptions,
  canNavigate,
  handleEditorMounted,
  goToPreviousDiff,
  goToNextDiff,
  clearTexts,
  swapTexts,
  openFile,
  saveFile,
  handleFileDrop,
  copyToClipboard,
  pasteFromClipboard,
  exportPatch,
} = useTextDiff();

// 设置文件拖放
const { isDraggingOver: isLeftDragging } = useFileDrop({
  element: leftDropZone,
  fileOnly: true,
  multiple: true,
  onDrop: (paths) => handleFileDrop(paths, "left"),
});

const { isDraggingOver: isRightDragging } = useFileDrop({
  element: rightDropZone,
  fileOnly: true,
  multiple: true,
  onDrop: (paths) => handleFileDrop(paths, "right"),
});
</script>

<style scoped>
.text-diff-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  gap: 20px;
  overflow: hidden;
}

.toolbar-card {
  flex-shrink: 0;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  padding: 16px;
}

.toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.experimental-icon {
  cursor: help;
  vertical-align: middle;
}

.diff-counter {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  margin-left: 8px;
}

.diff-editor-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.file-names {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 2px;
}

.file-name-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--card-bg);
  border-radius: 8px;
  font-size: 13px;
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
}

.file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.file-name-placeholder {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.editor-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.drop-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.left-drop-zone {
  left: 0;
}

.right-drop-zone {
  right: 0;
}

.drop-zone--active {
  opacity: 1;
  pointer-events: auto;
  background: rgba(64, 158, 255, 0.1);
  border: 2px dashed var(--el-color-primary);
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.drop-hint .el-icon {
  font-size: 32px;
}

.diff-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: transparent;
}
</style>
