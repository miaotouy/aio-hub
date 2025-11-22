<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "@/types/asset-management";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import { createModuleLogger } from "@utils/logger";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import { generateVideoThumbnail } from "@/utils/mediaThumbnailUtils";

const logger = createModuleLogger("AttachmentCard");

interface Props {
  asset: Asset;
  removable?: boolean;
  size?: "small" | "medium" | "large";
  /** 所有附件列表，用于图片预览时的图片切换 */
  allAssets?: Asset[];
  /** Token 计数 */
  tokenCount?: number;
  /** 是否为估算值 */
  tokenEstimated?: boolean;
  /** Token 计算错误信息 */
  tokenError?: string;
}

interface Emits {
  (e: "remove", asset: Asset): void;
  (e: "preview-document", asset: Asset): void;
}

const props = withDefaults(defineProps<Props>(), {
  removable: true,
  size: "medium",
});

const emit = defineEmits<Emits>();

const { show: showImage } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { saveAssetThumbnail } = useAssetManager();
const assetUrl = ref<string>("");
const isLoadingUrl = ref(true);
const loadError = ref(false);
const basePath = ref<string>("");
const showDocumentPreview = ref(false);

// 预览文件的路径
const previewFilePath = computed(() => {
  const isPending =
    props.asset.importStatus === "pending" || props.asset.importStatus === "importing";
  return isPending ? props.asset.originalPath || props.asset.path : props.asset.path;
});

// 格式化文件大小
const formattedSize = computed(() => {
  const bytes = props.asset.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
});

// 是否为图片类型
const isImage = computed(() => props.asset.type === "image");
// 是否为视频类型
const isVideo = computed(() => props.asset.type === "video");

// 是否应该使用长条形式（非图片类型都用长条）
const isBarLayout = computed(() => !isImage.value);

// 是否为文档类型（可以点击预览）
const isDocument = computed(() => props.asset.type === "document");

// 获取文件后缀名
const fileExtension = computed(() => {
  const name = props.asset.name;
  const index = name.lastIndexOf(".");
  if (index === -1) return "";
  return name.slice(index + 1).toUpperCase();
});

// 加载资产 URL
const loadAssetUrl = async () => {
  isLoadingUrl.value = true;
  loadError.value = false;
  try {
    // 判断是否为 pending/importing 状态
    const isPending =
      props.asset.importStatus === "pending" || props.asset.importStatus === "importing";

    if (!basePath.value && !isPending) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }

    if (isPending) {
      // pending 状态
      const originalPath = props.asset.originalPath || props.asset.path;
      if (!originalPath) throw new Error("缺少原始路径");

      const fileUrl = convertFileSrc(originalPath);

      if (isVideo.value) {
        // 视频：尝试生成预览
        assetUrl.value = await generateVideoThumbnail(fileUrl);
      } else if (isImage.value) {
        // 图片：直接使用文件 URL
        assetUrl.value = fileUrl;
      } else {
        // 音频或其他：暂时显示图标，等待后端处理完成
        assetUrl.value = "";
      }
    } else {
      // 已导入状态
      if (props.asset.thumbnailPath) {
        // 有缩略图（图片、音频、或者后端生成的视频缩略图）
        assetUrl.value = assetManagerEngine.convertToAssetProtocol(
          props.asset.thumbnailPath,
          basePath.value
        );
      } else if (isImage.value) {
        // 图片本身
        assetUrl.value = assetManagerEngine.convertToAssetProtocol(
          props.asset.path,
          basePath.value
        );
      } else if (isVideo.value) {
        // 视频且无缩略图：前端动态生成并保存
        const videoPathUrl = assetManagerEngine.convertToAssetProtocol(
          props.asset.path,
          basePath.value
        );
        try {
          const base64 = await generateVideoThumbnail(videoPathUrl);
          assetUrl.value = base64;
          // 异步保存到后端
          saveAssetThumbnail(props.asset.id, base64).catch((err) => {
            logger.warn("保存视频缩略图失败", { error: err, assetId: props.asset.id });
          });
        } catch (e) {
          logger.warn("生成视频缩略图失败", { error: e, asset: props.asset });
        }
      } else {
        // 其他情况（如没有封面的音频），不设置 assetUrl，使用默认图标
        assetUrl.value = "";
      }
    }
  } catch (error) {
    logger.warn("加载资产预览失败", { error, asset: props.asset });
    // 不设置 loadError，这样会显示默认图标而不是错误图标
    assetUrl.value = "";
  }

  isLoadingUrl.value = false;
};

