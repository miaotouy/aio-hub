<script setup lang="ts">
/**
 * 颜色判断步骤配置：单点 / 区域 + 期望颜色 + 容差 + 跳转
 */
import type {
  ColorCheckStepParams,
  ColorCheckMode,
  RectCheckType,
  FlowStep,
} from "../../types";

const props = defineProps<{
  params: ColorCheckStepParams;
  steps: FlowStep[];
}>();
const emit = defineEmits<{
  (e: "update:params", value: ColorCheckStepParams): void;
}>();

function update(patch: Partial<ColorCheckStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

function updateRect(patch: Partial<NonNullable<ColorCheckStepParams["rect"]>>) {
  const cur = props.params.rect ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    mode: "pixel",
  };
  update({ rect: { ...cur, ...patch } });
}

function updateCoord(
  patch: Partial<NonNullable<ColorCheckStepParams["coordinate"]>>
) {
  const cur = props.params.coordinate ?? { x: 0, y: 0, mode: "pixel" };
  update({ coordinate: { ...cur, ...patch } });
}

const modes: Array<{ value: ColorCheckMode; label: string }> = [
  { value: "point", label: "单点" },
  { value: "rect", label: "区域" },
];
const rectCheckTypes: Array<{ value: RectCheckType; label: string }> = [
  { value: "contains", label: "区域内包含颜色" },
  { value: "percentage", label: "颜色占比达到阈值" },
];
</script>

<template>
  <div class="color-check-config">
    <div class="row">
      <div class="field">
        <label>判断模式</label>
        <el-select
          :model-value="params.checkMode"
          @update:model-value="(v: ColorCheckMode) => update({ checkMode: v })"
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
        <label>期望颜色 (Hex)</label>
        <el-input
          :model-value="params.expectedColor"
          placeholder="#RRGGBB"
          @update:model-value="
            (v: string | number) => update({ expectedColor: String(v ?? '') })
          "
        />
      </div>
      <div class="field grow">
        <label>容差 (0~100%)</label>
        <el-input-number
          :model-value="params.tolerance"
          :min="0"
          :max="100"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => update({ tolerance: Number(v) || 0 })
          "
        />
      </div>
    </div>

    <template v-if="params.checkMode === 'point'">
      <div class="row">
        <div class="field grow">
          <label>X</label>
          <el-input-number
            :model-value="params.coordinate?.x ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateCoord({ x: Number(v) || 0 })
            "
          />
        </div>
        <div class="field grow">
          <label>Y</label>
          <el-input-number
            :model-value="params.coordinate?.y ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateCoord({ y: Number(v) || 0 })
            "
          />
        </div>
        <div class="field">
          <label>模式</label>
          <el-select
            :model-value="params.coordinate?.mode ?? 'pixel'"
            @update:model-value="
              (v: 'pixel' | 'percent') => updateCoord({ mode: v })
            "
          >
            <el-option label="像素" value="pixel" />
            <el-option label="百分比" value="percent" />
          </el-select>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="row">
        <div class="field grow">
          <label>X</label>
          <el-input-number
            :model-value="params.rect?.x ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateRect({ x: Number(v) || 0 })
            "
          />
        </div>
        <div class="field grow">
          <label>Y</label>
          <el-input-number
            :model-value="params.rect?.y ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateRect({ y: Number(v) || 0 })
            "
          />
        </div>
        <div class="field grow">
          <label>宽</label>
          <el-input-number
            :model-value="params.rect?.width ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateRect({ width: Number(v) || 0 })
            "
          />
        </div>
        <div class="field grow">
          <label>高</label>
          <el-input-number
            :model-value="params.rect?.height ?? 0"
            :min="0"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) => updateRect({ height: Number(v) || 0 })
            "
          />
        </div>
        <div class="field">
          <label>模式</label>
          <el-select
            :model-value="params.rect?.mode ?? 'pixel'"
            @update:model-value="
              (v: 'pixel' | 'percent') => updateRect({ mode: v })
            "
          >
            <el-option label="像素" value="pixel" />
            <el-option label="百分比" value="percent" />
          </el-select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>区域判定</label>
          <el-select
            :model-value="params.rectCheckType ?? 'contains'"
            @update:model-value="
              (v: RectCheckType) => update({ rectCheckType: v })
            "
          >
            <el-option
              v-for="t in rectCheckTypes"
              :key="t.value"
              :label="t.label"
              :value="t.value"
            />
          </el-select>
        </div>
        <div v-if="params.rectCheckType === 'percentage'" class="field grow">
          <label>占比阈值 (%)</label>
          <el-input-number
            :model-value="params.minPercentage ?? 0"
            :min="0"
            :max="100"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) =>
                update({ minPercentage: Number(v) || 0 })
            "
          />
        </div>
      </div>
    </template>

    <div class="row">
      <div class="field grow">
        <label>匹配时跳转</label>
        <el-select
          :model-value="params.matchGoto"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ matchGoto: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
      <div class="field grow">
        <label>不匹配时跳转</label>
        <el-select
          :model-value="params.mismatchGoto"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ mismatchGoto: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-check-config {
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
  min-width: 130px;
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
