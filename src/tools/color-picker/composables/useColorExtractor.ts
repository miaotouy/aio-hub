import { ref } from 'vue';
// node-vibrant v4.x 在浏览器环境中的正确导入方式
import { Vibrant } from 'node-vibrant/browser';
import ColorThief from 'color-thief-ts';
import { FastAverageColor } from 'fast-average-color';
import type {
  QuantizeResult,
  VibrantResult,
  AverageResult,
  ColorAnalysisResult,
  AnalysisAlgorithm
} from '../colorPicker.store';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { createModuleLogger } from '@/utils/logger';

const errorHandler = createModuleErrorHandler('color-picker/useColorExtractor');
const logger = createModuleLogger('color-picker/useColorExtractor');

/**
 * 颜色提取器 Composable
 */
export function useColorExtractor() {
  const isProcessing = ref(false);

  /**
   * 从图片元素提取颜色
   * @param imageElement HTMLImageElement 元素
   * @param algorithms 要执行的算法数组，如果为空则执行所有算法
   */
  async function extractColors(
    imageElement: HTMLImageElement,
    algorithms: AnalysisAlgorithm[] = ['quantize', 'vibrant', 'average']
  ): Promise<ColorAnalysisResult> {
    isProcessing.value = true;

    const result: ColorAnalysisResult = {
      quantize: null,
      vibrant: null,
      average: null,
    };

    try {
      // 并行执行所有请求的算法
      const promises: Promise<void>[] = [];

      if (algorithms.includes('quantize')) {
        promises.push(extractQuantizeColors(imageElement).then(res => {
          result.quantize = res;
        }));
      }

      if (algorithms.includes('vibrant')) {
        promises.push(extractVibrantColors(imageElement).then(res => {
          result.vibrant = res;
        }));
      }

      if (algorithms.includes('average')) {
        promises.push(extractAverageColor(imageElement).then(res => {
          result.average = res;
        }));
      }

      await Promise.all(promises);

      logger.info('颜色提取完成', {
        algorithms,
        hasQuantize: !!result.quantize,
        hasVibrant: !!result.vibrant,
        hasAverage: !!result.average,
      });

    } catch (error) {
      errorHandler.error(error, '颜色提取失败');
    } finally {
      isProcessing.value = false;
    }

    return result;
  }

  /**
   * 提取主色调 (Color Thief)
   */
  async function extractQuantizeColors(
    imageElement: HTMLImageElement,
    colorCount: number = 8
  ): Promise<QuantizeResult | null> {
    return errorHandler.wrapAsync(async () => {
      const colorThief = new ColorThief();

      // 确保图片已加载完成
      if (!imageElement.complete) {
        await new Promise((resolve, reject) => {
          imageElement.onload = resolve;
          imageElement.onerror = reject;
          // 如果图片已经加载但没有触发 onload，手动触发
          if (imageElement.complete) {
            resolve(void 0);
          }
        });
      }

      const palette = colorThief.getPalette(imageElement, colorCount);
      const dominantColor = colorThief.getColor(imageElement);

      // Based on debug logs, color-thief-ts can return hex strings directly.
      // This function handles both string and array formats for robustness.
      const formatToHex = (color: string | number[]): string => {
        if (typeof color === 'string') {
          return color.startsWith('#') ? color : `#${color}`;
        }
        if (Array.isArray(color)) {
          return `#${color.map((c: number) => c.toString(16).padStart(2, '0')).join('')}`;
        }
        // Fallback for unexpected formats
        logger.warn('Unexpected color format from ColorThief', { color });
        return '#000000';
      };

      // 将主色调放在第一位，然后添加调色板颜色
      const rawColors = [
        formatToHex(dominantColor as any),
        ...palette.map((pColor: string | number[]) => formatToHex(pColor))
      ];

      // 过滤掉转换失败的颜色并去重
      const colors = [...new Set(rawColors.filter(c => c !== '#000000'))];
      
      logger.debug('主色调提取完成', { colorCount, actualCount: colors.length });

      return {
        colors,
        count: colors.length,
      };
    }, {
      userMessage: '主色调提取失败',
      context: { colorCount },
    });
  }

  /**
   * 提取设计感调色板 (Vibrant)
   */
  async function extractVibrantColors(
    imageElement: HTMLImageElement
  ): Promise<VibrantResult | null> {
    return errorHandler.wrapAsync(async () => {
      // 确保图片已加载完成
      if (!imageElement.complete) {
        await new Promise((resolve, reject) => {
          imageElement.onload = resolve;
          imageElement.onerror = reject;
          if (imageElement.complete) {
            resolve(void 0);
          }
        });
      }

      const palette = await Vibrant.from(imageElement).getPalette();
      const result: VibrantResult = {
        Vibrant: palette.Vibrant?.hex || null,
        Muted: palette.Muted?.hex || null,
        DarkVibrant: palette.DarkVibrant?.hex || null,
        DarkMuted: palette.DarkMuted?.hex || null,
        LightVibrant: palette.LightVibrant?.hex || null,
        LightMuted: palette.LightMuted?.hex || null,
      };

      logger.debug('设计感调色板提取完成', {
        hasVibrant: !!result.Vibrant,
        hasMuted: !!result.Muted,
      });

      return result;
    }, {
      userMessage: '设计感调色板提取失败',
    });
  }

  /**
   * 提取平均色 (Fast Average Color)
   */
  async function extractAverageColor(
    imageElement: HTMLImageElement
  ): Promise<AverageResult | null> {
    return errorHandler.wrapAsync(async () => {
      const fac = new FastAverageColor();

      try {
        // 确保图片已加载完成
        if (!imageElement.complete) {
          await new Promise((resolve, reject) => {
            imageElement.onload = resolve;
            imageElement.onerror = reject;
            if (imageElement.complete) {
              resolve(void 0);
            }
          });
        }

        const color = await fac.getColorAsync(imageElement);

        if (!color) {
          throw new Error('FastAverageColor could not determine the color.');
        }

        const result: AverageResult = {
          color: color.hex,
          rgb: color.rgb,
        };

        logger.debug('平均色提取完成', {
          hex: result.color,
          rgb: result.rgb,
        });

        return result;
      } finally {
        fac.destroy();
      }
    }, {
      userMessage: '平均色提取失败',
    });
  }

  /**
   * 从 Canvas 获取指定像素的颜色
   * @param canvas Canvas 元素
   * @param x X 坐标
   * @param y Y 坐标
   */
  function getPixelColor(
    canvas: HTMLCanvasElement,
    x: number,
    y: number
  ): { hex: string; rgb: { r: number; g: number; b: number } } | null {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        logger.warn('无法获取 Canvas 2D 上下文');
        return null;
      }

      const imageData = ctx.getImageData(x, y, 1, 1);
      const data = imageData.data;

      const rgb = {
        r: data[0],
        g: data[1],
        b: data[2],
      };

      const hex = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;

      return { hex, rgb };
    } catch (error) {
      errorHandler.error(error, '获取像素颜色失败', { x, y });
      return null;
    }
  }

  return {
    isProcessing,
    extractColors,
    extractQuantizeColors,
    extractVibrantColors,
    extractAverageColor,
    getPixelColor,
  };
}