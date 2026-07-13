<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="layer-panel-float" :class="{ collapsed: isCollapsed }">
    <!-- 折叠状态下的触发按钮 -->
    <button
      v-if="isCollapsed"
      class="panel-toggle"
      title="展开图层面板"
      @click="isCollapsed = false"
    >
      <Layers :size="18" />
    </button>

    <!-- 展开状态的面板 -->
    <div v-else class="panel-body">
      <div class="panel-header">
        <span class="panel-title">图层</span>
        <div class="header-actions">
          <!-- 新建图层按钮组 -->
          <button
            class="header-btn"
            title="新建填充图层"
            @click="handleCreateLayer('background')"
          >
            <PaintBucket :size="14" />
          </button>
          <button
            class="header-btn"
            title="新建位图图层"
            @click="handleCreateLayer('raster')"
          >
            <Paintbrush :size="14" />
          </button>
          <button
            class="header-btn"
            title="新建对象图层"
            @click="handleCreateLayer('object')"
          >
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
          class="layer-group"
        >
          <!-- 图层条目 -->
          <div
            class="layer-item"
            :class="{ active: layer.id === activeLayerId }"
            @click="selectLayer(layer.id)"
          >
            <!-- 可见性 -->
            <button
              class="icon-btn"
              :title="layer.visible ? '隐藏' : '显示'"
              @click.stop="toggleVisible(layer.id)"
            >
              <component :is="layer.visible ? Eye : EyeOff" :size="13" />
            </button>

            <!-- 锁定 -->
            <button
              class="icon-btn"
              :title="layer.locked ? '解锁' : '锁定'"
              @click.stop="toggleLocked(layer.id)"
            >
              <component :is="layer.locked ? Lock : Unlock" :size="13" />
            </button>

            <!-- 类型图标 + 名称 -->
            <span class="layer-type-icon">
              <component :is="getLayerIcon(layer.type)" :size="12" />
            </span>
            <span class="layer-name">{{ layer.name }}</span>

            <!-- 展开/折叠按钮（仅对象图层） -->
            <button
              v-if="layer.type === 'object' && layer.objects.length > 0"
              class="icon-btn mini expand-btn"
              :title="expandedLayers.has(layer.id) ? '折叠' : '展开对象列表'"
              @click.stop="toggleExpand(layer.id)"
            >
              <component
                :is="expandedLayers.has(layer.id) ? ChevronDown : ChevronRight"
                :size="12"
              />
            </button>

            <!-- 排序按钮 -->
            <div class="layer-order">
              <button
                class="icon-btn mini"
                :disabled="isMoveLayerDisabled(index, -1)"
                @click.stop="moveLayer(index, -1)"
              >
                <ChevronUp :size="12" />
              </button>
              <button
                class="icon-btn mini"
                :disabled="isMoveLayerDisabled(index, 1)"
                @click.stop="moveLayer(index, 1)"
              >
                <ChevronDown :size="12" />
              </button>
            </div>
          </div>

          <!-- 对象列表（展开时显示） -->
          <div
            v-if="layer.type === 'object' && expandedLayers.has(layer.id)"
            class="object-list"
          >
            <div
              v-for="(obj, objIndex) in getLayerObjects(layer)"
              :key="obj.id"
              class="object-item"
              :class="{ selected: obj.id === selectedObjectId }"
              @click.stop="handleObjectClick(obj.id)"
            >
              <span class="object-type-icon">
                <component :is="getObjectIcon(obj.type)" :size="11" />
              </span>
              <span class="object-name">{{ getObjectName(obj) }}</span>
              <div class="object-order">
                <el-tooltip
                  content="上移（显示更靠前）"
                  placement="top"
                  :show-after="300"
                >
                  <button
                    class="icon-btn mini"
                    :disabled="objIndex === getLayerObjects(layer).length - 1"
                    @click.stop="moveObject(layer.id, objIndex, 1)"
                  >
                    <ChevronUp :size="11" />
                  </button>
                </el-tooltip>
                <el-tooltip
                  content="下移（显示更靠后）"
                  placement="top"
                  :show-after="300"
                >
                  <button
                    class="icon-btn mini"
                    :disabled="objIndex === 0"
                    @click.stop="moveObject(layer.id, objIndex, -1)"
                  >
                    <ChevronDown :size="11" />
                  </button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="panel-footer">
        <el-tooltip content="删除图层" placement="top" :show-after="300">
          <button
            class="footer-btn danger"
            :disabled="layers.length <= 1"
            @click="deleteActiveLayer"
          >
            <Trash2 :size="13" />
          </button>
        </el-tooltip>
        <el-tooltip content="向下合并" placement="top" :show-after="300">
          <button
            class="footer-btn"
            :disabled="
              layers.length <= 1 ||
              activeLayerIndex === layers.length - 1 ||
              activeLayer?.type === 'background'
            "
            @click="mergeDown"
          >
            <Merge :size="13" />
          </button>
        </el-tooltip>
        <el-tooltip content="栅格化" placement="top" :show-after="300">
          <button
            class="footer-btn"
            :disabled="!activeLayer || activeLayer.type !== 'object'"
            @click="rasterizeActiveLayer"
          >
            <Grid3x3 :size="13" />
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject } from "vue";
import {
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Layers,
  PaintBucket,
  Paintbrush,
  Shapes,
  Merge,
  Grid3x3,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Type,
  Image,
} from "lucide-vue-next";
import { useEditorSession } from "../composables/useEditorSession";
import type { HybridLayer, ObjectLayer, SketchObject } from "../types";
import type { SketchPadContext } from "../SketchPad.vue";

const { state, runtime, actions } = useEditorSession();
const ctx = inject<SketchPadContext>("sketchPadContext")!;

