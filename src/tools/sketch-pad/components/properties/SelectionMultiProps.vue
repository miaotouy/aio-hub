<template>
  <div class="property-group">
    <div class="selected-info">已选中 {{ count }} 个对象</div>

    <!-- 对齐操作 -->
    <div class="property-item">
      <span class="label">对齐</span>
      <div class="align-grid">
        <button class="align-btn" title="左对齐" @click="emit('align', 'left')">
          <AlignStartVertical :size="14" />
        </button>
        <button class="align-btn" title="水平居中" @click="emit('align', 'center-h')">
          <AlignCenterVertical :size="14" />
        </button>
        <button class="align-btn" title="右对齐" @click="emit('align', 'right')">
          <AlignEndVertical :size="14" />
        </button>
        <button class="align-btn" title="顶对齐" @click="emit('align', 'top')">
          <AlignStartHorizontal :size="14" />
        </button>
        <button class="align-btn" title="垂直居中" @click="emit('align', 'center-v')">
          <AlignCenterHorizontal :size="14" />
        </button>
        <button class="align-btn" title="底对齐" @click="emit('align', 'bottom')">
          <AlignEndHorizontal :size="14" />
        </button>
      </div>
    </div>

    <!-- 分布操作 -->
    <div v-if="count >= 3" class="property-item">
      <span class="label">分布</span>
      <div class="distribute-row">
        <button class="dist-btn" title="水平等距" @click="emit('distribute', 'horizontal')">
          <AlignHorizontalSpaceAround :size="14" />
          <span>水平等距</span>
        </button>
        <button class="dist-btn" title="垂直等距" @click="emit('distribute', 'vertical')">
          <AlignVerticalSpaceAround :size="14" />
          <span>垂直等距</span>
        </button>
      </div>
    </div>

    <div class="section-divider" />

    <!-- 批量属性修改 -->
    <PropertySlider
      label="不透明度"
      :model-value="commonOpacity * 100"
      :min="0"
      :max="100"
      suffix="%"
      @update:model-value="(v) => emit('update-common', 'opacity', v / 100)"
    />

    <PropertyColorPicker
      v-if="hasStroke"
      label="描边颜色"
      :model-value="commonStroke"
      @update:model-value="(v) => emit('update-common', 'stroke', v)"
    />

    <PropertySlider
      v-if="hasStroke"
      label="描边粗细"
      :model-value="commonStrokeWidth"
      :min="1"
      :max="20"
      @update:model-value="(v) => emit('update-common', 'strokeWidth', v)"
    />

    <div class="section-divider" />

    <div class="property-item">
      <button class="delete-btn" @click="emit('delete')">
        <Trash2 :size="14" />
        删除选中
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Trash2,
} from "lucide-vue-next";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";
import type { SelectionInfo } from "../../types";

const props = defineProps<{
  count: number;
  commonProps: SelectionInfo["commonProps"];
}>();

const emit = defineEmits<{
  (e: "align", direction: "left" | "right" | "top" | "bottom" | "center-h" | "center-v"): void;
  (e: "distribute", direction: "horizontal" | "vertical"): void;
  (e: "update-common", key: string, value: any): void;
  (e: "delete"): void;
}>();

const hasStroke = props.commonProps.stroke !== undefined;
const commonOpacity = props.commonProps.opacity ?? 1;
const commonStroke = props.commonProps.stroke ?? "#000000";
const commonStrokeWidth = props.commonProps.strokeWidth ?? 2;
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-info {
  font-size: 11px;
  color: var(--primary-color);
  font-weight: 500;
  background: rgba(var(--primary-color-rgb), 0.1);
  padding: 6px 8px;
  border-radius: 6px;
  text-align: center;
}

.section-divider {
  height: 1px;
  background: var(--border-color);
  margin: 2px 0;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.align-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.align-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.12s;
}

.align-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.06);
}

.distribute-row {
  display: flex;
  gap: 4px;
}

.dist-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.12s;
}

.dist-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.06);
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
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.15);
  color: var(--el-color-danger);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-btn:hover {
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.25);
}
</style>
