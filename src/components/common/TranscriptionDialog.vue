<template>
  <BaseDialog
    :model-value="modelValue"
    :title="`编辑转写内容 - ${asset.name}`"
    width="90vw"
    height="85vh"
    :show-close-button="true"
    :close-on-backdrop-click="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #content>
      <div class="transcription-dialog-content">
        <!-- 左侧：预览区域 -->
        <div class="preview-column">
          <div class="preview-container">
            <template v-if="isLoadingUrl">
              <div class="loading-spinner"></div>
            </template>
            <template v-else>
              <img
                v-if="isImage"
                :src="previewUrl"
                class="preview-image"
                alt="预览"
                @click="handleImagePreview"
              />
              <div v-else-if="isVideo" class="video-player-wrapper">
                <VideoPlayer
                  v-if="previewUrl"
                  :src="previewUrl"
                  :title="asset.name"
                  :autoplay="false"
                />
              </div>
              <div v-else-if="isAudio" class="audio-player-wrapper">
                <AudioPlayer
                  v-if="previewUrl"
                  :src="previewUrl"
                  :title="asset.name"
                  :poster="posterUrl"
                  :autoplay="false"
                />
              </div>
              <div v-else class="generic-preview">
                <FileIcon :file-name="asset.name" :file-type="asset.type" :size="64" />
              </div>
            </template>
          </div>
        </div>

        <!-- 右侧：编辑区域 -->
        <div class="editor-column">
          <div class="editor-toolbar">
            <span class="toolbar-title">Markdown 编辑器</span>
            <div class="toolbar-actions">
              <button class="toolbar-btn" @click="handleCopy" title="复制内容">
                <Copy :size="16" />
                复制
              </button>
            </div>
          </div>
          <div class="editor-wrapper">
            <RichCodeEditor
              v-model="currentContent"
              language="markdown"
              :line-numbers="true"
              editor-type="codemirror"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer-content">
        <div class="left-actions">
          <button 
            v-if="showRegenerate" 
            class="btn btn-secondary btn-danger-hover" 
            @click="handleRegenerate"
          >
            <RefreshCw :size="16" class="btn-icon" />
            重新生成
          </button>
        </div>
        <div class="right-actions">
          <button class="btn btn-secondary" @click="handleClose">取消</button>
          <button class="btn btn-primary" @click="handleSave" :disabled="isSaving">
            <span v-if="isSaving" class="spinner-mini"></span>
            <span v-else>保存修改</span>
          </button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import { Copy, RefreshCw } from "lucide-vue-next";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("TranscriptionDialog");

const props = withDefaults(defineProps<{
  modelValue: boolean;
  asset: Asset;
  initialContent: string;
  showRegenerate?: boolean;
}>(), {
  showRegenerate: true
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "save", content: string): void;
  (e: "regenerate"): void;
}>();

const { show: showImage } = useImageViewer();

const currentContent = ref("");
const previewUrl = ref("");
const posterUrl = ref("");
const isLoadingUrl = ref(false);
const isSaving = ref(false);

const isImage = computed(() => props.asset.type === "image");
const isVideo = computed(() => props.asset.type === "video");
const isAudio = computed(() => props.asset.type === "audio");

// 加载预览 URL
const loadPreviewUrl = async () => {
  isLoadingUrl.value = true;
  try {
    const basePath = await assetManagerEngine.getAssetBasePath();

    // 1. 加载主资源 URL
    // 如果是 pending 状态，使用 originalPath
    if (props.asset.importStatus === "pending" || props.asset.importStatus === "importing") {
      const originalPath = props.asset.originalPath || props.asset.path;
      if (originalPath) {
        previewUrl.value = originalPath.startsWith("blob:")
          ? originalPath
          : convertFileSrc(originalPath);
      }
    } else {
      // 已导入状态
      previewUrl.value = assetManagerEngine.convertToAssetProtocol(props.asset.path, basePath);
    }

    // 2. 加载缩略图/封面 URL (如有)
    if (props.asset.thumbnailPath) {
      posterUrl.value = assetManagerEngine.convertToAssetProtocol(
        props.asset.thumbnailPath,
        basePath
      );
    } else {
      posterUrl.value = "";
    }
  } catch (error) {
    logger.error("加载预览 URL 失败", error);
  } finally {
    isLoadingUrl.value = false;
  }
};

// 监听 asset 变化
watch(
  () => props.asset,
  () => {
    loadPreviewUrl();
  },
  { immediate: true }
);

// 监听 initialContent 变化
watch(
  () => props.initialContent,
  (newVal) => {
    currentContent.value = newVal || "";
  },
  { immediate: true }
);

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = async () => {
  isSaving.value = true;
  try {
    emit("save", currentContent.value);
    // 这里不关闭对话框，由父组件决定（通常父组件保存成功后会关闭）
    // 或者我们假定 emit save 只是触发动作
  } catch (error) {
    logger.error("保存失败", error);
  } finally {
    isSaving.value = false;
  }
};

const handleRegenerate = () => {
  emit("regenerate");
  handleClose();
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(currentContent.value);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
  }
};

const handleImagePreview = () => {
  if (previewUrl.value) {
    showImage([previewUrl.value], 0);
  }
};
</script>

<style scoped>
.transcription-dialog-content {
  display: flex;
  height: 100%;
  gap: 20px;
  overflow: hidden;
}

.preview-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--black); /* 预览背景通常深色更好 */
  position: relative;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: zoom-in;
}

.video-player-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.audio-player-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.generic-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  color: var(--text-color-secondary);
  width: 100%;
  padding: 20px;
}

.editor-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 10px;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-color-hover);
}

.editor-wrapper {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.dialog-footer-content {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.left-actions,
.right-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-secondary {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--hover-bg);
  border-color: var(--border-color-hover);
}

.btn-danger-hover:hover {
  color: var(--error-color);
  border-color: var(--error-color);
  background: var(--error-bg-light);
}

.btn-primary {
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover-color);
  border-color: var(--primary-hover-color);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-mini {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>