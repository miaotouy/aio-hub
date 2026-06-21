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
} from "lucide-vue-next";
import draggable from "vuedraggable";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import ClickConfig from "./step-configs/ClickConfig.vue";
import KeyPressConfig from "./step-configs/KeyPressConfig.vue";
import DelayConfig from "./step-configs/DelayConfig.vue";
import ColorCheckConfig from "./step-configs/ColorCheckConfig.vue";
import GotoConfig from "./step-configs/GotoConfig.vue";
import CounterConfig from "./step-configs/CounterConfig.vue";
import LogConfig from "./step-configs/LogConfig.vue";
import OcrConfig from "./step-configs/OcrConfig.vue";
import ScreenshotPicker from "./ScreenshotPicker.vue";
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

const steps = computed<FlowStep[]>({
  get: () => store.currentFlow?.steps ?? [],
  set: (val) => {
    if (store.currentFlow) store.setSteps(store.currentFlow.id, val);
  },
});

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
  if (!store.currentFlow) return;
  store.updateStep(store.currentFlow.id, step.id, { enabled: !step.enabled });
}

function removeStep(step: FlowStep) {
  if (!store.currentFlow) return;
  if (expandedStepId.value === step.id) expandedStepId.value = null;
  store.deleteStep(store.currentFlow.id, step.id);
}

function updateLabel(step: FlowStep, value: string) {
  if (!store.currentFlow) return;
  store.updateStep(store.currentFlow.id, step.id, { label: value });
}

/** 内嵌配置的 update:params 回写 */
function onInlineParamsUpdate(step: FlowStep, next: StepParams["params"]) {
  if (!store.currentFlow) return;
  store.updateStep(store.currentFlow.id, step.id, {
    stepConfig: { type: step.stepConfig.type, params: next } as StepParams,
  });
}

/** 延时步骤的 quick edit：直接更新 duration */
function updateDelayDuration(step: FlowStep, value: number | undefined) {
  if (!store.currentFlow || step.stepConfig.type !== "delay") return;
  const next: DelayStepParams = {
    ...step.stepConfig.params,
    duration: Math.max(0, Number(value) || 0),
  };
  store.updateStep(store.currentFlow.id, step.id, {
    stepConfig: { type: "delay", params: next },
  });
}

// ===================== 徽章交互 =====================

function highlightTargets(targets: string[]) {
  highlightedStepIds.value = new Set(targets);
}
function clearHighlight() {
  if (highlightedStepIds.value.size > 0) highlightedStepIds.value = new Set();
}

async function scrollToStep(stepId: string) {
  const el = document.querySelector<HTMLElement>(
    `[data-step-id="${stepId}"]`
  );
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
    store.updateStep(store.currentFlow.id, step.id, {
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
    store.updateStep(store.currentFlow.id, step.id, {
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
    store.updateStep(store.currentFlow.id, step.id, {
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

const isStepActive = (index: number) =>
  store.runtime.status === "running" &&
  store.runtime.currentStepIndex === index;
</script>

<template>
  <div class="flow-editor">
    <div class="editor-header">
      <div class="header-title">
        步骤流 <span class="count">({{ steps.length }})</span>
      </div>
      <div class="header-hint">点击卡片展开/收起配置</div>
    </div>

    <div v-if="isEmpty" class="empty">
      暂无步骤，请从左侧工具箱添加第一个步骤
    </div>

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
          :data-step-id="element.id"
          class="step-item"
          :class="{
            selected: store.selectedStepId === element.id,
            active: isStepActive(index),
            disabled: !element.enabled,
            expanded: expandedStepId === element.id,
            highlighted: highlightedStepIds.has(element.id),
          }"
          :style="{
            '--type-color': metaFor(element.stepConfig.type).color,
          }"
          @click="selectStep(element)"
        >
          <div class="step-strip" aria-hidden="true"></div>

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
            <component
              :is="metaFor(element.stepConfig.type).icon"
              :size="13"
            />
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
              @update:model-value="(v: number | undefined) => updateDelayDuration(element, v)"
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
          <div v-if="incomingSources(element.id).length" class="badges" @click.stop>
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
                  (element.stepConfig as Extract<
                    StepParams,
                    { type: 'keypress' }
                  >).params
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
                  (element.stepConfig as Extract<
                    StepParams,
                    { type: 'colorCheck' }
                  >).params
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
                  (element.stepConfig as Extract<
                    StepParams,
                    { type: 'counter' }
                  >).params
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
            </div>
          </transition>
        </div>
      </template>
    </draggable>

    <ScreenshotPicker
      v-if="
        showScreenshotPicker && store.boundWindow && screenshotStepId
      "
      v-model="showScreenshotPicker"
      :hwnd="store.boundWindow.hwnd"
      :mode="screenshotMode"
      @confirm="onPickerConfirm"
      @cancel="onPickerCancel"
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
.header-title {
  font-weight: 500;
  font-size: 14px;
}
.header-title .count {
  color: var(--el-text-color-secondary);
  font-weight: 400;
  margin-left: 2px;
}
.header-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
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
  border-color: var(--el-color-primary-light-5);
}
.step-item.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.step-item.active {
  background-color: var(--el-color-primary-light-9);
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
  box-shadow: 0 0 0 2px var(--el-color-warning-light-7) inset;
}
.step-item.expanded {
  background-color: var(--el-fill-color-light);
}
.step-ghost {
  opacity: 0.4;
  background-color: var(--el-color-primary-light-9);
}
@keyframes step-breath {
  0%, 100% { box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
  50% { box-shadow: 0 0 0 2px var(--el-color-primary) inset, 0 0 12px var(--el-color-primary-light-5); }
}
@keyframes strip-breath {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; filter: brightness(1.4); }
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
  background-color: var(--el-fill-color);
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
  background-color: var(--el-fill-color);
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
  background-color: var(--el-fill-color-light);
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
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.badge-out:hover {
  background-color: var(--el-color-primary-light-7);
}
.badge-in {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}
.badge-in:hover {
  background-color: var(--el-color-warning-light-7);
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
  transition: max-height 0.22s ease, opacity 0.22s ease;
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