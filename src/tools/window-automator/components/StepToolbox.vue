<script setup lang="ts">
/**
 * 步骤工具箱
 *
 * 左侧折叠栏内容：
 *  - 顶部：目标窗口绑定（WindowSelector inline）
 *  - 下方：所有可添加的步骤类型按钮（点击触发 add-step 事件）
 */
import {
  MousePointerClick,
  Keyboard,
  Hourglass,
  Palette,
  CornerDownRight,
  Repeat,
  FileText,
  TextCursorInput,
  Crosshair,
} from "lucide-vue-next";
import WindowSelector from "./WindowSelector.vue";
import type { WindowInfo, StepType } from "../types";

const emit = defineEmits<{
  (e: "add-step", type: StepType): void;
  (e: "bound", window: WindowInfo | null): void;
}>();

const stepTypes: Array<{
  type: StepType;
  label: string;
  icon: typeof MousePointerClick;
  hint: string;
}> = [
  {
    type: "click",
    label: "点击",
    icon: MousePointerClick,
    hint: "后台/前台点击目标坐标",
  },
  {
    type: "keypress",
    label: "按键",
    icon: Keyboard,
    hint: "向绑定窗口发送按键",
  },
  {
    type: "delay",
    label: "延时",
    icon: Hourglass,
    hint: "等待指定毫秒数（可叠加随机波动）",
  },
  {
    type: "colorCheck",
    label: "颜色判断",
    icon: Palette,
    hint: "按颜色/区域判定，决定跳转分支",
  },
  {
    type: "goto",
    label: "跳转",
    icon: CornerDownRight,
    hint: "无条件跳转到指定步骤",
  },
  {
    type: "counter",
    label: "循环计数",
    icon: Repeat,
    hint: "按次数控制循环逻辑",
  },
  {
    type: "log",
    label: "日志",
    icon: FileText,
    hint: "输出日志，支持 {var} 插值",
  },
  {
    type: "ocr",
    label: "OCR 识别",
    icon: TextCursorInput,
    hint: "识别文字并按关键字决定跳转",
  },
];

function onBound(w: WindowInfo | null) {
  emit("bound", w);
}
</script>

<template>
  <div class="step-toolbox">
    <div class="toolbox-section window-section">
      <div class="section-title">
        <Crosshair :size="14" />
        <span>目标窗口</span>
      </div>
      <WindowSelector mode="inline" @bound="onBound" />
    </div>

    <div class="toolbox-section add-section">
      <div class="section-title">
        <span>添加步骤</span>
        <span class="section-sub">点击下方按钮追加到末尾</span>
      </div>
      <div class="step-types">
        <el-tooltip
          v-for="t in stepTypes"
          :key="t.type"
          :content="t.hint"
          placement="right"
        >
          <button
            class="step-type-btn"
            type="button"
            @click="emit('add-step', t.type)"
          >
            <component :is="t.icon" :size="18" class="icon" />
            <span class="label">{{ t.label }}</span>
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-toolbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.toolbox-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border-bottom: var(--border-width) solid var(--border-color-light);
}
.toolbox-section:last-child {
  border-bottom: none;
  flex: 1;
  min-height: 0;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.section-sub {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
.step-types {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 2px;
}
.step-type-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: all 0.15s ease;
}
.step-type-btn:hover {
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.5)
  );
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.step-type-btn:active {
  transform: translateY(1px);
}
.step-type-btn .icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.step-type-btn .label {
  font-size: 13px;
  font-weight: 500;
}
</style>
