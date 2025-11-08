import { ref, type Ref } from "vue";
import type Viewer from "viewerjs";
import { acquireBlobUrl, releaseBlobUrl } from "@/utils/avatarImageCache";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("useImageViewer");

export interface ImageViewerState {
  /** 当前显示的图片列表（处理后的 URL） */
  images: string[];
  /** 原始图片路径（用于释放 Blob） */
  originalImages: string[];
  /** 当前显示的图片索引 */
  currentIndex: number;
  /** 是否显示查看器 */
  visible: boolean;
  /** 自定义配置 */
  options?: Viewer.Options;
}

export interface UseImageViewerReturn {
  /** 图片查看器状态 */
  state: Ref<ImageViewerState>
  /** 显示图片查看器 */
  show: (images: string | string[], index?: number, options?: Viewer.Options) => void
  /** 隐藏图片查看器 */
  hide: () => void
  /** 显示下一张 */
  next: () => void
  /** 显示上一张 */
  prev: () => void
  /** 更新图片列表 */
  updateImages: (images: string[]) => void
}

// 全局状态
const globalState = ref<ImageViewerState>({
  images: [],
  originalImages: [],
  currentIndex: 0,
  visible: false,
  options: undefined,
});

/**
 * 图片查看器 Composable
 * 提供全局的图片查看功能
 * 
 * @example
 * ```vue
 * <script setup>
 * import { useImageViewer } from '@/composables/useImageViewer'
 * 
 * const imageViewer = useImageViewer()
 * 
 * // 显示单张图片
 * imageViewer.show('https://example.com/image.jpg')
 * 
 * // 显示图片列表
 * imageViewer.show([
 *   'https://example.com/image1.jpg',
 *   'https://example.com/image2.jpg'
 * ], 0) // 从第一张开始显示
 * 
 * // 自定义配置
 * imageViewer.show(images, 0, {
 *   navbar: false,
 *   toolbar: false
 * })
 * </script>
 * ```
 */
export function useImageViewer(): UseImageViewerReturn {
  /**
   * 显示图片查看器
   * @param images 图片 URL 或图片 URL 数组
   * @param index 初始显示的图片索引，默认 0
   * @param options 自定义 Viewer.js 配置
   */
  const show = async (
    images: string | string[],
    index = 0,
    options?: Viewer.Options
  ) => {
    const originalImageArray = Array.isArray(images) ? images : [images];
    logger.debug("显示图片查看器，原始路径:", originalImageArray);

    // 预处理图片路径，将本地路径转换为 Blob URL
    const processedImages = await Promise.all(
      originalImageArray.map(async (src) => {
        const sanitizedSrc = src.trim().replace(/^"|"$/g, "").trim();
        if (
          sanitizedSrc.startsWith("appdata://") ||
          /^[A-Za-z]:[\\/]/.test(sanitizedSrc) ||
          sanitizedSrc.startsWith("\\\\")
        ) {
          logger.debug(`转换本地路径: ${sanitizedSrc}`);
          const blobUrl = await acquireBlobUrl(sanitizedSrc);
          if (blobUrl) {
            logger.debug(`路径 ${sanitizedSrc} 成功转换为 Blob URL`);
            return blobUrl;
          } else {
            logger.error(`路径 ${sanitizedSrc} 转换为 Blob URL 失败`);
            return src; // 转换失败，返回原始路径，让其自然裂开
          }
        }
        return src;
      })
    );

    logger.info("处理后的图片列表:", processedImages);

    globalState.value = {
      images: processedImages,
      originalImages: originalImageArray, // 保存原始路径
      currentIndex: index,
      visible: true,
      options,
    };
  };

  /**
   * 隐藏图片查看器
   */
  const hide = () => {
    globalState.value.visible = false;
    // 延迟清空数据，避免关闭动画时数据消失
    setTimeout(() => {
      if (!globalState.value.visible) {
        // 释放通过 acquireBlobUrl 获取的 Blob URL
        globalState.value.originalImages.forEach((src) => {
          if (
            src.startsWith("appdata://") ||
            /^[A-Za-z]:[\\/]/.test(src) ||
            src.startsWith("\\\\")
          ) {
            releaseBlobUrl(src);
          }
        });

        globalState.value.images = [];
        globalState.value.originalImages = [];
        globalState.value.currentIndex = 0;
        globalState.value.options = undefined;
      }
    }, 300);
  };

  /**
   * 显示下一张图片
   */
  const next = () => {
    if (globalState.value.currentIndex < globalState.value.images.length - 1) {
      globalState.value.currentIndex++
    }
  }

  /**
   * 显示上一张图片
   */
  const prev = () => {
    if (globalState.value.currentIndex > 0) {
      globalState.value.currentIndex--
    }
  }

  /**
   * 更新图片列表
   * @param images 新的图片列表
   */
  const updateImages = (images: string[]) => {
    globalState.value.images = images
    // 确保当前索引在有效范围内
    if (globalState.value.currentIndex >= images.length) {
      globalState.value.currentIndex = Math.max(0, images.length - 1)
    }
  }

  return {
    state: globalState,
    show,
    hide,
    next,
    prev,
    updateImages
  }
}