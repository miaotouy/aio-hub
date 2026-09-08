<template>
  <aside class="batch-input-sidebar">
    <!-- 添加目录区 -->
    <section class="sidebar-section">
      <h3 class="section-title">添加目录</h3>
      <DropZone
        variant="input"
        :directory-only="true"
        :multiple="false"
        hide-content
        @drop="handlePathDrop"
      >
        <div class="path-input-group">
          <el-input
            :model-value="directoryPath"
            placeholder="拖拽、输入或选择目录路径"
            @update:model-value="$emit('update:directoryPath', $event)"
            @keyup.enter="$emit('scan-path')"
          />
          <el-button :icon="FolderOpened" @click.stop="$emit('add-directory')">
            选择
          </el-button>
        </div>
      </DropZone>

      <!-- 候选列表统计 -->
      <div v-if="candidateCount > 0" class="candidates-summary">
        <div class="summary-row">
          <span class="summary-label">候选图片</span>
          <span class="summary-value">{{ candidateCount }} 张</span>
        </div>
        <el-button
          size="small"
          text
          type="danger"
          @click="$emit('clear-candidates')"
        >
          清空全部
        </el-button>
      </div>
    </section>

    <!-- 扫描设置区 -->
    <section class="sidebar-section">
      <h3 class="section-title">扫描设置</h3>

      <div class="config-item">
        <label class="config-label">递归深度</label>
        <el-select
          :model-value="maxDepth"
          size="small"
          @update:model-value="$emit('update:maxDepth', $event)"
        >
          <el-option label="仅当前目录" :value="0" />
          <el-option label="递归 1 层" :value="1" />
          <el-option label="递归 2 层" :value="2" />
          <el-option label="递归 3 层" :value="3" />
          <el-option label="无限递归" :value="9999" />
        </el-select>
      </div>
    </section>
    <!-- 分析控制区 -->
    <section class="sidebar-section">
      <el-button
        type="primary"
        size="large"
        :disabled="candidateCount === 0 || analyzing"
        :loading="analyzing"
        style="width: 100%"
        @click="$emit('start-analyze')"
      >
        {{ analyzing ? "分析中..." : `开始分析 (${candidateCount} 张)` }}
      </el-button>

      <!-- 分析进度 -->
      <div v-if="analyzing" class="progress-section">
        <el-progress :percentage="progressPercent" :stroke-width="8" />
        <div class="progress-stats">
          <span class="progress-label">已完成</span>
          <span class="progress-value">{{ completed }} / {{ total }}</span>
        </div>
        <div v-if="etaSeconds !== null" class="progress-stats">
          <span class="progress-label">预计剩余</span>
          <span class="progress-value">{{ formatDuration(etaSeconds) }}</span>
        </div>
        <el-button size="small" text @click="$emit('cancel-analyze')">
          取消分析
        </el-button>
      </div>
    </section>

    <section class="sidebar-section">
      <h3 class="section-title">分类配置</h3>
      <p class="classification-hint">调整后无需重新分析</p>
      <div class="config-item">
        <BrightnessThresholdSlider
          ref="brightnessSlider"
          :model-value="thresholds"
          @update:model-value="$emit('update:thresholds', $event)"
          ><ClassificationPresetToolbar
            label="亮度"
            :value="thresholds"
            :builtin="builtinBrightnessOptions"
            :custom="brightnessOptions"
            :selected-id="presetState.selectedBrightnessPreset"
            @select="applyBrightness"
            :save-preset="saveBrightness"
            :remove-preset="removeBrightness"
        /></BrightnessThresholdSlider>
      </div>
      <ColorFamilyPointsEditor
        :model-value="colorPoints"
        :custom-presets="colorOptions"
        :selected-preset="presetState.selectedColorPreset"
        @select-preset="setColorPreset"
        :save-preset="saveColor"
        :remove-preset="removeColor"
        @update:model-value="$emit('update:colorPoints', $event)"
      />
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { FolderOpened } from "@element-plus/icons-vue";
import DropZone from "@/components/common/DropZone.vue";
import ColorFamilyPointsEditor from "./ColorFamilyPointsEditor.vue";
import type { ColorFamilyPoint } from "../colorFamilyPoints";
import BrightnessThresholdSlider from "./BrightnessThresholdSlider.vue";

