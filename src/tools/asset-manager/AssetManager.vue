<template>
  <div class="asset-manager-container">
    <!-- 工具栏 -->
    <Toolbar
      v-model:view-mode="viewMode"
      v-model:search-query="searchQuery"
      v-model:sort-by="sortBy"
      @import-files="handleImportFiles"
      @import-from-clipboard="handleImportFromClipboard"
      @rebuild-index="handleRebuildIndex"
      @find-duplicates="handleFindDuplicates"
    />

    <!-- 主体区域 -->
    <el-container class="main-container">
      <!-- 左侧边栏 -->
      <el-aside width="200px" class="sidebar-container">
        <Sidebar
          v-model:selected-type="selectedType"
          v-model:selected-origin="selectedOrigin"
          v-model:show-duplicates-only="showDuplicatesOnly"
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
            :duplicate-hashes="duplicateHashes"
            @select="handleSelectAsset"
            @delete="handleDeleteAsset"
          />

          <!-- 列表视图 -->
          <AssetListView
            v-else
            :assets="filteredAndSortedAssets"
            :duplicate-hashes="duplicateHashes"
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
import { invoke } from '@tauri-apps/api/core';
import { Loading } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useAssetManager } from '@/composables/useAssetManager';
import { customMessage } from '@/utils/customMessage';
import type { Asset, AssetType, AssetOrigin, DuplicateFilesResult } from '@/types/asset-management';
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

// 重复文件相关状态
const duplicateHashes = ref<Set<string>>(new Set());
const duplicateResult = ref<DuplicateFilesResult | null>(null);

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
const showDuplicatesOnly = ref(false);

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

  // 只显示重复文件
  if (showDuplicatesOnly.value) {
    result = result.filter(asset => duplicateHashes.value.has(asset.id));
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

/**
 * 重建哈希索引 (工具特定功能)
 */
const handleRebuildIndex = async () => {
  try {
    await ElMessageBox.confirm(
      '重建索引将扫描所有已有文件并建立哈希索引，这可能需要一些时间。是否继续？',
      '确认重建索引',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    const result = await invoke<string>('rebuild_hash_index');
    customMessage.success(result);
  } catch (err) {
    if (err !== 'cancel') {
      console.error('重建索引失败:', err);
    }
  }
};

/**
 * 查找重复文件 (工具特定功能)
 */
const handleFindDuplicates = async () => {
  try {
    const result = await invoke<DuplicateFilesResult>('find_duplicate_files');
    duplicateResult.value = result;
    
    // 构建重复文件哈希集合
    const hashSet = new Set<string>();
    result.duplicates.forEach(group => {
      group.files.forEach(filePath => {
        // 从路径中提取文件名（UUID）
        const fileName = filePath.split('/').pop() || '';
        const uuid = fileName.split('.')[0];
        hashSet.add(uuid);
      });
    });
    duplicateHashes.value = hashSet;
    
    // 显示结果
    if (result.totalGroups === 0) {
      customMessage.success('未发现重复文件');
    } else {
      const wastedSpaceMB = (result.wastedSpace / (1024 * 1024)).toFixed(2);
      await ElMessageBox.alert(
        `发现 ${result.totalGroups} 组重复文件，共 ${result.totalFiles} 个文件，可节省 ${wastedSpaceMB} MB 空间。\n\n重复文件已在列表中标记。`,
        '重复文件检测结果',
        {
          confirmButtonText: '确定',
          type: 'info',
        }
      );
    }
  } catch (err) {
    console.error('查找重复文件失败:', err);
  }
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