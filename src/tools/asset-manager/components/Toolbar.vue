<template>
  <div class="asset-toolbar">
    <!-- 左侧操作区 -->
    <div class="toolbar-left">
      <el-button @click="handleRebuildIndex">
        <el-icon><Refresh /></el-icon>
        重建索引
      </el-button>
      <el-button @click="handleFindDuplicates">
        <el-icon><CopyDocument /></el-icon>
        查找重复
      </el-button>
      <el-button v-if="props.hasDuplicates" type="warning" plain @click="emit('selectDuplicates')">
        <el-icon><Finished /></el-icon>
        选中多余副本
      </el-button>
      <template v-if="props.selectedCount > 0">
        <el-divider direction="vertical" />
        <el-button type="danger" plain @click="emit('deleteSelected')">
          <el-icon><Delete /></el-icon>
          删除选中 ({{ props.selectedCount }})
        </el-button>
        <el-button @click="emit('clearSelection')">
          <el-icon><Close /></el-icon>
          取消选择
        </el-button>
      </template>
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
  Search,
  Grid,
  List,
  Refresh,
  CopyDocument,
  Delete,
  Close,
  Finished,
} from '@element-plus/icons-vue';

interface Props {
  viewMode: 'grid' | 'list';
  searchQuery: string;
  sortBy: 'name' | 'date' | 'size';
  selectedCount?: number;
  hasDuplicates?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedCount: 0,
  hasDuplicates: false,
});

const emit = defineEmits<{
  'update:viewMode': [value: 'grid' | 'list'];
  'update:searchQuery': [value: string];
  'update:sortBy': [value: 'name' | 'date' | 'size'];
  'rebuildIndex': [];
  'findDuplicates': [];
  'selectDuplicates': [];
  'clearSelection': [];
  'deleteSelected': [];
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

const handleRebuildIndex = () => {
  emit('rebuildIndex');
};

const handleFindDuplicates = () => {
  emit('findDuplicates');
};
</script>

<style scoped>
.asset-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: var(--sidebar-bg);
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