// 是否正在导入
const isImporting = computed(
  () => props.asset.importStatus === "pending" || props.asset.importStatus === "importing"
);

// 是否导入失败
const hasImportError = computed(() => props.asset.importStatus === "error");

// 处理点击预览
const handlePreview = async () => {
  // 图片类型：打开图片查看器
  if (isImage.value) {
    await handleImagePreview();
    return;
  }

  // 视频类型：打开视频预览
  if (isVideo.value) {
    // 传入当前缩略图作为 poster，提升体验
    previewVideo(props.asset, { poster: assetUrl.value });
    return;
  }

  // 文档类型：打开预览对话框
  if (isDocument.value) {
    showDocumentPreview.value = true;
    return;
  }
};

// 处理图片预览
const handleImagePreview = async () => {
  try {
    // 获取所有图片类型的附件
    const allAssets = props.allAssets || [props.asset];
    const imageAssets = allAssets.filter((asset) => asset.type === "image");

    // 查找当前图片在图片列表中的索引
    const currentIndex = imageAssets.findIndex((asset) => asset.id === props.asset.id);

    // 确保有 basePath
    if (!basePath.value) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }

    // 为所有图片生成 URL
    const imageUrls: string[] = [];
    for (const imageAsset of imageAssets) {
      const isPending =
        imageAsset.importStatus === "pending" || imageAsset.importStatus === "importing";

      if (isPending) {
        // pending 状态：使用 convertFileSrc 创建 URL
        const originalPath = imageAsset.originalPath || imageAsset.path;
        if (originalPath) {
          const url = convertFileSrc(originalPath);
          imageUrls.push(url);
        }
      } else {
        // 已导入状态：使用 asset:// 协议
        const url = assetManagerEngine.convertToAssetProtocol(imageAsset.path, basePath.value);
        imageUrls.push(url);
      }
    }

    // 传递图片数组和当前索引给图片查看器
    showImage(imageUrls, currentIndex >= 0 ? currentIndex : 0);
  } catch (error) {
    logger.error("打开图片预览失败", error);
  }
};

// 处理移除
const handleRemove = (e: Event) => {
  e.stopPropagation();
  emit("remove", props.asset);
};

// 监听 asset 变化，重新加载 URL
watch(
  () => props.asset,
  () => {
    // 如果旧 URL 是 Blob URL，先释放
    if (assetUrl.value && assetUrl.value.startsWith("blob:")) {
      URL.revokeObjectURL(assetUrl.value);
    }
    loadAssetUrl();
  },
  { immediate: true }
);

// 组件卸载时释放 Blob URL（只有 pending 状态的才是 Blob URL）
import { onUnmounted } from "vue";
onUnmounted(() => {
  if (assetUrl.value && assetUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(assetUrl.value);
  }
});
</script>

