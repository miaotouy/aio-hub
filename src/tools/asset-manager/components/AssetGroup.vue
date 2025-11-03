<template>
  <div class="asset-group">
    <div class="group-header">
      <div class="header-left">
        <h3 class="group-title">{{ label }}</h3>
        <span class="asset-count">{{ assets.length }} 个文件</span>
      </div>
      <div class="header-actions">
        <el-button
          size="small"
          :type="isAllSelected ? 'primary' : 'default'"
          @click="handleToggleSelectAll"
        >
          {{ isAllSelected ? '取消全选' : '全选' }}
        </el-button>
      </div>
    </div>
    
    <div class="group-content">
      <!-- 网格视图 -->
      <AssetGridView
        v-if="viewMode === 'grid'"
        :assets="assets"
        :duplicate-hashes="duplicateHashes"
        :selected-ids="selectedIds"
        @selection-change="(asset, event) => emit('selection-change', asset, event)"
        @select="(asset) => emit('select', asset)"
        @delete="(assetId) => emit('delete', assetId)"
      />
      
      <!-- 列表视图 -->
      <AssetListView
        v-else
        :assets="assets"
        :duplicate-hashes="duplicateHashes"
        :selected-ids="selectedIds"
        @selection-change="(asset, event) => emit('selection-change', asset, event)"
        @select="(asset) => emit('select', asset)"
        @delete="(assetId) => emit('delete', assetId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Asset } from '@/types/asset-management';
import AssetGridView from './AssetGridView.vue';
import AssetListView from './AssetListView.vue';

interface Props {
  groupKey: string;
  label: string;
  assets: Asset[];
  viewMode: 'grid' | 'list';
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
}

const props = withDefaults(defineProps<Props>(), {
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
});

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
  'selection-change': [asset: Asset, event: MouseEvent];
  'select-all': [assetIds: string[]];
  'deselect-all': [assetIds: string[]];
}>();

// 判断当前分组的所有资产是否全部被选中
const isAllSelected = computed(() => {
  if (props.assets.length === 0) return false;
  return props.assets.every(asset => props.selectedIds.has(asset.id));
});

// 切换全选/取消全选
const handleToggleSelectAll = () => {
  const assetIds = props.assets.map(asset => asset.id);
  if (isAllSelected.value) {
    emit('deselect-all', assetIds);
  } else {
    emit('select-all', assetIds);
  }
};
</script>

<style scoped>
.asset-group {
  margin-bottom: 24px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  margin-bottom: 16px;
  border-radius: 4px;
  background-color: var(--sidebar-bg);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
}

.group-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

.asset-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.group-content {
  width: 100%;
}
</style>