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
          <div class="action-buttons" style="display: flex; align-items: center;">
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
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { View, Delete } from '@element-plus/icons-vue';
import type { Asset, AssetType, AssetOrigin } from '@/types/asset-management';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { ref, watch } from 'vue';

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
}

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
});

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
  'selection-change': [asset: Asset, event: MouseEvent];
}>();

// 存储每个资产的 URL
const assetUrls = ref<Map<string, string>>(new Map());
const basePath = ref<string>('');
const isLoadingUrls = ref(false);

// 加载资产 URL
const loadAssetUrls = async () => {
  try {
    isLoadingUrls.value = true;
    
    // 获取基础路径（只需获取一次）
    if (!basePath.value) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }
    
    // 清空旧的 URL
    assetUrls.value.clear();
    
    // 为所有图片资产生成 URL
    for (const asset of props.assets) {
      if (asset.type === 'image') {
        try {
          const url = assetManagerEngine.convertToAssetProtocol(asset.path, basePath.value);
          assetUrls.value.set(asset.id, url);
        } catch (error) {
          console.error('生成资产 URL 失败:', asset.id, error);
        }
      }
    }
  } finally {
    isLoadingUrls.value = false;
  }
};

// 获取资产的 URL
const getAssetUrl = (asset: Asset): string => {
  return assetUrls.value.get(asset.id) || '';
};

// 监听资产列表变化
watch(() => props.assets, () => {
  loadAssetUrls();
}, { immediate: true, deep: true });


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