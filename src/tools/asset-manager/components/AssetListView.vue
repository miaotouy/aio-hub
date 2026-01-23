<template>
  <div class="asset-list-view">
    <el-table
      :data="assets"
      style="width: 100%"
      :row-class-name="getRowClassName"
      @row-click="
        (row: Asset, _column: any, event: MouseEvent) => emit('selection-change', row, event)
      "
    >
      <!-- 复选框列 -->
      <el-table-column width="45" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="props.selectedIds.has(row.id)"
            size="large"
            @click.stop="(e: MouseEvent) => emit('selection-change', row, e)"
          />
        </template>
      </el-table-column>

      <!-- 文件类型图标 -->
      <el-table-column width="60" align="center">
        <template #default="{ row }">
          <div class="type-icon">
            <AssetIcon
              :asset="row"
              :asset-url="getAssetUrl(row)"
              :icon-size="32"
              :video-icon-size="12"
              class="list-thumbnail"
            />
          </div>
        </template>
      </el-table-column>

      <!-- 文件名 -->
      <el-table-column prop="name" label="文件名" min-width="200">
        <template #default="{ row }">
          <div class="file-name">
            {{ row.name }}
            <el-tag
              v-if="props.duplicateHashes.has(row.id)"
              size="small"
              type="warning"
              effect="plain"
            >
              重复
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <!-- 文件类型 -->
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info">
            {{ getTypeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 文件大小 -->
      <el-table-column label="大小" width="100">
        <template #default="{ row }">
          {{ formatFileSize(row.size) }}
        </template>
      </el-table-column>

      <!-- 来源 -->
      <el-table-column label="来源" width="180">
        <template #default="{ row }">
          <div v-if="row.origins && row.origins.length > 0" class="origins-cell">
            <el-tag
              v-for="(origin, index) in row.origins.slice(0, 2)"
              :key="index"
              size="small"
              type="info"
              effect="plain"
            >
              {{ getOriginDisplayText(origin) }}
            </el-tag>
            <el-tag v-if="row.origins.length > 2" size="small" type="info" effect="plain">
              +{{ row.origins.length - 2 }}
            </el-tag>
          </div>
          <span v-else class="text-secondary">未知</span>
        </template>
      </el-table-column>

      <!-- 导入时间 -->
      <el-table-column label="导入时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="80" fixed="right" align="center">
        <template #default="{ row }">
          <el-dropdown trigger="click" @click.stop>
            <el-button text circle>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleSelect(row)">
                  <el-icon><View /></el-icon>
                  预览
                </el-dropdown-item>
                <el-dropdown-item @click="handleShowInFolder(row.path)">
                  <el-icon><FolderOpened /></el-icon>
                  打开所在目录
                </el-dropdown-item>
                <!-- 动态附属操作 -->
                <template v-for="action in getSidecarActions(row)" :key="action.id">
                  <el-dropdown-item
                    :divided="action.divided"
                    @click="action.handler(row)"
                  >
                    <el-icon v-if="action.icon">
                      <component :is="action.icon" />
                    </el-icon>
                    {{ action.label }}
                  </el-dropdown-item>
                </template>
                <el-dropdown-item divided @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { View, Delete, MoreFilled, FolderOpened } from "@element-plus/icons-vue";
import type { Asset } from "@/types/asset-management";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import { getTypeLabel, getOriginDisplayText } from "../utils/displayUtils";
import AssetIcon from "./AssetIcon.vue";

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
  assetUrls: Map<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
  assetUrls: () => new Map(),
});

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
  "selection-change": [asset: Asset, event: MouseEvent];
  "show-in-folder": [path: string];
}>();

const { getSidecarActions } = useAssetManager();

// 获取资产的 URL
const getAssetUrl = (asset: Asset): string => {
  return props.assetUrls.get(asset.id) || "";
};

const handleSelect = (asset: Asset) => {
  emit("select", asset);
};

const handleDelete = (assetId: string) => {
  emit("delete", assetId);
};

const handleShowInFolder = (path: string) => {
  emit("show-in-folder", path);
};

const formatFileSize = (bytes: number) => {
  return assetManagerEngine.formatFileSize(bytes);
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getRowClassName = ({ row }: { row: Asset }) => {
  const classes = [];
  if (props.duplicateHashes.has(row.id)) {
    classes.push("duplicate-row");
  }
  if (props.selectedIds.has(row.id)) {
    classes.push("selected-row");
  }
  return classes.join(" ");
};
</script>

<style scoped>
.asset-list-view {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.emoji-icon {
  font-size: 24px;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-secondary {
  color: var(--el-text-color-secondary);
}

.origins-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

:deep(.el-table__row) {
  cursor: pointer;
  user-select: none;
}

:deep(.el-table__row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
}

:deep(.el-table__row.duplicate-row .el-table__cell) {
  background-color: color-mix(in srgb, var(--el-color-warning) 15%, transparent) !important;
}

:deep(.el-table__row.duplicate-row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--el-color-warning) 25%, transparent) !important;
}

:deep(.el-table__row.selected-row .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 20%, transparent) !important;
}

:deep(.el-table__row.selected-row:hover .el-table__cell) {
  background-color: color-mix(in srgb, var(--primary-color) 30%, transparent) !important;
}
.el-table {
  box-sizing: border-box;
  background-color: var(--container-bg);
  padding: 8px;
  border-radius: 8px;
}
</style>
