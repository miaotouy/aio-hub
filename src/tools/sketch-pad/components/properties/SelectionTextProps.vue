<template>
  <div class="property-group">
    <SelectionCommonProps :obj="obj" show-size @update-prop="emitProp" />

    <div class="section-divider" />

    <!-- 文本内容编辑 -->
    <div class="property-item">
      <span class="label">内容</span>
      <el-input
        type="textarea"
        :model-value="obj.content"
        :autosize="{ minRows: 2, maxRows: 6 }"
        resize="none"
        placeholder="输入文本内容..."
        @update:model-value="(v: string) => emitProp('content', v)"
      />
    </div>

    <div class="section-divider" />

    <PropertySlider
      label="字号"
      :model-value="obj.fontSize"
      :min="12"
      :max="120"
      @update:model-value="(v) => emitProp('fontSize', v)"
    />

    <PropertyColorPicker label="文字颜色" :model-value="obj.color" @update:model-value="(v) => emitProp('color', v)" />

    <!-- 字体样式 -->
    <div class="property-item">
      <span class="label">样式</span>
      <div class="style-buttons">
        <button
          class="style-btn"
          :class="{ active: obj.fontWeight === 'bold' }"
          @click="emitProp('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold')"
        >
          B
        </button>
        <button
          class="style-btn italic"
          :class="{ active: obj.fontStyle === 'italic' }"
          @click="emitProp('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic')"
        >
          I
        </button>
      </div>
    </div>

    <!-- 对齐方式 -->
    <div class="property-item">
      <span class="label">对齐</span>
      <div class="align-buttons">
        <button class="style-btn" :class="{ active: obj.textAlign === 'left' }" @click="emitProp('textAlign', 'left')">
          <AlignLeft :size="14" />
        </button>
        <button
          class="style-btn"
          :class="{ active: obj.textAlign === 'center' }"
          @click="emitProp('textAlign', 'center')"
        >
          <AlignCenter :size="14" />
        </button>
        <button
          class="style-btn"
          :class="{ active: obj.textAlign === 'right' }"
          @click="emitProp('textAlign', 'right')"
        >
          <AlignRight :size="14" />
        </button>
      </div>
    </div>

    <!-- 行高 -->
    <PropertySlider
      label="行高"
      :model-value="obj.lineHeight"
      :min="0.8"
      :max="3.0"
      :step="0.1"
      :decimals="1"
      suffix=""
      @update:model-value="(v) => emitProp('lineHeight', v)"
    />

    <!-- 背景色 -->
    <div class="property-item">
      <span class="label">背景色</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input type="checkbox" :checked="obj.backgroundColor !== null" @change="toggleBg" />
          <span class="checkmark" />
          <span>启用</span>
        </label>
        <el-color-picker
          :model-value="obj.backgroundColor || '#ffffff'"
          size="small"
          :disabled="obj.backgroundColor === null"
          @change="onBgChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlignLeft, AlignCenter, AlignRight } from "lucide-vue-next";
import type { TextObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";

const props = defineProps<{
  obj: TextObject;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
}>();

function emitProp(key: string, value: any) {
  emit("update-prop", key, value);
}

function toggleBg() {
  if (props.obj.backgroundColor !== null) {
    emitProp("backgroundColor", null);
  } else {
    emitProp("backgroundColor", "#ffffff");
  }
}

function onBgChange(val: string | null) {
  if (val) emitProp("backgroundColor", val);
}
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  background: rgba(var(--primary-color-rgb), 0.06);
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
}

.style-btn.italic {
  font-style: italic;
}

.style-btn:hover {
  background: rgba(var(--primary-color-rgb), 0.12);
}

.style-btn.active {
  background: var(--primary-color);
  color: #fff;
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
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.custom-checkbox input {
  accent-color: var(--primary-color);
}
</style>
