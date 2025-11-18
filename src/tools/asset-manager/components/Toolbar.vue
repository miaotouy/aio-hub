<template>
  <div ref="toolbarRef" class="asset-toolbar" :class="layoutClass">
    <!-- 左侧操作区 -->
    <div class="toolbar-left">
      <el-tooltip
        :content="props.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        placement="bottom"
      >
        <el-button @click="emit('toggle-sidebar')">
          <el-icon>
            <Expand v-if="props.sidebarCollapsed" />
            <Fold v-else />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="刷新列表" placement="bottom">
        <el-button @click="emit('refresh')">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </el-tooltip>
      <el-divider direction="vertical" />
      <el-dropdown>
        <el-button>
          <el-icon><MoreFilled /></el-icon>
          <span>文件操作</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="Refresh" @click="handleRebuildIndex">
              重建索引
            </el-dropdown-item>
            <el-dropdown-item
              v-if="!props.hasDuplicates"
              :icon="CopyDocument"
              @click="emit('findDuplicates')"
            >
              查找重复文件
            </el-dropdown-item>
            <template v-else>
              <el-dropdown-item :icon="Close" @click="emit('clearDuplicates')">
                清除重复标记
              </el-dropdown-item>
              <el-dropdown-item
                :icon="Finished"
                class="warning-item"
                @click="emit('selectDuplicates')"
              >
                自动选中副本
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <template v-if="props.selectedCount > 0">
        <el-divider direction="vertical" />
        <el-tooltip content="删除已选中的资产文件" placement="bottom">
          <el-button type="danger" plain @click="emit('deleteSelected')">
            <el-icon><Delete /></el-icon>
            <span v-if="layoutMode !== 'compact'">删除选中 ({{ props.selectedCount }})</span>
            <span v-else>({{ props.selectedCount }})</span>
          </el-button>
        </el-tooltip>
        <el-tooltip content="取消当前选择" placement="bottom">
          <el-button @click="emit('clearSelection')">
            <el-icon><Close /></el-icon>
            <span v-if="layoutMode === 'wide'">取消选择</span>
          </el-button>
        </el-tooltip>
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
      <!-- 分组方式 -->
      <div class="selector-group">
        <span v-if="layoutMode === 'wide'" class="selector-label">分组:</span>
        <el-tooltip content="选择资产分组方式" placement="bottom">
          <el-select
            v-model="internalGroupBy"
            placeholder="分组方式"
            @change="handleGroupByChange"
            :style="{ width: layoutMode === 'compact' ? '110px' : '140px' }"
          >
            <el-option label="按月份" value="month" />
            <el-option label="按类型" value="type" />
            <el-option label="按来源" value="origin" />
            <el-option label="按来源模块" value="source-module" />
            <el-option label="不分组" value="none" />
          </el-select>
        </el-tooltip>
      </div>

      <!-- 排序方式 -->
      <div class="selector-group">
        <span v-if="layoutMode === 'wide'" class="selector-label">排序:</span>
        <el-tooltip content="选择资产排序方式" placement="bottom">
          <el-select
            v-model="internalSortBy"
            placeholder="排序方式"
            @change="handleSortChange"
            :style="{ width: layoutMode === 'compact' ? '100px' : '120px' }"
          >
            <el-option label="按时间" value="date" />
            <el-option label="按名称" value="name" />
            <el-option label="按大小" value="size" />
          </el-select>
        </el-tooltip>
      </div>

      <!-- 视图切换 -->
      <el-radio-group v-model="internalViewMode" @change="handleViewModeChange">
        <el-tooltip content="网格视图" placement="bottom">
          <el-radio-button value="grid">
            <el-icon><Grid /></el-icon>
          </el-radio-button>
        </el-tooltip>
        <el-tooltip content="列表视图" placement="bottom">
          <el-radio-button value="list">
            <el-icon><List /></el-icon>
          </el-radio-button>
        </el-tooltip>
      </el-radio-group>

      <!-- 网格视图尺寸切换 -->
      <el-radio-group
        v-if="internalViewMode === 'grid'"
        v-model="internalGridCardSize"
        size="medium"
        style="margin-left: 8px"
        @change="handleGridCardSizeChange"
      >
        <el-tooltip content="大卡片" placement="bottom">
          <el-radio-button value="large">大</el-radio-button>
        </el-tooltip>
        <el-tooltip content="中卡片" placement="bottom">
          <el-radio-button value="medium">中</el-radio-button>
        </el-tooltip>
        <el-tooltip content="小卡片" placement="bottom">
          <el-radio-button value="small">小</el-radio-button>
        </el-tooltip>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useElementSize } from "@vueuse/core";
import {
  Search,
  Grid,
  List,
  Refresh,
  CopyDocument,
  Delete,
  Close,
  Finished,
  Expand,
  Fold,
  MoreFilled,
} from "@element-plus/icons-vue";

interface Props {
  viewMode: "grid" | "list";
  searchQuery: string;
  sortBy: "name" | "date" | "size";
  groupBy: "month" | "type" | "origin" | "source-module" | "none";
  gridCardSize?: "large" | "medium" | "small";
  selectedCount?: number;
  hasDuplicates?: boolean;
  sidebarCollapsed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedCount: 0,
  hasDuplicates: false,
  sidebarCollapsed: false,
  gridCardSize: "medium",
});

