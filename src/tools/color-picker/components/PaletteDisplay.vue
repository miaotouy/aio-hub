<template>
  <div class="palette-display">
    <!-- 主色调模式 (Quantize) -->
    <div v-if="algorithm === 'quantize' && quantizeResult" class="quantize-palette">
      <div class="color-grid">
        <div
          v-for="(color, index) in quantizeResult.colors"
          :key="index"
          class="color-item"
          :style="{ backgroundColor: color }"
          @click="copyColor(color)"
        >
          <div class="color-overlay">
            <span class="color-text" :style="{ color: getTextColor(color) }">
              {{ formatColor(color) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 设计感模式 (Vibrant) -->
    <div v-if="algorithm === 'vibrant' && vibrantResult" class="vibrant-palette">
      <div class="vibrant-grid">
        <div
          v-for="[label, color] in Object.entries(vibrantResult)"
          :key="label"
          class="vibrant-item"
        >
          <div class="vibrant-label">{{ translateLabel(label) }}</div>
          <div
            v-if="color"
            class="vibrant-color"
            :style="{ backgroundColor: color }"
            @click="copyColor(color)"
          >
            <div class="color-overlay">
              <span class="color-text" :style="{ color: getTextColor(color) }">
                {{ formatColor(color) }}
              </span>
            </div>
          </div>
          <div v-else class="vibrant-color empty">
            <span class="empty-text">无</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 平均色模式 (Average) -->
    <div v-if="algorithm === 'average' && averageResult" class="average-palette">
      <div
        class="average-color"
        :style="{ backgroundColor: averageResult.color }"
        @click="copyColor(averageResult.color)"
      >
        <div class="color-overlay">
          <span class="color-text large" :style="{ color: getTextColor(averageResult.color) }">
            {{ formatColor(averageResult.color) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!hasResult" class="empty-state">
      <el-empty description="尚未进行颜色分析" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  AnalysisAlgorithm,
  QuantizeResult,
  VibrantResult,
  AverageResult,
  ColorFormat,
} from '../colorPicker.store';
import { useColorConverter, getContrastColor, copyToClipboard } from '../composables/useColorConverter';
import { customMessage } from '@/utils/customMessage';
import { createModuleErrorHandler } from '@/utils/errorHandler';

interface Props {
  algorithm: AnalysisAlgorithm;
  quantizeResult?: QuantizeResult | null;
  vibrantResult?: VibrantResult | null;
  averageResult?: AverageResult | null;
  format: ColorFormat;
}

const props = defineProps<Props>();
const errorHandler = createModuleErrorHandler('ColorPicker/PaletteDisplay');

/**
 * 是否有分析结果
 */
const hasResult = computed(() => {
  switch (props.algorithm) {
    case 'quantize':
      return !!props.quantizeResult;
    case 'vibrant':
      return !!props.vibrantResult;
    case 'average':
      return !!props.averageResult;
    default:
      return false;
  }
});

/**
 * 格式化颜色值
 */
function formatColor(hexColor: string): string {
  const converter = useColorConverter(hexColor, props.format);
  return converter.formatted.value;
}

/**
 * 获取文字颜色（黑色或白色，取决于背景）
 */
function getTextColor(hexColor: string): string {
  return getContrastColor(hexColor);
}

/**
 * 复制颜色到剪贴板
 */
async function copyColor(hexColor: string) {
  const formattedColor = formatColor(hexColor);
  await copyToClipboard(
    formattedColor,
    () => {
      customMessage.success(`已复制: ${formattedColor}`);
    },
    (error) => {
      errorHandler.error(error, '复制失败');
    }
  );
}

/**
 * 翻译 Vibrant 标签
 */
function translateLabel(label: string): string {
  const labelMap: Record<string, string> = {
    Vibrant: '鲜艳',
    Muted: '柔和',
    DarkVibrant: '暗色鲜艳',
    DarkMuted: '暗色柔和',
    LightVibrant: '亮色鲜艳',
    LightMuted: '亮色柔和',
  };
  return labelMap[label] || label;
}
</script>

<style scoped>
.palette-display {
  width: 100%;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
}

/* 主色调网格 */
.quantize-palette {
  width: 100%;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.color-item {
  aspect-ratio: 1;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--border-color);
}

.color-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.color-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.1);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.color-item:hover .color-overlay {
  opacity: 1;
}

.color-text {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

/* 设计感网格 */
.vibrant-palette {
  width: 100%;
}

.vibrant-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.vibrant-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vibrant-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.vibrant-color {
  height: 80px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--border-color);
}

.vibrant-color:not(.empty):hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.vibrant-color.empty {
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
}

.empty-text {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.vibrant-color:not(.empty):hover .color-overlay {
  opacity: 1;
}

/* 平均色 */
.average-palette {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.average-color {
  width: 100%;
  max-width: 400px;
  height: 200px;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--border-color);
}

.average-color:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.average-color:hover .color-overlay {
  opacity: 1;
}

.color-text.large {
  font-size: 16px;
  padding: 8px 16px;
}

/* 空状态 */
.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>