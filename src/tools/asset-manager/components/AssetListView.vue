<template>
  <div class="asset-list-view">
    <el-table
      :data="assets"
        style="width: 100%"
        :row-class-name="getRowClassName"
        @row-click="(row: Asset, _column: any, event: MouseEvent) => emit('selection-change', row, event)"
      >
        <!-- 复选框列 -->
        <el-table-column width="45" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="props.selectedIds.has(row.id)"
            size="large"
            @click.stop="(e: MouseEvent) => emit('selection-change', row, e)"
          />
        </template>
      </el-table-column>

      <!-- 文件类型图标 -->
      <el-table-column width="60" align="center">
        <template #default="{ row }">
          <div class="type-icon">
            <template v-if="shouldShowThumbnail(row)">
              <img
                :src="getDisplayUrl(row)"
                class="thumbnail"
              />
              <div v-if="row.type === 'video'" class="video-overlay-small">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="play-icon"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </div>
            </template>
            <FileIcon
              v-else
              :file-name="row.name"
              :file-type="row.type"
              :size="32"
            />
          </div>
        </template>
      </el-table-column>

      <!-- 文件名 -->
      <el-table-column prop="name" label="文件名" min-width="200">
        <template #default="{ row }">
          <div class="file-name">
            {{ row.name }}
            <el-tag v-if="props.duplicateHashes.has(row.id)" size="small" type="warning" effect="plain">
              重复
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <!-- 文件类型 -->
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info">
            {{ getTypeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 文件大小 -->
      <el-table-column label="大小" width="100">
        <template #default="{ row }">
          {{ formatFileSize(row.size) }}
        </template>
      </el-table-column>

      <!-- 来源 -->
      <el-table-column label="来源" width="180">
        <template #default="{ row }">
          <div v-if="row.origins && row.origins.length > 0" class="origins-cell">
            <el-tag
              v-for="(origin, index) in row.origins.slice(0, 2)"
              :key="index"
              size="small"
              type="info"
              effect="plain"
            >
              {{ getOriginLabel(origin.type) }}
            </el-tag>
            <el-tag
              v-if="row.origins.length > 2"
              size="small"
              type="info"
              effect="plain"
            >
              +{{ row.origins.length - 2 }}
            </el-tag>
          </div>
          <span v-else class="text-secondary">未知</span>
        </template>
      </el-table-column>

      <!-- 导入时间 -->
      <el-table-column label="导入时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="80" fixed="right" align="center">
        <template #default="{ row }">
          <el-dropdown trigger="click" @click.stop>
            <el-button text circle>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleSelect(row)">
                  <el-icon><View /></el-icon>
                  预览
                </el-dropdown-item>
                <el-dropdown-item @click="handleShowInFolder(row.path)">
                  <el-icon><FolderOpened /></el-icon>
                  打开所在目录
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { View, Delete, MoreFilled, FolderOpened } from '@element-plus/icons-vue';
import type { Asset, AssetType } from '@/types/asset-management';
import { useAssetManager, assetManagerEngine } from '@/composables/useAssetManager';
import FileIcon from '@/components/common/FileIcon.vue';
import { generateVideoThumbnail } from '@/utils/mediaThumbnailUtils';

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
  assetUrls: Map<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
  assetUrls: () => new Map(),
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

// 获取资产的 URL
const getAssetUrl = (asset: Asset): string => {
  return props.assetUrls.get(asset.id) || '';
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

const getTypeLabel = (type: AssetType): string => {
  const labels: Record<AssetType, string> = {
    image: '图片',
    video: '视频',
    audio: '音频',
    document: '文档',
    other: '其他',
  };
  return labels[type];
};

const getOriginLabel = (type: string): string => {
  const labels: Record<string, string> = {
    local: '本地',
    clipboard: '剪贴板',
    network: '网络',
  };
  return labels[type] || type;
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getRowClassName = ({ row }: { row: Asset }) => {
  const classes = [];
  if (props.duplicateHashes.has(row.id)) {
    classes.push('duplicate-row');
  }
  if (props.selectedIds.has(row.id)) {
    classes.push('selected-row');
  }
  return classes.join(' ');
};

// 判断是否应该显示缩略图
const shouldShowThumbnail = (asset: Asset) => {
  // 图片总是显示
  if (asset.type === 'image') return true;
  // 音频有缩略图时显示
  if (asset.type === 'audio' && asset.thumbnailPath) return true;
  // 视频总是显示
  if (asset.type === 'video') return true;
  return false;
};
// 获取显示的 URL
const getDisplayUrl = (asset: Asset) => {
  // 1. 优先使用本地生成的 Base64 缩略图
  if (localThumbnails.value.has(asset.id)) {
    return localThumbnails.value.get(asset.id);
  }

  const url = getAssetUrl(asset);
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
    const base64 = await generateVideoThumbnail(videoUrl);
    localThumbnails.value.set(asset.id, base64);
    await saveAssetThumbnail(asset.id, base64);
  } catch (error) {
    console.error('生成视频缩略图失败:', asset.name, error);
  } finally {
    processingAssets.value.delete(asset.id);
  }
};
</script>

<style scoped>
.asset-list-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: var(--container-bg);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.emoji-icon {
  font-size: 24px;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-secondary {
  color: var(--el-text-color-secondary);
}

.origins-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

:deep(.el-table__row) {
  cursor: pointer;
  user-select: none;
}

:deep(.el-table__row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
}

:deep(.el-table__row.duplicate-row .el-table__cell) {
  background-color: color-mix(in srgb, var(--el-color-warning) 15%, transparent) !important;
}

:deep(.el-table__row.duplicate-row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--el-color-warning) 25%, transparent) !important;
}

:deep(.el-table__row.selected-row .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 20%, transparent) !important;
}

:deep(.el-table__row.selected-row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 30%, transparent) !important;
}
</style>