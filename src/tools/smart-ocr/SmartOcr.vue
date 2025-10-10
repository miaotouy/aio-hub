<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import ControlPanel from './components/ControlPanel.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import ResultPanel from './components/ResultPanel.vue';
import type { OcrEngineConfig, ImageBlock, OcrResult, SlicerConfig, CutLine, UploadedImage } from './types';
import type { SmartOcrConfig } from './config';
import { loadSmartOcrConfig, createDebouncedSave, getCurrentEngineConfig, defaultSmartOcrConfig } from './config';
import { useOcrRunner } from './composables/useOcrRunner';

// 图片相关状态
const uploadedImages = ref<UploadedImage[]>([]);
const selectedImageId = ref<string | null>(null);

// 完整配置对象（内部维护）
const fullConfig = ref<SmartOcrConfig>({ ...defaultSmartOcrConfig });

// 当前引擎配置（通过计算属性暴露给子组件）
const engineConfig = computed<OcrEngineConfig>({
  get: () => getCurrentEngineConfig(fullConfig.value),
  set: (newConfig: OcrEngineConfig) => {
    const type = newConfig.type;
    
    // 检查是否只是切换引擎类型（配置对象只包含 type 字段）
    const isTypeSwitch = Object.keys(newConfig).length === 1 && 'type' in newConfig;
    
    if (isTypeSwitch) {
      // 切换引擎类型：更新当前引擎类型，保持各引擎已保存的配置不变
      fullConfig.value = {
        ...fullConfig.value,
        currentEngineType: type
      };
    } else {
      // 更新当前引擎的配置
      const newEngineConfigs = { ...fullConfig.value.engineConfigs };
      
      // 根据引擎类型更新对应的配置
      switch (type) {
        case 'tesseract':
          // 只更新实际改变的字段，保留其他字段
          newEngineConfigs.tesseract = {
            ...newEngineConfigs.tesseract,
            name: newConfig.name || newEngineConfigs.tesseract.name,
            language: (newConfig as any).language !== undefined
              ? (newConfig as any).language
              : newEngineConfigs.tesseract.language
          };
          break;
        case 'native':
          newEngineConfigs.native = {
            ...newEngineConfigs.native,
            name: newConfig.name || newEngineConfigs.native.name
          };
          break;
        case 'vlm':
          newEngineConfigs.vlm = {
            ...newEngineConfigs.vlm,
            name: newConfig.name || newEngineConfigs.vlm.name,
            profileId: (newConfig as any).profileId !== undefined
              ? (newConfig as any).profileId
              : newEngineConfigs.vlm.profileId,
            modelId: (newConfig as any).modelId !== undefined
              ? (newConfig as any).modelId
              : newEngineConfigs.vlm.modelId,
            prompt: (newConfig as any).prompt !== undefined
              ? (newConfig as any).prompt
              : newEngineConfigs.vlm.prompt,
            temperature: (newConfig as any).temperature !== undefined
              ? (newConfig as any).temperature
              : newEngineConfigs.vlm.temperature,
            maxTokens: (newConfig as any).maxTokens !== undefined
              ? (newConfig as any).maxTokens
              : newEngineConfigs.vlm.maxTokens
          };
          break;
        case 'cloud':
          newEngineConfigs.cloud = {
            ...newEngineConfigs.cloud,
            name: newConfig.name || newEngineConfigs.cloud.name,
            apiEndpoint: (newConfig as any).apiEndpoint !== undefined
              ? (newConfig as any).apiEndpoint
              : newEngineConfigs.cloud.apiEndpoint,
            apiKey: (newConfig as any).apiKey !== undefined
              ? (newConfig as any).apiKey
              : newEngineConfigs.cloud.apiKey
          };
          break;
      }
      
      // 更新完整配置
      fullConfig.value = {
        ...fullConfig.value,
        currentEngineType: type,
        engineConfigs: newEngineConfigs
      };
    }
  }
});

// 智能切图配置（通过计算属性暴露给子组件）
const slicerConfig = computed<SlicerConfig>({
  get: () => fullConfig.value.slicerConfig,
  set: (value: SlicerConfig) => {
    fullConfig.value = {
      ...fullConfig.value,
      slicerConfig: value
    };
  }
});

