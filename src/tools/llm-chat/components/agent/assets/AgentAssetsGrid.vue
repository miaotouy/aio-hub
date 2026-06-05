<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Delete,
  Edit,
  CopyDocument,
  ZoomIn,
  VideoPlay,
  Headset,
} from "@element-plus/icons-vue";
import FileIcon from "@/components/common/FileIcon.vue";
import type { AgentAsset } from "../../../types";

interface Props {
  assets: AgentAsset[];
  agentId: string;
  isSelectionMode: boolean;
  selectedAssetIds: Set<string>;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "asset-click", asset: AgentAsset): void;
  (e: "toggle-selection", asset: AgentAsset): void;
  (e: "preview", asset: AgentAsset): void;
  (e: "copy-id", asset: AgentAsset): void;
  (e: "edit", asset: AgentAsset): void;
  (e: "delete", asset: AgentAsset): void;
  (e: "drag-start", ev: DragEvent, asset: AgentAsset): void;
  (e: "drag-end"): void;
}>();

// 格式化文件大小
const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "--";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

// 异步加载图片 URL 的组件逻辑
const AssetThumbnail = {
  props: ["asset", "agentId"],
  setup(props: any) {
    const src = ref("");

    invoke<string>("get_agent_asset_path", {
      agentId: props.agentId,
      assetPath: props.asset.path,
    }).then((path) => {
      src.value = convertFileSrc(path);
    });

    return { src };
  },
  template: `<img v-if="src" :src="src" class="w-full h-full object-cover" loading="lazy" />`,
};

// 异步加载缩略图 URL 的组件逻辑（用于音频封面等）
const ThumbnailPreview = {
  props: ["thumbnailPath", "agentId"],
  setup(props: any) {
    const src = ref("");
    const loaded = ref(false);

    if (props.thumbnailPath) {
      invoke<string>("get_agent_asset_path", {
        agentId: props.agentId,
        assetPath: props.thumbnailPath,
      })
        .then((path) => {
          src.value = convertFileSrc(path);
          loaded.value = true;
        })
        .catch(() => {
          loaded.value = false;
        });
    }

    return { src, loaded };
  },
  template: `
    <img v-if="loaded && src" :src="src" class="w-full h-full object-cover" loading="lazy" />
    <slot v-else name="fallback"></slot>
  `,
};
</script>

<template>
  <div class="assets-grid-container">
    <div class="assets-grid">
      <div
        v-for="asset in assets"
        :key="asset.path"
        class="asset-card"
        :class="{
          'is-selected': selectedAssetIds.has(asset.id),
          'is-selection-mode': isSelectionMode,
        }"
        draggable="true"
        @dragstart="emit('drag-start', $event, asset)"
        @dragend="emit('drag-end')"
        @click="emit('asset-click', asset)"
      >
        <!-- 选中遮罩 (Selection Mode) -->
        <div class="selection-overlay" v-if="isSelectionMode">
          <el-checkbox
            :model-value="selectedAssetIds.has(asset.id)"
            @change="emit('toggle-selection', asset)"
            @click.stop
          />
        </div>

        <!-- 预览区域 -->
        <div class="asset-preview">
          <!-- 图片类型 -->
          <component
            v-if="asset.type === 'image'"
            :is="AssetThumbnail"
            :asset="asset"
            :agent-id="agentId"
          />

          <!-- 音频类型（可能有封面缩略图） -->
          <template v-else-if="asset.type === 'audio'">
            <component
              v-if="asset.thumbnailPath"
              :is="ThumbnailPreview"
              :thumbnail-path="asset.thumbnailPath"
              :agent-id="agentId"
            >
              <template #fallback>
                <div class="generic-preview audio">
                  <el-icon :size="48"><Headset /></el-icon>
                </div>
              </template>
            </component>
            <div v-else class="generic-preview audio">
              <el-icon :size="48"><Headset /></el-icon>
            </div>
          </template>

          <!-- 其他类型 -->
          <div v-else class="generic-preview" :class="asset.type">
            <el-icon v-if="asset.type === 'video'" :size="48"
              ><VideoPlay
            /></el-icon>
            <FileIcon v-else :filename="asset.filename" :size="48" />
          </div>

          <!-- 悬停遮罩 (非选择模式下显示) -->
          <div class="asset-overlay" @click.stop v-if="!isSelectionMode">
            <div class="overlay-actions">
              <el-tooltip content="预览" :show-after="500" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="ZoomIn"
                  @click="emit('preview', asset)"
                />
              </el-tooltip>
              <el-tooltip
                content="复制引用路径"
                :show-after="500"
                placement="top"
              >
                <el-button
                  circle
                  size="small"
                  :icon="CopyDocument"
                  @click="emit('copy-id', asset)"
                />
              </el-tooltip>
              <el-tooltip content="编辑信息" :show-after="500" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="Edit"
                  type="primary"
                  plain
                  @click="emit('edit', asset)"
                />
              </el-tooltip>
              <el-tooltip content="删除" :show-after="500" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="Delete"
                  type="danger"
                  plain
                  @click="emit('delete', asset)"
                />
              </el-tooltip>
            </div>
          </div>

          <!-- 类型标签 -->
          <div class="asset-type-tag">
            {{ asset.type.toUpperCase() }}
          </div>
        </div>

        <!-- 信息区域 -->
        <div class="asset-info">
          <div class="asset-id" :title="asset.id">
            {{ asset.id }}
          </div>
          <div class="asset-meta">
            <span class="filename" :title="asset.filename">{{
              asset.filename
            }}</span>
            <span class="size">{{ formatSize(asset.size) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assets-grid-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  box-sizing: border-box;
}

.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.asset-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
}

.asset-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-color-primary-light-5);
}

.asset-card.is-selection-mode {
  cursor: pointer;
}

.asset-card.is-selected {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.selection-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  pointer-events: none;
}

.selection-overlay .el-checkbox {
  pointer-events: auto;
  --el-checkbox-bg-color: white;
}

.asset-preview {
  aspect-ratio: 1 / 1;
  position: relative;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.asset-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.generic-preview {
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.generic-preview.video {
  background-color: #f0f9eb;
  color: var(--el-color-success);
}

.generic-preview.audio {
  background-color: #fdf6ec;
  color: var(--el-color-warning);
}

.asset-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  backdrop-filter: blur(2px);
}

.asset-card:hover .asset-overlay {
  opacity: 1;
}

.overlay-actions {
  display: flex;
  gap: 8px;
  transform: translateY(10px);
  transition: transform 0.2s;
}

.asset-card:hover .overlay-actions {
  transform: translateY(0);
}

.asset-type-tag {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
  font-weight: bold;
}

.asset-info {
  padding: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.asset-id {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.filename {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.size {
  flex-shrink: 0;
  font-family: monospace;
}
</style>