<template>
  <div
    class="attachment-card"
    :class="[
      `size-${size}`,
      {
        'is-image': isImage,
        // 'is-video': isVideo, // 视频现在也是横条布局，不再需要特殊的顶层类
        'is-bar-layout': isBarLayout,
        'is-document': isDocument,
        'has-error': loadError || hasImportError,
        'is-importing': isImporting,
      },
    ]"
  >
    <!-- 长条布局（非图片类型） -->
    <template v-if="isBarLayout">
      <div
        class="bar-layout-container"
        :class="{ clickable: isDocument || isVideo }"
        @click="handlePreview"
      >
        <!-- 文件图标区域 -->
        <div class="bar-icon-wrapper">
          <template v-if="isLoadingUrl">
            <div class="spinner-small"></div>
          </template>
          <template v-else-if="loadError || hasImportError">
            <span class="icon-emoji error">⚠️</span>
          </template>
          <template v-else>
            <div v-if="assetUrl" class="bar-thumbnail-wrapper">
              <img :src="assetUrl" class="bar-thumbnail-image" alt="预览" />
              <div v-if="isVideo" class="bar-video-overlay">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="play-icon"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
            </div>
            <div v-else class="file-type-badge" :data-type="asset.type">
              <FileIcon :file-name="asset.name" :file-type="asset.type" :size="20" />
            </div>
          </template>

          <!-- 导入状态指示器 -->
          <div v-if="isImporting" class="bar-import-overlay">
            <div class="import-spinner-small"></div>
          </div>
        </div>

        <!-- 文件信息区域 -->
        <div class="bar-info-wrapper">
          <div class="bar-header">
            <div class="bar-file-name" :title="asset.name">{{ asset.name }}</div>
          </div>

          <div class="bar-meta-row">
            <span class="bar-file-size">{{ formattedSize }}</span>

            <template v-if="fileExtension">
              <span class="bar-meta-divider">·</span>
              <span class="bar-file-ext">{{ fileExtension }}</span>
            </template>

            <!-- Token 信息 -->
            <template v-if="tokenError || tokenCount !== undefined">
              <span class="bar-meta-divider">·</span>
              <span v-if="tokenError" class="bar-token-tag error" :title="tokenError">
                Token 错误
              </span>
              <span v-else class="bar-token-tag" :class="{ estimated: tokenEstimated }">
                {{ tokenCount!.toLocaleString() }} tokens
              </span>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- 方形卡片布局（仅图片） -->
    <template v-else>
      <!-- 预览区域 -->
      <div class="attachment-preview" @click="handlePreview">
        <template v-if="isLoadingUrl">
          <div class="loading-placeholder">
            <div class="spinner"></div>
          </div>
        </template>
        <template v-else-if="loadError || hasImportError">
          <div class="error-placeholder">
            <span class="icon">⚠️</span>
            <span class="text">{{ hasImportError ? "导入失败" : "加载失败" }}</span>
          </div>
        </template>
        <template v-else>
          <img
            v-if="isImage && assetUrl"
            :src="assetUrl"
            :alt="asset.name"
            class="preview-image"
            :class="{ clickable: isImage }"
          />
          <div v-else class="file-icon">
            <FileIcon :file-name="asset.name" :file-type="asset.type" :size="36" />
          </div>
        </template>

        <!-- 导入状态指示器 -->
        <div v-if="isImporting" class="import-status-overlay">
          <div class="import-spinner"></div>
        </div>

        <!-- Token 信息标签（方形布局专用） -->
        <div v-if="!isBarLayout && (tokenError || tokenCount !== undefined)" class="token-badge">
          <span v-if="tokenError" class="token-tag error" :title="tokenError"> Token 错误 </span>
          <span v-else class="token-tag" :class="{ estimated: tokenEstimated }">
            {{ tokenCount!.toLocaleString() }}
          </span>
        </div>
      </div>
    </template>

    <!-- 移除按钮 (统一使用外部悬浮按钮) -->
    <button v-if="removable" class="remove-button" @click="handleRemove" title="移除附件">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>

    <!-- 文档预览对话框 -->
    <BaseDialog
      v-model="showDocumentPreview"
      :title="asset.name"
      width="80vw"
      height="80vh"
      :show-close-button="true"
      :close-on-backdrop-click="true"
    >
      <DocumentViewer
        v-if="showDocumentPreview"
        :file-path="previewFilePath"
        :file-name="asset.name"
        :show-engine-switch="true"
      />
    </BaseDialog>
  </div>
</template>

<style scoped>
.attachment-card {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: visible;
  background: var(--bg-color);
  transition: all 0.2s;
  flex-shrink: 0;
  align-self: flex-start; /* 防止在 flex 容器中被拉伸 */
}

