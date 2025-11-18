<template>
  <InfoCard title="色彩分析" class="right-panel-card">
    <!-- 分析设置区域 -->
    <div class="settings-section">
      <div class="section-header">
        <span class="section-title">分析设置</span>
      </div>
      <div class="control-group">
        <div class="control-row">
          <span class="control-label">分析算法</span>
          <el-segmented
            v-model="store.selectedAlgorithm"
            :options="algorithmOptions"
            @change="onAlgorithmChange"
          />
        </div>
        <div class="control-row">
          <span class="control-label">颜色格式</span>
          <el-segmented
            v-model="store.preferredFormat"
            :options="formatOptions"
          />
        </div>
        <div v-if="store.selectedAlgorithm === 'quantize'" class="control-row">
          <span class="control-label">颜色数量</span>
          <el-slider
            v-model="store.quantizeColorCount"
            :min="3"
            :max="20"
            :step="1"
            show-input
            size="small"
            @change="onQuantizeCountChange"
          />
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 颜色结果区域 -->
    <div class="colors-section">
      <div class="section-header">
        <span class="section-title">颜色结果</span>
        <el-button
          v-if="hasAnalysisColors"
          size="small"
          type="primary"
          text
          bg
          :icon="DocumentCopy"
          @click="copyAllAnalysisColors"
        >
          复制全部
        </el-button>
      </div>

      <!-- 分析结果颜色 -->
      <div v-if="hasAnalysisColors" class="analysis-colors">
        <!-- 主色调模式 -->
        <template v-if="store.selectedAlgorithm === 'quantize' && store.currentAnalysisResult?.quantize">
          <div class="color-chips">
            <div
              v-for="(color, index) in store.currentAnalysisResult.quantize.colors"
              :key="`quantize-${index}`"
              class="color-chip"
              :style="{ backgroundColor: color }"
              @click="copyColor(color)"
            >
              <div class="color-chip-overlay">
                <span class="color-chip-text" :style="{ color: getTextColor(color) }">
                  {{ formatColor(color) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 设计感模式 -->
        <template v-if="store.selectedAlgorithm === 'vibrant' && store.currentAnalysisResult?.vibrant">
          <div class="vibrant-colors">
            <div
              v-for="[label, color] in Object.entries(store.currentAnalysisResult.vibrant).filter(([, c]) => c !== null)"
              :key="label"
              class="vibrant-chip"
            >
              <div class="vibrant-chip-label">{{ translateLabel(label) }}</div>
              <div
                class="color-chip"
                :style="{ backgroundColor: color as string }"
                @click="copyColor(color as string)"
              >
                <div class="color-chip-overlay">
                  <span class="color-chip-text" :style="{ color: getTextColor(color as string) }">
                    {{ formatColor(color as string) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 平均色模式 -->
        <template v-if="store.selectedAlgorithm === 'average' && store.currentAnalysisResult?.average">
          <div class="color-chips">
            <div
              class="color-chip average-chip"
              :style="{ backgroundColor: store.currentAnalysisResult.average.color }"
              @click="copyColor(store.currentAnalysisResult.average.color)"
            >
              <div class="color-chip-overlay">
                <span class="color-chip-text" :style="{ color: getTextColor(store.currentAnalysisResult.average.color) }">
                  {{ formatColor(store.currentAnalysisResult.average.color) }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
      <el-empty v-else description="尚未进行颜色分析" :image-size="60" />
    </div>

    <el-divider />

    <!-- 精确取色区域 -->
    <div class="picker-section">
      <div class="section-header">
        <span class="section-title">精确取色</span>
        <div class="picker-actions">
          <el-button
            v-if="store.manualPalette.length > 0"
            size="small"
            type="primary"
            text
            bg
            :icon="DocumentCopy"
            @click="copyAllManualColors"
          >
            复制全部
          </el-button>
          <el-button
            v-if="store.manualPalette.length > 0"
            size="small"
            type="danger"
            text
            bg
            @click="store.clearManualPalette"
          >
            清空
          </el-button>
        </div>
      </div>

      <div class="picker-content">
        <el-button
          type="primary"
          :icon="Pipette"
          @click="openEyeDropper"
          :disabled="!isEyeDropperSupported"
        >
          从画面取色
        </el-button>
        <p v-if="!isEyeDropperSupported" class="support-warning">
          当前浏览器不支持 EyeDropper API
        </p>

        <!-- 手动取色结果 -->
        <div v-if="store.manualPalette.length > 0" class="manual-colors">
          <div class="color-chips">
            <div
              v-for="color in store.manualPalette"
              :key="color.id"
              class="color-chip manual-chip"
              :style="{ backgroundColor: color.hex }"
              @click="copyColor(color.hex)"
            >
              <div class="color-chip-overlay">
                <span class="color-chip-text" :style="{ color: getTextColor(color.hex) }">
                  {{ formatColor(color.hex) }}
                </span>
                <el-button
                  class="remove-button"
                  type="danger"
                  size="small"
                  circle
                  :icon="Close"
                  @click.stop="store.removeManualColor(color.id)"
                />
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂未拾取颜色" :image-size="60" />
      </div>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DocumentCopy, Close } from '@element-plus/icons-vue';
import { Pipette } from 'lucide-vue-next';
import { useColorPickerStore } from '../colorPicker.store';
import { useColorConverter, getContrastColor, copyToClipboard } from '../composables/useColorConverter';
import { customMessage } from '@/utils/customMessage';
import InfoCard from '@/components/common/InfoCard.vue';

interface Props {
  isEyeDropperSupported: boolean;
  onAlgorithmChange: () => void;
  onQuantizeCountChange: () => void;
  openEyeDropper: () => void;
}

defineProps<Props>();
const store = useColorPickerStore();

const algorithmOptions = [
  { label: '主色调', value: 'quantize' },
  { label: '设计感', value: 'vibrant' },
  { label: '平均色', value: 'average' },
];

const formatOptions = [
  { label: 'HEX', value: 'hex' },
  { label: 'RGB', value: 'rgb' },
  { label: 'HSL', value: 'hsl' },
];

/**
 * 是否有分析颜色
 */
const hasAnalysisColors = computed(() => {
  if (!store.currentAnalysisResult) return false;
  
  switch (store.selectedAlgorithm) {
    case 'quantize':
      return !!store.currentAnalysisResult.quantize?.colors?.length;
    case 'vibrant':
      return !!store.currentAnalysisResult.vibrant && 
        Object.values(store.currentAnalysisResult.vibrant).some(c => c !== null);
    case 'average':
      return !!store.currentAnalysisResult.average?.color;
    default:
      return false;
  }
});

/**
 * 格式化颜色值
 */
function formatColor(hexColor: string): string {
  const converter = useColorConverter(hexColor, store.preferredFormat);
  return converter.formatted.value;
}

/**
 * 获取文字颜色（黑色或白色，取决于背景）
 */
function getTextColor(hexColor: string): string {
  return getContrastColor(hexColor);
}

/**
 * 复制单个颜色
 */
async function copyColor(hexColor: string) {
  const formattedColor = formatColor(hexColor);
  await copyToClipboard(
    formattedColor,
    () => customMessage.success(`已复制: ${formattedColor}`),
    (error) => customMessage.error(`复制失败: ${error.message}`)
  );
}

/**
 * 复制所有分析颜色
 */
async function copyAllAnalysisColors() {
  const colors: string[] = [];
  
  if (store.selectedAlgorithm === 'quantize' && store.currentAnalysisResult?.quantize) {
    colors.push(...store.currentAnalysisResult.quantize.colors);
  } else if (store.selectedAlgorithm === 'vibrant' && store.currentAnalysisResult?.vibrant) {
    Object.values(store.currentAnalysisResult.vibrant).forEach(color => {
      if (color) colors.push(color);
    });
  } else if (store.selectedAlgorithm === 'average' && store.currentAnalysisResult?.average) {
    colors.push(store.currentAnalysisResult.average.color);
  }
  
  const formattedColors = colors.map(c => formatColor(c)).join('\n');
  await copyToClipboard(
    formattedColors,
    () => customMessage.success(`已复制 ${colors.length} 个颜色`),
    (error) => customMessage.error(`复制失败: ${error.message}`)
  );
}

/**
 * 复制所有手动取色
 */
async function copyAllManualColors() {
  const colors = store.manualPalette.map(c => formatColor(c.hex)).join('\n');
  await copyToClipboard(
    colors,
    () => customMessage.success(`已复制 ${store.manualPalette.length} 个颜色`),
    (error) => customMessage.error(`复制失败: ${error.message}`)
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
.right-panel-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.right-panel-card :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 区域头部 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 分析设置区域 */
.settings-section {
  flex-shrink: 0;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  width: 80px;
  flex-shrink: 0;
}

/* 颜色结果区域 */
.colors-section {
  flex-shrink: 0;
}

.analysis-colors {
  margin-top: 8px;
}

/* 颜色芯片通用样式 */
.color-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.color-chip {
  aspect-ratio: 1;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--border-color);
}

.color-chip:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.color-chip-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.1);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.color-chip:hover .color-chip-overlay {
  opacity: 1;
}

.color-chip-text {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}

.remove-button {
  position: absolute;
  top: 4px;
  right: 4px;
}

/* 平均色特殊样式 */
.average-chip {
  grid-column: 1 / -1;
  aspect-ratio: 3 / 1;
  max-height: 120px;
}

.average-chip .color-chip-text {
  font-size: 14px;
  padding: 6px 12px;
}

/* 设计感模式特殊样式 */
.vibrant-colors {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.vibrant-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vibrant-chip-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.vibrant-chip .color-chip {
  aspect-ratio: 2 / 1;
}

/* 精确取色区域 */
.picker-section {
  flex-shrink: 0;
}

.picker-actions {
  display: flex;
  gap: 8px;
}

.picker-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.support-warning {
  font-size: 12px;
  color: var(--el-color-warning);
  margin: 0;
}

.manual-colors {
  margin-top: 8px;
}

/* 分隔线样式调整 */
:deep(.el-divider) {
  margin: 16px 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .color-chips {
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  }
  
  .vibrant-colors {
    grid-template-columns: 1fr;
  }
  
  .control-label {
    width: 70px;
  }
}
</style>