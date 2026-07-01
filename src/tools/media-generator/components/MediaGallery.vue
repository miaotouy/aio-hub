<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import {
  Search,
  Info,
  Download,
  Trash2,
  Video as VideoIcon,
  Music as AudioIcon,
  RefreshCw,
} from "lucide-vue-next";
import { useAssetManager, type Asset } from "@/composables/useAssetManager";
import { invoke } from "@tauri-apps/api/core";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useGenerationInfoViewer } from "../composables/useGenerationInfoViewer";
import type { AssetType } from "@/types/asset-management";
import { useInfiniteScroll } from "@vueuse/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const {
  assets,
  isLoading,
  hasMore,
  loadAssetsPaginated,
  getAssetUrl,
  getAssetBasePath,
  removeSourceFromAsset,
} = useAssetManager();
const { show: showImageViewer } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { previewAudio } = useAudioViewer();
const { show: showInfoViewer } = useGenerationInfoViewer();

const searchQuery = ref("");
const filterType = ref<AssetType | "all">("all");
const currentPage = ref(1);
const pageSize = ref(20);

const galleryContainer = ref<HTMLElement | null>(null);

// 资产 URL 缓存
const assetUrls = ref<Record<string, string>>({});
const videoPosterUrls = ref<Record<string, string>>({});
const generationInfoCache = ref<Record<string, any>>({});

const handleVideoEnter = (e: Event) => {
  const video = e.target as HTMLVideoElement;
  if (video) {
    video.play().catch(() => {});
  }
};

const handleVideoLeave = (e: Event) => {
  const video = e.target as HTMLVideoElement;
  if (video) {
    video.pause();
  }
};

const getInlineGenerationInfo = (asset: Asset) => {
  const metadata = asset.metadata as any;
  if (metadata?.generation) return metadata.generation;
  if (metadata?.prompt || metadata?.revisedPrompt) return metadata;
  return null;
};

const loadGenerationInfo = async (asset: Asset) => {
  if (
    Object.prototype.hasOwnProperty.call(generationInfoCache.value, asset.id)
  ) {
    return;
  }

  const inlineInfo = getInlineGenerationInfo(asset);
  if (inlineInfo?.prompt || inlineInfo?.revisedPrompt) {
    generationInfoCache.value[asset.id] = inlineInfo;
    return;
  }

  const derivedPath = (asset.metadata as any)?.derived?.generation?.path;
  if (!derivedPath) {
    generationInfoCache.value[asset.id] = null;
    return;
  }

  try {
    const basePath = await getAssetBasePath();
    const fullPath = await join(basePath, derivedPath);
    generationInfoCache.value[asset.id] = JSON.parse(
      await readTextFile(fullPath)
    );
  } catch {
    generationInfoCache.value[asset.id] = null;
  }
};

const getGenerationInfo = (asset: Asset) => {
  return generationInfoCache.value[asset.id] || getInlineGenerationInfo(asset);
};

const getAssetPrompt = (asset: Asset) => {
  const genInfo = getGenerationInfo(asset);
  return genInfo?.prompt || genInfo?.revisedPrompt || asset.name;
};

const hydrateVisibleAssets = async () => {
  await Promise.all(
    assets.value.map(async (asset) => {
      if (!assetUrls.value[asset.id]) {
        assetUrls.value[asset.id] = await getAssetUrl(asset);
      }
      if (asset.type === "video" && asset.thumbnailPath) {
        videoPosterUrls.value[asset.id] = await getAssetUrl(asset, true);
      }
      await loadGenerationInfo(asset);
    })
  );
};