/* 尺寸变体 */
.attachment-card.size-small {
  width: 52px;
}

.attachment-card.size-small .attachment-preview {
  height: 52px;
}

.attachment-card.size-small .file-icon .icon {
  font-size: 28px;
}

.attachment-card.size-medium {
  width: 80px;
}

.attachment-card.size-medium .attachment-preview {
  height: 80px;
}

.attachment-card.size-medium .file-icon .icon {
  font-size: 36px;
}

.attachment-card.size-large {
  width: 120px;
}

.attachment-card.size-large .attachment-preview {
  height: 120px;
}

.attachment-card.size-large .file-icon .icon {
  font-size: 48px;
}

.attachment-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.attachment-card.has-error {
  border-color: var(--error-color);
}

.attachment-card.is-importing {
  opacity: 0.8;
}

.attachment-card.is-document {
  cursor: pointer;
}

.attachment-preview {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--container-bg);
  overflow: hidden;
  border-radius: 8px;
}

.attachment-preview.clickable {
  cursor: pointer;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-image.clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.preview-image.clickable:hover {
  transform: scale(1.05);
}

.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.file-icon .icon {
  font-size: 36px;
}

.loading-placeholder,
.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--text-color-light);
}

.spinner {
  width: 24px;
  height: 24px;
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

.error-placeholder .icon {
  font-size: 32px;
}

.error-placeholder .text {
  font-size: 12px;
}
.attachment-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.5) 60%,
    transparent 100%
  );
  backdrop-filter: blur(2px);
}

.attachment-name {
  font-size: 11px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-size {
  flex-shrink: 0;
}

.attachment-ext {
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.remove-button {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 2;
}

.attachment-card:hover .remove-button {
  opacity: 1;
}

.remove-button:hover {
  background: var(--error-color);
  transform: scale(1.1);
}

.import-status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
}

.import-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* 长条布局样式 */
.attachment-card.is-bar-layout {
  width: fit-content;
  min-width: 160px;
  max-width: 320px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-direction: row;
  padding: 0;
  transition: all 0.2s ease;
}

.attachment-card.is-bar-layout:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.bar-layout-container {
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  width: 100%;
  height: 100%;
}

.bar-layout-container.clickable {
  cursor: pointer;
}

.bar-icon-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-type-badge {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-dark);
  border-radius: 8px;
  font-size: 20px;
  transition: transform 0.2s;
}

.attachment-card.is-bar-layout:hover .file-type-badge {
  transform: scale(1.05);
}

/* 不同类型的图标背景色微调 */
.file-type-badge[data-type="document"] {
  background: rgba(64, 158, 255, 0.15);
}
.file-type-badge[data-type="audio"] {
  background: rgba(230, 162, 60, 0.15);
}
.file-type-badge[data-type="video"] {
  background: rgba(245, 108, 108, 0.15);
}
.file-type-badge[data-type="image"] {
  background: rgba(103, 194, 58, 0.15);
}

.bar-info-wrapper {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.bar-file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.bar-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.2;
}

.bar-file-size {
  flex-shrink: 0;
  font-family: var(--font-family-mono);
}

.bar-meta-divider {
  color: var(--border-color-darker);
  font-weight: bold;
}

.bar-token-tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  font-family: var(--font-family-mono);
}

.bar-token-tag.estimated {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.bar-token-tag.error {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.bar-import-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(1px);
  border-radius: 8px;
  z-index: 2;
}

.bar-thumbnail-wrapper {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.bar-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bar-video-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.bar-video-overlay .play-icon {
  width: 16px;
  height: 16px;
  fill: rgba(255, 255, 255, 0.9);
  stroke: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.import-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.import-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Token 标签（方形布局专用） */
.token-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  pointer-events: none;
}

.token-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  color: #67c23a;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.token-tag.estimated {
  color: #e6a23c;
}

.token-tag.error {
  color: #f56c6c;
}

.bar-file-ext {
  flex-shrink: 0;
  font-family: var(--font-family-mono);
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--text-color-secondary);
  line-height: 1.2;
}
</style>
