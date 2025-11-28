<template>
  <div class="markdown-style-editor">
    <!-- 骨架屏加载状态 -->
    <template v-if="loading">
      <div class="editor-nav">
        <div class="nav-tabs">
          <el-skeleton animated class="nav-skeleton">
            <template #template>
              <div style="display: flex; gap: 20px; align-items: center; height: 100%">
                <el-skeleton-item variant="text" style="width: 60px" />
                <el-skeleton-item variant="text" style="width: 60px" />
                <el-skeleton-item variant="text" style="width: 60px" />
                <el-skeleton-item variant="text" style="width: 60px" />
              </div>
            </template>
          </el-skeleton>
        </div>
      </div>
      <div class="editor-content" style="padding: 24px; overflow: hidden">
        <el-skeleton animated>
          <template #template>
            <div style="margin-bottom: 40px">
              <el-skeleton-item variant="text" style="width: 150px; margin-bottom: 16px" />
              <el-skeleton-item
                variant="rect"
                style="height: 120px; width: 100%; border-radius: 8px"
              />
            </div>
            <div style="margin-bottom: 40px">
              <el-skeleton-item variant="text" style="width: 100px; margin-bottom: 16px" />
              <el-skeleton-item
                variant="rect"
                style="height: 80px; width: 100%; border-radius: 8px"
              />
            </div>
            <div>
              <el-skeleton-item variant="text" style="width: 120px; margin-bottom: 16px" />
              <el-skeleton-item
                variant="rect"
                style="height: 80px; width: 100%; border-radius: 8px"
              />
            </div>
          </template>
        </el-skeleton>
      </div>
    </template>

    <!-- 实际内容 -->
    <template v-else>
      <!-- 顶部导航栏 -->
      <div class="editor-nav">
        <div class="nav-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.name"
            class="nav-tab-item"
            :class="{ active: activeTab === tab.name }"
            @click="activeTab = tab.name"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="nav-actions">
          <el-tooltip content="一键启用/禁用所有样式" placement="bottom">
            <el-switch
              v-model="allEnabled"
              active-text="全部启用"
              inactive-text="全部禁用"
              inline-prompt
              style="margin-right: 12px"
              @change="handleToggleAll"
            />
          </el-tooltip>
          <el-tooltip content="复制配置到剪贴板" placement="bottom">
            <el-button :icon="CopyDocument" @click="handleCopyConfig" circle />
          </el-tooltip>
          <el-tooltip content="从剪贴板粘贴配置" placement="bottom">
            <el-button :icon="DocumentAdd" @click="handlePasteConfig" circle />
          </el-tooltip>
          <el-tooltip content="重置为默认样式" placement="bottom">
            <el-button :icon="Refresh" @click="handleReset" circle />
          </el-tooltip>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="editor-content">
        <!-- 基础格式 -->
        <div v-show="activeTab === 'basic'" class="tab-content">
          <div class="style-section">
            <div class="section-header">普通文本 (Paragraph)</div>
            <StyleItemEditor
              v-model="localValue.paragraph.value"
              preview-text="这是一段普通的文本内容预览，用于展示样式的实际效果。"
              preview-tag="p"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">粗体 (Strong)</div>
            <StyleItemEditor
              v-model="localValue.strong.value"
              preview-text="这是一段粗体文本预览"
              preview-tag="strong"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">斜体 (Em)</div>
            <StyleItemEditor
              v-model="localValue.em.value"
              preview-text="这是一段斜体文本预览"
              preview-tag="em"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">删除线 (Strikethrough)</div>
            <StyleItemEditor
              v-model="localValue.strikethrough.value"
              preview-text="这是一段删除线文本预览"
              preview-tag="del"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">引号 (Quote)</div>
            <StyleItemEditor
              v-model="localValue.quote.value"
              preview-text="“这是一段被引号包裹的文本预览”"
              preview-tag="span"
            />
          </div>
        </div>

        <!-- 块级元素 -->
        <div v-show="activeTab === 'block'" class="tab-content">
          <div class="style-section">
            <div class="section-header">引用块 (Blockquote)</div>
            <StyleItemEditor
              v-model="localValue.blockquote.value"
              preview-text="这是一个引用块的内容预览，通常用于引用他人的话语或段落。"
              is-block
              preview-tag="blockquote"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">行内代码 (Inline Code)</div>
            <StyleItemEditor
              v-model="localValue.inlineCode.value"
              preview-text="const x = 1;"
              preview-tag="code"
            />
          </div>
        </div>

        <!-- 链接 -->
        <div v-show="activeTab === 'link'" class="tab-content">
          <div class="style-section">
            <div class="section-header">链接 (Link)</div>
            <StyleItemEditor
              v-model="localValue.link.value"
              preview-text="这是一个链接预览"
              preview-tag="a"
            />
          </div>
        </div>

        <!-- 标题 -->
        <div v-show="activeTab === 'heading'" class="tab-content">
          <div class="style-section">
            <div class="section-header">一级标题 (H1)</div>
            <StyleItemEditor
              v-model="localValue.h1.value"
              preview-text="一级标题预览"
              is-block
              preview-tag="h1"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">二级标题 (H2)</div>
            <StyleItemEditor
              v-model="localValue.h2.value"
              preview-text="二级标题预览"
              is-block
              preview-tag="h2"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">三级标题 (H3)</div>
            <StyleItemEditor
              v-model="localValue.h3.value"
              preview-text="三级标题预览"
              is-block
              preview-tag="h3"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">四级标题 (H4)</div>
            <StyleItemEditor
              v-model="localValue.h4.value"
              preview-text="四级标题预览"
              is-block
              preview-tag="h4"
            />
            <el-divider />
          </div>
          <div class="style-section">
            <div class="section-header">五级标题 (H5)</div>
            <StyleItemEditor
              v-model="localValue.h5.value"
              preview-text="五级标题预览"
              is-block
              preview-tag="h5"
            />
            <el-divider />
          </div>
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
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { Refresh, CopyDocument, DocumentAdd } from "@element-plus/icons-vue";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import type { RichTextRendererStyleOptions, MarkdownStyleOption } from "../../types";
import StyleItemEditor from "./StyleItemEditor.vue";

