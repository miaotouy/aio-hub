<template>
  <div class="asset-manager-container">
    <!-- 工具栏 -->
    <Toolbar
      v-model:view-mode="viewMode"
      v-model:search-query="searchQuery"
      v-model:sort-by="sortBy"
      @import-files="handleImportFiles"
      @import-from-clipboard="handleImportFromClipboard"
    />

    <!-- 主体区域 -->
    <el-container class="main-container">
      <!-- 左侧边栏 -->
      <el-aside width="200px" class="sidebar-container">
        <Sidebar
          v-model:selected-type="selectedType"
          v-model:selected-origin="selectedOrigin"
          :total-assets="totalAssets"
          :total-size="totalSize"
          :type-counts="typeCounts"
        />
      </el-aside>

      <!-- 主视图区 -->
      <el-main class="main-view-container">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-container">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载中...</span>
        </div>

        <!-- 错误提示 -->
        <el-alert v-else-if="error" type="error" :closable="false" show-icon>
          {{ error }}
        </el-alert>

        <!-- 空状态 -->
        <el-empty
          v-else-if="filteredAndSortedAssets.length === 0"
          description="还没有导入任何资产"
        >
          <el-button type="primary" @click="handleImportFiles">
            导入文件
          </el-button>
        </el-empty>

        <!-- 视图切换 -->
        <template v-else>
          <!-- 网格视图 -->
          <AssetGridView
            v-if="viewMode === 'grid'"
            :assets="filteredAndSortedAssets"
            @select="handleSelectAsset"
            @delete="handleDeleteAsset"
          />

          <!-- 列表视图 -->
          <AssetListView
            v-else
            :assets="filteredAndSortedAssets"
            @select="handleSelectAsset"
            @delete="handleDeleteAsset"
          />
        </template>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import { useAssetManager } from '@/composables/useAssetManager';
import type { Asset, AssetType, AssetOrigin } from '@/types/asset-management';
import Toolbar from './components/Toolbar.vue';
import Sidebar from './components/Sidebar.vue';
import AssetGridView from './components/AssetGridView.vue';
import AssetListView from './components/AssetListView.vue';

// 使用资产管理器
const {
  assets,
  isLoading,
  error,
  totalAssets,
  totalSize,
  imageAssets,
  videoAssets,
  audioAssets,
  documentAssets,
  otherAssets,
  loadAssets,
  importAssetFromClipboard,
  searchAssets,
  removeAsset,
} = useAssetManager();

// 组件挂载时加载资产列表
onMounted(async () => {
  await loadAssets();
});

// UI 状态
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const sortBy = ref<'name' | 'date' | 'size'>('date');
const selectedType = ref<AssetType | 'all'>('all');
const selectedOrigin = ref<AssetOrigin['type'] | 'all'>('all');

// 计算各类型资产数量
const typeCounts = computed(() => ({
  image: imageAssets.value.length,
  video: videoAssets.value.length,
  audio: audioAssets.value.length,
  document: documentAssets.value.length,
  other: otherAssets.value.length,
}));

// 过滤和排序资产
const filteredAndSortedAssets = computed(() => {
  let result = assets.value;

  // 按类型过滤
  if (selectedType.value !== 'all') {
    result = result.filter(asset => asset.type === selectedType.value);
  }

  // 按来源过滤
  if (selectedOrigin.value !== 'all') {
    result = result.filter(asset => asset.origin?.type === selectedOrigin.value);
  }

  // 搜索过滤
  if (searchQuery.value.trim()) {
    result = searchAssets(searchQuery.value);
  }

  // 排序
  result = [...result].sort((a, b) => {
    switch (sortBy.value) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'size':
        return b.size - a.size;
      case 'date':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return result;
});

// 事件处理
const handleImportFiles = () => {
  // TODO: 实现文件导入对话框
  console.log('导入文件');
};

const handleImportFromClipboard = async () => {
  try {
    await importAssetFromClipboard();
  } catch (err) {
    console.error('从剪贴板导入失败:', err);
  }
};

const handleSelectAsset = (asset: Asset) => {
  // TODO: 实现资产预览
  console.log('选中资产:', asset);
};

const handleDeleteAsset = (assetId: string) => {
  removeAsset(assetId);
};
</script>

<style scoped>
.asset-manager-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
  box-sizing: border-box;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.sidebar-container {
  background-color: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color);
  overflow-y: auto;
}

.main-view-container {
  overflow-y: auto;
  padding: 16px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.loading-container .el-icon {
  font-size: 32px;
}
</style>