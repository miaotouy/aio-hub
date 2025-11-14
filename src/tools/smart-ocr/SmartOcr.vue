<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { customMessage } from '@/utils/customMessage';
import ControlPanel from './components/ControlPanel.vue';
import HistoryDialog from './components/HistoryDialog.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import ResultPanel from './components/ResultPanel.vue';
import SidebarToggleIcon from '@/components/icons/SidebarToggleIcon.vue';
import type { UploadedImage } from './types';
import { useSmartOcrUiState } from './composables/useSmartOcrUiState';
import { useSmartOcrStore } from './smartOcr.store';
import { useSmartOcrRunner } from './composables/useSmartOcrRunner';
import { useOcrHistory } from './composables/useOcrHistory';
import { useAssetManager } from '@/composables/useAssetManager';
import { createModuleLogger } from '@utils/logger';
import { nanoid } from 'nanoid';

// 创建模块日志记录器
const log = createModuleLogger('SmartOCR');

// 1. 获取 store 和响应式状态
const store = useSmartOcrStore();
const {
  uploadedImages,
  imageBlocksMap,
  cutLinesMap,
  ocrResults,
  isProcessing,
  fullConfig,
  engineConfig,
  slicerConfig,
} = storeToRefs(store);

// 2. 获取业务方法
const {
  initialize,
  addImages,
  removeImage,
  sliceImage,
  sliceAllImages,
  retryBlock,
  toggleBlockIgnore,
  updateBlockText,
  updateEngineConfig,
  updateSlicerConfig,
  runFullOcrProcess,
} = useSmartOcrRunner();

// UI状态持久化
const {
  isLeftPanelCollapsed,
  isRightPanelCollapsed,
  leftPanelWidth,
  rightPanelWidth,
  loadUiState,
  startWatching,
} = useSmartOcrUiState();

// 拖拽状态
const isDraggingLeft = ref(false);
const isDraggingRight = ref(false);
const dragStartX = ref(0);
const dragStartWidth = ref(0);

// UI 状态
const selectedImageId = ref<string | null>(null);
const isHistoryDialogVisible = ref(false);

// ControlPanel 组件引用（保留用于未来可能需要的方法调用）
const controlPanelRef = ref<InstanceType<typeof ControlPanel>>();

// 拖拽处理
const handleLeftDragStart = (e: MouseEvent) => {
  isDraggingLeft.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = leftPanelWidth.value;
  e.preventDefault();
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleRightDragStart = (e: MouseEvent) => {
  isDraggingRight.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = rightPanelWidth.value;
  e.preventDefault();
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDraggingLeft.value) {
    const delta = e.clientX - dragStartX.value;
    const newWidth = dragStartWidth.value + delta;
    if (newWidth >= 280 && newWidth <= 600) {
      leftPanelWidth.value = newWidth;
    }
  } else if (isDraggingRight.value) {
    const delta = e.clientX - dragStartX.value;
    const newWidth = dragStartWidth.value - delta;
    if (newWidth >= 300 && newWidth <= 600) {
      rightPanelWidth.value = newWidth;
    }
  }
};

