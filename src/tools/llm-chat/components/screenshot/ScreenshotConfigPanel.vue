<template>
  <section class="left-panel">
    <div class="config-section">
      <div class="section-title">布局覆盖</div>
      <div class="config-row">
        <span class="config-label">布局模式</span>
        <div class="config-value">
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
      </div>
      <div class="config-row">
        <span class="config-label">气泡圆角</span>
        <div class="config-value">
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
      </div>
      <div class="config-row">
        <span class="config-label">字体大小</span>
        <div class="config-value">
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
    </div>

    <div class="config-section">
      <div class="section-title">渲染尺寸</div>
      <div class="switch-row">
        <el-switch v-model="isFixedWidth" />
        <span class="switch-label">固定渲染宽度 (默认跟随消息区)</span>
      </div>
      <div class="config-row">
        <span class="config-label">渲染宽度</span>
        <div class="config-value">
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
      </div>
      <div class="config-row">
        <span class="config-label">输出精度</span>
        <div class="config-value">
          <el-select
            :model-value="renderOptions.scale"
            size="small"
            style="width: 120px"
            @update:model-value="onScaleChange"
          >
            <el-option
              v-for="opt in CAPTURE_SCALE_OPTIONS"
              :key="opt"
              :label="opt + 'x' + (opt === 2 ? ' (2x 推荐)' : '')"
              :value="opt"
            />
          </el-select>
        </div>
      </div>
      <p class="section-hint">
        渲染宽度决定消息气泡/卡片的换行宽度；输出精度决定最终图片清晰度（最终像素
        ≈ 宽度 × 精度）。
        自动模式会在打开对话框时按消息区宽度采样，向下取整并夹紧到 480~1280 px。
      </p>
    </div>

    <div class="config-section">
      <div class="section-title">背景与间距</div>
      <div class="config-row">
        <span class="config-label">背景类型</span>
        <div class="config-value">
          <el-select
            :model-value="renderOptions.bgConfig.type"
            size="small"
            style="width: 160px"
            @update:model-value="onBgTypeChange"
          >
            <el-option label="跟随主题" value="theme" />
            <el-option label="纯色背景" value="solid" />
            <el-option label="应用壁纸" value="wallpaper" />
          </el-select>
        </div>
      </div>
      <div v-if="renderOptions.bgConfig.type === 'solid'" class="config-row">
        <span class="config-label">背景颜色</span>
        <div class="config-value">
          <el-color-picker
            :model-value="renderOptions.bgConfig.color"
            size="small"
            :predefine="[
              '#ffffff',
              '#f5f7fa',
              '#fafafa',
              '#1a1a1a',
              '#242424',
              '#121212',
            ]"
            @update:model-value="onBgColorChange"
          />
          <span class="config-hint">{{ renderOptions.bgConfig.color }}</span>
        </div>
      </div>
      <div
        v-if="renderOptions.bgConfig.type === 'wallpaper'"
        class="config-row"
      >
        <span class="config-label">壁纸不透明度</span>
        <div class="config-value">
          <el-slider
            :model-value="renderOptions.bgConfig.wallpaperOpacity"
            :min="0"
            :max="1"
            :step="0.05"
            size="small"
            style="flex: 1; min-width: 80px"
            @update:model-value="onWallpaperOpacityChange"
          />
          <span class="config-hint">
            {{
              Math.round(
                (renderOptions.bgConfig.wallpaperOpacity ?? 0.6) * 100
              )
            }}%
          </span>
        </div>
      </div>
      <div
        v-if="renderOptions.bgConfig.type === 'wallpaper'"
        class="config-row"
      >
        <span class="config-label">壁纸平铺</span>
        <div class="config-value">
          <el-select
            :model-value="renderOptions.bgConfig.wallpaperMode"
            size="small"
            style="width: 160px"
            @update:model-value="onWallpaperModeChange"
          >
            <el-option label="铺满 (cover)" value="cover" />
            <el-option label="完整显示 (contain)" value="contain" />
            <el-option label="平铺 (tile)" value="tile" />
            <el-option label="拉伸 (stretch)" value="stretch" />
          </el-select>
        </div>
      </div>
      <div class="config-row">
        <span class="config-label">消息间距</span>
        <div class="config-value">
          <el-switch
            :model-value="renderOptions.gap === undefined"
            size="small"
            active-text="自动"
            @update:model-value="onGapAutoToggle"
          />
          <el-input-number
            v-if="renderOptions.gap !== undefined"
            :model-value="renderOptions.gap"
            :min="SCREENSHOT_GAP_MIN"
            :max="SCREENSHOT_GAP_MAX"
            size="small"
            controls-position="right"
            style="width: 100px"
            @update:model-value="onGapChange"
          />
          <span v-if="renderOptions.gap !== undefined" class="config-hint"
            >px</span
          >
        </div>
      </div>
      <div class="config-row">
        <span class="config-label">四周留白</span>
        <div class="config-value">
          <el-input-number
            :model-value="renderOptions.padding"
            :min="SCREENSHOT_PADDING_MIN"
            :max="SCREENSHOT_PADDING_MAX"
            size="small"
            controls-position="right"
            style="width: 100px"
            @update:model-value="onPaddingChange"
          />
          <span class="config-hint">px</span>
        </div>
      </div>
      <div class="switch-row">
        <el-switch
          :model-value="renderOptions.enableDecoration"
          @update:model-value="onDecorationToggle"
        />
        <span class="switch-label">卡片边框与投影装饰</span>
      </div>
      <p class="section-hint">
        背景、间距与留白同时影响实时预览和最终输出图片。
      </p>
    </div>

    <div class="config-section">
      <div class="section-title">水印</div>
      <div class="switch-row">
        <el-switch
          :model-value="renderOptions.watermark.enable"
          @update:model-value="onWatermarkEnableChange"
        />
        <span class="switch-label">启用水印</span>
      </div>
      <template v-if="renderOptions.watermark.enable">
        <div class="config-row">
          <span class="config-label">水印文字</span>
          <div class="config-value">
            <el-input
              :model-value="renderOptions.watermark.text"
              size="small"
              style="width: 160px"
              :maxlength="40"
              @update:model-value="onWatermarkTextChange"
            />
          </div>
        </div>
        <div class="config-row">
          <span class="config-label">水印颜色</span>
          <div class="config-value">
            <el-color-picker
              :model-value="renderOptions.watermark.color"
              size="small"
              :predefine="[
                'rgba(0, 0, 0, 0.08)',
                'rgba(255, 255, 255, 0.18)',
                'rgba(0, 0, 0, 0.15)',
                'rgba(0, 0, 0, 0.25)',
                'rgba(255, 255, 255, 0.35)',
              ]"
              show-alpha
              @update:model-value="onWatermarkColorChange"
            />
            <span class="config-hint">{{ renderOptions.watermark.color }}</span>
          </div>
        </div>
        <div class="config-row">
          <span class="config-label">字号</span>
          <div class="config-value">
            <el-input-number
              :model-value="renderOptions.watermark.fontSize"
              :min="SCREENSHOT_WATERMARK_FONT_SIZE_MIN"
              :max="SCREENSHOT_WATERMARK_FONT_SIZE_MAX"
              :step="1"
              size="small"
              controls-position="right"
              style="width: 100px"
              @update:model-value="onWatermarkFontSizeChange"
            />
            <span class="config-hint">px</span>
          </div>
        </div>
        <div class="config-row">
          <span class="config-label">平铺间距</span>
          <div class="config-value">
            <el-input-number
              :model-value="renderOptions.watermark.gap"
              :min="SCREENSHOT_WATERMARK_GAP_MIN"
              :max="SCREENSHOT_WATERMARK_GAP_MAX"
              :step="10"
              size="small"
              controls-position="right"
              style="width: 100px"
              @update:model-value="onWatermarkGapChange"
            />
            <span class="config-hint">px</span>
          </div>
        </div>
        <div class="config-row">
          <span class="config-label">旋转角度</span>
          <div class="config-value">
            <el-slider
              :model-value="renderOptions.watermark.angle"
              :min="SCREENSHOT_WATERMARK_ANGLE_MIN"
              :max="SCREENSHOT_WATERMARK_ANGLE_MAX"
              :step="1"
              size="small"
              style="flex: 1; min-width: 80px"
              @update:model-value="onWatermarkAngleChange"
            />
            <span class="config-hint"
              >{{ renderOptions.watermark.angle }}°</span
            >
          </div>
        </div>
      </template>
      <p class="section-hint">
        水印会在整张长图上以平铺方式呈现, 同时影响实时预览和最终输出图片。
      </p>
    </div>

    <div class="config-section">
      <div class="section-title">应用标识</div>
      <div class="config-row">
        <span class="config-label">显示位置</span>
        <div class="config-value">
          <el-select
            :model-value="renderOptions.brand.show"
            size="small"
            style="width: 160px"
            @update:model-value="onBrandShowChange"
          >
            <el-option label="不显示" value="none" />
            <el-option label="仅顶部" value="top" />
            <el-option label="仅底部" value="bottom" />
            <el-option label="顶部 + 底部" value="both" />
          </el-select>
        </div>
      </div>
      <template v-if="renderOptions.brand.show !== 'none'">
        <div class="config-row">
          <span class="config-label">自定义文字</span>
          <div class="config-value">
            <el-input
              :model-value="renderOptions.brand.text"
              size="small"
              style="width: 160px"
              :maxlength="40"
              @update:model-value="onBrandTextChange"
            />
          </div>
        </div>
        <div class="switch-row">
          <el-switch
            :model-value="renderOptions.brand.showLogo"
            @update:model-value="onBrandShowLogoChange"
          />
          <span class="switch-label">显示 AIO Hub Logo</span>
        </div>
      </template>
      <p class="section-hint">
        标识会作为独立的截图元素拼接在长图顶部或底部, 复用毛玻璃壁纸背景。
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

