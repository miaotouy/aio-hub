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
 * 一体化步骤流编辑器（Quicker 风格 + VSCode 折叠）
 *
 * 关键设计：
 *  - 步骤卡片默认折叠为高密度行，仅显示序号/类型/标签/摘要/快捷入口/徽章/动作。
 *  - 点击卡片切换内嵌配置表单的展开（accordion）。
 *  - 延时（delay）步骤在头部直接提供数字输入框做 quick edit。
 *  - 跳转类步骤（goto / colorCheck / counter / ocr）在头部显示"→ #N"徽章。
 *  - 任何被其他步骤跳转指向的步骤在头部显示"← 来自 #N, #M"徽章。
 *  - 卡片左侧有彩色视觉边条，区分步骤类型。
 *  - 正在执行的卡片显示呼吸灯高亮。
 *  - 点击/颜色判断/OCR 步骤在展开区提供"截图取点/框选"入口。
 */
import { computed, ref, nextTick } from "vue";
import {
  MousePointerClick,
  Keyboard,
  Hourglass,
  Palette,
  CornerDownRight,
  Repeat,
  FileText,
  TextCursorInput,
  Camera,
  Crop,
  Trash2,
  Power,
  PowerOff,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Workflow,
  ArrowLeftToLine,
  Settings,
} from "lucide-vue-next";
import { VueDraggableNext } from "vue-draggable-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import ClickConfig from "./step-configs/ClickConfig.vue";
import KeyPressConfig from "./step-configs/KeyPressConfig.vue";
import DelayConfig from "./step-configs/DelayConfig.vue";
import ColorCheckConfig from "./step-configs/ColorCheckConfig.vue";
import GotoConfig from "./step-configs/GotoConfig.vue";
import CounterConfig from "./step-configs/CounterConfig.vue";
import LogConfig from "./step-configs/LogConfig.vue";
import OcrConfig from "./step-configs/OcrConfig.vue";
import CallConfig from "./step-configs/CallConfig.vue";
import ScreenshotPicker from "./ScreenshotPicker.vue";
import SubFlowSettingsDialog from "./SubFlowSettingsDialog.vue";
import type {
  FlowStep,
  StepType,
  StepParams,
  ScreenshotPickerResult,
  ColorCheckStepParams,
  OcrStepParams,
  ClickStepParams,
  DelayStepParams,
} from "../types";

const store = useWindowAutomatorStore();

/** 步骤多选状态（用于提取为函数） */
const selectedStepIds = ref<string[]>([]);
const isIdle = computed(() => store.runtime.status === "idle");

function toggleStepSelection(stepId: string) {
  const idx = selectedStepIds.value.indexOf(stepId);
  if (idx >= 0) {
    selectedStepIds.value.splice(idx, 1);
  } else {
    selectedStepIds.value.push(stepId);
  }
}

function clearSelection() {
  selectedStepIds.value = [];
}

async function extractToFunction() {
  if (selectedStepIds.value.length === 0) return;
  let name = "新提取函数";
  try {
    const { value } = await ElMessageBox.prompt(
      "输入提取的函数名称",
      "提取为函数",
      {
        inputValue: name,
        confirmButtonText: "提取",
        cancelButtonText: "取消",
        lockScroll: false,
      }
    );
    if (!value) return;
    name = value.trim() || "新提取函数";
  } catch {
    return;
  }

  const { subFlow, clearedRefs } = store.extractSelectedToSubFlow(
    selectedStepIds.value,
    name
  );

  if (subFlow) {
    customMessage.success(`已成功提取函数: ${subFlow.name}`);
    if (clearedRefs > 0) {
      customMessage.warning(`已自动清理 ${clearedRefs} 处跨提取范围的跳转引用`);
    }
    selectedStepIds.value = [];
    expandedStepId.value = null;
  } else {
    customMessage.error("提取失败");
  }
}

