import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('color-picker/store');

/**
 * 颜色格式类型
 */
export type ColorFormat = 'hex' | 'rgb' | 'hsl';

/**
 * 分析算法类型
 */
export type AnalysisAlgorithm = 'quantize' | 'vibrant' | 'average';

/**
 * 主色调分析结果 (color-thief)
 */
export interface QuantizeResult {
  colors: string[]; // HEX 格式
  count: number; // 提取的颜色数量
}

/**
 * 设计感分析结果 (node-vibrant)
 */
export interface VibrantResult {
  Vibrant: string | null;
  Muted: string | null;
  DarkVibrant: string | null;
  DarkMuted: string | null;
  LightVibrant: string | null;
  LightMuted: string | null;
}

/**
 * 平均色分析结果 (fast-average-color)
 */
export interface AverageResult {
  color: string; // HEX 格式
  rgb: string; // rgb(r, g, b) 格式
}

/**
 * 完整的分析结果
 */
export interface ColorAnalysisResult {
  quantize: QuantizeResult | null;
  vibrant: VibrantResult | null;
  average: AverageResult | null;
}

/**
 * 手动取色的锁定颜色信息
 */
export interface ManualColor {
  id: string; // 用于 v-for 的 key
  hex: string;
  rgb: { r: number; g: number; b: number };
  position: { x: number; y: number }; // 图片上的坐标
}

export const useColorPickerStore = defineStore('color-picker', () => {
  // === 状态定义 ===
  
  // 当前工作区
  const currentImageAssetUri = ref<string | null>(null);
  const currentImageName = ref<string | null>(null);
  const currentAnalysisResult = ref<ColorAnalysisResult | null>(null);
  
  // UI 状态
  const selectedAlgorithm = ref<AnalysisAlgorithm>('quantize');
  const preferredFormat = ref<ColorFormat>('hex');
  const quantizeColorCount = ref<number>(8); // 主色调提取的颜色数量 (3-20)
  
  // 手动取色
  const manualPalette = ref<ManualColor[]>([]);
  const MAX_PALETTE_SIZE = 12;
  
  // 处理状态
  const isAnalyzing = ref<boolean>(false);
  
  // === 计算属性 ===
  
  /**
   * 当前是否有加载的图片
   */
  const hasImage = computed(() => currentImageAssetUri.value !== null);
  
  /**
   * 当前是否有分析结果
   */
  const hasResult = computed(() => currentAnalysisResult.value !== null);
  
  /**
   * 当前选中算法的分析结果
   */
  const currentAlgorithmResult = computed(() => {
    if (!currentAnalysisResult.value) return null;
    return currentAnalysisResult.value[selectedAlgorithm.value];
  });
  
  // === 方法 ===
  
  /**
   * 设置当前图片
   */
  function setCurrentImage(assetUri: string, imageName: string) {
    currentImageAssetUri.value = assetUri;
    currentImageName.value = imageName;
    logger.info('设置当前图片', { assetUri, imageName });
  }
  
  /**
   * 设置分析结果
   */
  function setAnalysisResult(result: ColorAnalysisResult) {
    currentAnalysisResult.value = result;
    logger.info('更新分析结果', { 
      hasQuantize: !!result.quantize,
      hasVibrant: !!result.vibrant,
      hasAverage: !!result.average,
    });
  }
  
  /**
   * 更新特定算法的结果
   */
  function updateAlgorithmResult(algorithm: AnalysisAlgorithm, result: any) {
    if (!currentAnalysisResult.value) {
      currentAnalysisResult.value = {
        quantize: null,
        vibrant: null,
        average: null,
      };
    }
    currentAnalysisResult.value[algorithm] = result;
    logger.debug(`更新 ${algorithm} 算法结果`);
  }
  
  /**
   * 切换分析算法
   */
  function setAlgorithm(algorithm: AnalysisAlgorithm) {
    selectedAlgorithm.value = algorithm;
    logger.debug('切换分析算法', { algorithm });
  }
  
  /**
   * 设置颜色格式
   */
  function setFormat(format: ColorFormat) {
    preferredFormat.value = format;
    logger.debug('切换颜色格式', { format });
  }
  
  /**
   * 设置主色调提取数量
   */
  function setQuantizeCount(count: number) {
    quantizeColorCount.value = Math.max(3, Math.min(20, count));
    logger.debug('设置主色调数量', { count: quantizeColorCount.value });
  }
  
  /**
   * 添加一个手动拾取的颜色到调色板
   */
  function addManualColor(color: Omit<ManualColor, 'id'>) {
    if (manualPalette.value.length >= MAX_PALETTE_SIZE) {
      // 移除最旧的颜色以腾出空间
      manualPalette.value.shift();
    }
    const newColor: ManualColor = {
      ...color,
      id: crypto.randomUUID(),
    };
    manualPalette.value.push(newColor);
    logger.debug('添加手动取色', { hex: newColor.hex });
  }

  /**
   * 从调色板移除一个颜色
   */
  function removeManualColor(colorId: string) {
    const index = manualPalette.value.findIndex((c) => c.id === colorId);
    if (index !== -1) {
      manualPalette.value.splice(index, 1);
      logger.debug('移除手动取色', { colorId });
    }
  }

  /**
   * 清空手动调色板
   */
  function clearManualPalette() {
    manualPalette.value = [];
    logger.info('清空手动调色板');
  }
  
  /**
   * 设置处理状态
   */
  function setAnalyzing(status: boolean) {
    isAnalyzing.value = status;
  }
  
  /**
   * 清除当前工作区
   */
  function clearCurrent() {
    currentImageAssetUri.value = null;
    currentImageName.value = null;
    currentAnalysisResult.value = null;
    manualPalette.value = [];
    logger.info('清除当前工作区');
  }
  
  /**
   * 重置所有状态（不包括历史记录，历史记录由 useColorHistory 管理）
   */
  function reset() {
    currentImageAssetUri.value = null;
    currentImageName.value = null;
    currentAnalysisResult.value = null;
    selectedAlgorithm.value = 'quantize';
    preferredFormat.value = 'hex';
    quantizeColorCount.value = 8;
    manualPalette.value = [];
    isAnalyzing.value = false;
    logger.info('ColorPicker Store 已重置');
  }
  
  return {
    // 状态
    currentImageAssetUri,
    currentImageName,
    currentAnalysisResult,
    selectedAlgorithm,
    preferredFormat,
    quantizeColorCount,
    manualPalette,
    isAnalyzing,
    
    // 计算属性
    hasImage,
    hasResult,
    currentAlgorithmResult,
    
    // 方法
    setCurrentImage,
    setAnalysisResult,
    updateAlgorithmResult,
    setAlgorithm,
    setFormat,
    setQuantizeCount,
    addManualColor,
    removeManualColor,
    clearManualPalette,
    setAnalyzing,
    clearCurrent,
    reset,
  };
});