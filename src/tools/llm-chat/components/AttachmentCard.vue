<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "@/types/asset-management";
import { useImageViewer } from "@/composables/useImageViewer";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("AttachmentCard");

interface Props {
  asset: Asset;
  removable?: boolean;
  size?: "small" | "medium" | "large";
  /** 所有附件列表，用于图片预览时的图片切换 */
  allAssets?: Asset[];
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
const assetUrl = ref<string>("");
const isLoadingUrl = ref(true);
const loadError = ref(false);
const basePath = ref<string>("");

// 格式化文件大小
const formattedSize = computed(() => {
  const bytes = props.asset.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
});

// 是否为图片或视频类型（使用方形卡片）
const isImage = computed(() => props.asset.type === "image");
const isVideo = computed(() => props.asset.type === "video");

// 是否应该使用长条形式（非图片/视频类型）
const isBarLayout = computed(() => !isImage.value && !isVideo.value);

// 是否为文档类型（可以点击预览）
const isDocument = computed(() => props.asset.type === "document");

// 获取文件后缀名
const fileExtension = computed(() => {
  const name = props.asset.name;
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === name.length - 1) {
    return "";
  }
  return name.substring(lastDotIndex);
});

// 获取文件类型图标
const fileTypeIcon = computed(() => {
  switch (props.asset.type) {
    case "image":
      return "🖼️";
    case "audio":
      return "🎵";
    case "video":
      return "🎬";
    case "document":
      return "📄";
    default:
      return "📎";
  }
});

// 加载资产 URL
const loadAssetUrl = async () => {
  isLoadingUrl.value = true;
  loadError.value = false;
  try {
    // 判断是否为 pending/importing 状态
    const isPending =
      props.asset.importStatus === "pending" || props.asset.importStatus === "importing";

    if (isPending) {
      // pending 状态：使用原始路径通过 convertFileSrc 创建一个快速预览 URL
      const originalPath = props.asset.originalPath || props.asset.path;

      if (!originalPath) {
        throw new Error("缺少原始路径");
      }

      // 使用 convertFileSrc 立即生成可用的 URL，这比读取整个文件要快得多
      assetUrl.value = convertFileSrc(originalPath);
    } else {
      // 已导入状态：使用同步的 asset:// 协议
      if (!basePath.value) {
        basePath.value = await assetManagerEngine.getAssetBasePath();
      }

      const path = props.asset.thumbnailPath || props.asset.path;
      assetUrl.value = assetManagerEngine.convertToAssetProtocol(path, basePath.value);
    }
  } catch (error) {
    logger.error("加载资产 URL 失败", error, { asset: props.asset });
    loadError.value = true;
  }

  // 无论成功或失败，都应尽快完成 loading 状态
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

  // 文档类型：发出预览事件
  if (isDocument.value) {
    emit("preview-document", props.asset);
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
        'is-video': isVideo,
        'is-bar-layout': isBarLayout,
        'is-document': isDocument,
        'has-error': loadError || hasImportError,
        'is-importing': isImporting,
      },
    ]"
  >
    <!-- 长条布局（非图片/视频类型） -->
    <template v-if="isBarLayout">
      <div class="bar-layout-content" :class="{ clickable: isDocument }" @click="handlePreview">
        <!-- 文件图标区域 -->
        <div class="bar-icon-area">
          <template v-if="isLoadingUrl">
            <div class="spinner-small"></div>
          </template>
          <template v-else-if="loadError || hasImportError">
            <span class="icon-emoji error">⚠️</span>
          </template>
          <template v-else>
            <span class="icon-emoji">{{ fileTypeIcon }}</span>
          </template>

          <!-- 导入状态指示器 -->
          <div v-if="isImporting" class="bar-import-overlay">
            <div class="import-spinner-small"></div>
          </div>
        </div>

        <!-- 文件信息区域 -->
        <div class="bar-info-area">
          <div class="bar-file-name" :title="asset.name">{{ asset.name }}</div>
          <div class="bar-file-meta">
            <span class="bar-file-size">{{ formattedSize }}</span>
            <span v-if="fileExtension" class="bar-file-ext">{{ fileExtension }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 方形卡片布局（图片/视频） -->
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
            <span class="icon">{{ fileTypeIcon }}</span>
          </div>
        </template>

        <!-- 导入状态指示器 -->
        <div v-if="isImporting" class="import-status-overlay">
          <div class="import-spinner"></div>
        </div>
      </div>
    </template>

    <!-- 移除按钮 -->
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
  </div>
</template>

<style scoped>
.attachment-card {
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
  width: 40px;
}

.attachment-card.size-small .attachment-preview {
  height: 40px;
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
  max-width: 400px;
  background: rgba(0, 0, 0, 0.1);
  flex-direction: row;
  padding: 0;
}

.bar-layout-content {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.2s;
}

.bar-layout-content.clickable {
  cursor: pointer;
}

.bar-layout-content.clickable:hover {
  background-color: var(--hover-bg);
}

.bar-icon-area {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.bar-icon-area .icon-emoji {
  font-size: 24px;
}

.bar-icon-area .icon-emoji.error {
  font-size: 20px;
}

.bar-info-area {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bar-file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-file-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-color-light);
}

.bar-file-size {
  flex-shrink: 0;
}

.bar-file-ext {
  flex-shrink: 0;
  border-radius: 3px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
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
  border-radius: 6px;
}

.import-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
</style>
