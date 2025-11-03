import { defineStore } from 'pinia';
import type { UploadedImage, CutLine, ImageBlock, OcrResult, OcrEngineConfig, SlicerConfig } from './types';
import type { SmartOcrConfig } from './config';
import { defaultSmartOcrConfig, getCurrentEngineConfig } from './config';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('smart-ocr/store');

export const useSmartOcrStore = defineStore('smart-ocr', {
  state: () => ({
    fullConfig: { ...defaultSmartOcrConfig } as SmartOcrConfig,
    uploadedImages: [] as UploadedImage[],
    cutLinesMap: new Map<string, CutLine[]>(),
    imageBlocksMap: new Map<string, ImageBlock[]>(),
    ocrResults: [] as OcrResult[],
    isProcessing: false,
  }),

  getters: {
    engineConfig: (state): OcrEngineConfig => getCurrentEngineConfig(state.fullConfig),
    slicerConfig: (state): SlicerConfig => state.fullConfig.slicerConfig,
  },

  actions: {
    // === 同步状态变更 ===
    setProcessing(status: boolean) {
      this.isProcessing = status;
    },
    setFullConfig(config: SmartOcrConfig) {
      this.fullConfig = config;
    },
    addImages(images: UploadedImage[]) {
      this.uploadedImages.push(...images);
    },
    removeImage(imageId: string) {
      const index = this.uploadedImages.findIndex((img) => img.id === imageId);
      if (index !== -1) {
        this.uploadedImages.splice(index, 1);
        this.cutLinesMap.delete(imageId);
        this.imageBlocksMap.delete(imageId);
        // 级联删除相关的 OCR 结果
        this.ocrResults = this.ocrResults.filter(r => r.imageId !== imageId);
        logger.info('已从 store 中删除图片及其关联数据', { imageId });
      }
    },
    updateImageBlocks(imageId: string, blocks: ImageBlock[]) {
      this.imageBlocksMap.set(imageId, blocks);
    },
    updateCutLines(imageId: string, lines: CutLine[]) {
      this.cutLinesMap.set(imageId, lines);
    },
    setOcrResults(results: OcrResult[]) {
      this.ocrResults = results;
    },
    // 用于替换或添加单个/多个结果
    updateOcrResults(results: OcrResult[]) {
        for (const result of results) {
            const index = this.ocrResults.findIndex(r => r.blockId === result.blockId);
            if (index !== -1) {
                this.ocrResults[index] = result;
            } else {
                this.ocrResults.push(result);
            }
        }
    },
    clearOcrResults(imageIds?: string[]) {
        if (imageIds && imageIds.length > 0) {
            const idSet = new Set(imageIds);
            this.ocrResults = this.ocrResults.filter(r => !idSet.has(r.imageId));
        } else {
            this.ocrResults = [];
        }
    },
    toggleBlockIgnore(blockId: string) {
      const result = this.ocrResults.find((r) => r.blockId === blockId);
      if (result) {
        result.ignored = !result.ignored;
      }
    },
    updateBlockText(blockId: string, text: string) {
      const result = this.ocrResults.find((r) => r.blockId === blockId);
      if (result) {
        result.text = text;
      }
    },
    reset() {
      this.uploadedImages = [];
      this.cutLinesMap.clear();
      this.imageBlocksMap.clear();
      this.ocrResults = [];
      this.isProcessing = false;
      logger.info('SmartOcr Store 已重置');
    },
  },
});