/**
 * 当前编辑器显示的步骤：主流程或当前编辑的子流程。
 * store.editingSteps 已经做完了主/子流程切换，
 * 这里只需把 setter 也分发到对应的 setSteps / setSubFlowSteps。
 */
const steps = computed<FlowStep[]>({
  get: () => store.editingSteps,
  set: (val) => {
    if (!store.currentFlow) return;
    if (store.currentEditingSubFlowId) {
      store.setSubFlowSteps(store.currentEditingSubFlowId, val);
    } else {
      store.setSteps(store.currentFlow.id, val);
    }
  },
});

/** 是否正在编辑子流程（用于头部面包屑与按钮） */
const isEditingSubFlow = computed(() => !!store.currentEditingSubFlowId);

/**
 * 根据当前编辑上下文，把步骤 CRUD 操作分发到主流程或子流程。
 * 这样原有 step 列表内的所有拖拽/选中/删除/更新逻辑零改动直接复用。
 */
function deleteStepByContext(stepId: string) {
  if (!store.currentFlow) return;
  if (store.currentEditingSubFlowId) {
    store.deleteSubFlowStep(store.currentEditingSubFlowId, stepId);
  } else {
    store.deleteStep(store.currentFlow.id, stepId);
  }
}

function updateStepByContext(stepId: string, patch: Partial<FlowStep>) {
  if (!store.currentFlow) return;
  if (store.currentEditingSubFlowId) {
    store.updateSubFlowStep(store.currentEditingSubFlowId, stepId, patch);
  } else {
    store.updateStep(store.currentFlow.id, stepId, patch);
  }
}

/** 当前展开的步骤 ID；同时只允许一个展开（accordion 行为） */
const expandedStepId = ref<string | null>(null);
/** 高亮（鼠标悬停徽章时）的目标步骤 ID 集合 */
const highlightedStepIds = ref<Set<string>>(new Set());

/** 截图选点弹窗状态 */
const showScreenshotPicker = ref(false);
const screenshotMode = ref<"point" | "rect">("point");
const screenshotStepId = ref<string | null>(null);

const isEmpty = computed(() => steps.value.length === 0);

/** 步骤类型 → 视觉色 & 图标映射 */
const typeMeta: Record<
  StepType,
  { color: string; label: string; icon: typeof MousePointerClick }
> = {
  click: { color: "#3b82f6", label: "点击", icon: MousePointerClick },
  keypress: { color: "#8b5cf6", label: "按键", icon: Keyboard },
  delay: { color: "#f59e0b", label: "延时", icon: Hourglass },
  colorCheck: { color: "#a855f7", label: "颜色判断", icon: Palette },
  goto: { color: "#ec4899", label: "跳转", icon: CornerDownRight },
  counter: { color: "#10b981", label: "循环计数", icon: Repeat },
  log: { color: "#64748b", label: "日志", icon: FileText },
  ocr: { color: "#22c55e", label: "OCR 识别", icon: TextCursorInput },
  call: { color: "#0ea5e9", label: "调用函数", icon: Workflow },
};

function metaFor(type: StepType) {
  return typeMeta[type];
}

/** 索引（1-based）→ ID 映射 */
const indexByStepId = computed(() => {
  const map = new Map<string, number>();
  steps.value.forEach((s, i) => map.set(s.id, i + 1));
  return map;
});

function indexOf(stepId: string): number {
  return indexByStepId.value.get(stepId) ?? -1;
}

/** 单行摘要 */
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
      return c.params.targetStepId
        ? `→ 步骤 #${indexOf(c.params.targetStepId) || "?"}`
        : "→ (未配置)";
    case "counter":
      return `上限 ${c.params.maxCount}`;
    case "log":
      return `${c.params.level}: ${c.params.message || "(空)"}`;
    case "ocr":
      return `${c.params.engineType} (${c.params.rect.width}x${c.params.rect.height}) "${c.params.keyword || "(任意)"}"`;
    case "call": {
      const target = store.currentFlow?.subFlows?.find(
        (s) => s.id === c.params.targetSubFlowId
      );
      return target ? `→ ${target.name}` : "→ (未选择函数)";
    }
  }
}

