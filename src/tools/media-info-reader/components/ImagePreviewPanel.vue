<template>
  <div class="left-panel">
    <InfoCard title="图片预览" class="preview-card">
      <template #headerExtra>
        <div v-if="previewSrc" class="preview-actions">
          <el-text type="info" size="small">拖放或粘贴以替换</el-text>
          <el-button :icon="FolderOpened" size="small" @click.stop="$emit('openPicker')">
            替换
          </el-button>
          <el-button :icon="Delete" size="small" @click.stop="$emit('clear')"> 清除 </el-button>
        </div>
      </template>
      <div ref="dropAreaRef" class="image-preview-area" :class="{ highlight: isDraggingOver }">
        <div v-if="!previewSrc" class="upload-prompt">
          <el-icon :size="64"><Upload /></el-icon>
          <p>拖放图片到此处，或粘贴图片</p>
          <el-button type="primary" @click.stop="$emit('openPicker')">
            <el-icon><FolderOpened /></el-icon>
            选择图片
          </el-button>
        </div>

        <template v-else>
          <img :src="previewSrc" class="preview-image" />
        </template>
      </div>
    </InfoCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElButton, ElIcon, ElText } from "element-plus";
import { Delete, Upload, FolderOpened } from "@element-plus/icons-vue";
import InfoCard from "@components/common/InfoCard.vue";
import { useFileInteraction } from "@/composables/useFileInteraction";

defineProps<{
  previewSrc: string;
}>();

const emit = defineEmits<{
  (e: "openPicker"): void;
  (e: "clear"): void;
  (e: "paths", paths: string[]): void;
  (e: "files", files: File[]): void;
}>();

const dropAreaRef = ref<HTMLElement>();

const { isDraggingOver } = useFileInteraction({
  element: dropAreaRef,
  onPaths: (paths) => emit("paths", paths),
  onFiles: (files) => emit("files", files),
  multiple: false,
  imageOnly: true,
  accept: [".png", ".jpg", ".jpeg", ".webp"],
  showPasteMessage: false,
});
</script>

<style scoped>
.left-panel {
  flex: 2;
  min-width: 500px;
  width: 60vw;
  display: flex;
  flex-direction: column;
}

.preview-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-card :deep(.el-card__body) {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-preview-area {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
  overflow: hidden;
  background-color: var(--card-bg);
  box-sizing: border-box;
  margin: 0;
}

.image-preview-area.highlight {
  border-color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.1);
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-placeholder);
  padding: 20px;
  text-align: center;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

@media (max-width: 1000px) {
  .left-panel {
    max-width: none;
    min-height: 300px;
    flex: none;
  }
}
</style>