const props = defineProps<{
  modelValue: RichTextRendererStyleOptions;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: RichTextRendererStyleOptions): void;
}>();

const activeTab = ref("basic");

const tabs = [
  { label: "基础格式", name: "basic" },
  { label: "块级元素", name: "block" },
  { label: "链接", name: "link" },
  { label: "标题", name: "heading" },
];

// 全局开关状态（直接绑定到 modelValue.globalEnabled）
const allEnabled = computed({
  get: () => props.modelValue.globalEnabled !== false,
  set: (val: boolean) => {
    emit("update:modelValue", {
      ...props.modelValue,
      globalEnabled: val,
    });
  },
});

// 一键启用/禁用所有样式（只控制全局开关，不修改子项）
const handleToggleAll = (enabled: boolean) => {
  // allEnabled 的 setter 已经处理了更新逻辑
  customMessage.success(enabled ? "已启用所有样式" : "已禁用所有样式");
};

const handleReset = () => {
  ElMessageBox.confirm("确定要重置所有 Markdown 样式配置吗？此操作无法撤销。", "确认重置", {
    confirmButtonText: "重置",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("update:modelValue", {});
      allEnabled.value = true;
      customMessage.success("样式已重置为默认值");
    })
    .catch(() => {});
};

const { copy } = useClipboard();

const handleCopyConfig = () => {
  try {
    const config = JSON.stringify(props.modelValue, null, 2);
    copy(config);
    customMessage.success("配置已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制配置失败");
    console.error(error);
  }
};

const handlePasteConfig = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      customMessage.warning("剪贴板为空");
      return;
    }

    try {
      const config = JSON.parse(text);
      if (typeof config !== "object" || config === null) {
        throw new Error("无效的配置格式");
      }

      ElMessageBox.confirm("确定要用剪贴板中的配置覆盖当前样式吗？", "确认粘贴", {
        confirmButtonText: "覆盖",
        cancelButtonText: "取消",
        type: "warning",
      })
        .then(() => {
          emit("update:modelValue", config);
          customMessage.success("配置已粘贴并应用");
        })
        .catch(() => {});
    } catch (e) {
      customMessage.error("剪贴板内容不是有效的 JSON 配置");
    }
  } catch (error) {
    customMessage.error("读取剪贴板失败，请检查权限");
    console.error(error);
  }
};

// 创建一个代理对象，用于处理 v-model 的双向绑定
// 这样可以避免维护一个 localValue 副本，直接操作 modelValue
const createProxy = (key: Exclude<keyof RichTextRendererStyleOptions, "globalEnabled">) => {
  return computed({
    get: () => props.modelValue[key] || {},
    set: (val: MarkdownStyleOption) => {
      // 过滤掉 undefined 或 null
      if (val === undefined || val === null) {
        const { [key]: _, ...rest } = props.modelValue;
        emit("update:modelValue", rest);
        return;
      }

      const newValue = { ...props.modelValue, [key]: val };

      // 如果对象为空，则从父对象中删除该键
      if (Object.keys(val).length === 0) {
        delete newValue[key];
      }

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
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* 顶部导航栏 */
.editor-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-color-soft);
  flex-shrink: 0;
  height: 48px;
}

.nav-tabs {
  display: flex;
  gap: 4px;
  height: 100%;
}

.nav-tab-item {
  padding: 0 16px;
  height: 100%;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--text-color-secondary);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.nav-tab-item:hover {
  color: var(--text-color);
  background-color: var(--fill-color-light);
}

.nav-tab-item.active {
  color: var(--el-color-primary);
  font-weight: 500;
}

.nav-tab-item.active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--el-color-primary);
}

.nav-actions {
  display: flex;
  align-items: center;
}

/* 内容区域 */
.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  position: relative;
}

.tab-content {
  display: grid;
  /* 使用 min(100%, 340px) 既能保证窄屏下不溢出，又能让分列时的最小宽度更宽敞 */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 600px), 1fr));
  gap: 0 24px; /* 列间距 */
  padding: 24px;
}

.style-section {
  margin-bottom: 0;
  /* 当分列时，确保每个 section 不会内部断开 */
  break-inside: avoid;
  page-break-inside: avoid;
}

/* 分割线样式 */
.style-section:not(:last-child) .el-divider {
  margin: 24px 0;
}

.style-section:last-child .el-divider {
  display: none;
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
</style>