/**
 * 每个步骤的"出向"跳转目标 ID 列表。
 * 用于在卡片头部展示跳转源徽章（"→ #N"）。
 */
function outboundTargets(step: FlowStep): string[] {
  const c = step.stepConfig;
  const ids: string[] = [];
  if (c.type === "goto") {
    if (c.params.targetStepId) ids.push(c.params.targetStepId);
  } else if (c.type === "colorCheck") {
    if (c.params.matchGoto) ids.push(c.params.matchGoto);
    if (c.params.mismatchGoto) ids.push(c.params.mismatchGoto);
  } else if (c.type === "counter") {
    if (c.params.notReachedGotoId) ids.push(c.params.notReachedGotoId);
    if (c.params.reachedGotoId) ids.push(c.params.reachedGotoId);
  } else if (c.type === "ocr") {
    if (c.params.matchGoto) ids.push(c.params.matchGoto);
    if (c.params.mismatchGoto) ids.push(c.params.mismatchGoto);
  }
  return ids.filter((id) => indexOf(id) > 0);
}

/**
 * 反向索引：步骤 ID → 引用了它的步骤 ID 列表。
 * 用于显示跳转目标徽章（"↩ 来自 #N, #M"）。
 */
const incomingByStepId = computed(() => {
  const map = new Map<string, string[]>();
  for (const s of steps.value) {
    for (const target of outboundTargets(s)) {
      if (!map.has(target)) map.set(target, []);
      map.get(target)!.push(s.id);
    }
  }
  return map;
});

function incomingSources(stepId: string): string[] {
  return incomingByStepId.value.get(stepId) ?? [];
}

function isJumper(step: FlowStep): boolean {
  return outboundTargets(step).length > 0;
}

/** 拼接 "← 来自" 徽章文本：最多显示 3 个，多了 +N */
function formatIncomingLabel(stepId: string): string {
  const ids = incomingSources(stepId);
  if (ids.length === 0) return "";
  const shown = ids.slice(0, 3);
  const text = shown.map((id) => `#${indexOf(id)}`).join(", ");
  return ids.length > 3 ? `${text} +${ids.length - 3}` : text;
}

// ===================== 交互 =====================

function toggleExpand(step: FlowStep) {
  expandedStepId.value = expandedStepId.value === step.id ? null : step.id;
}

function selectStep(step: FlowStep) {
  store.selectStep(step.id);
  toggleExpand(step);
}

function toggleEnabled(step: FlowStep) {
  updateStepByContext(step.id, { enabled: !step.enabled });
}

function removeStep(step: FlowStep) {
  if (expandedStepId.value === step.id) expandedStepId.value = null;
  deleteStepByContext(step.id);
}

function updateLabel(step: FlowStep, value: string) {
  updateStepByContext(step.id, { label: value });
}

/** 内嵌配置的 update:params 回写 */
function onInlineParamsUpdate(step: FlowStep, next: StepParams["params"]) {
  updateStepByContext(step.id, {
    stepConfig: { type: step.stepConfig.type, params: next } as StepParams,
  });
}

/** 延时步骤的 quick edit：直接更新 duration */
function updateDelayDuration(step: FlowStep, value: number | undefined) {
  if (step.stepConfig.type !== "delay") return;
  const next: DelayStepParams = {
    ...step.stepConfig.params,
    duration: Math.max(0, Number(value) || 0),
  };
  updateStepByContext(step.id, {
    stepConfig: { type: "delay", params: next },
  });
}

function backToMainFlow() {
  store.exitSubFlow();
  expandedStepId.value = null;
}

// ===================== 函数设置对话框 =====================
/** 函数设置对话框的显隐与目标子流程 id */
const subFlowSettingsOpen = ref(false);
function openSubFlowSettings() {
  if (!store.currentEditingSubFlowId) return;
  subFlowSettingsOpen.value = true;
}