const handleMouseUp = () => {
  isDraggingLeft.value = false;
  isDraggingRight.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

// 组件挂载时初始化
onMounted(async () => {
  // 加载UI状态
  await loadUiState();
  startWatching();

  // 初始化 OCR（加载配置）
  await initialize();
  
  log.info('SmartOCR 组件已挂载，Store 和 Runner 已初始化');

  // 注册鼠标事件监听
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  log.info('SmartOCR 组件已卸载');
});

// 处理图片上传
const handleImagesUpload = (images: UploadedImage[]) => {
  addImages(images);
  // 自动选中第一张新上传的图片
  if (images.length > 0 && !selectedImageId.value) {
    selectedImageId.value = images[0].id;
  }
};

// 处理图片删除
const handleImageRemove = (imageId: string) => {
  removeImage(imageId);
  
  // 如果删除的是当前选中的图片，选中下一张
  if (selectedImageId.value === imageId) {
    selectedImageId.value = uploadedImages.value[0]?.id || null;
  }
};

// 处理清除所有图片
const handleClearAllImages = () => {
  store.reset();
  selectedImageId.value = null;
  customMessage.success('已清除所有图片');
};

// 处理图片选择
const handleImageSelect = (imageId: string) => {
  selectedImageId.value = imageId;
};


// 处理单个图片切图
const handleSliceImage = async (imageId: string) => {
  await sliceImage(imageId);
};

// 处理批量切图
const handleSliceAllImages = async () => {
  await sliceAllImages();
};

// 处理重试单个块
const handleRetryBlock = async (blockId: string) => {
  await retryBlock({ blockId });
  customMessage.success('重试完成');
};

// 处理切换忽略状态
const handleToggleIgnore = (blockId: string) => {
  toggleBlockIgnore(blockId);
  const result = ocrResults.value.find((r: any) => r.blockId === blockId);
  customMessage.success(result?.ignored ? '已忽略该块' : '已取消忽略');
};

// 处理文本更新
const handleUpdateText = (blockId: string, text: string) => {
  updateBlockText(blockId, text);
  log.info('更新块文本', { blockId, textLength: text.length });
};

// ==================== 历史记录处理 ====================

const { loadFullRecord } = useOcrHistory();
const { getAssetBinary } = useAssetManager();

const openHistoryDialog = () => {
  isHistoryDialogVisible.value = true;
};

/**
 * 从 File 对象创建 UploadedImage 对象
 */
async function createUploadedImageFromFile(file: File): Promise<UploadedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  return {
    id: nanoid(),
    file,
    img,
    name: file.name,
    size: file.size,
    dataUrl,
  };
}

const handleLoadRecord = async (recordId: string) => {
  try {
    const fullRecord = await loadFullRecord(recordId);
    if (!fullRecord) {
      customMessage.error('找不到该历史记录的详细数据');
      return;
    }

    const assetBinary = await getAssetBinary(fullRecord.assetPath);
    const file = new File([assetBinary], fullRecord.id, { type: fullRecord.assetMimeType });
    
    const uploadedImage = await createUploadedImageFromFile(file);
    addImages([uploadedImage]);

    // 关键：将历史结果与新加载的图片关联起来
    const newResults = fullRecord.results.map(res => ({
      ...res,
      imageId: uploadedImage.id, // 将结果中的 imageId 更新为新图片的 ID
    }));
    store.updateOcrResults(newResults);

    // 选中新加载的图片
    selectedImageId.value = uploadedImage.id;
    isHistoryDialogVisible.value = false;
    customMessage.success('历史记录已加载');
  } catch (error) {
    customMessage.error(`加载历史记录失败: ${error}`);
    log.error('加载历史记录失败', error, { recordId });
  }
};

const handleReRecognize = async (recordId: string) => {
  try {
    const fullRecord = await loadFullRecord(recordId);
    if (!fullRecord) {
      customMessage.error('找不到该历史记录的详细数据');
      return;
    }

    const assetBinary = await getAssetBinary(fullRecord.assetPath);
    const file = new File([assetBinary], fullRecord.id, { type: fullRecord.assetMimeType });

    const uploadedImage = await createUploadedImageFromFile(file);
    addImages([uploadedImage]);
    
    // 选中新加载的图片
    selectedImageId.value = uploadedImage.id;

    // 开始识别
    await runFullOcrProcess({ imageIds: [uploadedImage.id] });

    isHistoryDialogVisible.value = false;
  } catch (error) {
    customMessage.error(`重识别失败: ${error}`);
    log.error('重识别失败', error, { recordId });
  }
};
</script>

