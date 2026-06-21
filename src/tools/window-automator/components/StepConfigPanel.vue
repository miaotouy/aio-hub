<!--\n  DEPRECATED: 步骤配置已迁入 FlowEditor.vue 的内嵌展开区。\n  本文件不再被任何模块引用；保留此文件仅为方便回退。\n  下一轮手动清理时删除。\n-->\n<script setup lang="ts">
/**
 * 步骤配置面板
 *
 * 根据当前选中步骤的类型，动态渲染对应的 step-config 子组件。
 * 同时在点击/颜色判断/OCR 等步骤中提供"截图取点"入口。
 */
import { computed, ref } from "vue";
import { Camera, Crop } from "@element-plus/icons-vue";
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
  ClickStepParams,
  ColorCheckStepParams,
  OcrStepParams,
  ScreenshotPickerResult,
  StepParams,
} from "../types";

const store = useWindowAutomatorStore();

const step = computed(() => store.currentSelectedStep);
const flow = computed(() => store.currentFlow);

const showScreenshotPicker = ref(false);
const screenshotMode = ref<"point" | "rect">("point");

function openScreenshot(mode: "point" | "rect") {
  screenshotMode.value = mode;
  showScreenshotPicker.value = true;
}

function onPickerConfirm(result: ScreenshotPickerResult) {
  if (!step.value || !flow.value) return;
  const c = step.value.stepConfig;
  if (c.type === "click") {
    const next: ClickStepParams = {
      ...c.params,
      coordinate: {
        mode: "pixel",
        x: result.x,
        y: result.y,
      },
    };
    store.updateStep(flow.value.id, step.value.id, {
      stepConfig: { type: "click", params: next } as StepParams,
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
    store.updateStep(flow.value.id, step.value.id, {
      stepConfig: { type: "colorCheck", params: next } as StepParams,
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
    store.updateStep(flow.value.id, step.value.id, {
      stepConfig: { type: "ocr", params: next } as StepParams,
    });
  }
  showScreenshotPicker.value = false;
}

function onPickerCancel() {
  showScreenshotPicker.value = false;
}

const supportsPointPick = computed(() => {
  if (!step.value) return false;
  const t = step.value.stepConfig.type;
  return t === "click";
});

const supportsRectPick = computed(() => {
  if (!step.value) return false;
  const t = step.value.stepConfig.type;
  return t === "colorCheck" || t === "ocr";
});

const typeLabels: Record<string, string> = {
  click: "点击",
  keypress: "按键",
  delay: "延时",
  colorCheck: "颜色判断",
  goto: "跳转",
  counter: "循环计数",
  log: "日志",
  ocr: "OCR 识别",
};

function onParamsUpdate(next: StepParams["params"]) {
  if (!step.value || !flow.value) return;
  store.updateStep(flow.value.id, step.value.id, {
    stepConfig: {
      type: step.value.stepConfig.type,
      params: next,
    } as StepParams,
  });
}
</script>

<template>
  <div class="step-config-panel">
    <div v-if="!step" class="placeholder">
      <p>选中左侧步骤以编辑其参数</p>
    </div>
    <template v-else>
      <div class="panel-header">
        <div class="title">
          <span class="type-tag">{{
            typeLabels[step.stepConfig.type] ?? step.stepConfig.type
          }}</span>
          <span class="label">{{ step.label }}</span>
        </div>
        <div
          v-if="supportsPointPick || supportsRectPick"
          class="header-actions"
        >
          <el-button
            v-if="supportsPointPick"
            :icon="Camera"
            size="small"
            @click="openScreenshot('point')"
            :disabled="!store.boundWindow"
          >
            截图取点
          </el-button>
          <el-button
            v-if="supportsRectPick"
            :icon="Crop"
            size="small"
            @click="openScreenshot('rect')"
            :disabled="!store.boundWindow"
          >
            截图框选
          </el-button>
        </div>
      </div>

      <div class="panel-body">
        <ClickConfig
          v-if="step.stepConfig.type === 'click'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'click' }>).params
          "
          @update:params="(v) => onParamsUpdate(v)"
        />
        <KeyPressConfig
          v-else-if="step.stepConfig.type === 'keypress'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'keypress' }>)
              .params
          "
          @update:params="(v) => onParamsUpdate(v)"
        />
        <DelayConfig
          v-else-if="step.stepConfig.type === 'delay'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'delay' }>).params
          "
          @update:params="(v) => onParamsUpdate(v)"
        />
        <ColorCheckConfig
          v-else-if="step.stepConfig.type === 'colorCheck'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'colorCheck' }>)
              .params
          "
          :steps="flow?.steps ?? []"
          @update:params="(v) => onParamsUpdate(v)"
        />
        <GotoConfig
          v-else-if="step.stepConfig.type === 'goto'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'goto' }>).params
          "
          :steps="flow?.steps ?? []"
          :self-id="step.id"
          @update:params="(v) => onParamsUpdate(v)"
        />
        <CounterConfig
          v-else-if="step.stepConfig.type === 'counter'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'counter' }>).params
          "
          :steps="flow?.steps ?? []"
          @update:params="(v) => onParamsUpdate(v)"
        />
        <LogConfig
          v-else-if="step.stepConfig.type === 'log'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'log' }>).params
          "
          @update:params="(v) => onParamsUpdate(v)"
        />
        <OcrConfig
          v-else-if="step.stepConfig.type === 'ocr'"
          :params="
            (step.stepConfig as Extract<StepParams, { type: 'ocr' }>).params
          "
          :steps="flow?.steps ?? []"
          @update:params="(v) => onParamsUpdate(v)"
        />
      </div>
    </template>

    <ScreenshotPicker
      v-if="showScreenshotPicker && store.boundWindow"
      v-model="showScreenshotPicker"
      :hwnd="store.boundWindow.hwnd"
      :mode="screenshotMode"
      @confirm="onPickerConfirm"
      @cancel="onPickerCancel"
    />
  </div>
</template>

<style scoped>
.step-config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--header-bg);
  gap: 12px;
  flex-wrap: wrap;
}
.title {
  display: flex;
  gap: 8px;
  align-items: center;
}
.type-tag {
  padding: 2px 8px;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 4px;
  font-size: 12px;
}
.label {
  font-weight: 500;
}
.header-actions {
  display: flex;
  gap: 6px;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>