// ===================== 函数签名概览 =====================
const subFlowSignature = computed(() => {
  const sub = store.currentEditingSubFlow;
  if (!sub) return "";
  const params = (sub.params ?? [])
    .map((p) => p.label?.trim() || p.name)
    .join(", ");
  const ret = sub.returnVariableName ? ` -> ${sub.returnVariableName}` : "";
  return `${sub.name}(${params})${ret}`;
});

// ===================== 徽章交互 =====================

function highlightTargets(targets: string[]) {
  highlightedStepIds.value = new Set(targets);
}
function clearHighlight() {
  if (highlightedStepIds.value.size > 0) highlightedStepIds.value = new Set();
}

async function scrollToStep(stepId: string) {
  const el = document.querySelector<HTMLElement>(`[data-step-id="${stepId}"]`);
  if (!el) return;
  // 展开目标
  if (expandedStepId.value !== stepId) {
    expandedStepId.value = stepId;
    await nextTick();
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // 短暂高亮后清除
  highlightedStepIds.value = new Set([stepId]);
  window.setTimeout(() => clearHighlight(), 1200);
}

// ===================== 截图入口 =====================

function openScreenshotPicker(step: FlowStep, mode: "point" | "rect") {
  screenshotStepId.value = step.id;
  screenshotMode.value = mode;
  showScreenshotPicker.value = true;
}

function onPickerConfirm(result: ScreenshotPickerResult) {
  if (!store.currentFlow || !screenshotStepId.value) return;
  const step = steps.value.find((s) => s.id === screenshotStepId.value);
  if (!step) {
    showScreenshotPicker.value = false;
    return;
  }
  const c = step.stepConfig;
  if (c.type === "click") {
    const next: ClickStepParams = {
      ...c.params,
      coordinate: { mode: "pixel", x: result.x, y: result.y },
    };
    updateStepByContext(step.id, {
      stepConfig: { type: "click", params: next },
    });
  } else if (c.type === "colorCheck" && result.rect) {
    const next: ColorCheckStepParams = {
      ...c.params,
      checkMode: "rect",
      rect: {
        x: result.rect.x,
        y: result.rect.y,
        width: result.rect.width,
        height: result.rect.height,
        mode: "pixel",
      },
      coordinate: undefined,
    };
    updateStepByContext(step.id, {
      stepConfig: { type: "colorCheck", params: next },
    });
  } else if (c.type === "ocr" && result.rect) {
    const next: OcrStepParams = {
      ...c.params,
      rect: {
        x: result.rect.x,
        y: result.rect.y,
        width: result.rect.width,
        height: result.rect.height,
        mode: "pixel",
      },
    };
    updateStepByContext(step.id, {
      stepConfig: { type: "ocr", params: next },
    });
  }
  showScreenshotPicker.value = false;
  screenshotStepId.value = null;
}

function onPickerCancel() {
  showScreenshotPicker.value = false;
  screenshotStepId.value = null;
}

const supportsPointPick = (type: StepType) => type === "click";
const supportsRectPick = (type: StepType) =>
  type === "colorCheck" || type === "ocr";

// ===================== 当前活动步骤 =====================

/**
 * 当前编辑上下文下的"活动步骤"判定。
 *  - 编辑主流程：主流程高亮步骤（currentStepIndex）= 正在执行的主流程步骤；
 *    当嵌套在子流程里时，currentStepIndex 会被 executor 锁定为调用方 call 步骤。
 *  - 编辑子流程：调用栈最后一帧的 stepIndex 才是该子流程内正在跑的步骤。
 */
const isStepActive = (index: number) => {
  if (store.runtime.status !== "running") return false;
  if (isEditingSubFlow.value) {
    const stack = store.runtime.currentCallStack;
    const last = stack[stack.length - 1];
    if (!last) return false;
    if (last.subFlowId !== store.currentEditingSubFlowId) return false;
    return last.stepIndex === index;
  }
  return store.runtime.currentStepIndex === index;
};
</script>

<template>
  <div class="flow-editor">
    <div class="editor-header">
      <div class="header-title">
        <el-tooltip
          v-if="isEditingSubFlow"
          content="返回主流程"
          placement="bottom"
        >
          <button
            class="back-btn"
            type="button"
            aria-label="返回主流程"
            @click="backToMainFlow"
          >
            <ArrowLeftToLine :size="14" />
          </button>
        </el-tooltip>
        <span class="title-text">步骤流</span>
        <span v-if="isEditingSubFlow" class="subflow-tag">
          (函数: {{ store.currentEditingSubFlow?.name }})
        </span>
        <span v-else class="main-tag">(主流程)</span>
        <span class="count">({{ steps.length }})</span>
        <el-tooltip
          v-if="isEditingSubFlow"
          content="函数设置（形参 / 返回值）"
          placement="bottom"
        >
          <button
            class="back-btn"
            type="button"
            aria-label="函数设置"
            @click="openSubFlowSettings"
          >
            <Settings :size="14" />
          </button>
        </el-tooltip>
      </div>
      <div v-if="selectedStepIds.length > 0" class="header-actions">
        <el-button
          type="primary"
          size="small"
          :icon="Workflow"
          @click="extractToFunction"
        >
          提取为函数 ({{ selectedStepIds.length }})
        </el-button>
        <el-button size="small" @click="clearSelection"> 取消选择 </el-button>
      </div>
      <div v-else-if="isEditingSubFlow && subFlowSignature" class="header-sig">
        签名: <code>{{ subFlowSignature }}</code>
      </div>
      <div v-else class="header-hint">点击卡片展开/收起配置</div>
    </div>

    <div v-if="isEmpty" class="empty">
      暂无步骤，请从左侧工具箱添加第一个步骤
    </div>

    <VueDraggableNext
      v-else
      v-model="steps"
      item-key="id"
      handle=".drag-handle"
      ghost-class="step-ghost"
      drag-class="drag-step"
      class="step-list"
      :force-fallback="true"
      :animation="200"
    >
      <div
        v-for="(element, index) in steps"
        :key="element.id"
        :data-step-id="element.id"
        class="step-item"
        :class="{
          selected: store.selectedStepId === element.id,
          active: isStepActive(index),
          disabled: !element.enabled,
          expanded: expandedStepId === element.id,
          highlighted: highlightedStepIds.has(element.id),
          'multi-selected': selectedStepIds.includes(element.id),
        }"
        :style="{
          '--type-color': metaFor(element.stepConfig.type).color,
        }"
        @click="selectStep(element)"
      >
        <div class="step-strip" aria-hidden="true"></div>

        <!-- 多选复选框 -->
        <div v-if="isIdle" class="step-checkbox" @click.stop>
          <el-checkbox
            :model-value="selectedStepIds.includes(element.id)"
            @change="toggleStepSelection(element.id)"
          />
        </div>

        <button
          class="expand-toggle"
          type="button"
          :aria-label="expandedStepId === element.id ? '收起' : '展开'"
          @click.stop="toggleExpand(element)"
        >
          <component
            :is="expandedStepId === element.id ? ChevronDown : ChevronRight"
            :size="14"
          />
        </button>

        <div class="drag-handle" @click.stop>
          <GripVertical :size="14" />
        </div>

        <div class="index">{{ index + 1 }}</div>

        <div class="type-chip">
          <component :is="metaFor(element.stepConfig.type).icon" :size="13" />
          <span>{{ metaFor(element.stepConfig.type).label }}</span>
        </div>

        <div class="content">
          <div class="row1">
            <input
              class="label-input"
              :value="element.label"
              placeholder="步骤标签"
              @click.stop
              @input="
                (e: Event) =>
                  updateLabel(element, (e.target as HTMLInputElement).value)
              "
            />
          </div>
          <div class="row2">{{ describeStep(element) }}</div>
        </div>

        <!-- 延时 quick edit -->
        <div
          v-if="element.stepConfig.type === 'delay'"
          class="quick-edit"
          @click.stop
        >
          <el-input-number
            :model-value="element.stepConfig.params.duration"
            :min="0"
            :step="100"
            :precision="0"
            size="small"
            controls-position="right"
            style="width: 110px"
            @update:model-value="
              (v: number | undefined) => updateDelayDuration(element, v)
            "
          />
          <span class="quick-unit">ms</span>
        </div>

        <!-- 跳转源徽章 -->
        <div
          v-if="isJumper(element)"
          class="badges"
          @click.stop
          @mouseleave="clearHighlight()"
        >
          <el-tooltip
            v-for="target in outboundTargets(element)"
            :key="`out-${target}`"
            :content="`跳转到 #${indexOf(target)}`"
            placement="top"
          >
            <span
              class="badge badge-out"
              @mouseenter="highlightTargets([target])"
              @click="scrollToStep(target)"
            >
              → #{{ indexOf(target) }}
            </span>
          </el-tooltip>
        </div>

        <!-- 跳转目标徽章（来自谁） -->
        <div
          v-if="incomingSources(element.id).length"
          class="badges"
          @click.stop
        >
          <el-tooltip
            :content="`被 ${incomingSources(element.id).length} 个步骤引用`"
            placement="top"
          >
            <span
              class="badge badge-in"
              @click="scrollToStep(incomingSources(element.id)[0])"
            >
              ← {{ formatIncomingLabel(element.id) }}
            </span>
          </el-tooltip>
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

        <!-- 内嵌配置区 -->
        <transition name="expand">
          <div
            v-if="expandedStepId === element.id"
            class="inline-config"
            @click.stop
          >
            <div
              v-if="
                supportsPointPick(element.stepConfig.type) ||
                supportsRectPick(element.stepConfig.type)
              "
              class="inline-toolbar"
            >
              <el-button
                v-if="supportsPointPick(element.stepConfig.type)"
                :icon="Camera"
                size="small"
                :disabled="!store.boundWindow"
                @click="openScreenshotPicker(element, 'point')"
              >
                截图取点
              </el-button>
              <el-button
                v-if="supportsRectPick(element.stepConfig.type)"
                :icon="Crop"
                size="small"
                :disabled="!store.boundWindow"
                @click="openScreenshotPicker(element, 'rect')"
              >
                截图框选
              </el-button>
              <span v-if="!store.boundWindow" class="toolbar-hint">
                <Camera :size="12" /> 需先在左侧工具箱绑定目标窗口
              </span>
            </div>

            <ClickConfig
              v-if="element.stepConfig.type === 'click'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'click' }>)
                  .params
              "
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <KeyPressConfig
              v-else-if="element.stepConfig.type === 'keypress'"
              :params="
                (
                  element.stepConfig as Extract<
                    StepParams,
                    { type: 'keypress' }
                  >
                ).params
              "
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <DelayConfig
              v-else-if="element.stepConfig.type === 'delay'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'delay' }>)
                  .params
              "
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <ColorCheckConfig
              v-else-if="element.stepConfig.type === 'colorCheck'"
              :params="
                (
                  element.stepConfig as Extract<
                    StepParams,
                    { type: 'colorCheck' }
                  >
                ).params
              "
              :steps="steps"
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <GotoConfig
              v-else-if="element.stepConfig.type === 'goto'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'goto' }>)
                  .params
              "
              :steps="steps"
              :self-id="element.id"
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <CounterConfig
              v-else-if="element.stepConfig.type === 'counter'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'counter' }>)
                  .params
              "
              :steps="steps"
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <LogConfig
              v-else-if="element.stepConfig.type === 'log'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'log' }>)
                  .params
              "
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <OcrConfig
              v-else-if="element.stepConfig.type === 'ocr'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'ocr' }>)
                  .params
              "
              :steps="steps"
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
            <CallConfig
              v-else-if="element.stepConfig.type === 'call'"
              :params="
                (element.stepConfig as Extract<StepParams, { type: 'call' }>)
                  .params
              "
              @update:params="(v) => onInlineParamsUpdate(element, v)"
            />
          </div>
        </transition>
      </div>
    </VueDraggableNext>

    <ScreenshotPicker
      v-if="showScreenshotPicker && store.boundWindow && screenshotStepId"
      v-model="showScreenshotPicker"
      :hwnd="store.boundWindow.hwnd"
      :mode="screenshotMode"
      @confirm="onPickerConfirm"
      @cancel="onPickerCancel"
    />

    <SubFlowSettingsDialog
      v-if="isEditingSubFlow"
      v-model="subFlowSettingsOpen"
      :sub-flow-id="store.currentEditingSubFlowId"
    />
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--header-bg);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 14px;
  min-width: 0;
}
.header-title .title-text {
  font-weight: 500;
}
.header-title .count {
  color: var(--el-text-color-secondary);
  font-weight: 400;
  margin-left: 2px;
}
.header-title .main-tag,
.header-title .subflow-tag {
  color: var(--el-text-color-secondary);
  font-weight: 400;
  font-size: 12px;
}
.header-title .subflow-tag {
  color: var(--el-color-primary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}
.back-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
}
.header-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.header-sig {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.header-sig code {
  background-color: var(--el-fill-color-light);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
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
  padding: 8px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step-item {
  --type-color: #94a3b8;
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 10px 8px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color);
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
}
.step-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--type-color);
}
.step-item:hover {
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.5)
  );
}
.step-item.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.step-item.multi-selected {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.04)
  );
}
.step-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
  flex-shrink: 0;
}
.step-item.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  border-color: var(--el-color-primary);
  animation: step-breath 1.6s ease-in-out infinite;
}
.step-item.active .step-strip {
  animation: strip-breath 1.6s ease-in-out infinite;
}
.step-item.disabled {
  opacity: 0.55;
}
.step-item.highlighted {
  border-color: var(--el-color-warning);
  box-shadow: 0 0 0 2px
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity, 1) * 0.3)) inset;
}
.step-item.expanded {
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.04)
  );
}
.step-ghost {
  opacity: 0.4;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}