// 加载数据
const loadData = async (append = false) => {
  if (!append) {
    currentPage.value = 1;
  }

  // 如果有搜索词，且不是追加模式，我们尝试使用专门的后端搜索
  // 注意：目前的后端搜索不支持分页，所以我们仅在第一页且有搜索词时尝试
  if (searchQuery.value && !append) {
    try {
      isLoading.value = true;
      const searchResults = await invoke<any[]>("search_media_generator_data", {
        query: searchQuery.value,
        limit: 100,
      });

      // 提取所有关联的资产 ID
      const assetIds = searchResults
        .map((r) => r.asset_id)
        .filter((id): id is string => !!id);

      if (assetIds.length > 0) {
        // 去重
        const uniqueAssetIds = [...new Set(assetIds)];

        // 根据 ID 获取资产对象
        const matchedAssets: Asset[] = [];
        for (const id of uniqueAssetIds) {
          try {
            const asset = await invoke<Asset>("get_asset_by_id", {
              assetId: id,
            });
            if (asset) {
              // 检查类型过滤
              if (
                filterType.value !== "all" &&
                asset.type !== filterType.value
              ) {
                continue;
              }
              matchedAssets.push(asset);
            }
          } catch (e) {
            // 忽略找不到的资产
          }
        }

        assets.value = matchedAssets;
        hasMore.value = false; // 搜索模式暂不支持分页

        await hydrateVisibleAssets();
        return;
      }
    } catch (e) {
      console.error("后端搜索失败，退回到普通搜索", e);
    } finally {
      isLoading.value = false;
    }
  }

  await loadAssetsPaginated(
    {
      page: currentPage.value,
      pageSize: pageSize.value,
      searchQuery: searchQuery.value,
      filterType: filterType.value === "all" ? undefined : filterType.value,
      filterOrigin: "generated",
      filterSourceModule: "media-generator",
      sortBy: "date",
      sortOrder: "desc",
    },
    append
  );

  await hydrateVisibleAssets();
};

// 初始加载
onMounted(() => {
  loadData();
});

// 监听搜索和筛选
watch([searchQuery, filterType], () => {
  loadData();
});

// 无限滚动
useInfiniteScroll(
  galleryContainer,
  () => {
    if (hasMore.value && !isLoading.value) {
      currentPage.value++;
      loadData(true);
    }
  },
  { distance: 10 }
);

const handlePreview = (asset: Asset) => {
  const url = assetUrls.value[asset.id];
  if (!url) return;

  if (asset.type === "image") {
    showImageViewer(url);
  } else if (asset.type === "video") {
    previewVideo(asset);
  } else if (asset.type === "audio") {
    previewAudio(asset);
  }
};

const handleViewInfo = (asset: Asset) => {
  // 从资产元数据中提取生成信息
  const genInfo = getGenerationInfo(asset);
  showInfoViewer(asset, {
    prompt: genInfo?.prompt || asset.name,
    negativePrompt: genInfo?.negativePrompt,
    modelId: genInfo?.modelId,
    params: genInfo?.params,
    genType: (genInfo?.genType as any) || asset.type,
  });
};

const handleDownload = (asset: Asset) => {
  const url = assetUrls.value[asset.id];
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = asset.name;
  link.click();
};

const handleRemove = async (asset: Asset) => {
  await removeSourceFromAsset(asset.id, "media-generator");
};

const handleRefresh = () => {
  loadData();
};
</script>