const emit = defineEmits<{
  "update:viewMode": [value: "grid" | "list"];
  "update:searchQuery": [value: string];
  "update:sortBy": [value: "name" | "date" | "size"];
  "update:groupBy": [value: "month" | "type" | "origin" | "source-module" | "none"];
  "update:gridCardSize": [value: "large" | "medium" | "small"];
  rebuildIndex: [];
  findDuplicates: [];
  selectDuplicates: [];
  clearDuplicates: [];
  clearSelection: [];
  deleteSelected: [];
  "toggle-sidebar": [];
  refresh: [];
}>();

// 容器宽度检测
const toolbarRef = ref<HTMLElement | null>(null);
const { width: toolbarWidth } = useElementSize(toolbarRef);

// 布局模式：根据容器宽度自动调整
// wide: > 1100px - 显示所有文字和标签
// medium: 880-1100px - 隐藏部分标签，保留重要按钮文字
// compact: < 880px - 只显示图标，隐藏大部分文字
const layoutMode = computed<"wide" | "medium" | "compact">(() => {
  if (toolbarWidth.value > 1100) return "wide";
  if (toolbarWidth.value > 880) return "medium";
  return "compact";
});

// 布局 CSS 类
const layoutClass = computed(() => `layout-${layoutMode.value}`);

// 内部状态
const internalViewMode = ref(props.viewMode);
const internalSearchQuery = ref(props.searchQuery);
const internalSortBy = ref(props.sortBy);
const internalGroupBy = ref(props.groupBy);
const internalGridCardSize = ref(props.gridCardSize);

// 监听 props 变化
watch(
  () => props.viewMode,
  (newVal) => {
    internalViewMode.value = newVal;
  }
);

watch(
  () => props.searchQuery,
  (newVal) => {
    internalSearchQuery.value = newVal;
  }
);

watch(
  () => props.sortBy,
  (newVal) => {
    internalSortBy.value = newVal;
  }
);

watch(
  () => props.groupBy,
  (newVal) => {
    internalGroupBy.value = newVal;
  }
);

watch(
  () => props.gridCardSize,
  (newVal) => {
    internalGridCardSize.value = newVal;
  }
);

// 事件处理
const handleViewModeChange = (value: "grid" | "list") => {
  emit("update:viewMode", value);
};

const handleSearchInput = (value: string) => {
  emit("update:searchQuery", value);
};

const handleSortChange = (value: "name" | "date" | "size") => {
  emit("update:sortBy", value);
};

const handleGroupByChange = (value: "month" | "type" | "origin" | "source-module" | "none") => {
  emit("update:groupBy", value);
};

const handleGridCardSizeChange = (value: "large" | "medium" | "small") => {
  emit("update:gridCardSize", value);
};

const handleRebuildIndex = () => {
  emit("rebuildIndex");
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
  backdrop-filter: blur(var(--ui-blur));
  transition: all 0.3s ease;
}

/* 宽屏布局 (> 1100px) */
.asset-toolbar.layout-wide {
  flex-wrap: nowrap;
}

.asset-toolbar.layout-wide .toolbar-left {
  flex-shrink: 0;
  flex-wrap: nowrap;
}

.asset-toolbar.layout-wide .toolbar-center {
  flex: 1;
  max-width: 400px;
  min-width: 200px;
}

.asset-toolbar.layout-wide .toolbar-right {
  flex-shrink: 0;
}

/* 中等布局 (800-1100px) */
.asset-toolbar.layout-medium {
  flex-wrap: nowrap;
}

.asset-toolbar.layout-medium .toolbar-left {
  flex-shrink: 1;
  flex-wrap: nowrap;
}

.asset-toolbar.layout-medium .toolbar-center {
  flex: 1;
  max-width: 300px;
  min-width: 150px;
}

.asset-toolbar.layout-medium .toolbar-right {
  flex-shrink: 0;
  gap: 8px;
}

/* 紧凑布局 (< 800px) */
.asset-toolbar.layout-compact {
  flex-wrap: wrap;
  gap: 8px;
}

.asset-toolbar.layout-compact .toolbar-left {
  flex: 1 1 auto;
  min-width: 200px;
}

.asset-toolbar.layout-compact .toolbar-center {
  flex: 1 1 100%;
  max-width: 100%;
  order: 3;
}

.asset-toolbar.layout-compact .toolbar-right {
  flex: 0 1 auto;
  gap: 6px;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-center {
  flex: 1;
  max-width: 400px;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: nowrap;
}

.selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  transition: opacity 0.3s ease;
}

/* 按钮内文字过渡效果 */
.el-button span {
  transition: all 0.3s ease;
}

/* 响应式调整间距 */
.layout-compact .toolbar-left {
  gap: 4px;
}

.layout-compact .selector-group {
  gap: 4px;
}

:deep(.el-dropdown-menu__item.warning-item) {
  color: var(--el-color-warning);
}
:deep(.el-dropdown-menu__item.warning-item:hover),
:deep(.el-dropdown-menu__item.warning-item:focus) {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}
</style>
