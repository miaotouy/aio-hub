<template>
  <div class="markdown-style-editor">
    <el-tooltip content="重置为默认样式" placement="bottom">
      <el-button class="reset-button" :icon="Refresh" @click="handleReset" circle />
    </el-tooltip>
    <el-tabs v-model="activeTab" tab-position="left" class="style-tabs">
      <el-tab-pane label="基础格式" name="basic">
        <div class="tab-content">
          <div class="style-section">
            <div class="section-header">普通文本 (Paragraph)</div>
            <StyleItemEditor
              v-model="localValue.paragraph.value"
              preview-text="这是一段普通的文本内容预览，用于展示样式的实际效果。"
              preview-tag="p"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">粗体 (Strong)</div>
            <StyleItemEditor
              v-model="localValue.strong.value"
              preview-text="这是一段粗体文本预览"
              preview-tag="strong"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">斜体 (Em)</div>
            <StyleItemEditor
              v-model="localValue.em.value"
              preview-text="这是一段斜体文本预览"
              preview-tag="em"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">删除线 (Strikethrough)</div>
            <StyleItemEditor
              v-model="localValue.strikethrough.value"
              preview-text="这是一段删除线文本预览"
              preview-tag="del"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">引号 (Quote)</div>
            <StyleItemEditor
              v-model="localValue.quote.value"
              preview-text="“这是一段被引号包裹的文本预览”"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="块级元素" name="block">
        <div class="tab-content">
          <div class="style-section">
            <div class="section-header">引用块 (Blockquote)</div>
            <StyleItemEditor
              v-model="localValue.blockquote.value"
              preview-text="这是一个引用块的内容预览，通常用于引用他人的话语或段落。"
              is-block
              preview-tag="blockquote"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">行内代码 (Inline Code)</div>
            <StyleItemEditor
              v-model="localValue.inlineCode.value"
              preview-text="const x = 1;"
              preview-tag="code"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="链接" name="link">
        <div class="tab-content">
          <div class="style-section">
            <div class="section-header">链接 (Link)</div>
            <StyleItemEditor
              v-model="localValue.link.value"
              preview-text="这是一个链接预览"
              preview-tag="a"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="标题" name="heading">
        <div class="tab-content">
          <div class="style-section">
            <div class="section-header">一级标题 (H1)</div>
            <StyleItemEditor
              v-model="localValue.h1.value"
              preview-text="一级标题预览"
              is-block
              preview-tag="h1"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">二级标题 (H2)</div>
            <StyleItemEditor
              v-model="localValue.h2.value"
              preview-text="二级标题预览"
              is-block
              preview-tag="h2"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">三级标题 (H3)</div>
            <StyleItemEditor
              v-model="localValue.h3.value"
              preview-text="三级标题预览"
              is-block
              preview-tag="h3"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">四级标题 (H4)</div>
            <StyleItemEditor
              v-model="localValue.h4.value"
              preview-text="四级标题预览"
              is-block
              preview-tag="h4"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">五级标题 (H5)</div>
            <StyleItemEditor
              v-model="localValue.h5.value"
              preview-text="五级标题预览"
              is-block
              preview-tag="h5"
            />
          </div>
          <el-divider />
          <div class="style-section">
            <div class="section-header">六级标题 (H6)</div>
            <StyleItemEditor
              v-model="localValue.h6.value"
              preview-text="六级标题预览"
              is-block
              preview-tag="h6"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import type { RichTextRendererStyleOptions, MarkdownStyleOption } from "../../types";
import StyleItemEditor from "./StyleItemEditor.vue";

const props = defineProps<{
  modelValue: RichTextRendererStyleOptions;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: RichTextRendererStyleOptions): void;
}>();

const activeTab = ref("basic");

const handleReset = () => {
  ElMessageBox.confirm("确定要重置所有 Markdown 样式配置吗？此操作无法撤销。", "确认重置", {
    confirmButtonText: "重置",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("update:modelValue", {});
      customMessage.success("样式已重置为默认值");
    })
    .catch(() => {});
};

// 创建一个代理对象，用于处理 v-model 的双向绑定
// 这样可以避免维护一个 localValue 副本，直接操作 modelValue
const createProxy = (key: keyof RichTextRendererStyleOptions) => {
  return computed({
    get: () => props.modelValue[key] || {},
    set: (val: MarkdownStyleOption) => {
      const newValue = { ...props.modelValue, [key]: val };
      emit("update:modelValue", newValue);
    },
  });
};

const localValue = {
  paragraph: createProxy("paragraph"),
  strong: createProxy("strong"),
  em: createProxy("em"),
  strikethrough: createProxy("strikethrough"),
  quote: createProxy("quote"),
  blockquote: createProxy("blockquote"),
  inlineCode: createProxy("inlineCode"),
  link: createProxy("link"),
  h1: createProxy("h1"),
  h2: createProxy("h2"),
  h3: createProxy("h3"),
  h4: createProxy("h4"),
  h5: createProxy("h5"),
  h6: createProxy("h6"),
};
</script>

<style scoped>
.markdown-style-editor {
  position: relative;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
  min-height: 400px;
}

.reset-button {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
}

.style-tabs {
  height: 100%;
}

/* 左侧标签页样式 */
.style-tabs :deep(.el-tabs__header) {
  width: 120px;
  margin-right: 0;
  border-right: 1px solid var(--border-color);
}

.style-tabs :deep(.el-tabs__nav-wrap) {
  padding: 12px 0;
}

.style-tabs :deep(.el-tabs__item) {
  text-align: left;
  padding-left: 20px;
  height: 42px;
  line-height: 42px;
}

/* 右侧内容区域 */
.style-tabs :deep(.el-tabs__content) {
  padding: 0;
  height: 100%;
  overflow-y: auto;
}

.tab-content {
  padding: 24px;
  /* max-width: 1000px; Remove max-width to allow full width usage */
}

.style-section {
  margin-bottom: 0;
}

.section-header {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-header::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 16px;
  background-color: var(--el-color-primary);
  border-radius: 2px;
}

/* 分割线样式 */
.el-divider {
  margin: 24px 0;
}
</style>
