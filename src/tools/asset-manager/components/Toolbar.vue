<template>
  <div class="asset-toolbar">
    <!-- 左侧操作区 -->
    <div class="toolbar-left">
      <el-button type="primary" @click="handleImportFiles">
        <el-icon><FolderOpened /></el-icon>
        导入文件
      </el-button>
      <el-button @click="handleImportFromClipboard">
        <el-icon><DocumentCopy /></el-icon>
        从剪贴板导入
      </el-button>
      <el-button @click="handleRebuildIndex">
        <el-icon><Refresh /></el-icon>
        重建索引
      </el-button>
    </div>

    <!-- 中间搜索区 -->
    <div class="toolbar-center">
      <el-input
        v-model="internalSearchQuery"
        placeholder="搜索资产..."
        clearable
        @input="handleSearchInput"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 右侧控制区 -->
    <div class="toolbar-right">
      <!-- 排序方式 -->
      <el-select
        v-model="internalSortBy"
        placeholder="排序方式"
        @change="handleSortChange"
        style="width: 120px"
      >
        <el-option label="按时间" value="date" />
        <el-option label="按名称" value="name" />
        <el-option label="按大小" value="size" />
      </el-select>

      <!-- 视图切换 -->
      <el-radio-group
        v-model="internalViewMode"
        @change="handleViewModeChange"
      >
        <el-radio-button label="grid">
          <el-icon><Grid /></el-icon>
        </el-radio-button>
        <el-radio-button label="list">
          <el-icon><List /></el-icon>
        </el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  FolderOpened,
  DocumentCopy,
  Search,
  Grid,
  List,
  Refresh,
} from '@element-plus/icons-vue';

interface Props {
  viewMode: 'grid' | 'list';
  searchQuery: string;
  sortBy: 'name' | 'date' | 'size';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:viewMode': [value: 'grid' | 'list'];
  'update:searchQuery': [value: string];
  'update:sortBy': [value: 'name' | 'date' | 'size'];
  'importFiles': [];
  'importFromClipboard': [];
  'rebuildIndex': [];
}>();

// 内部状态
const internalViewMode = ref(props.viewMode);
const internalSearchQuery = ref(props.searchQuery);
const internalSortBy = ref(props.sortBy);

// 监听 props 变化
watch(() => props.viewMode, (newVal) => {
  internalViewMode.value = newVal;
});

watch(() => props.searchQuery, (newVal) => {
  internalSearchQuery.value = newVal;
});

watch(() => props.sortBy, (newVal) => {
  internalSortBy.value = newVal;
});

// 事件处理
const handleViewModeChange = (value: 'grid' | 'list') => {
  emit('update:viewMode', value);
};

const handleSearchInput = (value: string) => {
  emit('update:searchQuery', value);
};

const handleSortChange = (value: 'name' | 'date' | 'size') => {
  emit('update:sortBy', value);
};

const handleImportFiles = () => {
  emit('importFiles');
};

const handleImportFromClipboard = () => {
  emit('importFromClipboard');
};

const handleRebuildIndex = () => {
  emit('rebuildIndex');
};
</script>

<style scoped>
.asset-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  box-sizing: border-box;
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.toolbar-center {
  flex: 1;
  max-width: 400px;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>