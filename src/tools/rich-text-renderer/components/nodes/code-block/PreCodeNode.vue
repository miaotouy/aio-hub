<template>
  <div class="pre-code-node" :class="[{ 'with-line-numbers': lineNumbers }, theme ? `theme-${theme}` : '']">
    <div v-if="lineNumbers" class="line-numbers-gutter" :style="dynamicGutterStyle">
      <div v-for="n in lineCount" :key="n" class="line-number">
        <span class="num">{{ n }}</span>
        <span v-if="theme === 'monaco' || theme === 'codemirror'" class="fold-placeholder"></span>
      </div>
    </div>
    <pre class="code-content"><code>{{ content }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  content: string;
  lineNumbers?: boolean;
  theme?: "monaco" | "codemirror";
  gutterWidth?: number; // 显式指定行号区域宽度
}>();

const lineCount = computed(() => {
  return props.content.split("\n").length || 1;
});

const dynamicGutterStyle = computed(() => {
  if (!props.gutterWidth) return {};
  return {
    width: `${props.gutterWidth}px`,
    minWidth: `${props.gutterWidth}px`,
  };
});
</script>

<style scoped>
/* ========== 基础样式（通用） ========== */
.pre-code-node {
  display: flex;
  background-color: transparent;
  /* 匹配 Monaco 和 CodeMirror 的字体栈，优先使用 Windows 常用的 Consolas */
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: var(--pre-font-size, 13px);
  line-height: var(--pre-line-height, 1.5);
  tab-size: 4;
  overflow: hidden;
  width: 100%;
  min-height: 20px;
  padding: 0;
}

.line-numbers-gutter {
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.line-number {
  height: var(--pre-line-height, 1.5em);
  display: flex;
  align-items: center;
  /* 确保行号也使用等宽字体 */
  font-family: inherit;
}

.code-content {
  margin: 0;
  overflow-x: auto;
  flex-grow: 1;
  white-space: pre;
  box-sizing: border-box;
  /* 显式重置全局 index.css 中的 pre 样式 */
  background-color: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  /* 强制继承字体，防止浏览器默认样式干扰 */
  font-family: inherit;
}

.code-content code {
  font-family: inherit;
}

/* 隐藏滚动条但保持可滚动 */
.code-content::-webkit-scrollbar {
  display: none;
}

/* ========== CodeMirror 主题样式 ========== */
.pre-code-node.theme-codemirror {
  padding: 0;
  background-color: transparent;
}

.pre-code-node.theme-codemirror .line-numbers-gutter {
  padding: 12px 0;
  background-color: transparent;
  border-right: none;
}

.pre-code-node.theme-codemirror .line-number {
  padding: 0;
}

.pre-code-node.theme-codemirror .num {
  flex: 1;
  text-align: right;
  padding: 0 8px 0 12px;
  min-width: 40px;
  box-sizing: border-box;
  color: var(--text-color-light, #858585);
  opacity: 0.5;
  /* 统一使用 1.0 倍字号，匹配真实 CodeMirror 表现 */
  font-size: var(--pre-font-size, 13px);
}

.pre-code-node.theme-codemirror .fold-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.pre-code-node.theme-codemirror .code-content {
  padding: 12px 12px 12px 4px; /* 匹配 .cm-content (12px 0) + .cm-line (0 12px 0 4px) */
  color: var(--text-color);
}

/* ========== Monaco 主题样式 ========== */
.pre-code-node.theme-monaco {
  padding: 0;
  /* 模拟 Monaco 的背景色，使用变量。行号区和代码区都透明，由这里统一提供背景 */
  background-color: var(--code-block-bg, var(--container-bg)) !important;
}

/* Monaco 行号区域：精确匹配 .monaco-editor .margin 的样式 */
.pre-code-node.theme-monaco .line-numbers-gutter {
  min-width: 64px;
  width: 64px;
  padding: 0;
  background-color: transparent;
  text-align: right;
}

.pre-code-node.theme-monaco .line-number {
  padding: 0;
  justify-content: flex-end;
}

.pre-code-node.theme-monaco .num {
  flex: 1;
  padding: 0 10px 0 0;
  color: var(--vscode-editor-foreground, #858585);
  opacity: 0.4;
  font-size: var(--pre-font-size, 14px);
  line-height: var(--pre-line-height, 19px);
}

.pre-code-node.theme-monaco .fold-placeholder {
  width: 20px; /* Monaco 典型的折叠/指示区宽度 */
  flex-shrink: 0;
}

/* Monaco 代码内容区域：精确匹配 .monaco-editor .lines-content 的样式 */
.pre-code-node.theme-monaco .code-content {
  padding: 0;
  color: var(--vscode-editor-foreground, var(--text-color));
  background-color: transparent;
}

/* Monaco 代码行内边距：匹配 .view-line 的实际渲染 */
.pre-code-node.theme-monaco .code-content code {
  display: block;
  padding-left: 0;
}
</style>
