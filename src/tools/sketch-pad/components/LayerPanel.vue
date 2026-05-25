<template>
  <div class="layer-panel-float" :class="{ collapsed: isCollapsed }">
    <!-- 折叠状态下的触发按钮 -->
    <button v-if="isCollapsed" class="panel-toggle" title="展开图层面板" @click="isCollapsed = false">
      <Layers :size="18" />
    </button>

    <!-- 展开状态的面板 -->
    <div v-else class="panel-body">
      <div class="panel-header">
        <span class="panel-title">图层</span>
        <div class="header-actions">
          <!-- 新建图层按钮组 -->
          <button class="header-btn" title="新建位图图层" @click="handleCreateLayer('raster')">
            <Paintbrush :size="14" />
          </button>
          <button class="header-btn" title="新建对象图层" @click="handleCreateLayer('object')">
            <Shapes :size="14" />
          </button>
          <button class="panel-close" title="收起" @click="isCollapsed = true">
            <ChevronDown :size="16" />
          </button>
        </div>
      </div>

      <!-- 图层列表 -->
      <div class="layer-list">
        <div
          v-for="(layer, index) in layers"
          :key="layer.id"
          class="layer-item"
          :class="{ active: layer.id === activeLayerId }"
          @click="selectLayer(layer.id)"
        >
          <!-- 可见性 -->
          <button class="icon-btn" :title="layer.visible ? '隐藏' : '显示'" @click.stop="toggleVisible(layer.id)">
            <component :is="layer.visible ? Eye : EyeOff" :size="13" />
          </button>

          <!-- 锁定 -->
          <button class="icon-btn" :title="layer.locked ? '解锁' : '锁定'" @click.stop="toggleLocked(layer.id)">
            <component :is="layer.locked ? Lock : Unlock" :size="13" />
          </button>

          <!-- 类型图标 + 名称 -->
          <span class="layer-type-icon">
            <component :is="layer.type === 'raster' ? Paintbrush : Shapes" :size="12" />
          </span>
          <span class="layer-name">{{ layer.name }}</span>

          <!-- 排序按钮 -->
          <div class="layer-order">
            <button class="icon-btn mini" :disabled="index === 0" @click.stop="moveLayer(index, -1)">
              <ChevronUp :size="12" />
            </button>
            <button class="icon-btn mini" :disabled="index === layers.length - 1" @click.stop="moveLayer(index, 1)">
              <ChevronDown :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="panel-footer">
        <button class="footer-btn danger" :disabled="layers.length <= 1" title="删除图层" @click="deleteActiveLayer">
          <Trash2 :size="13" />
        </button>
        <button
          class="footer-btn"
          :disabled="layers.length <= 1 || activeLayerIndex === layers.length - 1"
          title="向下合并"
          @click="mergeDown"
        >
          <Merge :size="13" />
        </button>
        <button
          class="footer-btn"
          :disabled="!activeLayer || activeLayer.type !== 'object'"
          title="栅格化"
          @click="rasterizeActiveLayer"
        >
          <Grid3x3 :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Layers,
  Paintbrush,
  Shapes,
  Merge,
  Grid3x3,
} from "lucide-vue-next";
import type { HybridLayer } from "../types";

const isCollapsed = ref(true);

const props = defineProps<{
  layers: HybridLayer[];
  activeLayerId: string;
}>();

const emit = defineEmits<{
  (e: "create-layer", type: "raster" | "object"): void;
  (e: "delete-layer", id: string): void;
  (e: "select-layer", id: string): void;
  (e: "toggle-visible", id: string): void;
  (e: "toggle-locked", id: string): void;
  (e: "reorder-layers", newOrder: string[]): void;
  (e: "merge-down", id: string): void;
  (e: "rasterize-layer", id: string): void;
}>();

const activeLayerIndex = computed(() => {
  return props.layers.findIndex((l) => l.id === props.activeLayerId);
});

const activeLayer = computed(() => {
  return props.layers.find((l) => l.id === props.activeLayerId) || null;
});

function handleCreateLayer(type: "raster" | "object") {
  emit("create-layer", type);
}

function selectLayer(id: string) {
  emit("select-layer", id);
}

function toggleVisible(id: string) {
  emit("toggle-visible", id);
}

function toggleLocked(id: string) {
  emit("toggle-locked", id);
}

function moveLayer(index: number, direction: number) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= props.layers.length) return;

  const newLayers = [...props.layers];
  const [moved] = newLayers.splice(index, 1);
  newLayers.splice(newIndex, 0, moved);

  emit(
    "reorder-layers",
    newLayers.map((l) => l.id),
  );
}

function deleteActiveLayer() {
  if (props.activeLayerId) {
    emit("delete-layer", props.activeLayerId);
  }
}

function mergeDown() {
  if (props.activeLayerId) {
    emit("merge-down", props.activeLayerId);
  }
}

function rasterizeActiveLayer() {
  if (props.activeLayerId) {
    emit("rasterize-layer", props.activeLayerId);
  }
}
</script>

<style scoped>
.layer-panel-float {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 100;
}

.layer-panel-float.collapsed .panel-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  color: var(--el-text-color-regular);
  cursor: pointer;
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transition: all 0.15s ease;
}

.panel-toggle:hover {
  background: rgba(var(--primary-color-rgb), 0.08);
  color: var(--el-text-color-primary);
}

.panel-body {
  width: 220px;
  max-height: 320px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--primary-color-rgb), 0.06);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.12s;
}

.header-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.12);
  color: var(--el-text-color-primary);
}

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s;
  margin-left: 4px;
}

.panel-close:hover {
  background: rgba(var(--primary-color-rgb), 0.08);
  color: var(--el-text-color-primary);
}

.layer-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}

.layer-item:hover {
  background: rgba(var(--primary-color-rgb), 0.06);
}

.layer-item.active {
  background: rgba(var(--primary-color-rgb), 0.15);
  border-color: rgba(var(--primary-color-rgb), 0.25);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--el-text-color-primary);
}

.icon-btn.mini {
  width: 18px;
  height: 18px;
}

.icon-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.layer-type-icon {
  display: flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.layer-name {
  flex: 1;
  font-size: 11px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-order {
  display: flex;
  flex-direction: column;
  gap: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.layer-item:hover .layer-order {
  opacity: 1;
}

.panel-footer {
  padding: 8px 10px;
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  gap: 4px;
  justify-content: center;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--primary-color-rgb), 0.06);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.12s;
}

.footer-btn:hover:not(:disabled) {
  background: rgba(var(--primary-color-rgb), 0.12);
  color: var(--el-text-color-primary);
}

.footer-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.footer-btn.danger:hover:not(:disabled) {
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.2);
  color: var(--el-color-danger);
}
</style>
