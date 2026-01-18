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
            @click.stop="openRegenerateConfirm"
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

  <!-- 重新生成配置弹窗 (套娃弹窗) -->
  <BaseDialog
    v-model="showRegenerateConfirm"
    title="重新生成转写"
    width="500px"
    height="auto"
    :z-index="2100"
  >
    <template #content>
      <div class="regenerate-form">
        <div class="form-item">
          <label>指定模型（可选）</label>
          <LlmModelSelector
            v-model="selectedModelId"
            placeholder="选择模型 (可选，默认使用全局设置)"
            :capabilities="requiredCapabilities"
            :teleported="true"
            popper-class="transcription-regenerate-popper"
          />
        </div>
        <div class="form-item">
          <label>附加提示 (Prompt)</label>
          <el-input
            v-model="tempPrompt"
            type="textarea"
            :rows="6"
            placeholder="输入额外的指令来引导重新生成，例如：'请以更正式的语气转写' 或 '着重提取关键技术术语'..."
          />
        </div>
        <div class="form-tip">
          <Info :size="14" />
          <div class="tip-content">
            <p>重新生成将覆盖当前编辑器中的内容。</p>
            <p>附加提示将<b>追加</b>到全局转写提示词之后。</p>
            <p v-if="previousConfig">
              <span class="has-config-hint">已从上次转写任务中恢复配置</span>
            </p>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="confirm-footer">
        <button class="btn btn-secondary" @click="showRegenerateConfirm = false">取消</button>
        <button class="btn btn-primary btn-danger" @click="handleConfirmRegenerate">
          确认重新生成
        </button>
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
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import { Copy, RefreshCw, Info } from "lucide-vue-next";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("TranscriptionDialog");

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    asset: Asset;
    initialContent: string;
    showRegenerate?: boolean;
    previousConfig?: any;
  }>(),
  {
    showRegenerate: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "save", content: string): void;
  (e: "regenerate", payload: { modelId: string; prompt: string }): void;
}>();

const { show: showImage } = useImageViewer();

const currentContent = ref("");
const previewUrl = ref("");
const posterUrl = ref("");
const isLoadingUrl = ref(false);
const isSaving = ref(false);
const showRegenerateConfirm = ref(false);
const selectedModelId = ref("");
const tempPrompt = ref("");

const isImage = computed(() => props.asset.type === "image");
const isVideo = computed(() => props.asset.type === "video");
const isAudio = computed(() => props.asset.type === "audio");
const isDocument = computed(() => props.asset.type === "document");

const requiredCapabilities = computed(() => {
  if (isImage.value) {
    return { vision: true };
  }
  if (isAudio.value) {
    return { audio: true };
  }
  if (isVideo.value) {
    return { video: true };
  }
  if (isDocument.value) {
    return { document: true };
  }
  return {};
});

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

const openRegenerateConfirm = () => {
  // 回填之前的配置
  if (props.previousConfig) {
    const identifier = props.previousConfig.modelIdentifier;
    if (identifier) {
      selectedModelId.value = identifier.includes(":") ? identifier.split(":")[1] : identifier;
    } else {
      selectedModelId.value = "";
    }
    tempPrompt.value = props.previousConfig.customPrompt || "";
  } else {
    selectedModelId.value = "";
    tempPrompt.value = "";
  }
  showRegenerateConfirm.value = true;
};

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = async () => {
  isSaving.value = true;
  try {
    emit("save", currentContent.value);
  } catch (error) {
    logger.error("保存失败", error);
  } finally {
    isSaving.value = false;
  }
};

const handleConfirmRegenerate = () => {
  emit("regenerate", {
    modelId: selectedModelId.value,
    prompt: tempPrompt.value,
  });
  showRegenerateConfirm.value = false;
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
  background-color: var(--black);
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
  align-items: center;
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

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 重新生成表单样式 */
.regenerate-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.form-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-secondary);
  background: var(--hover-bg);
  padding: 4px 12px;
  border-radius: 6px;
}

.tip-content p {
  margin: 0;
  line-height: 1.6;
}

.tip-content b {
  color: var(--primary-color);
}

.has-config-hint {
  color: var(--primary-color);
  font-weight: 600;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.btn-danger {
  background: var(--error-color);
  border-color: var(--error-color);
}

.btn-danger:hover {
  background: var(--error-hover-color);
  border-color: var(--error-hover-color);
}
</style>

<style>
/* 全局样式，用于提升被 teleport 到 body 的下拉框层级 */
.el-popper.transcription-regenerate-popper {
  z-index: 6000 !important;
}
</style>
