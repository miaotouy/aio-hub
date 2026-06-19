<!--
  截图配置面板 (左下)。
  - 三个 v-model: layoutOverrides / collapseStrategy / elementToggles
  - 父组件只需要持有状态, 面板负责所有 UI 渲染与交互。
  - 渲染尺寸 (renderOptions) 由父组件的 v-model:renderOptions 双向绑定。
-->
<template>
  <section class="left-panel">
    <div class="config-section">
      <div class="section-title">布局覆盖</div>
      <div class="config-row">
        <span class="config-label">布局模式</span>
        <el-select
          v-model="layoutOverrides.mode"
          placeholder="选择"
          size="small"
          style="width: 160px"
        >
          <el-option label="跟随系统" value="follow" />
          <el-option label="卡片模式" value="card" />
          <el-option label="气泡模式" value="bubble" />
        </el-select>
      </div>
      <div class="config-row">
        <span class="config-label">气泡圆角</span>
        <el-input-number
          v-model="layoutOverrides.borderRadius"
          placeholder="跟随系统"
          :min="0"
          :max="32"
          size="small"
          controls-position="right"
          style="width: 120px"
        />
        <span class="config-hint">px</span>
      </div>
      <div class="config-row">
        <span class="config-label">字体大小</span>
        <el-input-number
          v-model="layoutOverrides.fontSize"
          placeholder="跟随系统"
          :min="10"
          :max="24"
          size="small"
          controls-position="right"
          style="width: 120px"
        />
        <span class="config-hint">px</span>
      </div>
    </div>

    <div class="config-section">
      <div class="section-title">渲染尺寸</div>
      <div class="switch-row">
        <el-switch v-model="isFixedWidth" />
        <span class="switch-label">固定渲染宽度 (默认跟随消息区)</span>
      </div>
      <div class="config-row">
        <span class="config-label">渲染宽度</span>
        <el-input-number
          v-if="isFixedWidth"
          :model-value="renderOptions.width"
          :min="RENDER_WIDTH_MIN"
          :max="RENDER_WIDTH_MAX"
          :step="RENDER_WIDTH_STEP"
          size="small"
          controls-position="right"
          style="width: 120px"
          @update:model-value="onWidthChange"
        />
        <span v-else class="auto-width-display">
          自动: {{ renderOptions.width }} px
        </span>
        <span v-if="isFixedWidth" class="config-hint">px</span>
      </div>
      <div class="config-row">
        <span class="config-label">输出精度</span>
        <el-select
          :model-value="renderOptions.scale"
          size="small"
          style="width: 120px"
          @update:model-value="onScaleChange"
        >
          <el-option
            v-for="opt in CAPTURE_SCALE_OPTIONS"
            :key="opt"
            :label="opt + 'x' + (opt === 2 ? ' (2x 高清, 推荐)' : '')"
            :value="opt"
          />
        </el-select>
      </div>
      <p class="section-hint">
        渲染宽度决定消息气泡/卡片的换行宽度；输出精度决定最终图片清晰度（最终像素
        ≈ 宽度 × 精度）。
        自动模式会在打开对话框时按消息区宽度采样，向下取整并夹紧到 480~1280 px。
      </p>
    </div>

    <div class="config-section">
      <div class="section-title">折叠策略</div>
      <el-select v-model="collapseStrategy" size="small" style="width: 100%">
        <el-option label="强制展开" value="override-expand" />
        <el-option label="强制收起" value="override-collapse" />
        <el-option label="跟随配置" value="config" />
        <el-option label="维持现状" value="preserve" />
      </el-select>
      <p class="section-hint">决定工具调用节点在截图中是展开还是收起。</p>
    </div>

    <div class="config-section">
      <div class="section-title">显示元素</div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showAvatar" />
        <span class="switch-label">显示头像</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showModelInfo" />
        <span class="switch-label">显示模型信息</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showTimestamp" />
        <span class="switch-label">显示时间戳</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showTokenCount" />
        <span class="switch-label">显示消息 Token 统计</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showTokenCountForBlocks" />
        <span class="switch-label">显示块级 Token 统计</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showCharCount" />
        <span class="switch-label">显示消息字数</span>
      </div>
      <div class="switch-row">
        <el-switch v-model="elementToggles.showPerformanceMetrics" />
        <span class="switch-label">显示性能指标</span>
      </div>
      <p class="section-hint">
        默认开启即跟随系统设置，关闭后对应元素在截图中隐藏。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { ElInputNumber, ElOption, ElSelect, ElSwitch } from "element-plus";
import type {
  CollapseStrategy,
  ElementToggles,
  LayoutOverrides,
  ScreenshotRenderOptions,
} from "./screenshotTypes";
import {
  CAPTURE_SCALE_OPTIONS,
  RENDER_WIDTH_MAX,
  RENDER_WIDTH_MIN,
  RENDER_WIDTH_STEP,
} from "./screenshotTypes";

const layoutOverrides = defineModel<LayoutOverrides>("layoutOverrides", {
  required: true,
});
const collapseStrategy = defineModel<CollapseStrategy>("collapseStrategy", {
  required: true,
});
const elementToggles = defineModel<ElementToggles>("elementToggles", {
  required: true,
});
const renderOptions = defineModel<ScreenshotRenderOptions>("renderOptions", {
  required: true,
});

function onWidthChange(v: number | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  const clamped = Math.min(
    RENDER_WIDTH_MAX,
    Math.max(RENDER_WIDTH_MIN, Math.round(v))
  );
  renderOptions.value = { ...renderOptions.value, width: clamped };
}

function onScaleChange(v: number | undefined) {
  if (typeof v !== "number") return;
  renderOptions.value = { ...renderOptions.value, scale: v };
}

// 固定宽度开关: 反向映射 renderOptions.widthMode, 让 v-model 直接绑开关
const isFixedWidth = computed<boolean>({
  get: () => renderOptions.value.widthMode === "fixed",
  set: (v) => {
    if (renderOptions.value.widthMode === (v ? "fixed" : "auto")) return;
    renderOptions.value = {
      ...renderOptions.value,
      widthMode: v ? "fixed" : "auto",
    };
  },
});
</script>

<style scoped>
.left-panel {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  overflow: hidden;
  overflow-y: auto;
}

/* ===== 配置 ===== */
.config-section {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}
.config-section:last-child {
  border-bottom: none;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-color-primary);
}
.section-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.config-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  min-width: 70px;
}
.config-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  height: 28px;
}
.switch-label {
  font-size: 12px;
  color: var(--text-color-secondary);
}
/* auto 模式: 显示当前采样值的只读展示, 与输入框等高对齐 */
.auto-width-display {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
:deep(.config-section .el-checkbox) {
  display: flex;
  margin-bottom: 6px;
  height: auto;
}
:deep(.config-section .el-checkbox + .el-checkbox) {
  margin-top: 2px;
}
</style>

