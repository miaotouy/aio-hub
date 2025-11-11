<template>
  <div class="asset-sidebar">
    <!-- 统计信息 -->
    <div class="stats-section">
      <h3 class="section-title">资产统计</h3>
      <div class="stat-item">
        <span class="stat-label">总数量</span>
        <span class="stat-value">{{ totalAssets }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总大小</span>
        <span class="stat-value">{{ formatSize(totalSize) }}</span>
      </div>
    </div>

    <el-divider />

    <!-- 按类型筛选 -->
    <div class="filter-section">
      <h3 class="section-title">文件类型</h3>
      <el-radio-group v-model="internalSelectedType" @change="handleTypeChange">
        <el-radio value="all" class="filter-radio">
          <div class="radio-content">
            <span>全部</span>
            <span class="count">{{ totalAssets }}</span>
          </div>
        </el-radio>
        <el-radio value="image" class="filter-radio">
          <div class="radio-content">
            <span>📷 图片</span>
            <span class="count">{{ typeCounts.image }}</span>
          </div>
        </el-radio>
        <el-radio value="video" class="filter-radio">
          <div class="radio-content">
            <span>🎬 视频</span>
            <span class="count">{{ typeCounts.video }}</span>
          </div>
        </el-radio>
        <el-radio value="audio" class="filter-radio">
          <div class="radio-content">
            <span>🎵 音频</span>
            <span class="count">{{ typeCounts.audio }}</span>
          </div>
        </el-radio>
        <el-radio value="document" class="filter-radio">
          <div class="radio-content">
            <span>📄 文档</span>
            <span class="count">{{ typeCounts.document }}</span>
          </div>
        </el-radio>
        <el-radio value="other" class="filter-radio">
          <div class="radio-content">
            <span>📎 其他</span>
            <span class="count">{{ typeCounts.other }}</span>
          </div>
        </el-radio>
      </el-radio-group>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AssetType, AssetStats } from '@/types/asset-management';
import { assetManagerEngine } from '@/composables/useAssetManager';

interface Props {
  selectedType: AssetType | 'all';
  totalAssets: number;
  totalSize: number;
  typeCounts: AssetStats['typeCounts'];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:selectedType': [value: AssetType | 'all'];
  'update:showDuplicatesOnly': [value: boolean];
}>();

// 内部状态
const internalSelectedType = ref(props.selectedType);

// 监听 props 变化
watch(() => props.selectedType, (newVal) => {
  internalSelectedType.value = newVal;
});

// 事件处理
const handleTypeChange = (value: string | number | boolean) => {
  emit('update:selectedType', value as AssetType | 'all');
};

// 格式化文件大小
const formatSize = (bytes: number) => {
  return assetManagerEngine.formatFileSize(bytes);
};
</script>

<style scoped>
.asset-sidebar {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 12px 0;
}

.stats-section {
  margin-bottom: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}

.stat-label {
  color: var(--el-text-color-secondary);
}

.stat-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.filter-section {
  margin-bottom: 8px;
}

.filter-radio {
  width: 100%;
  margin: 0;
  padding: 8px 0;
  height: auto;
}

.filter-radio :deep(.el-radio__label) {
  width: 100%;
  padding-left: 8px;
}

.radio-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 13px;
}

.count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.el-divider {
  margin: 16px 0;
}
</style>