import ClassificationPresetToolbar from "./ClassificationPresetToolbar.vue";
import {
  builtinBrightnessOptions,
  type ClassificationPresetState,
  type PresetOption,
} from "../classificationPresets";
interface Props {
  presetState: ClassificationPresetState;
  persistPresets: (state: ClassificationPresetState) => Promise<void>;
  colorPoints: ColorFamilyPoint[];
  candidateCount: number;
  directoryPath: string;
  maxDepth: number | null;
  thresholds: number[];
  analyzing: boolean;
  completed: number;
  total: number;
  etaSeconds: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:presetState", value: ClassificationPresetState): void;
  (e: "add-directory"): void;
  (e: "scan-path"): void;
  (e: "clear-candidates"): void;
  (e: "update:directoryPath", value: string): void;
  (e: "update:maxDepth", value: number | null): void;
  (e: "update:thresholds", value: number[]): void;
  (e: "update:colorPoints", value: ColorFamilyPoint[]): void;
  (e: "start-analyze"): void;
  (e: "cancel-analyze"): void;
  (e: "drop", paths: string[]): void;
}>();

const brightnessSlider = ref<InstanceType<typeof BrightnessThresholdSlider>>();
const brightnessOptions = computed(() =>
  props.presetState.brightnessPresets.map((p) => ({
    id: p.id,
    name: p.name,
    value: p.thresholds,
  }))
);
const colorOptions = computed(() =>
  props.presetState.colorPresets.map((p) => ({
    id: p.id,
    name: p.name,
    value: p.colorPoints,
  }))
);
function patchPresets(patch: Partial<ClassificationPresetState>) {
  emit("update:presetState", { ...props.presetState, ...patch });
}
function applyBrightness(option: PresetOption<number[]>) {
  brightnessSlider.value?.stopDragging();
  emit("update:thresholds", [...option.value]);
  patchPresets({ selectedBrightnessPreset: option.id });
}
async function saveBrightness(option: PresetOption<number[]>) {
  const record = {
    id: option.id,
    name: option.name,
    thresholds: [...option.value],
  };
  const list = props.presetState.brightnessPresets;
  await props.persistPresets({
    ...props.presetState,
    brightnessPresets: list.some((p) => p.id === option.id)
      ? list.map((p) => (p.id === option.id ? record : p))
      : [...list, record],
    selectedBrightnessPreset: option.id,
  });
}
async function removeBrightness(id: string) {
  await props.persistPresets({
    ...props.presetState,
    brightnessPresets: props.presetState.brightnessPresets.filter(
      (p) => p.id !== id
    ),
    selectedBrightnessPreset: null,
  });
}
function setColorPreset(id: string) {
  patchPresets({ selectedColorPreset: id });
}
async function saveColor(option: PresetOption<ColorFamilyPoint[]>) {
  const record = {
    id: option.id,
    name: option.name,
    colorPoints: option.value.map((p) => ({ ...p })),
  };
  const list = props.presetState.colorPresets;
  await props.persistPresets({
    ...props.presetState,
    colorPresets: list.some((p) => p.id === option.id)
      ? list.map((p) => (p.id === option.id ? record : p))
      : [...list, record],
    selectedColorPreset: option.id,
  });
}
async function removeColor(id: string) {
  await props.persistPresets({
    ...props.presetState,
    colorPresets: props.presetState.colorPresets.filter((p) => p.id !== id),
    selectedColorPreset: null,
  });
}

const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    emit("update:directoryPath", paths[0]);
    emit("drop", [paths[0]]);
  }
};

const progressPercent = computed(() =>
  props.total ? Math.round((props.completed / props.total) * 100) : 0
);

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};
</script>

<style scoped>
.classification-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin: 0 0 12px;
}
.batch-input-sidebar {
  width: 340px;
  box-sizing: border-box;
  flex-shrink: 0;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 768px) {
  .batch-input-sidebar {
    width: 100%;
    flex-shrink: 1;
    overflow-y: visible;
  }
}

.sidebar-section {
  flex-shrink: 0;
  min-width: 0;
}

.sidebar-section + .sidebar-section {
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-color);
}

.path-input-group {
  display: flex;
  gap: 6px;
}

.path-input-group .el-input {
  min-width: 0;
}

.candidates-summary {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.config-item {
  margin-bottom: 16px;
}

.config-item:last-child {
  margin-bottom: 0;
}

.config-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-color);
}

.threshold-control {
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.threshold-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.progress-section {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.progress-label {
  color: var(--el-text-color-secondary);
}

.progress-value {
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
