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
  <div class="property-panel-float" :class="{ collapsed: isCollapsed }">
    <!-- 折叠状态下的触发按钮 -->
    <button
      v-if="isCollapsed"
      class="panel-toggle"
      title="展开属性面板"
      @click="isCollapsed = false"
    >
      <Palette :size="18" />
    </button>

    <!-- 展开状态的面板 -->
    <div v-else class="panel-body">
      <div class="panel-header">
        <span class="panel-title">{{ panelTitle }}</span>
        <button class="panel-close" title="收起" @click="isCollapsed = true">
          <ChevronDown :size="16" />
        </button>
      </div>

      <!-- 1. 填充图层 -->
      <BackgroundProps
        v-if="activeBackgroundLayer"
        :fill-color="activeBackgroundLayer.fillColor"
        @update="updateActiveBackground"
      />

      <!-- 2. 画笔属性 (铅笔、马克笔、橡皮擦) -->
      <BrushProps
        v-else-if="isBrushTool"
        :active-tool="activeTool"
        :brush-size="brushSize"
        :brush-color="brushColor"
        :brush-opacity="brushOpacity"
        @update="(data) => actions.updateBrush(data)"
      />

      <!-- 2. 形状属性 (矩形、圆形、线段、箭头) -->
      <ShapeProps
        v-else-if="isShapeTool"
        :active-tool="activeTool"
        :stroke-width="strokeWidth"
        :stroke-color="strokeColor"
        :fill-color="fillColor"
        :corner-radius="cornerRadius"
        @update="(data) => actions.updateShape(data)"
      />

      <!-- 3. 文字属性 (文字工具且未选中对象时显示默认属性) -->
      <TextProps
        v-else-if="activeTool === 'text' && selectionInfo.count === 0"
        :font-size="fontSize"
        :font-family="fontFamily"
        :text-color="textColor"
        @update="(data) => actions.updateText(data)"
      />

      <!-- 4. 选中对象属性编辑 (选择工具或文字工具下有选中对象) -->
      <SelectionProps
        v-else-if="
          (activeTool === 'select' || activeTool === 'text') &&
          selectionInfo.count > 0
        "
        :selection-info="selectionInfo"
        @update-prop="(key, val) => actions.updateSelectionProp(key, val)"
        @update-props="(data) => actions.updateSelectionProps(data)"
        @align="(dir) => actions.alignSelection(dir)"
        @distribute="(dir) => actions.distributeSelection(dir)"
        @delete-selected="actions.deleteSelected()"
      />

      <!-- 5. 选择工具 (未选中对象) -->
      <div v-else-if="activeTool === 'select'" class="empty-tip">
        <MousePointer :size="24" class="tip-icon" />
        <div class="tip-title">选择工具</div>
        <div class="tip-desc">在画布上点击或框选对象进行编辑</div>
      </div>

      <!-- 6. 抓手工具 -->
      <div v-else-if="activeTool === 'hand'" class="empty-tip">
        <Hand :size="24" class="tip-icon" />
        <div class="tip-title">抓手工具</div>
        <div class="tip-desc">在画布上拖拽可平移视图<br />滚动滚轮可缩放</div>
      </div>

      <div v-else class="empty-tip">选择工具后显示属性</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Palette, ChevronDown, MousePointer, Hand } from "lucide-vue-next";
import { useEditorSession } from "../composables/useEditorSession";
import BrushProps from "./properties/BrushProps.vue";
import BackgroundProps from "./properties/BackgroundProps.vue";
import ShapeProps from "./properties/ShapeProps.vue";
import TextProps from "./properties/TextProps.vue";
import SelectionProps from "./properties/SelectionProps.vue";

const { state, actions } = useEditorSession();

const isCollapsed = ref(false);

// 直接从 session 读状态
const activeTool = state.activeTool;
const activeLayer = state.activeLayer;
const brushSize = state.brushSize;
const brushColor = state.brushColor;
const brushOpacity = state.brushOpacity;
const strokeWidth = state.strokeWidth;
const strokeColor = state.strokeColor;
const fillColor = state.fillColor;
const cornerRadius = state.cornerRadius;
const fontSize = state.fontSize;
const fontFamily = state.fontFamily;
const textColor = state.textColor;
const selectionInfo = state.selectionInfo;

const isBrushTool = computed(() => {
  return ["pencil", "marker", "eraser"].includes(activeTool.value);
});

const isShapeTool = computed(() => {
  return ["rect", "ellipse", "line", "arrow"].includes(activeTool.value);
});

const activeBackgroundLayer = computed(() => {
  return activeLayer.value?.type === "background" ? activeLayer.value : null;
});

function updateActiveBackground(fillColor: string | null) {
  if (!activeBackgroundLayer.value) return;
  actions.updateBackgroundLayer(activeBackgroundLayer.value.id, fillColor);
}

const panelTitle = computed(() => {
  if (activeLayer.value?.type === "background") return "填充";
  if (isBrushTool.value) return "画笔";
  if (isShapeTool.value) return "形状";
  // 文字工具或选择工具下有选中对象时，显示对象类型
  if (
    (activeTool.value === "text" || activeTool.value === "select") &&
    selectionInfo.value.count > 0
  ) {
    if (selectionInfo.value.count === 1 && selectionInfo.value.singleObject) {
      const typeLabels: Record<string, string> = {
        rect: "矩形",
        ellipse: "圆形",
        line: "线条",
        arrow: "箭头",
        text: "文本",
        image: "图片",
      };
      return typeLabels[selectionInfo.value.singleObject.type] || "对象";
    }
    return "多选对象";
  }
  if (activeTool.value === "text") return "文字";
  return "属性";
});
</script>

<style scoped>
.property-panel-float {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 100;
}

.property-panel-float.collapsed .panel-toggle {
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
  max-height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  letter-spacing: 0.5px;
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
}

.panel-close:hover {
  background: rgba(var(--primary-color-rgb), 0.08);
  color: var(--el-text-color-primary);
}

.empty-tip {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tip-icon {
  color: var(--el-text-color-placeholder);
  opacity: 0.7;
}

.tip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.tip-desc {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.4;
}
</style>
