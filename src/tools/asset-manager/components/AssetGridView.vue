<template>
  <div class="asset-grid-view">
    <div :class="['grid-container', `size-${props.gridCardSize}`]">
      <div
        v-for="asset in assets"
        :key="asset.id"
        :data-asset-id="asset.id"
        :class="[
          'asset-card',
          { 'is-duplicate': props.duplicateHashes.has(asset.id) },
          { 'is-selected': props.selectedIds.has(asset.id) },
        ]"
        @click="emit('selection-change', asset, $event)"
      >
        <!-- 复选框 -->
        <el-checkbox
          :model-value="props.selectedIds.has(asset.id)"
          class="selection-checkbox"
          size="large"
          @click.stop="emit('selection-change', asset, $event)"
        />
        <!-- 缩略图或图标 -->
        <div class="asset-preview" @click.stop="handleSelect(asset)">
          <AssetIcon
            :asset="asset"
            :asset-url="props.assetUrls.get(asset.id)"
            :icon-size="48"
            :video-icon-size="24"
            :show-loading="true"
            class="grid-thumbnail"
          />
        </div>
        <!-- 文件信息 -->
        <div class="asset-info">
          <div class="asset-name" :title="asset.name">
            {{ asset.name }}
            <el-tag
              v-if="props.duplicateHashes.has(asset.id)"
              size="small"
              type="warning"
              effect="plain"
            >
              重复
            </el-tag>
          </div>
          <div class="asset-meta">
            <span class="asset-size">{{ formatFileSize(asset.size) }}</span>
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
                    <el-dropdown-item @click="handleShowInFolder(asset.path)">
                      <el-icon><FolderOpened /></el-icon>
                      打开所在目录
                    </el-dropdown-item>
                    <!-- 动态附属操作 -->
                    <template v-for="action in getSidecarActions(asset)" :key="action.id">
                      <el-dropdown-item :divided="action.divided" @click="action.handler(asset)">
                        <el-icon v-if="action.icon">
                          <component :is="action.icon" />
                        </el-icon>
                        {{ action.label }}
                      </el-dropdown-item>
                    </template>
                    <el-dropdown-item divided @click="handleDelete(asset.id)">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { MoreFilled, View, Delete, FolderOpened } from "@element-plus/icons-vue";
import type { Asset } from "@/types/asset-management";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import AssetIcon from "./AssetIcon.vue";

interface Props {
  assets: Asset[];
  duplicateHashes?: Set<string>;
  selectedIds?: Set<string>;
  assetUrls: Map<string, string>;
  gridCardSize?: "large" | "medium" | "small";
}

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  duplicateHashes: () => new Set(),
  selectedIds: () => new Set(),
  assetUrls: () => new Map(),
  gridCardSize: "medium",
});

const emit = defineEmits<{
  select: [asset: Asset];
  delete: [assetId: string];
  "selection-change": [asset: Asset, event: MouseEvent];
  "show-in-folder": [path: string];
}>();

const { getSidecarActions } = useAssetManager();

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

.grid-container.size-small {
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.grid-container.size-large {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
  user-select: none;
  backdrop-filter: blur(var(--ui-blur));
}

.asset-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}
.asset-card:hover .selection-checkbox {
  opacity: 1;
}

.asset-card.is-selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 30%, transparent);
}
.asset-card.is-selected:hover {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 40%, transparent);
}
.asset-card.is-selected .selection-checkbox {
  opacity: 1;
}

.asset-card.is-duplicate {
  border-color: var(--el-color-warning);
  background-color: color-mix(in srgb, var(--el-color-warning) 15%, transparent);
}

.asset-preview {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--container-bg);
  overflow: hidden;
}

.grid-thumbnail {
  width: 100%;
  height: 100%;
}

.asset-info {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  align-items: flex-end;
}

.asset-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.asset-card:hover .asset-actions {
  opacity: 1;
}

.selection-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: all;
}
</style>
