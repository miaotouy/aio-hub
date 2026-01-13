<template>
  <div class="workspace-toolbar">
    <div class="toolbar-left">
      <!-- 侧边栏折叠按钮 -->
      <el-tooltip
        :content="isConfigCollapsed ? '展开配置栏' : '折叠配置栏'"
        placement="bottom"
        :show-after="300"
      >
        <el-button
          :icon="isConfigCollapsed ? DArrowRight : DArrowLeft"
          @click="$emit('update:isConfigCollapsed', !isConfigCollapsed)"
          size="small"
        />
      </el-tooltip>

      <!-- 样式配置按钮 -->
      <el-tooltip content="配置 Markdown 渲染样式" placement="bottom" :show-after="300">
        <el-button :icon="Brush" @click="$emit('openStyleEditor')" size="small" />
      </el-tooltip>

      <!-- 正则规则配置按钮 -->
      <el-tooltip content="配置正则处理管道" placement="bottom" :show-after="300">
        <el-button :icon="MagicStick" @click="$emit('openRegexConfig')" size="small" />
      </el-tooltip>

      <!-- 查看 AST 按钮 -->
      <el-tooltip content="查看当前渲染的 AST 结构" placement="bottom" :show-after="300">
        <el-button :icon="Atom" @click="$emit('openAstViewer')" size="small" />
      </el-tooltip>

      <!-- 渲染状态标签 -->
      <el-tag v-if="isRendering" type="primary" effect="dark" size="small">
        <el-icon class="is-loading"><Loading /></el-icon>
        渲染中...
      </el-tag>

      <!-- 三状态布局切换 -->
      <el-divider direction="vertical" />
      <el-radio-group v-model="layoutMode" size="small">
        <el-radio-button value="split">分栏</el-radio-button>
        <el-radio-button value="input-only">仅输入</el-radio-button>
        <el-radio-button value="preview-only">仅预览</el-radio-button>
      </el-radio-group>
    </div>

    <div class="toolbar-right">
      <el-tooltip
        :content="
          isRendering
            ? '停止当前的渲染'
            : streamEnabled
              ? '开始流式渲染输入的 Markdown 内容'
              : '立即渲染输入的 Markdown 内容'
        "
        placement="bottom"
        :show-after="300"
      >
        <el-button
          :type="isRendering ? 'danger' : 'primary'"
          :icon="isRendering ? VideoPause : VideoPlay"
          @click="isRendering ? $emit('stopRender') : $emit('startRender')"
          :disabled="!isRendering && !inputContent.trim()"
          size="small"
        >
          {{ isRendering ? "停止" : streamEnabled ? "流式渲染" : "立即渲染" }}
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="
          syncInputProgress && cachedInputContent ? '清空输出并重置输入内容' : '清空渲染输出'
        "
        placement="bottom"
        :show-after="300"
      >
        <el-button
          :icon="RefreshRight"
          @click="$emit('clearOutput')"
          :disabled="!currentContent && !streamSource && !cachedInputContent"
          size="small"
        >
          {{ syncInputProgress && cachedInputContent ? "重置" : "清空" }}
        </el-button>
      </el-tooltip>
      <el-button-group>
        <el-tooltip content="复制原文和渲染后的 HTML" placement="bottom" :show-after="300">
          <el-button
            :icon="CopyDocument"
            @click="$emit('copyComparison')"
            :disabled="!inputContent.trim() || (!currentContent && !streamSource)"
            size="small"
          >
            复制对比
          </el-button>
        </el-tooltip>
        <el-popover placement="bottom" :width="220" trigger="click">
          <template #reference>
            <el-button :icon="Setting" size="small" />
          </template>
          <div class="copy-options">
            <div class="option-header">复制内容配置</div>
            <el-checkbox v-model="copyOptions.includeConfig">测试配置</el-checkbox>
            <el-checkbox v-model="copyOptions.includeOriginal">Markdown 原文</el-checkbox>
            <el-checkbox v-model="copyOptions.includeHtml">渲染后的 HTML</el-checkbox>
            <el-checkbox v-model="copyOptions.includeNormalizedOriginal"
              >规范化后的原文</el-checkbox
            >
            <el-checkbox v-model="copyOptions.includeNormalizedRendered"
              >规范化后的渲染文本</el-checkbox
            >
            <el-checkbox v-model="copyOptions.includeComparison">对比信息</el-checkbox>
            <el-checkbox v-model="copyOptions.includeStyleConfig">MD 样式配置</el-checkbox>
            <el-checkbox v-model="copyOptions.includeBlockInfo">块信息属性</el-checkbox>
          </div>
        </el-popover>
      </el-button-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  RefreshRight,
  Loading,
  CopyDocument,
  Brush,
  Setting,
  MagicStick,
} from "@element-plus/icons-vue";
import { Atom } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useRichTextRendererStore } from "../../stores/store";
import type { StreamSource } from "../../types";

defineProps<{
  isRendering: boolean;
  currentContent: string;
  streamSource: StreamSource | undefined;
  cachedInputContent: string;
}>();

defineEmits<{
  (e: "update:isConfigCollapsed", value: boolean): void;
  (e: "openStyleEditor"): void;
  (e: "openRegexConfig"): void;
  (e: "openAstViewer"): void;
  (e: "startRender"): void;
  (e: "stopRender"): void;
  (e: "clearOutput"): void;
  (e: "copyComparison"): void;
}>();

// Local state models
const isConfigCollapsed = defineModel<boolean>("isConfigCollapsed", { required: true });
const layoutMode = defineModel<"split" | "input-only" | "preview-only">("layoutMode", {
  required: true,
});

// Store
const store = useRichTextRendererStore();
const { inputContent, streamEnabled, syncInputProgress, copyOptions } = storeToRefs(store);
</script>

<style scoped>
.workspace-toolbar {
  display: flex;
  /* 移除 space-between，改用 margin-left: auto 实现两端对齐 */
  /* justify-content: space-between; */
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
  flex-wrap: wrap; /* 允许换行 */
  gap: 12px; /* 换行后的间距 */
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap; /* 内部也允许换行 */
}

/* 让右侧工具栏自动靠右，即使在换行后也能保持靠右对齐 */
.toolbar-right {
  margin-left: auto;
}

/* Loading 图标动画 */
.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.copy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.copy-options :deep(.el-checkbox) {
  margin-right: 0;
  height: 24px;
}

.el-button {
  margin: 0px;
}
</style>
