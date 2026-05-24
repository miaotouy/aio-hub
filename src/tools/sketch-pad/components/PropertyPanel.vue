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
      <div v-if="isBrushTool" class="property-group">
        <div class="property-item">
          <span class="label">粗细 <span class="value">{{ brushSize }}px</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="localBrushSize"
            min="1"
            max="100"
            @input="onBrushSizeInput"
          />
        </div>

        <div v-if="activeTool !== 'eraser'" class="property-item">
          <span class="label">不透明度 <span class="value">{{ Math.round(brushOpacity * 100) }}%</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="localBrushOpacity * 100"
            min="10"
            max="100"
            step="5"
            @input="onBrushOpacityInput"
          />
        </div>

        <div v-if="activeTool !== 'eraser'" class="property-item">
          <span class="label">颜色</span>
          <div class="preset-colors">
            <div
              v-for="color in PRESET_COLORS"
              :key="color"
              class="color-swatch"
              :style="{ backgroundColor: color }"
              :class="{ active: brushColor === color }"
              @click="selectBrushColor(color)"
            />
          </div>
          <el-color-picker v-model="localBrushColor" size="small" show-alpha @change="updateBrush" />
        </div>
      </div>

      <!-- 2. 形状属性 (矩形、圆形、线段、箭头) -->
      <div v-else-if="isShapeTool" class="property-group">
        <div class="property-item">
          <span class="label">描边 <span class="value">{{ strokeWidth }}px</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="localStrokeWidth"
            min="1"
            max="20"
            @input="onStrokeWidthInput"
          />
        </div>

        <div class="property-item">
          <span class="label">描边颜色</span>
          <div class="preset-colors">
            <div
              v-for="color in PRESET_COLORS"
              :key="color"
              class="color-swatch"
              :style="{ backgroundColor: color }"
              :class="{ active: strokeColor === color }"
              @click="selectStrokeColor(color)"
            />
          </div>
          <el-color-picker v-model="localStrokeColor" size="small" @change="updateShape" />
        </div>

        <div v-if="activeTool === 'rect' || activeTool === 'ellipse'" class="property-item">
          <span class="label">填充</span>
          <div class="fill-row">
            <label class="custom-checkbox">
              <input type="checkbox" v-model="hasFill" @change="toggleFill" />
              <span class="checkmark" />
              <span>启用</span>
            </label>
            <el-color-picker v-model="localFillColor" size="small" :disabled="!hasFill" @change="updateShape" />
          </div>
        </div>

        <div v-if="activeTool === 'rect'" class="property-item">
          <span class="label">圆角 <span class="value">{{ cornerRadius }}px</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="localCornerRadius"
            min="0"
            max="50"
            @input="onCornerRadiusInput"
          />
        </div>
      </div>

      <!-- 3. 文字属性 -->
      <div v-else-if="activeTool === 'text'" class="property-group">
        <div class="property-item">
          <span class="label">字号 <span class="value">{{ fontSize }}px</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="localFontSize"
            min="12"
            max="120"
            @input="onFontSizeInput"
          />
        </div>

        <div class="property-item">
          <span class="label">颜色</span>
          <div class="preset-colors">
            <div
              v-for="color in PRESET_COLORS"
              :key="color"
              class="color-swatch"
              :style="{ backgroundColor: color }"
              :class="{ active: textColor === color }"
              @click="selectTextColor(color)"
            />
          </div>
          <el-color-picker v-model="localTextColor" size="small" @change="updateText" />
        </div>

        <div class="property-item">
          <span class="label">样式</span>
          <div class="style-buttons">
            <button class="style-btn" :class="{ active: isBold }" @click="isBold = !isBold; updateText()">B</button>
            <button class="style-btn italic" :class="{ active: isItalic }" @click="isItalic = !isItalic; updateText()">I</button>
          </div>
        </div>

        <div class="property-item">
          <span class="label">对齐</span>
          <div class="align-buttons">
            <button class="style-btn" :class="{ active: textAlign === 'left' }" @click="textAlign = 'left'; updateText()">
              <AlignLeft :size="14" />
            </button>
            <button class="style-btn" :class="{ active: textAlign === 'center' }" @click="textAlign = 'center'; updateText()">
              <AlignCenter :size="14" />
            </button>
            <button class="style-btn" :class="{ active: textAlign === 'right' }" @click="textAlign = 'right'; updateText()">
              <AlignRight :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- 4. 选中对象属性编辑 -->
      <div v-else-if="activeTool === 'select' && hasSelection" class="property-group">
        <div class="selected-info">已选中 {{ selectedNodesCount }} 个对象</div>

        <div class="property-item">
          <span class="label">颜色</span>
          <el-color-picker v-model="selectionColor" size="small" @change="updateSelectionColor" />
        </div>

        <div class="property-item">
          <span class="label">粗细 <span class="value">{{ selectionStrokeWidth }}px</span></span>
          <input
            type="range"
            class="custom-slider"
            :value="selectionStrokeWidth"
            min="1"
            max="20"
            @input="onSelectionStrokeInput"
          />
        </div>

        <div class="property-item">
          <button class="delete-btn" @click="$emit('delete-selected')">
            <Trash2 :size="14" />
            删除选中
          </button>
        </div>
      </div>

      <div v-else class="empty-tip">选择工具后显示属性</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Palette, ChevronDown, Trash2, AlignLeft, AlignCenter, AlignRight } from "lucide-vue-next";
import { PRESET_COLORS, type ToolType } from "../constants";

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
  hasSelection: boolean;
  selectedNodesCount: number;
}>();

