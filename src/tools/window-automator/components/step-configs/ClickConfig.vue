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

<script setup lang="ts">
/**
 * 点击步骤配置：坐标 + 按键 + 单/双击 + 后台/前台 + 点击后延时
 *
 * center 模式：以 flow 标定原点（缺省几何中心）为参考的相对偏移，
 * 支持直角（东西/南北偏移，y 向上为正）与极坐标（角度/半径）两种输入，
 * 悬挂象限徽标实时提示方位；flow 未标定原点时给出"去标定"引导。
 */
import { computed } from "vue";
import { LocateFixed } from "lucide-vue-next";
import type {
  ClickStepParams,
  MouseButton,
  ClickType,
  OperationMode,
} from "../../types";
import {
  cartesianToPolar,
  polarToCartesian,
  quadrantLabel,
} from "../../composables/coordinateTransforms";
import type { CoordinateOrigin } from "../../types";

const props = defineProps<{
  params: ClickStepParams;
  /** 当前 flow 的中心坐标系原点（null = 未标定） */
  origin?: CoordinateOrigin | null;
}>();

const emit = defineEmits<{
  (e: "update:params", value: ClickStepParams): void;
  (e: "mark-origin"): void;
}>();

function update(patch: Partial<ClickStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

function updateCoordinate(patch: Partial<ClickStepParams["coordinate"]>) {
  update({ coordinate: { ...props.params.coordinate, ...patch } });
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

const isCenter = computed(() => props.params.coordinate.mode === "center");
const isPolar = computed(
  () => isCenter.value && props.params.coordinate.form === "polar"
);

/** 直角 <-> 极坐标切换时按当前值换算初始输入，避免清零 */
function onFormChange(form: "cartesian" | "polar") {
  const coord = props.params.coordinate;
  if (form === "polar") {
    const polar = cartesianToPolar(coord.x, coord.y);
    updateCoordinate({ form, x: Number(polar.angle.toFixed(1)), y: Math.round(polar.radius) });
  } else {
    const c = polarToCartesian(coord.x, coord.y);
    updateCoordinate({ form, x: Math.round(c.dx), y: Math.round(c.dy) });
  }
}

/** 象限徽标：直角取 x/y；极坐标先归一化为直角 */
const quadrantText = computed(() => {
  if (!isCenter.value) return "";
  const coord = props.params.coordinate;
  if (coord.form === "polar") {
    const c = polarToCartesian(coord.x, coord.y);
    return quadrantLabel(
      c.dx === 0 || c.dy === 0 ? null : quadrantOf(c.dx, c.dy)
    );
  }
  return quadrantLabel(
    coord.x === 0 || coord.y === 0 ? null : quadrantOf(coord.x, coord.y)
  );
});

function quadrantOf(x: number, y: number): 1 | 2 | 3 | 4 {
  if (x > 0) return y > 0 ? 1 : 4;
  return y > 0 ? 2 : 3;
}

/** 极坐标输入下的归一化 dx/dy 预览 */
const polarPreview = computed(() => {
  if (!isPolar.value) return "";
  const c = polarToCartesian(
    props.params.coordinate.x,
    props.params.coordinate.y
  );
  const sign = (n: number) => (n >= 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
  return `等效偏移 dx=${sign(c.dx)}, dy=${sign(c.dy)}`;
});
</script>

<template>
  <div class="click-config">
    <div class="row">
      <template v-if="!isCenter">
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
      </template>
      <template v-else>
        <div class="field grow">
          <label>{{ isPolar ? "角度（°，逆时针为正）" : "东西偏移（右正）" }}</label>
          <el-input-number
            :model-value="params.coordinate.x"
            :step="isPolar ? 5 : 1"
            :precision="isPolar ? 1 : 0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) =>
                updateCoordinate({ x: v === undefined || Number.isNaN(v) ? 0 : v })
            "
          />
        </div>
        <div class="field grow">
          <label>{{ isPolar ? "半径（px）" : "南北偏移（y 向上为正）" }}</label>
          <el-input-number
            :model-value="params.coordinate.y"
            :min="isPolar ? 0 : undefined"
            :step="1"
            :precision="0"
            controls-position="right"
            @update:model-value="
              (v: number | undefined) =>
                updateCoordinate({ y: v === undefined || Number.isNaN(v) ? 0 : v })
            "
          />
        </div>
        <div class="field">
          <label>输入表达</label>
          <el-select
            :model-value="params.coordinate.form ?? 'cartesian'"
            @update:model-value="(v: 'cartesian' | 'polar') => onFormChange(v)"
          >
            <el-option label="直角 (dx/dy)" value="cartesian" />
            <el-option label="极坐标 (角度/半径)" value="polar" />
          </el-select>
        </div>
        <div class="field">
          <label>象限</label>
          <span class="quadrant-badge">{{ quadrantText }}</span>
        </div>
      </template>
      <div class="field">
        <label>坐标模式</label>
        <el-select
          :model-value="params.coordinate.mode"
          @update:model-value="
            (v: 'pixel' | 'percent' | 'center') => {
              const coord: ClickStepParams['coordinate'] = {
                ...params.coordinate,
                mode: v,
              };
              if (v === 'center') coord.form = coord.form ?? 'cartesian';
              else delete coord.form;
              update({ coordinate: coord });
            }
          "
        >
          <el-option label="像素" value="pixel" />
          <el-option label="百分比" value="percent" />
          <el-option label="中心（角色）" value="center" />
        </el-select>
      </div>
    </div>
    <div v-if="isCenter" class="center-hints">
      <span v-if="isPolar" class="polar-preview">{{ polarPreview }}</span>
      <span v-if="!origin" class="origin-warning">
        <LocateFixed :size="12" />
        未标定原点，执行时使用客户区几何中心 (50, 50)
        <el-button size="small" text type="primary" @click="emit('mark-origin')">
          去标定
        </el-button>
      </span>
      <span v-else class="origin-ok">
        <LocateFixed :size="12" />
        原点已标定: {{ origin.xPercent }}%, {{ origin.yPercent }}%
      </span>
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
.quadrant-badge {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border: var(--border-width) solid var(--border-color-light);
  border-radius: var(--radius-sm, 4px);
  background-color: var(--bg-color-secondary, transparent);
  font-size: 12px;
  color: var(--el-color-primary);
  white-space: nowrap;
}
.center-hints {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
}
.polar-preview {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  color: var(--el-text-color-secondary);
}
.origin-warning {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
}
.origin-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
}
</style>
