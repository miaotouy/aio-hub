<template>
  <div class="asset-manager-container">
    <!-- 工具栏 -->
    <Toolbar
      v-model:view-mode="viewMode"
      v-model:search-query="searchQuery"
      v-model:sort-by="sortBy"
      :selected-count="selectedCount"
      :has-duplicates="!!(duplicateResult && duplicateResult.totalGroups > 0)"
      @rebuild-index="handleRebuildIndex"
      @find-duplicates="handleFindDuplicates"
      @select-duplicates="handleSelectRedundantDuplicates"
      @delete-selected="handleDeleteSelected"
      @clear-selection="clearSelection"
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
          description="还没有任何资产"
        />

        <!-- 视图切换 -->
        <template v-else>
          <!-- 网格视图 -->
          <AssetGridView
            v-if="viewMode === 'grid'"
            :grouped-assets="groupedAssets"
            :duplicate-hashes="duplicateHashes"
            :selected-ids="selectedAssetIds"
            @selection-change="handleAssetSelection"
            @select="handleSelectAsset"
            @delete="handleDeleteAsset"
          />

          <!-- 列表视图 -->
          <AssetListView
            v-else
            :grouped-assets="groupedAssets"
            :duplicate-hashes="duplicateHashes"
            :selected-ids="selectedAssetIds"
            @selection-change="handleAssetSelection"
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
const handleSelectAsset = (asset: Asset) => {
  // TODO: 实现资产预览
  console.log('选中资产:', asset);
};

const handleDeleteAsset = (assetId: string) => {
  removeAsset(assetId);
  // 从选中项中移除
  if (selectedAssetIds.value.has(assetId)) {
    selectedAssetIds.value.delete(assetId);
  }
};

// --- 多选逻辑 ---

// 多选状态
const selectedAssetIds = ref<Set<string>>(new Set());
const lastSelectedAssetId = ref<string | null>(null);

// 选中项数量
const selectedCount = computed(() => selectedAssetIds.value.size);

const handleAssetSelection = (asset: Asset, event: MouseEvent) => {
  const assetId = asset.id;
  const currentIds = new Set(selectedAssetIds.value);

  if (event.shiftKey && lastSelectedAssetId.value) {
    const lastIndex = filteredAndSortedAssets.value.findIndex(a => a.id === lastSelectedAssetId.value);
    const currentIndex = filteredAndSortedAssets.value.findIndex(a => a.id === assetId);

    if (lastIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      for (let i = start; i <= end; i++) {
        currentIds.add(filteredAndSortedAssets.value[i].id);
      }
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (currentIds.has(assetId)) {
      currentIds.delete(assetId);
    } else {
      currentIds.add(assetId);
    }
  } else {
    // 普通点击：切换选中状态
    if (currentIds.size === 1 && currentIds.has(assetId)) {
      // 如果只有当前项被选中，则取消选中
      currentIds.clear();
    } else {
      // 否则清空其他选择，只选中当前项
      currentIds.clear();
      currentIds.add(assetId);
    }
  }

  selectedAssetIds.value = currentIds;
  lastSelectedAssetId.value = assetId;
};

const handleDeleteSelected = async () => {
  if (selectedCount.value === 0) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedCount.value} 个资产吗？文件将被移动到回收站。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    // 批量删除所有选中的资产
    const idsToDelete = Array.from(selectedAssetIds.value);
    for (const id of idsToDelete) {
      removeAsset(id);
    }
    
    // 清空选择
    selectedAssetIds.value.clear();
    lastSelectedAssetId.value = null;
    
    customMessage.success(`已成功删除 ${idsToDelete.length} 个资产`);
  } catch (err) {
    // 用户取消操作
    if (err !== 'cancel') {
      console.error('批量删除失败:', err);
    }
  }
};

const clearSelection = () => {
  selectedAssetIds.value.clear();
  lastSelectedAssetId.value = null;
};

const handleSelectRedundantDuplicates = () => {
  if (!duplicateResult.value || duplicateResult.value.totalGroups === 0) {
    customMessage.info('没有可供选择的重复文件。请先执行"查找重复"操作。');
    return;
  }

  const idsToSelect = new Set<string>();
  const allAssetIds = new Set(assets.value.map(a => a.id));

  duplicateResult.value.duplicates.forEach(group => {
    // 提取每个重复文件组中的 UUID
    const groupAssetIds = group.files.map(filePath => {
      const fileName = filePath.split('/').pop() || '';
      return fileName.split('.')[0];
    }).filter(id => allAssetIds.has(id)); // 确保文件仍在当前列表中

    // 找到这些 ID 对应的 Asset 对象
    const groupAssets = assets.value.filter(asset => groupAssetIds.includes(asset.id));
    
    // 按创建时间排序，保留最新的一个
    if (groupAssets.length > 1) {
      groupAssets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // 第一个之后的所有文件都视为多余副本
      for (let i = 1; i < groupAssets.length; i++) {
        idsToSelect.add(groupAssets[i].id);
      }
    }
  });

  if (idsToSelect.size === 0) {
    customMessage.success('未发现需要清理的多余重复文件。');
    return;
  }
  
  selectedAssetIds.value = idsToSelect;
  customMessage.success(`已自动选中 ${idsToSelect.size} 个多余的重复文件，请确认后删除。`);
};

// --- 分组逻辑 ---
const groupedAssets = computed(() => {
  const groups: { [key: string]: Asset[] } = {};
  
  filteredAndSortedAssets.value.forEach(asset => {
    const month = asset.createdAt.substring(0, 7); // YYYY-MM
    if (!groups[month]) {
      groups[month] = [];
    }
    groups[month].push(asset);
  });

  return Object.entries(groups)
    .sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
    .map(([month, assets]) => {
      const date = new Date(`${month}-01`);
      const label = date.toLocaleString('zh-CN', { month: 'long', year: 'numeric' });
      return { month, label, assets };
    });
});

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
  background-color: var(--bg-color);
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.sidebar-container {
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
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