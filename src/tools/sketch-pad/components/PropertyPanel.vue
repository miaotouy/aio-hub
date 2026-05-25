<template>
  <div class="property-panel-float" :class="{ collapsed: isCollapsed }">
    <!-- 折叠状态下的触发按钮 -->
    <button v-if="isCollapsed" class="panel-toggle" title="展开属性面板" @click="isCollapsed = false">
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

      <!-- 1. 画笔属性 (铅笔、马克笔、橡皮擦) -->
      <BrushProps
        v-if="isBrushTool"
        :active-tool="activeTool"
        :brush-size="brushSize"
        :brush-color="brushColor"
        :brush-opacity="brushOpacity"
        @update="(data) => $emit('update:brush', data)"
      />

      <!-- 2. 形状属性 (矩形、圆形、线段、箭头) -->
      <ShapeProps
        v-else-if="isShapeTool"
        :active-tool="activeTool"
        :stroke-width="strokeWidth"
        :stroke-color="strokeColor"
        :fill-color="fillColor"
        :corner-radius="cornerRadius"
        @update="(data) => $emit('update:shape', data)"
      />

      <!-- 3. 文字属性 -->
      <TextProps
        v-else-if="activeTool === 'text'"
        :font-size="fontSize"
        :text-color="textColor"
        @update="(data) => $emit('update:text', data)"
      />

      <!-- 4. 选中对象属性编辑 -->
      <SelectionProps
        v-else-if="activeTool === 'select' && selectionInfo.count > 0"
        :selection-info="selectionInfo"
        @update-prop="(key, val) => $emit('update:selection-prop', key, val)"
        @update-props="(data) => $emit('update:selection-props', data)"
        @align="(dir) => $emit('align-selection', dir)"
        @distribute="(dir) => $emit('distribute-selection', dir)"
        @delete-selected="$emit('delete-selected')"
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
import type { ToolType } from "../constants";
import type { SelectionInfo } from "../types";
import BrushProps from "./properties/BrushProps.vue";
import ShapeProps from "./properties/ShapeProps.vue";
import TextProps from "./properties/TextProps.vue";
import SelectionProps from "./properties/SelectionProps.vue";

const isCollapsed = ref(false);

const props = defineProps<{
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string | null;
  cornerRadius: number;
  fontSize: number;
  textColor: string;
  selectionInfo: SelectionInfo;
}>();

defineEmits<{
  (e: "update:brush", data: { size?: number; color?: string; opacity?: number }): void;
  (
    e: "update:shape",
    data: { strokeWidth?: number; strokeColor?: string; fillColor?: string | null; cornerRadius?: number },
  ): void;
  (
    e: "update:text",
    data: {
      fontSize?: number;
      color?: string;
      fontWeight?: "normal" | "bold";
      fontStyle?: "normal" | "italic";
      textAlign?: "left" | "center" | "right";
    },
  ): void;
  (e: "update:selection-prop", key: string, value: any): void;
  (e: "update:selection-props", data: Record<string, any>): void;
  (e: "align-selection", direction: "left" | "right" | "top" | "bottom" | "center-h" | "center-v"): void;
  (e: "distribute-selection", direction: "horizontal" | "vertical"): void;
  (e: "delete-selected"): void;
}>();

const isBrushTool = computed(() => {
  return ["pencil", "marker", "eraser"].includes(props.activeTool);
});

const isShapeTool = computed(() => {
  return ["rect", "ellipse", "line", "arrow"].includes(props.activeTool);
});

const panelTitle = computed(() => {
  if (isBrushTool.value) return "画笔";
  if (isShapeTool.value) return "形状";
  if (props.activeTool === "text") return "文字";
  if (props.activeTool === "select" && props.selectionInfo.count > 0) {
    if (props.selectionInfo.count === 1 && props.selectionInfo.singleObject) {
      const typeLabels: Record<string, string> = {
        rect: "矩形",
        ellipse: "圆形",
        line: "线条",
        arrow: "箭头",
        text: "文本",
        image: "图片",
      };
      return typeLabels[props.selectionInfo.singleObject.type] || "对象";
    }
    return "多选对象";
  }
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
