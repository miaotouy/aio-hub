<template>
  <div class="asset-grid-view">
    <div class="grid-container">
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="asset-card"
        @click="handleSelect(asset)"
      >
        <!-- 缩略图或图标 -->
        <div class="asset-preview">
          <img
            v-if="asset.type === 'image'"
            :src="getAssetUrl(asset)"
            :alt="asset.name"
            class="preview-image"
          />
          <div v-else class="preview-icon">
            {{ getAssetIcon(asset) }}
          </div>
        </div>

        <!-- 文件信息 -->
        <div class="asset-info">
          <div class="asset-name" :title="asset.name">
            {{ asset.name }}
          </div>
          <div class="asset-meta">
            <span class="asset-size">{{ formatFileSize(asset.size) }}</span>
          </div>
        </div>

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
                <el-dropdown-item @click="handleDelete(asset.id)">
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
</template>

<script setup lang="ts">
import { MoreFilled, View, Delete } from '@element-plus/icons-vue';
import type { Asset } from '@/types/asset-management';
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

.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--el-bg-color);
}

.asset-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.asset-preview {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-light);
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
}

.asset-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.asset-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.asset-card:hover .asset-actions {
  opacity: 1;
}
</style>