<template>
  <div class="smart-ocr-wrapper">
    <HistoryDialog
      v-model:visible="isHistoryDialogVisible"
      @load-record="handleLoadRecord"
      @re-recognize="handleReRecognize"
    />
    <div class="smart-ocr-container">
      <!-- 左栏：控制面板 -->
      <div
        v-if="!isLeftPanelCollapsed"
        class="panel left-panel"
        :style="{ width: `${leftPanelWidth}px` }"
      >
        <div class="panel-content">
          <ControlPanel
            ref="controlPanelRef"
            :selected-image-id="selectedImageId"
            :uploaded-images="uploadedImages"
            :is-processing="isProcessing"
            :engine-config="engineConfig"
            :slicer-config="slicerConfig"
            :full-config="fullConfig"
            @update-engine-config="updateEngineConfig"
            @update-slicer-config="updateSlicerConfig"
            @run-full-ocr-process="runFullOcrProcess"
            @open-history="openHistoryDialog"
          />
        </div>

        <!-- 拖拽分隔条 -->
        <div
          class="resize-handle right-handle"
          @mousedown="handleLeftDragStart"
          :class="{ dragging: isDraggingLeft }"
        ></div>

        <!-- 折叠按钮 -->
        <div class="collapse-button left-collapse" @click="isLeftPanelCollapsed = true">
          <SidebarToggleIcon class="collapse-icon trapezoid" />
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 中栏：预览面板 -->
      <div class="main-content">
        <!-- 左侧面板折叠时的展开按钮 -->
        <div
          v-if="isLeftPanelCollapsed"
          class="expand-button left-expand"
          @click="isLeftPanelCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" />
          <svg class="arrow-icon expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

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

        <!-- 右侧面板折叠时的展开按钮 -->
        <div
          v-if="isRightPanelCollapsed"
          class="expand-button right-expand"
          @click="isRightPanelCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" flip />
          <svg class="arrow-icon expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 右栏：结果面板 -->
      <div
        v-if="!isRightPanelCollapsed"
        class="panel right-panel"
        :style="{ width: `${rightPanelWidth}px` }"
      >
        <!-- 折叠按钮 -->
        <div class="collapse-button right-collapse" @click="isRightPanelCollapsed = true">
          <SidebarToggleIcon class="collapse-icon trapezoid" flip />
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <!-- 拖拽分隔条 -->
        <div
          class="resize-handle left-handle"
          @mousedown="handleRightDragStart"
          :class="{ dragging: isDraggingRight }"
        ></div>

        <div class="panel-content">
          <ResultPanel
            :ocr-results="ocrResults"
            :is-processing="isProcessing"
            :uploaded-images="uploadedImages"
            :image-blocks-map="imageBlocksMap"
            @retry-block="handleRetryBlock"
            @toggle-ignore="handleToggleIgnore"
            @update-text="handleUpdateText"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-ocr-wrapper {
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.smart-ocr-container {
  height: 100%;
  display: flex;
  position: relative;
  padding: 20px;
  background-color: var(--bg-color);
  gap: 16px;
  box-sizing: border-box;
}

/* 面板 */
.panel {
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
  display: flex;
}

.left-panel {
  border-radius: 8px;
}

.right-panel {
  border-radius: 8px;
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 拖拽分隔条 */
.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color 0.2s;
  z-index: 50;
}

.resize-handle:hover,
.resize-handle.dragging {
  background-color: var(--primary-color);
}

.left-handle {
  left: 0;
}

.right-handle {
  right: 0;
}

/* 折叠按钮 */
.collapse-button {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 200;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.collapse-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}

.arrow-icon {
  width: 12px;
  height: 12px;
  position: absolute;
  z-index: 1;
  transition: transform 0.3s;
  color: var(--text-color-light);
  stroke: var(--text-color-light);
}

.left-collapse {
  right: -20px;
}

.right-collapse {
  left: -20px;
}

/* 展开按钮 */
.expand-button {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 200;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.expand-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}

.left-expand {
  left: -12px;
}

.right-expand {
  right: -12px;
}

/* 中间内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  min-width: 0;
  position: relative;
}
</style>
