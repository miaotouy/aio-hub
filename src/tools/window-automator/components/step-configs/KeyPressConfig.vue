<script setup lang="ts">
/**
 * 按键步骤配置：按键名 + 修饰键 + 模式 + 延时
 */
import type { KeyPressStepParams, OperationMode } from "../../types";

const props = defineProps<{ params: KeyPressStepParams }>();
const emit = defineEmits<{
  (e: "update:params", value: KeyPressStepParams): void;
}>();

function update(patch: Partial<KeyPressStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

const allModifiers: Array<{ value: string; label: string }> = [
  { value: "ctrl", label: "Ctrl" },
  { value: "shift", label: "Shift" },
  { value: "alt", label: "Alt" },
];
const modes: Array<{ value: OperationMode; label: string }> = [
  { value: "background", label: "后台" },
  { value: "foreground", label: "前台" },
];
</script>

<template>
  <div class="keypress-config">
    <div class="row">
      <div class="field grow">
        <label>按键</label>
        <el-input
          :model-value="params.key"
          placeholder="如 Enter / a / F1 / Space"
          @update:model-value="
            (v: string | number) => update({ key: String(v ?? '') })
          "
        />
      </div>
      <div class="field">
        <label>操作模式</label>
        <el-select
          :model-value="params.mode"
          @update:model-value="(v: OperationMode) => update({ mode: v })"
        >
          <el-option
            v-for="m in modes"
            :key="m.value"
            :label="m.label"
            :value="m.value"
          />
        </el-select>
      </div>
      <div class="field grow">
        <label>按键后延时 (ms)</label>
        <el-input-number
          :model-value="params.delayAfter"
          :min="0"
          :step="50"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => update({ delayAfter: Number(v) || 0 })
          "
        />
      </div>
    </div>
    <div class="row">
      <div class="field grow">
        <label>修饰键</label>
        <el-select
          multiple
          collapse-tags
          collapse-tags-tooltip
          :model-value="params.modifiers"
          placeholder="无"
          @update:model-value="
            (v: string[]) =>
              update({ modifiers: Array.isArray(v) ? v.map(String) : [] })
          "
        >
          <el-option
            v-for="m in allModifiers"
            :key="m.value"
            :label="m.label"
            :value="m.value"
          />
        </el-select>
      </div>
    </div>
    <div class="hint">
      支持常见键名: 字母 / 数字 / F1-F12 / Enter / Space / Tab / Esc / Backspace
      / 方向键等
    </div>
  </div>
</template>

<style scoped>
.keypress-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 110px;
}
.field.grow {
  flex: 1;
  min-width: 160px;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