@keyframes step-breath {
  0%,
  100% {
    box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  }
  50% {
    box-shadow:
      0 0 0 2px var(--el-color-primary) inset,
      0 0 12px
        rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.5));
  }
}
@keyframes strip-breath {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
    filter: brightness(1.4);
  }
}
.expand-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  flex-shrink: 0;
}
.expand-toggle:hover {
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-color-primary);
}
.drag-handle {
  color: var(--el-text-color-placeholder);
  cursor: grab;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.drag-handle:active {
  cursor: grabbing;
}
.index {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.step-item.active .index {
  background-color: var(--el-color-primary);
  color: white;
}
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background-color: color-mix(in srgb, var(--type-color) 14%, transparent);
  color: var(--type-color);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
}
.content {
  flex: 1;
  min-width: 200px;
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
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  border-radius: 2px;
  padding: 2px 4px;
}
.row2 {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.quick-unit {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Consolas, monospace;
}
.badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  font-family: ui-monospace, Consolas, monospace;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
  white-space: nowrap;
}
.badge-out {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.badge-out:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.2)
  );
}
.badge-in {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-warning-dark-2);
}
.badge-in:hover {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.2)
  );
}
.src-link {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}
.more {
  font-weight: 700;
  margin-left: 1px;
}
.actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.inline-config {
  flex-basis: 100%;
  margin-top: 4px;
  padding: 12px 14px 14px 22px;
  background-color: var(--bg-color);
  border-top: var(--border-width) dashed var(--border-color);
  border-radius: 0 0 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.inline-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.toolbar-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.expand-enter-active,
.expand-leave-active {
  transition:
    max-height 0.22s ease,
    opacity 0.22s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
.expand-enter-to,
.expand-leave-from {
  max-height: 1200px;
  opacity: 1;
}
</style>
