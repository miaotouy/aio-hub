<template>
  <div class="code-header" :class="{ floating: seamless && viewMode === 'preview' }">
    <div class="language-info">
      <span class="language-tag">{{ language || "文本" }}</span>
      <!-- 预览模式指示器 -->
      <span v-if="isHtml && viewMode === 'preview'" class="mode-tag">预览模式</span>
      <!-- Token 计数 -->
      <span v-if="showTokenCount" class="token-info">
        {{ contentLength }} 字 / ~{{ tokenCount }} tokens
      </span>
    </div>
    <div class="header-actions">
      <!-- HTML 预览切换按钮 -->
      <template v-if="isHtml">
        <el-tooltip
          :content="viewMode === 'preview' ? '查看源码' : '预览 HTML'"
          :show-after="300"
        >
          <button
            class="action-btn"
            :class="{ 'action-btn-active': viewMode === 'preview' }"
            @click="$emit('toggle-view-mode')"
          >
            <Code v-if="viewMode === 'preview'" :size="14" />
            <Eye v-else :size="14" />
          </button>
        </el-tooltip>

        <el-tooltip
          :content="closed === false ? '内容生成中...' : '在弹窗中预览'"
          :show-after="300"
        >
          <button class="action-btn" :disabled="closed === false" @click="$emit('open-dialog-preview')">
            <ExternalLink :size="14" />
          </button>
        </el-tooltip>

        <div class="divider"></div>
      </template>

      <!-- 字体大小调整按钮 -->
      <el-tooltip content="减小字体" :show-after="300">
        <button
          class="action-btn"
          :disabled="codeFontSize <= codeFontMin"
          @click="$emit('decrease-font')"
        >
          <Minus :size="14" />
        </button>
      </el-tooltip>
      <el-tooltip content="重置字体大小" :show-after="300">
        <button
          class="action-btn"
          :disabled="!fontBaselineReady || codeFontSize === defaultCodeFontSize"
          @click="$emit('reset-font')"
        >
          <RotateCcw :size="14" />
        </button>
      </el-tooltip>
      <el-tooltip content="增大字体" :show-after="300">
        <button
          class="action-btn"
          :disabled="codeFontSize >= codeFontMax"
          @click="$emit('increase-font')"
        >
          <Plus :size="14" />
        </button>
      </el-tooltip>

      <!-- 换行切换按钮 -->
      <el-tooltip :content="wordWrapEnabled ? '禁用换行' : '启用换行'" :show-after="300">
        <button
          class="action-btn"
          :class="{ 'action-btn-active': wordWrapEnabled }"
          @click="$emit('toggle-word-wrap')"
        >
          <WrapText :size="14" />
        </button>
      </el-tooltip>

      <!-- 复制按钮 -->
      <el-tooltip :content="copied ? '已复制' : '复制代码'" :show-after="300">
        <button class="action-btn" :class="{ 'action-btn-active': copied }" @click="$emit('copy-code')">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
      </el-tooltip>

      <!-- 展开/折叠按钮 -->
      <el-tooltip :content="isExpanded ? '折叠' : '展开'" :show-after="300">
        <button class="action-btn" @click="$emit('toggle-expand')">
          <Minimize2 v-if="isExpanded" :size="14" />
          <Maximize2 v-else :size="14" />
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RotateCcw,
  WrapText,
  Eye,
  Code,
  ExternalLink,
} from "lucide-vue-next";

defineProps<{
  language?: string;
  viewMode: "code" | "preview";
  isHtml: boolean;
  isExpanded: boolean;
  wordWrapEnabled: boolean;
  copied: boolean;
  codeFontSize: number;
  codeFontMin: number;
  codeFontMax: number;
  defaultCodeFontSize: number;
  fontBaselineReady: boolean;
  tokenCount: number;
  showTokenCount: boolean;
  contentLength: number;
  closed?: boolean;
  seamless?: boolean;
}>();

defineEmits<{
  (e: "toggle-view-mode"): void;
  (e: "open-dialog-preview"): void;
  (e: "decrease-font"): void;
  (e: "reset-font"): void;
  (e: "increase-font"): void;
  (e: "toggle-word-wrap"): void;
  (e: "copy-code"): void;
  (e: "toggle-expand"): void;
}>();
</script>

<style scoped>
.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--code-block-bg, var(--card-bg));
  flex-shrink: 0;
}

/* 悬浮 Header 模式 */
.code-header.floating {
  position: absolute;
  top: -40px;
  height: 40px;
  left: 0;
  right: 0;
  padding: 0 8px 4px 8px;
  background-color: transparent;
  pointer-events: none;
  z-index: 10;
  justify-content: flex-end;
  align-items: flex-end;
}

.code-header.floating .language-info {
  display: none;
}

.code-header.floating .header-actions {
  background-color: var(--el-bg-color);
  backdrop-filter: blur(var(--ui-blur, 10px));
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
  box-shadow: var(--el-box-shadow-light);
  pointer-events: auto;
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease-in-out;
  position: relative;
}

.code-header.floating .header-actions::after {
  content: "";
  position: absolute;
  bottom: -15px;
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: -1;
}

/* 桥接层逻辑需要在父组件中通过 .hovered 类控制 */
:global(.markdown-code-block.hovered) .code-header.floating .header-actions {
  opacity: 1;
  transform: translateY(0);
}

.language-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.mode-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.token-info {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  opacity: 0.6;
  font-family: var(--el-font-family-mono);
  margin-left: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: rgba(var(--el-color-primary-rgb), 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 4px;
}
</style>