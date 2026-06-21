<script setup lang="ts">
/**
 * 点击步骤配置：坐标 + 按键 + 单/双击 + 后台/前台 + 点击后延时
 */
import type {
  ClickStepParams,
  MouseButton,
  ClickType,
  OperationMode,
} from "../../types";

const props = defineProps<{ params: ClickStepParams }>();
const emit = defineEmits<{
  (e: "update:params", value: ClickStepParams): void;
}>();

function update(patch: Partial<ClickStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

const buttons: Array<{ value: MouseButton; label: string }> = [
  { value: "left", label: "左键" },
  { value: "right", label: "右键" },
  { value: "middle", label: "中键" },
];
const clickTypes: Array<{ value: ClickType; label: string }> = [
  { value: "single", label: "单击" },
  { value: "double", label: "双击" },
];
const modes: Array<{ value: OperationMode; label: string }> = [
  { value: "background", label: "后台" },
  { value: "foreground", label: "前台" },
];
</script>

<template>
  <div class="click-config">
    <div class="row">
      <div class="field grow">
        <label>X 坐标</label>
        <el-input-number
          :model-value="params.coordinate.x"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) =>
              update({
                coordinate: { ...params.coordinate, x: Number(v) || 0 },
              })
          "
        />
      </div>
      <div class="field grow">
        <label>Y 坐标</label>
        <el-input-number
          :model-value="params.coordinate.y"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) =>
              update({
                coordinate: { ...params.coordinate, y: Number(v) || 0 },
              })
          "
        />
      </div>
      <div class="field">
        <label>坐标模式</label>
        <el-select
          :model-value="params.coordinate.mode"
          @update:model-value="
            (v: 'pixel' | 'percent') =>
              update({ coordinate: { ...params.coordinate, mode: v } })
          "
        >
          <el-option label="像素" value="pixel" />
          <el-option label="百分比" value="percent" />
        </el-select>
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>鼠标按键</label>
        <el-select
          :model-value="params.button"
          @update:model-value="(v: MouseButton) => update({ button: v })"
        >
          <el-option
            v-for="b in buttons"
            :key="b.value"
            :label="b.label"
            :value="b.value"
          />
        </el-select>
      </div>
      <div class="field">
        <label>点击方式</label>
        <el-select
          :model-value="params.clickType"
          @update:model-value="(v: ClickType) => update({ clickType: v })"
        >
          <el-option
            v-for="c in clickTypes"
            :key="c.value"
            :label="c.label"
            :value="c.value"
          />
        </el-select>
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
        <label>点击后延时 (ms)</label>
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
  </div>
</template>

<style scoped>
.click-config {
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
  min-width: 140px;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
