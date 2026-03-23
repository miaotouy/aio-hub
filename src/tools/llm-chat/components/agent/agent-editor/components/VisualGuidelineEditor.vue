<script setup lang="ts">
import { computed, ref } from "vue";
import { InfoFilled, MagicStick, RefreshLeft } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { DEFAULT_VISUAL_GUIDELINE } from "../../../../config/visualGuidelinePresets";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("llm-chat/agent-editor/VisualGuidelineEditor");

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value?: string): void;
}>();

const activeCollapse = ref<string[]>([]);
const isInherited = computed(() => !props.modelValue);

const handleStartCustomizing = () => {
  emit("update:modelValue", DEFAULT_VISUAL_GUIDELINE);
};

const handleResetToDefault = async () => {
  const confirmed = await errorHandler.wrapAsync(
    async () => {
      const { ElMessageBox } = await import("element-plus");
      await ElMessageBox.confirm(
        "确定要恢复使用系统默认规范吗？这将删除你当前的自定义内容，并使该智能体重新跟随 AIO Hub 的系统更新。",
        "恢复默认规范",
        {
          confirmButtonText: "确定恢复",
          cancelButtonText: "取消",
          type: "warning",
        },
      );
      return true;
    },
    { showToUser: false },
  );

  if (confirmed) {
    emit("update:modelValue", undefined);
  }
};
</script>

<template>
  <div class="visual-guideline-editor-wrapper" data-setting-id="visualGuideline">
    <el-collapse v-model="activeCollapse" class="visual-guideline-collapse">
      <el-collapse-item name="visual-guideline">
        <template #title>
          <div class="collapse-title-container">
            <span class="title-text">视觉化输出指南</span>
            <el-tag v-if="isInherited" size="small" type="info" effect="plain" class="status-tag">
              继承系统默认
            </el-tag>
            <el-tag v-else size="small" type="warning" effect="plain" class="status-tag"> 已自定义 </el-tag>
          </div>
        </template>

        <div class="block-header">
          <div class="block-hint">
            配置该智能体遵循的 HTML/CSS/JS 渲染规范。在 Prompt 中使用
            <code v-pre>{{ visual_guideline }}</code> 宏即可注入此内容。如果留空，系统将回退使用内置的默认规范。
          </div>
        </div>

        <div class="editor-content">
          <div v-if="isInherited" class="inherited-status">
            <div class="status-header">
              <div class="status-info">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
                <span>当前正在使用系统默认规范，将随 AIO Hub 更新而自动升级</span>
              </div>
              <el-button type="primary" plain size="small" :icon="MagicStick" @click="handleStartCustomizing">
                切换使用自定义
              </el-button>
            </div>

            <div class="preview-container">
              <div class="preview-label">当前默认规范预览 (只读)</div>
              <RichCodeEditor :model-value="DEFAULT_VISUAL_GUIDELINE" mode="markdown" read-only height="400px" />
            </div>
          </div>

          <div v-else class="custom-status">
            <div class="status-header">
              <div class="status-info custom">
                <el-icon class="info-icon"><MagicStick /></el-icon>
                <span>正在使用自定义规范，系统更新将不会覆盖此内容</span>
              </div>
              <el-button type="danger" plain size="small" :icon="RefreshLeft" @click="handleResetToDefault">
                恢复使用系统默认规范
              </el-button>
            </div>

            <RichCodeEditor
              :model-value="modelValue"
              @update:model-value="emit('update:modelValue', $event)"
              mode="markdown"
              height="500px"
            />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.visual-guideline-editor-wrapper {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.visual-guideline-collapse {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.visual-guideline-collapse :deep(.el-collapse-item__header) {
  padding: 0 16px;
  height: 48px;
  background-color: transparent;
  border-bottom: 1px solid var(--border-color);
}

.visual-guideline-collapse :deep(.el-collapse-item__wrap) {
  background-color: transparent;
}

.visual-guideline-collapse :deep(.el-collapse-item__content) {
  padding: 16px;
}

.collapse-title-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-text {
  font-size: 14px;
  font-weight: 500;
}

.block-header {
  margin-bottom: 16px;
}

.block-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.block-hint code {
  background-color: var(--input-bg);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: var(--el-font-family-mono);
  border: 1px solid var(--border-color);
}

.editor-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 10px 14px;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.status-info.custom {
  color: var(--el-color-warning);
}

.info-icon {
  font-size: 16px;
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 0.7;
  transition: opacity 0.3s;
}

.preview-container:hover {
  opacity: 0.9;
}

.preview-label {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding-left: 4px;
}

:deep(.rich-code-editor-wrapper) {
  border-color: var(--border-color);
  background-color: var(--input-bg);
}
</style>