<template>
  <div class="media-gallery">
    <!-- 工具栏 -->
    <div class="gallery-toolbar">
      <div class="search-box">
        <el-input
          v-model="searchQuery"
          placeholder="搜索提示词、模型..."
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleRefresh"
        />
      </div>

      <div class="filter-actions">
        <el-radio-group v-model="filterType" size="default">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="image">图片</el-radio-button>
          <el-radio-button value="video">视频</el-radio-button>
          <el-radio-button value="audio">音频</el-radio-button>
        </el-radio-group>

        <div class="stats">
          <el-tag type="info" effect="plain">
            共 {{ assets.length }} 个结果
          </el-tag>
          <el-button
            :icon="RefreshCw"
            circle
            size="small"
            @click="handleRefresh"
            :loading="isLoading"
          />
        </div>
      </div>
    </div>

    <!-- 瀑布流/网格内容 -->
    <div v-if="assets.length > 0" ref="galleryContainer" class="gallery-grid">
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="gallery-item"
        @click="handlePreview(asset)"
      >
        <!-- 预览图 -->
        <div class="item-preview">
          <template v-if="asset.type === 'image'">
            <img :src="assetUrls[asset.id]" loading="lazy" />
          </template>
          <template v-else-if="asset.type === 'video'">
            <video
              :src="assetUrls[asset.id]"
              :poster="videoPosterUrls[asset.id]"
              muted
              loop
              playsinline
              preload="none"
              @mouseenter="handleVideoEnter"
              @mouseleave="handleVideoLeave"
            ></video>
            <div class="media-badge">
              <VideoIcon :size="14" />
            </div>
          </template>
          <template v-else-if="asset.type === 'audio'">
            <div class="audio-placeholder">
              <AudioIcon class="audio-placeholder-icon" :size="38" />
              <div class="audio-copy">
                <span class="audio-label">音频结果</span>
                <p class="audio-prompt" :title="getAssetPrompt(asset)">
                  {{ getAssetPrompt(asset) }}
                </p>
              </div>
            </div>
            <div class="media-badge">
              <AudioIcon :size="14" />
            </div>
          </template>

          <!-- 悬浮层 -->
          <div class="item-overlay">
            <div class="overlay-top">
              <p class="prompt-hint">
                {{ getAssetPrompt(asset) }}
              </p>
            </div>
            <div class="overlay-bottom">
              <div class="action-buttons">
                <el-tooltip content="查看参数" placement="top">
                  <el-button
                    circle
                    size="small"
                    @click.stop="handleViewInfo(asset)"
                  >
                    <el-icon><Info /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-button
                    circle
                    size="small"
                    @click.stop="handleDownload(asset)"
                  >
                    <el-icon><Download /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button
                    circle
                    size="small"
                    type="danger"
                    @click.stop="handleRemove(asset)"
                  >
                    <el-icon><Trash2 /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载中状态 -->
      <div v-if="isLoading" class="loading-indicator">
        <el-icon class="is-loading"><RefreshCw /></el-icon>
        <span>加载中...</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!isLoading" class="empty-state">
      <el-empty
        :description="searchQuery ? '未找到匹配的结果' : '暂无生成结果'"
      >
        <template v-if="!searchQuery" #extra>
          <p>去工作台创作一些作品吧！</p>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.media-gallery {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
}

.gallery-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.search-box {
  width: 300px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.gallery-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: 200px;
  gap: 16px;
  overflow-y: auto;
  padding-right: 8px;
}

.gallery-item {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  cursor: pointer;
  /* 优化视口外渲染性能 */
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}

.gallery-item:hover {
  border-color: var(--el-color-primary);
}

.item-preview {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--el-fill-color-dark);
}

.item-preview img,
.item-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audio-placeholder {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  background-color: var(--input-bg);
}

.audio-placeholder-icon {
  flex-shrink: 0;
  color: var(--el-color-primary);
  opacity: 0.85;
}

.audio-copy {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.audio-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.audio-prompt {
  max-width: 100%;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--el-text-color-primary);
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.media-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  backdrop-filter: blur(4px);
}

.item-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    transparent 40%,
    transparent 60%,
    rgba(0, 0, 0, 0.6) 100%
  );
  opacity: 0;
  transition: opacity 0.3s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
}

.gallery-item:hover .item-overlay {
  opacity: 1;
}

.prompt-hint {
  color: white;
  font-size: 12px;
  margin: 0;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.overlay-bottom {
  display: flex;
  justify-content: flex-end;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-indicator {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

/* 滚动条美化 */
.gallery-grid::-webkit-scrollbar {
  width: 6px;
}

.gallery-grid::-webkit-scrollbar-thumb {
  background-color: var(--border-color);
  border-radius: 3px;
}
</style>
