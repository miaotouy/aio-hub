<template>
  <div class="asset-grid-view">
    <div :class="['grid-container', `size-${props.gridCardSize}`]">
      <div
        v-for="asset in assets"
        :key="asset.id"
        :data-asset-id="asset.id"
        :class="[
          'asset-card',
          { 'is-duplicate': props.duplicateHashes.has(asset.id) },
          { 'is-selected': props.selectedIds.has(asset.id) }
        ]"
        @click="emit('selection-change', asset, $event)"
      >
        <!-- 复选框 -->
        <el-checkbox
          :model-value="props.selectedIds.has(asset.id)"
          class="selection-checkbox"
          size="large"
          @click.stop="emit('selection-change', asset, $event)"
        />
        <!-- 缩略图或图标 -->
        <div class="asset-preview" @click.stop="handleSelect(asset)">
          <template v-if="shouldShowThumbnail(asset)">
            <!-- 只有在 URL 准备好时才渲染图片 -->
            <template v-if="getDisplayUrl(asset)">
              <img
                :src="getDisplayUrl(asset)"
                :alt="asset.name"
                class="preview-image"
                loading="lazy"
                @error="handleImageError(asset)"
              />
              <!-- 视频播放图标覆盖层 -->
              <div v-if="asset.type === 'video'" class="video-overlay">
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="play-icon"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </div>
            </template>
            <div v-else class="loading-placeholder">
              <div class="spinner-small"></div>
            </div>
          </template>
          <div v-else class="preview-icon">
            <FileIcon :file-name="asset.name" :file-type="asset.type" :size="48" />
          </div>
        </div>

        <!-- 文件信息 -->
        <div class="asset-info">
          <div class="asset-name" :title="asset.name">
            {{ asset.name }}
            <el-tag v-if="props.duplicateHashes.has(asset.id)" size="small" type="warning" effect="plain">
              重复
            </el-tag>
          </div>
          <div class="asset-meta">
            <span class="asset-size">{{ formatFileSize(asset.size) }}</span>
            <!-- 操作按钮 -->
            <div class="asset-actions" @click.stop>
              <el-dropdown trigger="click">
                <el-button text circle size="small">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="handleSelect(asset)">
                      <el-icon><View /></el-icon>
                      预览
                    </el-dropdown-item>
                    <el-dropdown-item @click="handleShowInFolder(asset.path)">
                      <el-icon><FolderOpened /></el-icon>
                      打开所在目录
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="handleDelete(asset.id)">
                      <el-icon><Delete /></el-icon>
                      删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { MoreFilled, View, Delete, FolderOpened } from '@element-plus/icons-vue';
import type { Asset } from '@/types/asset-management';
import { useAssetManager, assetManagerEngine } from '@/composables/useAssetManager';
import FileIcon from '@/components/common/FileIcon.vue';
import { generateVideoThumbnail } from '@/utils/mediaThumbnailUtils';

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
  assetUrls: Map<string, string>;
  gridCardSize?: 'large' | 'medium' | 'small';
}

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
  assetUrls: () => new Map(),
  gridCardSize: 'medium',
});

const { saveAssetThumbnail } = useAssetManager();
const localThumbnails = ref<Map<string, string>>(new Map());
const processingAssets = ref<Set<string>>(new Set());

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
  'selection-change': [asset: Asset, event: MouseEvent];
  'show-in-folder': [path: string];
}>();


// 处理图片加载错误
const handleImageError = (asset: Asset) => {
  console.error('图片加载失败:', asset.name, asset.path);
};

const handleSelect = (asset: Asset) => {
  emit('select', asset);
};

const handleDelete = (assetId: string) => {
  emit('delete', assetId);
};

const handleShowInFolder = (path: string) => {
  emit('show-in-folder', path);
};

const formatFileSize = (bytes: number) => {
  return assetManagerEngine.formatFileSize(bytes);
};

// 判断是否应该显示缩略图
const shouldShowThumbnail = (asset: Asset) => {
  // 图片总是显示
  if (asset.type === 'image') return true;
  // 音频有缩略图时显示
  if (asset.type === 'audio' && asset.thumbnailPath) return true;
  // 视频总是显示（没有缩略图时会尝试生成）
  if (asset.type === 'video') return true;
  return false;
};

// 获取显示的 URL（优先使用本地生成的，然后是 props 传入的）
const getDisplayUrl = (asset: Asset) => {
  // 1. 优先使用本地生成的 Base64 缩略图
  if (localThumbnails.value.has(asset.id)) {
    return localThumbnails.value.get(asset.id);
  }
  
  const url = props.assetUrls.get(asset.id);
  if (!url) return undefined;

  // 2. 如果是视频，且没有后端缩略图，说明这个 URL 是原视频路径
  // 我们不应该在 img 标签中显示原视频路径，而应该等待本地缩略图生成
  if (asset.type === 'video' && !asset.thumbnailPath) {
    return undefined;
  }

  // 3. 其他情况（图片，或有缩略图的音频/视频），直接显示
  return url;
};

// 监听 assets 和 assetUrls 变化，处理没有缩略图的视频
watch(
  [() => props.assets, () => props.assetUrls],
  ([newAssets, newUrls]) => {
    for (const asset of newAssets) {
      if (
        asset.type === 'video' &&
        !asset.thumbnailPath &&
        !processingAssets.value.has(asset.id) &&
        newUrls.has(asset.id)
      ) {
        processVideoThumbnail(asset);
      }
    }
  },
  { immediate: true, deep: true }
);

// 处理视频缩略图生成
const processVideoThumbnail = async (asset: Asset) => {
  if (processingAssets.value.has(asset.id)) return;
  
  const videoUrl = props.assetUrls.get(asset.id);
  if (!videoUrl) return;

  processingAssets.value.add(asset.id);

  try {
    // 生成缩略图
    const base64 = await generateVideoThumbnail(videoUrl);
    
    // 本地先显示
    localThumbnails.value.set(asset.id, base64);

    // 保存到后端
    await saveAssetThumbnail(asset.id, base64);
    
    // 保存成功后，后端会更新 Asset 信息，父组件刷新列表后 asset.thumbnailPath 会更新
    // 但为了避免闪烁，我们可以继续保留 localThumbnails 直到组件卸载或手动清理
  } catch (error) {
    console.error('生成视频缩略图失败:', asset.name, error);
  } finally {
    processingAssets.value.delete(asset.id);
  }
};
</script>

<style scoped>
.asset-grid-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  padding: 4px;
}

.grid-container.size-small {
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.grid-container.size-large {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
  user-select: none;
  backdrop-filter: blur(var(--ui-blur));
}

.asset-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}
.asset-card:hover .selection-checkbox {
  opacity: 1;
}

.asset-card.is-selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 30%, transparent);
}
.asset-card.is-selected:hover {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 40%, transparent);
}
.asset-card.is-selected .selection-checkbox {
  opacity: 1;
}

.asset-card.is-duplicate {
  border-color: var(--el-color-warning);
  background-color: color-mix(in srgb, var(--el-color-warning) 15%, transparent);
}

.asset-preview {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--container-bg);
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-icon {
  font-size: 48px;
}

.asset-info {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.asset-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.asset-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.asset-card:hover .asset-actions {
  opacity: 1;
}

.selection-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: all;
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