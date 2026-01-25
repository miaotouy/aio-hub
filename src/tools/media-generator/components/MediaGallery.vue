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
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useGenerationInfoViewer } from "../composables/useGenerationInfoViewer";
import type { MediaTaskType } from "../types";
import { useInfiniteScroll } from "@vueuse/core";

const { assets, isLoading, hasMore, loadAssetsPaginated, getAssetUrl, removeSourceFromAsset } =
  useAssetManager();
const { show: showImageViewer } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { previewAudio } = useAudioViewer();
const { show: showInfoViewer } = useGenerationInfoViewer();

const searchQuery = ref("");
const filterType = ref<MediaTaskType | "all">("all");
const currentPage = ref(1);
const pageSize = ref(20);

const galleryContainer = ref<HTMLElement | null>(null);

// 资产 URL 缓存
const assetUrls = ref<Record<string, string>>({});

// 加载数据
const loadData = async (append = false) => {
  if (!append) {
    currentPage.value = 1;
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

  // 加载可见资产的 URL
  for (const asset of assets.value) {
    if (!assetUrls.value[asset.id]) {
      assetUrls.value[asset.id] = await getAssetUrl(asset);
    }
  }
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
  const metadata = asset.metadata as any;
  const genInfo = metadata?.generation || metadata;
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
          placeholder="搜索提示词..."
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
          <el-tag type="info" effect="plain"> 共 {{ assets.length }} 个结果 </el-tag>
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
              muted
              loop
              onmouseover="this.play()"
              onmouseout="this.pause()"
            ></video>
            <div class="media-badge">
              <VideoIcon :size="14" />
            </div>
          </template>
          <template v-else-if="asset.type === 'audio'">
            <div class="audio-placeholder">
              <AudioIcon :size="48" />
              <span>音频结果</span>
            </div>
            <div class="media-badge">
              <AudioIcon :size="14" />
            </div>
          </template>

          <!-- 悬浮层 -->
          <div class="item-overlay">
            <div class="overlay-top">
              <p class="prompt-hint">
                {{
                  (asset.metadata as any)?.generation?.prompt ||
                  (asset.metadata as any)?.prompt ||
                  asset.name
                }}
              </p>
            </div>
            <div class="overlay-bottom">
              <div class="action-buttons">
                <el-tooltip content="查看参数" placement="top">
                  <el-button circle size="small" @click.stop="handleViewInfo(asset)">
                    <el-icon><Info /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-button circle size="small" @click.stop="handleDownload(asset)">
                    <el-icon><Download /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button circle size="small" type="danger" @click.stop="handleRemove(asset)">
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
      <el-empty :description="searchQuery ? '未找到匹配的结果' : '暂无生成结果'">
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
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--el-box-shadow);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
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
