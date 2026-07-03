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
  <div class="property-group">
    <SelectionCommonProps :obj="obj" show-size @update-prop="emitProp" />

    <div class="section-divider" />

    <!-- 文本内容编辑 -->
    <div class="property-item">
      <div class="label-row">
        <span class="label">内容</span>
        <el-button
          class="expand-btn"
          type="primary"
          link
          @click="isEditorOpen = true"
        >
          <Maximize2 :size="12" />
        </el-button>
      </div>
      <el-input
        type="textarea"
        :model-value="obj.content"
        :autosize="{ minRows: 2, maxRows: 6 }"
        resize="none"
        placeholder="输入文本内容..."
        @update:model-value="(v: string) => emitProp('content', v)"
      />
    </div>

    <!-- 文本放大编辑器弹窗 -->
    <BaseDialog
      v-model="isEditorOpen"
      title="编辑文本内容"
      width="600px"
      height="70vh"
    >
      <div class="large-editor-container">
        <el-input
          type="textarea"
          :model-value="obj.content"
          class="large-textarea"
          resize="none"
          placeholder="输入文本内容..."
          @update:model-value="(v: string) => emitProp('content', v)"
        />
      </div>
      <template #footer>
        <el-button type="primary" @click="isEditorOpen = false">确定</el-button>
      </template>
    </BaseDialog>

    <div class="section-divider" />

    <!-- 字体选择 -->
    <div class="property-item">
      <span class="label">字体</span>
      <el-select
        :model-value="obj.fontFamily"
        size="small"
        filterable
        placeholder="选择字体"
        @update:model-value="(v: any) => emitProp('fontFamily', v)"
      >
        <el-option-group label="预设字体">
          <el-option
            v-for="font in FONT_PRESETS"
            :key="font.value"
            :label="font.label"
            :value="font.value"
            :style="{ fontFamily: font.value }"
          />
        </el-option-group>
        <el-option-group v-if="systemFonts.length > 0" label="系统字体">
          <el-option
            v-for="font in systemFonts"
            :key="font"
            :label="font"
            :value="font"
            :style="{ fontFamily: font }"
          />
        </el-option-group>
      </el-select>
    </div>

    <PropertySlider
      label="字号"
      :model-value="obj.fontSize"
      :min="12"
      :max="120"
      @update:model-value="(v) => emitProp('fontSize', v)"
    />

    <PropertyColorPicker
      label="文字颜色"
      :model-value="obj.color"
      @update:model-value="(v) => emitProp('color', v)"
    />

    <!-- 字体样式 -->
    <div class="property-item">
      <span class="label">样式</span>
      <div class="style-buttons">
        <button
          class="style-btn"
          :class="{ active: obj.fontWeight === 'bold' }"
          @click="
            emitProp(
              'fontWeight',
              obj.fontWeight === 'bold' ? 'normal' : 'bold'
            )
          "
        >
          B
        </button>
        <button
          class="style-btn italic"
          :class="{ active: obj.fontStyle === 'italic' }"
          @click="
            emitProp(
              'fontStyle',
              obj.fontStyle === 'italic' ? 'normal' : 'italic'
            )
          "
        >
          I
        </button>
      </div>
    </div>

    <!-- 对齐方式 -->
    <div class="property-item">
      <span class="label">对齐</span>
      <div class="align-buttons">
        <button
          class="style-btn"
          :class="{ active: obj.textAlign === 'left' }"
          @click="emitProp('textAlign', 'left')"
        >
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
          <input
            type="checkbox"
            :checked="obj.backgroundColor !== null"
            @change="toggleBg"
          />
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
import { ref, onMounted } from "vue";
import { AlignLeft, AlignCenter, AlignRight, Maximize2 } from "lucide-vue-next";
import type { TextObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useSystemFonts } from "../../composables/useSystemFonts";
import { FONT_PRESETS } from "../../constants";

const props = defineProps<{
  obj: TextObject;
}>();

const { systemFonts, loadSystemFonts } = useSystemFonts();

onMounted(() => {
  loadSystemFonts();
});

const isEditorOpen = ref(false);

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

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.expand-btn {
  padding: 0;
  height: auto;
}

.large-editor-container {
  height: 100%;
  padding: 8px 0;
}

.large-textarea {
  height: 100%;
}

.large-textarea :deep(.el-textarea__inner) {
  height: 100% !important;
  font-family: inherit;
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
