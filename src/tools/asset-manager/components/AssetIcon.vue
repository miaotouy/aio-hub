<template>
  <div class="asset-icon-wrapper">
    <template v-if="shouldShowThumbnail(asset)">
      <!-- 只有在 URL 准备好时才渲染图片 -->
      <div v-if="displayUrl" class="thumbnail-container">
        <img
          :src="displayUrl"
          :alt="asset.name"
          class="asset-image"
          loading="lazy"
          @error="handleImageError"
        />
        <!-- 视频播放图标覆盖层 -->
        <div v-if="asset.type === 'video'" class="video-overlay">
          <svg
            viewBox="0 0 24 24"
            :width="videoIconSize"
            :height="videoIconSize"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="play-icon"
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
      </div>
      <div v-else-if="showLoading" class="loading-placeholder">
        <div class="spinner-small"></div>
      </div>
      <div v-else class="file-icon-wrapper fallback">
        <FileIcon :file-name="asset.name" :file-type="asset.type" :size="iconSize" />
      </div>
    </template>

    <!-- 文件类型图标 fallback -->
    <div v-else class="file-icon-wrapper">
      <FileIcon :file-name="asset.name" :file-type="asset.type" :size="iconSize" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import type { Asset } from "@/types/asset-management";
import { useAssetManager } from "@/composables/useAssetManager";
import FileIcon from "@/components/common/FileIcon.vue";
import { generateVideoThumbnail } from "@/utils/mediaThumbnailUtils";

interface Props {
  asset: Asset;
  assetUrl?: string;
  iconSize?: number; // 用于 FileIcon 的大小
  videoIconSize?: number; // 用于视频播放图标的大小
  showLoading?: boolean; // 是否在加载时显示 spinner
}

const props = withDefaults(defineProps<Props>(), {
  iconSize: 32,
  videoIconSize: 12,
  showLoading: false,
});

const { saveAssetThumbnail } = useAssetManager();
const localThumbnail = ref<string | null>(null);
const isProcessing = ref(false);

// 判断是否应该显示缩略图
const shouldShowThumbnail = (asset: Asset) => {
  if (asset.type === "image") return true;
  if (asset.type === "audio" && asset.thumbnailPath) return true;
  if (asset.type === "video") return true; // 视频总是尝试显示
  return false;
};

// 获取显示的 URL
const displayUrl = computed(() => {
  // 1. 优先使用本地生成的 Base64 缩略图
  if (localThumbnail.value) {
    return localThumbnail.value;
  }

  // 2. 如果有外部传入的 URL
  if (props.assetUrl) {
    // 如果是视频，且没有后端缩略图，说明这个 URL 是原视频路径
    // 我们不应该在 img 标签中显示原视频路径，而应该等待本地缩略图生成
    if (props.asset.type === "video" && !props.asset.thumbnailPath) {
      return undefined;
    }
    return props.assetUrl;
  }

  return undefined;
});

const handleImageError = () => {
  // console.error('图片加载失败:', props.asset.name);
};

// 处理视频缩略图生成
const processVideoThumbnail = async () => {
  if (isProcessing.value) return;
  if (localThumbnail.value) return; // 已经有本地缩略图了
  if (props.asset.thumbnailPath) return; // 已经有后端缩略图了
  if (!props.assetUrl) return; // 没有视频源地址

  isProcessing.value = true;

  try {
    const base64 = await generateVideoThumbnail(props.assetUrl);
    localThumbnail.value = base64;
    await saveAssetThumbnail(props.asset.id, base64);
  } catch (error) {
    console.error("生成视频缩略图失败:", props.asset.name, error);
  } finally {
    isProcessing.value = false;
  }
};

// 监听变化以触发视频缩略图生成
watch(
  [() => props.asset, () => props.assetUrl],
  ([newAsset, newUrl]) => {
    if (newAsset.type === "video" && !newAsset.thumbnailPath && newUrl) {
      processVideoThumbnail();
    }
  },
  { immediate: true }
);

// 清理
onUnmounted(() => {
  localThumbnail.value = null;
});
</script>

<style scoped>
.asset-icon-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumbnail-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-overlay {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.loading-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid var(--el-border-color);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
