<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import ControlPanel from "./components/ControlPanel.vue";
import PreviewPanel from "./components/PreviewPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import SidebarToggleIcon from "@/components/icons/SidebarToggleIcon.vue";
import type {
  OcrEngineConfig,
  ImageBlock,
  OcrResult,
  SlicerConfig,
  CutLine,
  UploadedImage,
} from "./types";
import type { SmartOcrConfig } from "./config";
import {
  loadSmartOcrConfig,
  createDebouncedSave,
  getCurrentEngineConfig,
  defaultSmartOcrConfig,
} from "./config";
import { useOcrRunner } from "./composables/useOcrRunner";
import { useSmartOcrUiState } from "./composables/useSmartOcrUiState";
import { createModuleLogger } from "@utils/logger";

// 创建模块日志记录器
const log = createModuleLogger("SmartOCR");

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

// 拖拽初始状态
const dragStartX = ref(0);
const dragStartWidth = ref(0);

// 拖拽处理
const handleLeftDragStart = (e: MouseEvent) => {
  isDraggingLeft.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = leftPanelWidth.value;
  e.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
};

const handleRightDragStart = (e: MouseEvent) => {
  isDraggingRight.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = rightPanelWidth.value;
  e.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
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
    const newWidth = dragStartWidth.value - delta; // 右侧边栏向左移动时宽度增加
    if (newWidth >= 300 && newWidth <= 600) {
      rightPanelWidth.value = newWidth;
    }
  }
};

const handleMouseUp = () => {
  isDraggingLeft.value = false;
  isDraggingRight.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};

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
    const isTypeSwitch = Object.keys(newConfig).length === 1 && "type" in newConfig;

    if (isTypeSwitch) {
      // 切换引擎类型：更新当前引擎类型，保持各引擎已保存的配置不变
      fullConfig.value = {
        ...fullConfig.value,
        currentEngineType: type,
      };
    } else {
      // 更新当前引擎的配置
      const newEngineConfigs = { ...fullConfig.value.engineConfigs };

      // 根据引擎类型更新对应的配置
      switch (type) {
        case "tesseract":
          // 只更新实际改变的字段，保留其他字段
          newEngineConfigs.tesseract = {
            ...newEngineConfigs.tesseract,
            name: newConfig.name || newEngineConfigs.tesseract.name,
            language:
              (newConfig as any).language !== undefined
                ? (newConfig as any).language
                : newEngineConfigs.tesseract.language,
          };
          break;
        case "native":
          newEngineConfigs.native = {
            ...newEngineConfigs.native,
            name: newConfig.name || newEngineConfigs.native.name,
          };
          break;
        case "vlm":
          newEngineConfigs.vlm = {
            ...newEngineConfigs.vlm,
            name: newConfig.name || newEngineConfigs.vlm.name,
            profileId:
              (newConfig as any).profileId !== undefined
                ? (newConfig as any).profileId
                : newEngineConfigs.vlm.profileId,
            modelId:
              (newConfig as any).modelId !== undefined
                ? (newConfig as any).modelId
                : newEngineConfigs.vlm.modelId,
            prompt:
              (newConfig as any).prompt !== undefined
                ? (newConfig as any).prompt
                : newEngineConfigs.vlm.prompt,
            temperature:
              (newConfig as any).temperature !== undefined
                ? (newConfig as any).temperature
                : newEngineConfigs.vlm.temperature,
            maxTokens:
              (newConfig as any).maxTokens !== undefined
                ? (newConfig as any).maxTokens
                : newEngineConfigs.vlm.maxTokens,
            concurrency:
              (newConfig as any).concurrency !== undefined
                ? (newConfig as any).concurrency
                : newEngineConfigs.vlm.concurrency,
            delay:
              (newConfig as any).delay !== undefined
                ? (newConfig as any).delay
                : newEngineConfigs.vlm.delay,
          };
          break;
        case "cloud":
          newEngineConfigs.cloud = {
            ...newEngineConfigs.cloud,
            name: newConfig.name || newEngineConfigs.cloud.name,
            activeProfileId:
              (newConfig as any).activeProfileId !== undefined
                ? (newConfig as any).activeProfileId
                : newEngineConfigs.cloud.activeProfileId,
          };
          break;
      }

      // 更新完整配置
      fullConfig.value = {
        ...fullConfig.value,
        currentEngineType: type,
        engineConfigs: newEngineConfigs,
      };
    }
  },
});

