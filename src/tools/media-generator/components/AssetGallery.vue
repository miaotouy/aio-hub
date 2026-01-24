<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useAssetManager } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { History, RefreshCw } from "lucide-vue-next";
import type { Asset, AssetType } from "@/types/asset-management";
import AssetIcon from "../../asset-manager/components/AssetIcon.vue";

const { assets, isLoading, loadAssetsPaginated, getAssetUrl } = useAssetManager();
const { show: showImageViewer } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { previewAudio } = useAudioViewer();

const filterType = ref<string>("all");
const assetUrls = ref<Map<string, string>>(new Map());

/**
 * 批量加载资产 URL
 */
const loadAssetUrls = async (newAssets: Asset[]) => {
  for (const asset of newAssets) {
    if (!assetUrls.value.has(asset.id)) {
      const url = await getAssetUrl(asset, true);
      assetUrls.value.set(asset.id, url);
    }
  }
};

// 监听资产列表变化，加载 URL
watch(
  assets,
  (newAssets) => {
    loadAssetUrls(newAssets);
  },
  { deep: true }
);

const loadGallery = async () => {
  await loadAssetsPaginated({
    page: 1,
    pageSize: 50,
    filterSourceModule: "media-generator",
    filterOrigin: "generated",
    filterType: (filterType.value === "all" ? undefined : filterType.value) as
      | AssetType
      | undefined,
    sortBy: "date",
    sortOrder: "desc",
  });
};

const handlePreview = async (asset: Asset) => {
  if (asset.type === "image") {
    const url = await getAssetUrl(asset);
    showImageViewer([url], 0);
  } else if (asset.type === "video") {
    previewVideo(asset);
  } else if (asset.type === "audio") {
    previewAudio(asset);
  }
};

onMounted(() => {
  loadGallery();
});
</script>

<template>
  <div class="asset-gallery">
    <div class="gallery-header">
      <div class="header-top">
        <el-icon><History /></el-icon>
        <span class="title">生成历史</span>
        <el-button link :loading="isLoading" @click="loadGallery">
          <el-icon><RefreshCw /></el-icon>
        </el-button>
      </div>

      <div class="filter-bar">
        <el-radio-group v-model="filterType" size="small" @change="loadGallery">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="image">图片</el-radio-button>
          <el-radio-button value="video">视频</el-radio-button>
          <el-radio-button value="audio">音频</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <el-scrollbar class="gallery-body">
      <div v-if="assets.length === 0 && !isLoading" class="empty-state">
        <el-empty :image-size="80" description="暂无历史作品" />
      </div>

      <div class="asset-grid">
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="asset-item"
          @click="handlePreview(asset)"
        >
          <div class="asset-preview">
            <AssetIcon
              :asset="asset"
              :asset-url="assetUrls.get(asset.id)"
              :icon-size="32"
              :show-loading="true"
            />
          </div>
          <div class="asset-info">
            <span class="asset-name text-ellipsis">{{ asset.name }}</span>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.asset-gallery {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.asset-gallery * {
  box-sizing: border-box;
}

.gallery-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.header-top .title {
  flex: 1;
}

.filter-bar :deep(.el-radio-group) {
  width: 100%;
}

.filter-bar :deep(.el-radio-button) {
  flex: 1;
}

.filter-bar :deep(.el-radio-button__inner) {
  width: 100%;
}

.gallery-body {
  flex: 1;
}

.empty-state {
  padding-top: 60px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px;
}

.asset-item {
  aspect-ratio: 1;
  background-color: var(--card-bg);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.asset-item:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.asset-preview {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-color: var(--el-fill-color-darker);
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-preview :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.image-placeholder,
.video-placeholder,
.other-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 24px;
}

.asset-item:hover .play-overlay {
  opacity: 1;
}

.asset-info {
  padding: 4px 8px;
  background-color: rgba(0, 0, 0, 0.02);
}

.asset-name {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  display: block;
}

.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
