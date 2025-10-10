<script setup lang="ts">
import { ref } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import ResultPanel from './components/ResultPanel.vue';
import type { OcrEngineConfig, ImageBlock, OcrResult, SlicerConfig, CutLine, UploadedImage } from './types';

// 图片相关状态
const uploadedImages = ref<UploadedImage[]>([]);
const selectedImageId = ref<string | null>(null);

// OCR引擎配置
const engineConfig = ref<OcrEngineConfig>({
  type: 'tesseract',
  name: 'Tesseract.js',
  language: 'chi_sim+eng'
});

// 智能切图配置
const slicerConfig = ref<SlicerConfig>({
  enabled: true,
  aspectRatioThreshold: 3,
  blankThreshold: 0.05, // 5%的黑色像素占比阈值
  minBlankHeight: 20
});

// 切图相关状态（按图片ID分组）
const cutLinesMap = ref<Map<string, CutLine[]>>(new Map());
const imageBlocksMap = ref<Map<string, ImageBlock[]>>(new Map());

// OCR结果
const ocrResults = ref<OcrResult[]>([]);
const isProcessing = ref(false);

// 处理图片上传
const handleImagesUpload = (images: UploadedImage[]) => {
  uploadedImages.value.push(...images);
  // 自动选中第一张新上传的图片
  if (images.length > 0 && !selectedImageId.value) {
    selectedImageId.value = images[0].id;
  }
};

// 处理图片删除
const handleImageRemove = (imageId: string) => {
  const index = uploadedImages.value.findIndex(img => img.id === imageId);
  if (index !== -1) {
    uploadedImages.value.splice(index, 1);
    cutLinesMap.value.delete(imageId);
    imageBlocksMap.value.delete(imageId);
    
    // 如果删除的是当前选中的图片，选中下一张
    if (selectedImageId.value === imageId) {
      selectedImageId.value = uploadedImages.value[index]?.id || uploadedImages.value[index - 1]?.id || null;
    }
  }
};

// 处理图片选择
const handleImageSelect = (imageId: string) => {
  selectedImageId.value = imageId;
};

// 处理切图完成
const handleSliceComplete = (imageId: string, blocks: ImageBlock[], lines: CutLine[]) => {
  imageBlocksMap.value.set(imageId, blocks);
  cutLinesMap.value.set(imageId, lines);
};

// 处理OCR开始
const handleOcrStart = () => {
  isProcessing.value = true;
};

// 处理OCR结果更新
const handleOcrResultUpdate = (results: OcrResult[]) => {
  ocrResults.value = results;
};

// 处理OCR完成
const handleOcrComplete = () => {
  isProcessing.value = false;
};
</script>

<template>
  <div class="smart-ocr-container">
    <!-- 左栏：控制面板 -->
    <div class="left-panel">
      <ControlPanel
        v-model:engine-config="engineConfig"
        v-model:slicer-config="slicerConfig"
        :uploaded-images="uploadedImages"
        :selected-image-id="selectedImageId"
        :is-processing="isProcessing"
        @slice-complete="handleSliceComplete"
        @ocr-start="handleOcrStart"
        @ocr-result-update="handleOcrResultUpdate"
        @ocr-complete="handleOcrComplete"
      />
    </div>

    <!-- 中栏：预览面板 -->
    <div class="middle-panel">
      <PreviewPanel
        :uploaded-images="uploadedImages"
        :selected-image-id="selectedImageId"
        :cut-lines-map="cutLinesMap"
        :image-blocks-map="imageBlocksMap"
        @images-upload="handleImagesUpload"
        @image-remove="handleImageRemove"
        @image-select="handleImageSelect"
      />
    </div>

    <!-- 右栏：结果面板 -->
    <div class="right-panel">
      <ResultPanel
        :ocr-results="ocrResults"
        :is-processing="isProcessing"
      />
    </div>
  </div>
</template>

<style scoped>
.smart-ocr-container {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  gap: 16px;
  padding: 20px;
  background-color: var(--bg-color);
  overflow: hidden;
}

.left-panel {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.middle-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.right-panel {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

/* 自定义滚动条样式 */
.left-panel::-webkit-scrollbar,
.right-panel::-webkit-scrollbar {
  width: 6px;
}

.left-panel::-webkit-scrollbar-track,
.right-panel::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.left-panel::-webkit-scrollbar-thumb,
.right-panel::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.left-panel::-webkit-scrollbar-thumb:hover,
.right-panel::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>