import {
  ElColorPicker,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
} from "element-plus";
import type {
  BrandShowMode,
  CollapseStrategy,
  ElementToggles,
  LayoutOverrides,
  ScreenshotBgType,
  ScreenshotRenderOptions,
  WallpaperMode,
} from "./screenshotTypes";
import {
  CAPTURE_SCALE_OPTIONS,
  RENDER_WIDTH_MAX,
  RENDER_WIDTH_MIN,
  RENDER_WIDTH_STEP,
  SCREENSHOT_GAP_MAX,
  SCREENSHOT_GAP_MIN,
  SCREENSHOT_PADDING_MAX,
  SCREENSHOT_PADDING_MIN,
  SCREENSHOT_WATERMARK_ANGLE_MAX,
  SCREENSHOT_WATERMARK_ANGLE_MIN,
  SCREENSHOT_WATERMARK_FONT_SIZE_MAX,
  SCREENSHOT_WATERMARK_FONT_SIZE_MIN,
  SCREENSHOT_WATERMARK_GAP_MAX,
  SCREENSHOT_WATERMARK_GAP_MIN,
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

// ----- V4: 背景与间距配置事件处理 -----
function onBgTypeChange(v: ScreenshotBgType) {
  renderOptions.value = {
    ...renderOptions.value,
    bgConfig: { ...renderOptions.value.bgConfig, type: v },
  };
}

function onBgColorChange(v: string | null) {
  if (!v) return;
  renderOptions.value = {
    ...renderOptions.value,
    bgConfig: { ...renderOptions.value.bgConfig, color: v },
  };
}

function onWallpaperOpacityChange(v: number | number[]) {
  const val = Array.isArray(v) ? v[0] : v;
  renderOptions.value = {
    ...renderOptions.value,
    bgConfig: { ...renderOptions.value.bgConfig, wallpaperOpacity: val },
  };
}

function onWallpaperModeChange(v: WallpaperMode | undefined) {
  if (!v) return;
  renderOptions.value = {
    ...renderOptions.value,
    bgConfig: { ...renderOptions.value.bgConfig, wallpaperMode: v },
  };
}

function onGapAutoToggle(isAuto: boolean | string | number) {
  renderOptions.value = {
    ...renderOptions.value,
    gap: isAuto ? undefined : 8,
  };
}

function onGapChange(v: number | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  renderOptions.value = {
    ...renderOptions.value,
    gap: Math.min(SCREENSHOT_GAP_MAX, Math.max(SCREENSHOT_GAP_MIN, v)),
  };
}

function onPaddingChange(v: number | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  renderOptions.value = {
    ...renderOptions.value,
    padding: Math.min(
      SCREENSHOT_PADDING_MAX,
      Math.max(SCREENSHOT_PADDING_MIN, v)
    ),
  };
}

function onDecorationToggle(v: boolean | string | number) {
  renderOptions.value = {
    ...renderOptions.value,
    enableDecoration: !!v,
  };
}

// ----- V5: 水印配置事件处理 -----
function onWatermarkEnableChange(v: boolean | string | number) {
  renderOptions.value = {
    ...renderOptions.value,
    watermark: { ...renderOptions.value.watermark, enable: !!v },
  };
}

function onWatermarkTextChange(v: string | number | null | undefined) {
  const text = typeof v === "string" ? v : String(v ?? "");
  renderOptions.value = {
    ...renderOptions.value,
    watermark: { ...renderOptions.value.watermark, text },
  };
}

function onWatermarkColorChange(v: string | null) {
  if (!v) return;
  renderOptions.value = {
    ...renderOptions.value,
    watermark: { ...renderOptions.value.watermark, color: v },
  };
}

function onWatermarkFontSizeChange(v: number | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  renderOptions.value = {
    ...renderOptions.value,
    watermark: {
      ...renderOptions.value.watermark,
      fontSize: Math.min(
        SCREENSHOT_WATERMARK_FONT_SIZE_MAX,
        Math.max(SCREENSHOT_WATERMARK_FONT_SIZE_MIN, Math.round(v))
      ),
    },
  };
}

function onWatermarkGapChange(v: number | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return;
  renderOptions.value = {
    ...renderOptions.value,
    watermark: {
      ...renderOptions.value.watermark,
      gap: Math.min(
        SCREENSHOT_WATERMARK_GAP_MAX,
        Math.max(SCREENSHOT_WATERMARK_GAP_MIN, Math.round(v))
      ),
    },
  };
}

function onWatermarkAngleChange(v: number | number[]) {
  const val = Array.isArray(v) ? v[0] : v;
  if (typeof val !== "number" || !Number.isFinite(val)) return;
  renderOptions.value = {
    ...renderOptions.value,
    watermark: {
      ...renderOptions.value.watermark,
      angle: Math.min(
        SCREENSHOT_WATERMARK_ANGLE_MAX,
        Math.max(SCREENSHOT_WATERMARK_ANGLE_MIN, Math.round(val))
      ),
    },
  };
}

// ----- V5: 品牌标识配置事件处理 -----
function onBrandShowChange(v: BrandShowMode | undefined) {
  if (!v) return;
  renderOptions.value = {
    ...renderOptions.value,
    brand: { ...renderOptions.value.brand, show: v },
  };
}

function onBrandTextChange(v: string | number | null | undefined) {
  const text = typeof v === "string" ? v : String(v ?? "");
  renderOptions.value = {
    ...renderOptions.value,
    brand: { ...renderOptions.value.brand, text },
  };
}

function onBrandShowLogoChange(v: boolean | string | number) {
  renderOptions.value = {
    ...renderOptions.value,
    brand: { ...renderOptions.value.brand, showLogo: !!v },
  };
}
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
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.config-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.config-value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
}

.config-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
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