// 智能切图配置（通过计算属性暴露给子组件）
const slicerConfig = computed<SlicerConfig>({
  get: () => fullConfig.value.slicerConfig,
  set: (value: SlicerConfig) => {
    fullConfig.value = {
      ...fullConfig.value,
      slicerConfig: value,
    };
  },
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
watch(
  fullConfig,
  () => {
    debouncedSave(fullConfig.value);
  },
  { deep: true }
);

// 组件挂载时加载配置
onMounted(async () => {
  // 加载UI状态
  await loadUiState();

  // 启动UI状态自动保存
  startWatching();

  // 加载OCR配置
  try {
    fullConfig.value = await loadSmartOcrConfig();
  } catch (error) {
    log.error("加载配置失败", error as Error);
  }

  // 注册鼠标事件监听
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
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
  const index = uploadedImages.value.findIndex((img) => img.id === imageId);
  if (index !== -1) {
    uploadedImages.value.splice(index, 1);
    cutLinesMap.value.delete(imageId);
    imageBlocksMap.value.delete(imageId);

    // 如果删除的是当前选中的图片，选中下一张
    if (selectedImageId.value === imageId) {
      selectedImageId.value =
        uploadedImages.value[index]?.id || uploadedImages.value[index - 1]?.id || null;
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
  customMessage.success("已清除所有图片");
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
  const resultIndex = ocrResults.value.findIndex((r) => r.blockId === blockId);
  if (resultIndex === -1) {
    customMessage.warning("未找到对应的识别结果");
    return;
  }

  const result = ocrResults.value[resultIndex];
  const imageId = result.imageId;

  // 找到对应的block
  const blocks = imageBlocksMap.value.get(imageId);
  if (!blocks) {
    customMessage.warning("未找到对应的图片块");
    return;
  }

  const block = blocks.find((b) => b.id === blockId);
  if (!block) {
    customMessage.warning("未找到对应的图片块");
    return;
  }

  // 更新状态为处理中
  ocrResults.value[resultIndex].status = "processing";
  ocrResults.value[resultIndex].error = undefined;

  try {
    // 重新识别这个块
    const singleBlockResults = await runOcr(
      [block],
      engineConfig.value,
      (updatedResults: OcrResult[]) => {
        // 更新单个结果
        if (updatedResults.length > 0) {
          ocrResults.value[resultIndex] = {
            ...updatedResults[0],
            imageId, // 保持 imageId
          };
        }
      }
    );

    // 最终更新
    if (singleBlockResults.length > 0) {
      ocrResults.value[resultIndex] = {
        ...singleBlockResults[0],
        imageId, // 保持 imageId
      };
    }

    customMessage.success("重试完成");
  } catch (error) {
    log.error("重试失败", error as Error, {
      blockId,
      imageId,
      engineType: engineConfig.value.type,
    });
    ocrResults.value[resultIndex].status = "error";
    ocrResults.value[resultIndex].error = (error as Error).message;
    customMessage.error("重试失败");
  }
};

// 处理切换忽略状态
const handleToggleIgnore = (blockId: string) => {
  const result = ocrResults.value.find((r) => r.blockId === blockId);
  if (result) {
    result.ignored = !result.ignored;
    customMessage.success(result.ignored ? "已忽略该块" : "已取消忽略");
  }
};
</script>

<template>
  <div class="smart-ocr-wrapper">
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