// 切图相关状态（按图片ID分组）
const cutLinesMap = ref<Map<string, CutLine[]>>(new Map());
const imageBlocksMap = ref<Map<string, ImageBlock[]>>(new Map());

// OCR结果
const ocrResults = ref<OcrResult[]>([]);
const isProcessing = ref(false);

// 配置持久化
const debouncedSave = createDebouncedSave();

// ControlPanel 组件引用
const controlPanelRef = ref<InstanceType<typeof ControlPanel>>();

// OCR 运行器
const { runOcr } = useOcrRunner();

// 监听完整配置变化并自动保存
watch(fullConfig, () => {
  debouncedSave(fullConfig.value);
}, { deep: true });

// 组件挂载时加载配置
onMounted(async () => {
  try {
    fullConfig.value = await loadSmartOcrConfig();
  } catch (error) {
    console.error('加载配置失败:', error);
  }
});

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

// 处理清除所有图片
const handleClearAllImages = () => {
  uploadedImages.value = [];
  cutLinesMap.value.clear();
  imageBlocksMap.value.clear();
  selectedImageId.value = null;
  ocrResults.value = [];
  ElMessage.success('已清除所有图片');
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

// 处理单个图片切图
const handleSliceImage = (imageId: string) => {
  controlPanelRef.value?.handleSliceOnly(imageId);
};

// 处理批量切图
const handleSliceAllImages = () => {
  controlPanelRef.value?.handleSliceAll();
};

// 处理重试单个块
const handleRetryBlock = async (blockId: string) => {
  // 找到对应的result
  const resultIndex = ocrResults.value.findIndex(r => r.blockId === blockId);
  if (resultIndex === -1) {
    ElMessage.warning('未找到对应的识别结果');
    return;
  }
  
  const result = ocrResults.value[resultIndex];
  const imageId = result.imageId;
  
  // 找到对应的block
  const blocks = imageBlocksMap.value.get(imageId);
  if (!blocks) {
    ElMessage.warning('未找到对应的图片块');
    return;
  }
  
  const block = blocks.find(b => b.id === blockId);
  if (!block) {
    ElMessage.warning('未找到对应的图片块');
    return;
  }
  
  // 更新状态为处理中
  ocrResults.value[resultIndex].status = 'processing';
  ocrResults.value[resultIndex].error = undefined;
  
  try {
    // 重新识别这个块
    const singleBlockResults = await runOcr([block], engineConfig.value, (updatedResults: OcrResult[]) => {
      // 更新单个结果
      if (updatedResults.length > 0) {
        ocrResults.value[resultIndex] = {
          ...updatedResults[0],
          imageId // 保持 imageId
        };
      }
    });
    
    // 最终更新
    if (singleBlockResults.length > 0) {
      ocrResults.value[resultIndex] = {
        ...singleBlockResults[0],
        imageId // 保持 imageId
      };
    }
    
    ElMessage.success('重试完成');
  } catch (error) {
    console.error('重试失败:', error);
    ocrResults.value[resultIndex].status = 'error';
    ocrResults.value[resultIndex].error = (error as Error).message;
    ElMessage.error('重试失败');
  }
};

// 处理切换忽略状态
const handleToggleIgnore = (blockId: string) => {
  const result = ocrResults.value.find(r => r.blockId === blockId);
  if (result) {
    result.ignored = !result.ignored;
    ElMessage.success(result.ignored ? '已忽略该块' : '已取消忽略');
  }
};
</script>

<template>
  <div class="smart-ocr-container">
    <!-- 左栏：控制面板 -->
    <div class="left-panel">
      <ControlPanel
        ref="controlPanelRef"
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
        @slice-image="handleSliceImage"
        @slice-all-images="handleSliceAllImages"
        @clear-all-images="handleClearAllImages"
      />
    </div>

    <!-- 右栏：结果面板 -->
    <div class="right-panel">
      <ResultPanel
        :ocr-results="ocrResults"
        :is-processing="isProcessing"
        :uploaded-images="uploadedImages"
        :image-blocks-map="imageBlocksMap"
        @retry-block="handleRetryBlock"
        @toggle-ignore="handleToggleIgnore"
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
  flex: 0 0 360px;
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
  flex: 0 0 420px;
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