const emit = defineEmits<{
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
  (e: "update:selection", data: { color?: string; strokeWidth?: number }): void;
  (e: "delete-selected"): void;
}>();

// 1. 画笔本地状态
const localBrushSize = ref(props.brushSize);
const localBrushOpacity = ref(props.brushOpacity);
const localBrushColor = ref(props.brushColor);

// 2. 形状本地状态
const localStrokeWidth = ref(props.strokeWidth);
const localStrokeColor = ref(props.strokeColor);
const hasFill = ref(props.fillColor !== null);
const localFillColor = ref(props.fillColor || "#ffffff");
const localCornerRadius = ref(props.cornerRadius);

// 3. 文字本地状态
const localFontSize = ref(props.fontSize);
const localTextColor = ref(props.textColor);
const isBold = ref(false);
const isItalic = ref(false);
const textAlign = ref<"left" | "center" | "right">("left");

// 4. 选中对象本地状态
const selectionColor = ref("#000000");
const selectionStrokeWidth = ref(2);

// 监听 props 变化同步本地状态
watch(
  () => props.brushSize,
  (val) => (localBrushSize.value = val),
);
watch(
  () => props.brushOpacity,
  (val) => (localBrushOpacity.value = val),
);
watch(
  () => props.brushColor,
  (val) => (localBrushColor.value = val),
);
watch(
  () => props.strokeWidth,
  (val) => (localStrokeWidth.value = val),
);
watch(
  () => props.strokeColor,
  (val) => (localStrokeColor.value = val),
);
watch(
  () => props.fillColor,
  (val) => {
    hasFill.value = val !== null;
    if (val) localFillColor.value = val;
  },
);
watch(
  () => props.cornerRadius,
  (val) => (localCornerRadius.value = val),
);
watch(
  () => props.fontSize,
  (val) => (localFontSize.value = val),
);
watch(
  () => props.textColor,
  (val) => (localTextColor.value = val),
);

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
  if (props.activeTool === "select" && props.hasSelection) return "选中对象";
  return "属性";
});

// 原生 range input 事件处理
function onBrushSizeInput(e: Event) {
  localBrushSize.value = Number((e.target as HTMLInputElement).value);
  updateBrush();
}

function onBrushOpacityInput(e: Event) {
  localBrushOpacity.value = Number((e.target as HTMLInputElement).value) / 100;
  updateBrush();
}

function onStrokeWidthInput(e: Event) {
  localStrokeWidth.value = Number((e.target as HTMLInputElement).value);
  updateShape();
}

function onCornerRadiusInput(e: Event) {
  localCornerRadius.value = Number((e.target as HTMLInputElement).value);
  updateShape();
}

function onFontSizeInput(e: Event) {
  localFontSize.value = Number((e.target as HTMLInputElement).value);
  updateText();
}

function onSelectionStrokeInput(e: Event) {
  selectionStrokeWidth.value = Number((e.target as HTMLInputElement).value);
  updateSelectionStrokeWidth();
}

function updateBrush() {
  emit("update:brush", {
    size: localBrushSize.value,
    color: localBrushColor.value,
    opacity: localBrushOpacity.value,
  });
}

function selectBrushColor(color: string) {
  localBrushColor.value = color;
  updateBrush();
}

function updateShape() {
  emit("update:shape", {
    strokeWidth: localStrokeWidth.value,
    strokeColor: localStrokeColor.value,
    fillColor: hasFill.value ? localFillColor.value : null,
    cornerRadius: localCornerRadius.value,
  });
}

function selectStrokeColor(color: string) {
  localStrokeColor.value = color;
  updateShape();
}

function toggleFill() {
  updateShape();
}

function updateText() {
  emit("update:text", {
    fontSize: localFontSize.value,
    color: localTextColor.value,
    fontWeight: isBold.value ? "bold" : "normal",
    fontStyle: isItalic.value ? "italic" : "normal",
    textAlign: textAlign.value,
  });
}

function selectTextColor(color: string) {
  localTextColor.value = color;
  updateText();
}

function updateSelectionColor() {
  emit("update:selection", { color: selectionColor.value });
}

function updateSelectionStrokeWidth() {
  emit("update:selection", { strokeWidth: selectionStrokeWidth.value });
}
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
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition: all 0.15s ease;
}

.panel-toggle:hover {
  background: rgba(30, 30, 30, 0.95);
  color: #fff;
}

.panel-body {
  width: 220px;
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden;
  background: rgba(30, 30, 30, 0.88);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
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
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.panel-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  gap: 4px;
}

.label .value {
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

/* 自定义滑块 */
.custom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  outline: none;
  margin: 4px 0;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--el-color-primary);
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.custom-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--el-color-primary);
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.preset-colors {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.color-swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  box-sizing: border-box;
  transition: all 0.12s ease;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.color-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.fill-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}

.custom-checkbox input {
  accent-color: var(--el-color-primary);
}

.style-buttons,
.align-buttons {
  display: flex;
  gap: 4px;
}

.style-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
}

.style-btn.italic {
  font-style: italic;
}

.style-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.style-btn.active {
  background: var(--el-color-primary);
  color: #fff;
}

.selected-info {
  font-size: 11px;
  color: var(--el-color-primary-light-3);
  font-weight: 500;
  background: rgba(var(--el-color-primary-rgb), 0.15);
  padding: 6px 8px;
  border-radius: 6px;
  text-align: center;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px;
  border: none;
  border-radius: 7px;
  background: rgba(255, 77, 79, 0.2);
  color: #ff7875;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-btn:hover {
  background: rgba(255, 77, 79, 0.35);
}

.empty-tip {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
  padding: 12px 0;
}
</style>
