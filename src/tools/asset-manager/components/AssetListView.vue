<template>
  <div class="asset-list-view">
    <el-table
      :data="assets"
      style="width: 100%"
      @row-click="handleRowClick"
    >
      <!-- 文件类型图标 -->
      <el-table-column width="60" align="center">
        <template #default="{ row }">
          <div class="type-icon">
            <img
              v-if="row.type === 'image'"
              :src="getAssetUrl(row)"
              class="thumbnail"
            />
            <span v-else class="emoji-icon">
              {{ getAssetIcon(row) }}
            </span>
          </div>
        </template>
      </el-table-column>

      <!-- 文件名 -->
      <el-table-column prop="name" label="文件名" min-width="200">
        <template #default="{ row }">
          <div class="file-name">{{ row.name }}</div>
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
      <el-table-column label="来源" width="120">
        <template #default="{ row }">
          <span v-if="row.origin">
            {{ getOriginLabel(row.origin.type) }}
          </span>
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
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            text
            type="primary"
            size="small"
            @click.stop="handleSelect(row)"
          >
            <el-icon><View /></el-icon>
            预览
          </el-button>
          <el-button
            text
            type="danger"
            size="small"
            @click.stop="handleDelete(row.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { View, Delete } from '@element-plus/icons-vue';
import type { Asset, AssetType, AssetOrigin } from '@/types/asset-management';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { ref, watch, onUnmounted } from 'vue';

interface Props {
  assets: Asset[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
}>();

// 存储每个资产的 Blob URL
const assetUrls = ref<Map<string, string>>(new Map());
const loadingUrls = ref<Set<string>>(new Set());

// 加载单个资产的 Blob URL
const loadAssetUrl = async (asset: Asset) => {
  if (asset.type !== 'image') return;
  if (assetUrls.value.has(asset.id)) return;
  if (loadingUrls.value.has(asset.id)) return;
  
  try {
    loadingUrls.value.add(asset.id);
    const url = await assetManagerEngine.getAssetUrl(asset, true);
    assetUrls.value.set(asset.id, url);
  } catch (error) {
    console.error('加载资产 URL 失败:', error, asset);
  } finally {
    loadingUrls.value.delete(asset.id);
  }
};

// 获取资产的 URL（从缓存中）
const getAssetUrl = (asset: Asset): string => {
  return assetUrls.value.get(asset.id) || '';
};

// 监听资产列表变化，加载新的图片 URL
watch(
  () => props.assets,
  (newAssets) => {
    // 加载新资产的 URL
    newAssets.forEach(asset => {
      if (asset.type === 'image') {
        loadAssetUrl(asset);
      }
    });
    
    // 清理不再需要的 URL
    const currentAssetIds = new Set(newAssets.map(a => a.id));
    assetUrls.value.forEach((url, id) => {
      if (!currentAssetIds.has(id)) {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
        assetUrls.value.delete(id);
      }
    });
  },
  { immediate: true }
);

// 清理所有 Blob URLs
onUnmounted(() => {
  assetUrls.value.forEach(url => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  });
  assetUrls.value.clear();
});

const handleRowClick = (asset: Asset) => {
  emit('select', asset);
};

const handleSelect = (asset: Asset) => {
  emit('select', asset);
};

const handleDelete = (assetId: string) => {
  emit('delete', assetId);
};

const getAssetIcon = (asset: Asset) => {
  return assetManagerEngine.getAssetIcon(asset);
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

const getOriginLabel = (type: AssetOrigin['type']): string => {
  const labels: Record<AssetOrigin['type'], string> = {
    local: '本地导入',
    clipboard: '剪贴板',
    network: '网络',
  };
  return labels[type];
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
</script>

<style scoped>
.asset-list-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
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
}

.text-secondary {
  color: var(--el-text-color-secondary);
}

:deep(.el-table__row) {
  cursor: pointer;
}

:deep(.el-table__row:hover) {
  background-color: var(--el-fill-color-light);
}
</style>