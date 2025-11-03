<template>
  <div class="asset-grid-view">
    <div class="grid-container">
      <div
        v-for="asset in assets"
        :key="asset.id"
        :data-asset-id="asset.id"
        :class="['asset-card', { 'is-duplicate': props.duplicateHashes.has(asset.id) }]"
        @click="handleSelect(asset)"
      >
        <!-- 缩略图或图标 -->
        <div class="asset-preview">
          <template v-if="asset.type === 'image'">
            <!-- 只有在 URL 准备好时才渲染图片 -->
            <template v-if="assetUrls.has(asset.id) && !isLoadingUrls">
              <img
                :src="assetUrls.get(asset.id)"
                :alt="asset.name"
                class="preview-image"
                loading="lazy"
                @error="handleImageError(asset)"
              />
            </template>
            <div v-else class="loading-placeholder">
              <div class="spinner-small"></div>
            </div>
          </template>
          <div v-else class="preview-icon">
            {{ getAssetIcon(asset) }}
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
import { ref, watch } from 'vue';
import { MoreFilled, View, Delete } from '@element-plus/icons-vue';
import type { Asset } from '@/types/asset-management';
import { assetManagerEngine } from '@/composables/useAssetManager';

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
}

const props = withDefaults(defineProps<Props>(), {
  duplicateHashes: () => new Set(),
});

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
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

// 监听资产列表变化
watch(() => props.assets, () => {
  loadAssetUrls();
}, { immediate: true });

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

.asset-card.is-duplicate {
  border-color: var(--el-color-warning);
  background-color: var(--el-color-warning-light-9);
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
  display: flex;
  align-items: center;
  gap: 4px;
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