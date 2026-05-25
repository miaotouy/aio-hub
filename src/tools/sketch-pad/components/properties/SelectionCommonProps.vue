<template>
  <div class="common-props">
    <!-- 位置 -->
    <div class="prop-row">
      <div class="prop-field">
        <span class="field-label">X</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.x)"
          @change="(e) => emitProp('x', Number((e.target as HTMLInputElement).value))"
        />
      </div>
      <div class="prop-field">
        <span class="field-label">Y</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.y)"
          @change="(e) => emitProp('y', Number((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <!-- 尺寸 -->
    <div v-if="showSize" class="prop-row">
      <div class="prop-field">
        <span class="field-label">W</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.width)"
          min="1"
          @change="(e) => emitProp('width', Math.max(1, Number((e.target as HTMLInputElement).value)))"
        />
      </div>
      <div class="prop-field">
        <span class="field-label">H</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.height)"
          min="1"
          @change="(e) => emitProp('height', Math.max(1, Number((e.target as HTMLInputElement).value)))"
        />
      </div>
    </div>

    <!-- 旋转 & 不透明度 -->
    <div class="prop-row">
      <div class="prop-field">
        <span class="field-label">旋转</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.rotation)"
          @change="(e) => emitProp('rotation', Number((e.target as HTMLInputElement).value) % 360)"
        />
        <span class="field-suffix">°</span>
      </div>
      <div class="prop-field">
        <span class="field-label">透明</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round(obj.opacity * 100)"
          min="0"
          max="100"
          @change="
            (e) => emitProp('opacity', Math.max(0, Math.min(100, Number((e.target as HTMLInputElement).value))) / 100)
          "
        />
        <span class="field-suffix">%</span>
      </div>
    </div>

    <!-- 变形 (scaleX / scaleY) -->
    <div class="prop-row">
      <div class="prop-field">
        <span class="field-label">横向</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round((obj.scaleX ?? 1) * 100)"
          step="1"
          @change="(e) => emitProp('scaleX', Number((e.target as HTMLInputElement).value) / 100)"
        />
        <span class="field-suffix">%</span>
      </div>
      <div class="prop-field">
        <span class="field-label">纵向</span>
        <input
          type="number"
          class="field-input"
          :value="Math.round((obj.scaleY ?? 1) * 100)"
          step="1"
          @change="(e) => emitProp('scaleY', Number((e.target as HTMLInputElement).value) / 100)"
        />
        <span class="field-suffix">%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SketchObject } from "../../types";

defineProps<{
  obj: SketchObject;
  showSize?: boolean;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
}>();

function emitProp(key: string, value: any) {
  emit("update-prop", key, value);
}
</script>

<style scoped>
.common-props {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prop-row {
  display: flex;
  gap: 6px;
}

.prop-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.field-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  min-width: 14px;
  flex-shrink: 0;
}

.field-input {
  flex: 1;
  width: 0;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--el-text-color-primary);
  font-size: 11px;
  text-align: right;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.1);
}

.field-input::-webkit-inner-spin-button,
.field-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field-suffix {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
</style>