const isCollapsed = ref(true);
const expandedLayers = ref<Set<string>>(new Set());

// 直接从 session 读状态
const layers = state.layers;
const activeLayerId = state.activeLayerId;
const selectionInfo = state.selectionInfo;

const selectedObjectId = computed(
  () => selectionInfo.value.singleObject?.id || null
);

const activeLayerIndex = computed(() => {
  return layers.value.findIndex((l) => l.id === activeLayerId.value);
});

const activeLayer = computed(() => {
  return layers.value.find((l) => l.id === activeLayerId.value) || null;
});

function handleCreateLayer(type: "background" | "raster" | "object") {
  actions.addLayer(
    type,
    type === "background" ? "填充" : undefined,
    type === "background" ? { fillColor: "#ffffff" } : undefined
  );
}

function selectLayer(id: string) {
  state.activeLayerId.value = id;
  const layer = layers.value.find((l) => l.id === id);
  if (layer?.type === "background") {
    actions.resetSelection();
  }
}

function toggleVisible(id: string) {
  actions.toggleVisible(id);
}

function toggleLocked(id: string) {
  actions.toggleLocked(id);
}

function moveLayer(index: number, direction: number) {
  if (isMoveLayerDisabled(index, direction)) return;

  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= layers.value.length) return;

  const newLayers = [...layers.value];
  const [moved] = newLayers.splice(index, 1);
  newLayers.splice(newIndex, 0, moved);

  actions.reorderLayers(newLayers.map((l) => l.id));
}

function isMoveLayerDisabled(index: number, direction: number): boolean {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= layers.value.length) return true;
  return false;
}

function deleteActiveLayer() {
  if (activeLayerId.value) {
    actions.deleteLayer(activeLayerId.value);
  }
}

function mergeDown() {
  if (activeLayerId.value) {
    ctx.layerOps.mergeDown(activeLayerId.value);
  }
}

function rasterizeActiveLayer() {
  if (activeLayerId.value) {
    ctx.layerOps.rasterizeLayer(activeLayerId.value);
  }
}

// ─── 对象列表相关 ───

function toggleExpand(layerId: string) {
  if (expandedLayers.value.has(layerId)) {
    expandedLayers.value.delete(layerId);
  } else {
    expandedLayers.value.add(layerId);
  }
}

/** 获取图层的对象列表（反转顺序，顶层对象在前） */
function getLayerObjects(layer: HybridLayer): SketchObject[] {
  if (layer.type !== "object") return [];
  return [...(layer as ObjectLayer).objects].reverse();
}

function getLayerIcon(type: HybridLayer["type"]) {
  switch (type) {
    case "background":
      return PaintBucket;
    case "raster":
      return Paintbrush;
    case "object":
      return Shapes;
  }
}

function getObjectIcon(type: string) {
  switch (type) {
    case "rect":
      return Square;
    case "ellipse":
      return Circle;
    case "line":
      return Minus;
    case "arrow":
      return ArrowRight;
    case "text":
      return Type;
    case "image":
      return Image;
    default:
      return Square;
  }
}

function getObjectName(obj: SketchObject): string {
  switch (obj.type) {
    case "rect":
      return "矩形";
    case "ellipse":
      return "椭圆";
    case "line":
      return "线段";
    case "arrow":
      return "箭头";
    case "text": {
      const content = obj.content.trim();
      return content
        ? content.length > 8
          ? content.substring(0, 8) + "…"
          : content
        : "文本";
    }
    case "image":
      return "图片";
    default:
      return "对象";
  }
}

function handleObjectClick(objectId: string) {
  runtime.capabilities.selectObjectById(objectId);
}

/**
 * 移动对象排序
 * 注意：显示列表是反转的（顶层在前），所以 direction 需要反转
 * displayIndex 是反转后的索引，direction: 1 = 在显示中上移 = 在实际数组中下移（zIndex 增大）
 */
function moveObject(layerId: string, displayIndex: number, direction: number) {
  const layer = layers.value.find((l) => l.id === layerId);
  if (!layer || layer.type !== "object") return;

  const objects = (layer as ObjectLayer).objects;
  // 显示列表是反转的，所以实际索引 = objects.length - 1 - displayIndex
  const actualIndex = objects.length - 1 - displayIndex;
  const newActualIndex = actualIndex + direction;

  if (newActualIndex < 0 || newActualIndex >= objects.length) return;

  // 构建新顺序
  const newObjects = [...objects];
  const [moved] = newObjects.splice(actualIndex, 1);
  newObjects.splice(newActualIndex, 0, moved);

  runtime.capabilities.reorderObjectsInLayer(
    layerId,
    newObjects.map((o) => o.id)
  );
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
  width: 240px;
  max-height: 400px;
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

.layer-group {
  display: flex;
  flex-direction: column;
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

.expand-btn {
  opacity: 0.6;
  transition: opacity 0.12s;
}

.expand-btn:hover {
  opacity: 1;
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

/* ─── 对象列表 ─── */

.object-list {
  margin-left: 20px;
  padding: 2px 0 4px 8px;
  border-left: 1px solid rgba(var(--primary-color-rgb), 0.15);
}

.object-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.12s;
}

.object-item:hover {
  background: rgba(var(--primary-color-rgb), 0.06);
}

.object-item.selected {
  background: rgba(var(--primary-color-rgb), 0.12);
}

.object-type-icon {
  display: flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.object-name {
  flex: 1;
  font-size: 10px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-order {
  display: flex;
  flex-direction: column;
  gap: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.object-item:hover .object-order {
  opacity: 1;
}

/* ─── 底部操作栏 ─── */

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
