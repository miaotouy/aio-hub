<script setup lang="ts">
/**
 * 动作流编辑器（步骤列表）
 *
 * 功能：
 *  - 拖拽排序（vuedraggable）；
 *  - 选中步骤（高亮当前 + 正在执行的步骤）；
 *  - 单步启用/禁用、删除；
 *  - 顶部"新增步骤"按钮组（按类型新增）。
 */
import { computed } from "vue";
import {
  MousePointerClick,
  Keyboard,
  Hourglass,
  Palette,
  CornerDownRight,
  Repeat,
  FileText,
  TextCursorInput,
  Plus,
  Trash2,
  Power,
  PowerOff,
  GripVertical,
} from "lucide-vue-next";
import draggable from "vuedraggable";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import type { FlowStep, StepType } from "../types";

const store = useWindowAutomatorStore();
const emit = defineEmits<{
  (e: "add-step", type: StepType): void;
}>();

const steps = computed<FlowStep[]>({
  get: () => store.currentFlow?.steps ?? [],
  set: (val) => {
    if (store.currentFlow) store.setSteps(store.currentFlow.id, val);
  },
});

const stepTypes: Array<{ type: StepType; label: string; icon: any }> = [
  { type: "click", label: "点击", icon: MousePointerClick },
  { type: "keypress", label: "按键", icon: Keyboard },
  { type: "delay", label: "延时", icon: Hourglass },
  { type: "colorCheck", label: "颜色判断", icon: Palette },
  { type: "goto", label: "跳转", icon: CornerDownRight },
  { type: "counter", label: "循环计数", icon: Repeat },
  { type: "log", label: "日志", icon: FileText },
  { type: "ocr", label: "OCR 识别", icon: TextCursorInput },
];

function selectStep(step: FlowStep) {
  store.selectStep(step.id);
}

function toggleEnabled(step: FlowStep) {
  if (!store.currentFlow) return;
  store.updateStep(store.currentFlow.id, step.id, { enabled: !step.enabled });
}

function removeStep(step: FlowStep) {
  if (!store.currentFlow) return;
  store.deleteStep(store.currentFlow.id, step.id);
}

function describeStep(step: FlowStep): string {
  const c = step.stepConfig;
  switch (c.type) {
    case "click": {
      const m = c.params.coordinate.mode === "percent" ? "%" : "px";
      return `(${c.params.coordinate.x}${m}, ${c.params.coordinate.y}${m}) ${c.params.clickType === "double" ? "双击" : "单击"} ${c.params.button}/${c.params.mode}`;
    }
    case "keypress":
      return `${c.params.modifiers.join("+")}${c.params.modifiers.length ? "+" : ""}${c.params.key} (${c.params.mode})`;
    case "delay":
      return `${c.params.duration}ms ±${c.params.randomRange}`;
    case "colorCheck":
      return c.params.checkMode === "point"
        ? `点 (${c.params.coordinate?.x}, ${c.params.coordinate?.y}) ${c.params.expectedColor} ±${c.params.tolerance}%`
        : `区 (${c.params.rect?.x},${c.params.rect?.y} ${c.params.rect?.width}x${c.params.rect?.height}) ${c.params.expectedColor} ±${c.params.tolerance}%`;
    case "goto":
      return `→ 步骤 ${findStepLabel(c.params.targetStepId)}`;
    case "counter":
      return `上限 ${c.params.maxCount}`;
    case "log":
      return `${c.params.level}: ${c.params.message || "(空)"}`;
    case "ocr":
      return `${c.params.engineType} (${c.params.rect.width}x${c.params.rect.height}) "${c.params.keyword || "(任意)"}"`;
  }
}

function findStepLabel(stepId: string): string {
  if (!stepId || !store.currentFlow) return "—";
  const idx = store.currentFlow.steps.findIndex((s) => s.id === stepId);
  return idx >= 0 ? `#${idx + 1}` : "(未指向)";
}

const isEmpty = computed(() => steps.value.length === 0);
</script>

<template>
  <div class="flow-editor">
    <div class="editor-header">
      <div class="header-title">步骤流 ({{ steps.length }})</div>
    </div>

    <div class="add-step-bar">
      <el-tooltip
        v-for="t in stepTypes"
        :key="t.type"
        :content="`新增 ${t.label} 步骤`"
        placement="top"
      >
        <el-button size="small" :icon="Plus" @click="emit('add-step', t.type)">
          <component :is="t.icon" :size="14" />
          {{ t.label }}
        </el-button>
      </el-tooltip>
    </div>

    <div v-if="isEmpty" class="empty">暂无步骤，使用上方按钮新增第一个步骤</div>

    <draggable
      v-else
      v-model="steps"
      item-key="id"
      handle=".drag-handle"
      ghost-class="step-ghost"
      class="step-list"
    >
      <template #item="{ element, index }">
        <div
          class="step-item"
          :class="{
            selected: store.selectedStepId === element.id,
            active:
              store.runtime.status === 'running' &&
              store.runtime.currentStepIndex === index,
            disabled: !element.enabled,
          }"
          @click="selectStep(element)"
        >
          <div class="drag-handle" @click.stop>
            <GripVertical :size="14" />
          </div>
          <div class="index">{{ index + 1 }}</div>
          <div class="content">
            <div class="row1">
              <input
                class="label-input"
                :value="element.label"
                @click.stop
                @input="
                  (e: Event) => {
                    const t = e.target as HTMLInputElement;
                    if (store.currentFlow)
                      store.updateStep(store.currentFlow.id, element.id, {
                        label: t.value,
                      });
                  }
                "
              />
            </div>
            <div class="row2">{{ describeStep(element) }}</div>
          </div>
          <div class="actions" @click.stop>
            <el-tooltip
              :content="element.enabled ? '禁用此步骤' : '启用此步骤'"
              placement="top"
            >
              <el-button
                size="small"
                link
                :icon="element.enabled ? Power : PowerOff"
                @click="toggleEnabled(element)"
              />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button
                size="small"
                link
                :icon="Trash2"
                @click="removeStep(element)"
              />
            </el-tooltip>
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.flow-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.editor-header {
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--header-bg);
}
.header-title {
  font-weight: 500;
  font-size: 14px;
}
.add-step-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color-light);
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  padding: 32px;
}
.step-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color);
  cursor: pointer;
  transition: all 0.15s;
}
.step-item:hover {
  border-color: var(--el-color-primary-light-5);
}
.step-item.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.step-item.active {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}
.step-item.disabled {
  opacity: 0.55;
}
.step-ghost {
  opacity: 0.4;
  background-color: var(--el-color-primary-light-9);
}
.drag-handle {
  color: var(--el-text-color-placeholder);
  cursor: grab;
  display: flex;
  align-items: center;
}
.drag-handle:active {
  cursor: grabbing;
}
.index {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.step-item.active .index {
  background-color: var(--el-color-primary);
  color: white;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row1 {
  display: flex;
  align-items: center;
  gap: 6px;
}
.label-input {
  border: none;
  background: transparent;
  font-weight: 500;
  color: var(--el-text-color-primary);
  width: 100%;
  outline: none;
  padding: 2px 0;
  font-size: 13px;
}
.label-input:focus {
  background-color: var(--el-fill-color-light);
  border-radius: 2px;
  padding: 2px 4px;
}
.row2 {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
}
.actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
</style>
