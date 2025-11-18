<template>
  <div class="color-picker-wrapper">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml"
      style="display: none"
      @change="onFileSelected"
    />
    <!-- 顶部操作栏 -->
    <div class="header-bar">
      <div class="header-content">
        <div class="header-left">
          <h3 class="page-title">图片色彩分析</h3>
          <el-tag v-if="store.isAnalyzing" type="primary" effect="dark">
            <el-icon class="is-loading"><Loading /></el-icon>
            分析中...
          </el-tag>
        </div>
        <div class="header-right">
          <el-tooltip content="查看历史记录" placement="bottom">
            <el-button :icon="Clock" @click="isHistoryDialogVisible = true">
              历史记录
            </el-button>
          </el-tooltip>
          <el-tooltip content="清除当前图片和结果" placement="bottom">
            <el-button :icon="Delete" @click="clearWorkspace" :disabled="!imageUrl">
              清除
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="color-picker-container">
      <!-- 左侧：图片预览区 -->
      <div class="left-panel">
        <InfoCard title="图片预览" class="preview-card">
          <template #headerExtra>
            <div v-if="imageUrl" class="preview-actions">
              <el-text type="info" size="small">拖放或粘贴以替换</el-text>
              <el-button :icon="FolderOpened" size="small" @click.stop="openFilePicker">
                替换图片
              </el-button>
              <el-button :icon="Delete" size="small" @click.stop="clearWorkspace">
                清除
              </el-button>
            </div>
          </template>
          <div
            ref="dropAreaRef"
            class="image-preview-area"
            :class="{ highlight: isDraggingOver }"
            @click="!imageUrl ? openFilePicker() : () => {}"
          >
            <div v-if="!imageUrl" class="upload-prompt">
              <el-icon :size="64"><Upload /></el-icon>
              <p>拖放图片到此处，或粘贴图片</p>
              <el-button type="primary" @click.stop="openFilePicker">
                <el-icon><FolderOpened /></el-icon>
                选择图片
              </el-button>
            </div>

            <template v-else>
              <img
                ref="imageRef"
                :src="imageUrl"
                class="preview-image"
              />
            </template>
          </div>
        </InfoCard>
      </div>

      <!-- 右侧：分析设置和结果 -->
      <RightPanel
        class="right-panel"
        :is-eye-dropper-supported="isEyeDropperSupported"
        :on-algorithm-change="onAlgorithmChange"
        :on-quantize-count-change="onQuantizeCountChange"
        :open-eye-dropper="openEyeDropper"
      />
    </div>

    <HistoryDialog
      :visible="isHistoryDialogVisible"
      @update:visible="isHistoryDialogVisible = $event"
      @load-record="handleLoadFromHistory"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import {
  Clock,
  Delete,
  Upload,
  FolderOpened,
  Loading,
} from '@element-plus/icons-vue';
import { useColorPickerStore, type ManualColor } from './colorPicker.store';
import { useColorExtractor } from './composables/useColorExtractor';
import { useColorHistory } from './composables/useColorHistory';
import { useAssetManager } from '@/composables/useAssetManager';
import { useFileInteraction } from '@/composables/useFileInteraction';
import { hexToRgb } from './composables/useColorConverter';
import { customMessage } from '@/utils/customMessage';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { createModuleLogger } from '@/utils/logger';
import { useDebounceFn } from '@vueuse/core';
import InfoCard from '@/components/common/InfoCard.vue';
import RightPanel from './components/RightPanel.vue';
import HistoryDialog from './components/HistoryDialog.vue';

const errorHandler = createModuleErrorHandler('color-picker/ColorPicker');
const logger = createModuleLogger('color-picker/ColorPicker');
const store = useColorPickerStore();
const assetManager = useAssetManager();
const { extractColors, extractQuantizeColors } = useColorExtractor();
const { addRecord, updateRecord, loadFullRecord } = useColorHistory();

// const { imageRef, onImageLoad } = useColorAnalysis();
const imageRef = ref<HTMLImageElement | null>(null);
const { isHistoryDialogVisible } = useDialogs();
const { openEyeDropper, isEyeDropperSupported } = useManualPicker();

const dropAreaRef = ref<HTMLElement | undefined>();
const fileInputRef = ref<HTMLInputElement | null>(null);
const imageUrl = ref<string | null>(null);
const isDraggingOver = ref(false);
const currentImageBlob = ref<Blob | null>(null);

function onAlgorithmChange() {
  // 未来可以根据算法切换触发重新分析
}

async function runInitialAnalysis() {
  if (!currentImageBlob.value) return;

  store.setAnalyzing(true);
  try {
    // 1. 导入资产并设置到 store
    const buffer = await currentImageBlob.value.arrayBuffer();
    // 使用 blob 的 name 属性，如果它是一个 File 对象
    const fileName = (currentImageBlob.value as File).name || 'image.png';
    const asset = await assetManager.importAssetFromBytes(buffer, fileName, {
      sourceModule: 'color-picker',
      origin: {
        type: 'local',
        source: 'color-picker',
        sourceModule: 'color-picker',
      },
      generateThumbnail: true,
      enableDeduplication: true,
    });
    if (!asset) throw new Error('资产创建失败');
    store.setCurrentImage(asset.id, asset.name);

    // 2. 进行颜色分析 (直接传递 Blob)
    if (!currentImageBlob.value) {
      // 应该不会发生，但在类型上做个保护
      throw new Error('当前没有可分析的图片 Blob');
    }
    const result = await extractColors(currentImageBlob.value);
    store.setAnalysisResult(result);

    // 4. 保存到历史记录（使用持久化存储）
    try {
      const record = await addRecord(
        {
          assetId: asset.id,
          sourceImageName: asset.name,
          createdAt: Date.now(),
          analysisResult: result,
          manualPalette: [],
        },
        asset
      );
      store.setCurrentRecordId(record.id);
      logger.info('已保存分析结果到历史记录', { assetId: asset.id, recordId: record.id });
    } catch (error) {
      errorHandler.error(error, '保存历史记录失败');
    }
  } catch (error) {
    errorHandler.error(error, '图片初始分析失败');
  } finally {
    store.setAnalyzing(false);
  }
}

async function onQuantizeCountChange() {
  if (currentImageBlob.value && store.selectedAlgorithm === 'quantize') {
    store.setAnalyzing(true);
    try {
      if (!currentImageBlob.value) return;
      const result = await extractQuantizeColors(
        currentImageBlob.value,
        store.quantizeColorCount
      );
      if (result) {
        store.updateAlgorithmResult('quantize', result);
      }
    } catch (error) {
      errorHandler.error(error, '重新计算颜色数量失败');
    } finally {
      store.setAnalyzing(false);
    }
  }
}

function clearWorkspace() {
  store.clearCurrent();
  if (imageUrl.value && imageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl.value);
  }
  imageUrl.value = null;
  currentImageBlob.value = null;
}

// --- Image Handling Logic ---

// 统一处理来自 Web API 的图片文件 (文件选择器, 粘贴)
const handleImageFiles = (files: File[]) => {
  if (files.length === 0) return;
  const file = files[0];

  // 清除旧状态
  if (store.hasImage) store.clearCurrent();
  if (imageUrl.value && imageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl.value);
  }
  currentImageBlob.value = null;
  // store.clearCurrent() 已经清除了 recordId，这里不需要重复清除

  // 保存 Blob 用于后续分析
  currentImageBlob.value = file;

  // 立即创建预览URL以快速显示图片
  imageUrl.value = URL.createObjectURL(file);

  // 在后台处理分析和保存
  runInitialAnalysis();
};

// 处理来自 Tauri 的文件拖放路径
const handleFilePaths = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];

  // 1. 清除旧状态
  if (store.hasImage) store.clearCurrent();
  if (imageUrl.value && imageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl.value);
  }
  currentImageBlob.value = null;
  // store.clearCurrent() 已经清除了 recordId

  // 2. 立即使用 tauri api 创建预览URL以快速显示图片
  imageUrl.value = convertFileSrc(path);

  // 3. 在后台读取文件并触发分析
  try {
    const base64Data = await invoke<string>('read_file_as_base64', { path });
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray]);
    const fileName = path.split(/[/\\]/).pop() || 'image';

    // 创建一个伪 File 对象，主要是为了能携带文件名
    currentImageBlob.value = new File([blob], fileName);

    runInitialAnalysis();
  } catch (error) {
    errorHandler.error(error, '读取拖放的文件失败');
  }
};

// 设置文件拖放和粘贴交互
const { isDraggingOver: isDraggingOverInternal, cleanup } = useFileInteraction({
  element: dropAreaRef,
  sourceModule: 'color-picker',
  onPaths: handleFilePaths,
  onFiles: handleImageFiles,
  imageOnly: true,
});
watch(isDraggingOverInternal, (newValue) => {
  isDraggingOver.value = newValue;
});

// 新增：处理文件输入框选择
function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleImageFiles(Array.from(target.files));
  }
  // 重置输入值，以便可以再次选择相同的文件
  if (target) {
    target.value = '';
  }
}

// 打开文件选择对话框
function openFilePicker() {
  fileInputRef.value?.click();
}

// 恢复上次会话
onMounted(async () => {
  if (store.currentImageAssetUri) {
    const asset = assetManager.assets.value.find(a => a.id === store.currentImageAssetUri);
    if (asset) {
      imageUrl.value = await assetManager.getAssetUrl(asset);
    }
  }
});

// --- Dialogs Logic ---
function useDialogs() {
  const isHistoryDialogVisible = ref(false);
  return { isHistoryDialogVisible };
}

// 从历史记录加载
async function handleLoadFromHistory(recordId: string) {
  try {
    const record = await loadFullRecord(recordId);
    if (!record) {
      customMessage.error('加载历史记录失败');
      return;
    }

    // 清除当前状态
    if (imageUrl.value && imageUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl.value);
    }
    currentImageBlob.value = null;
    store.setCurrentRecordId(null); // 暂停记录关联，避免加载过程触发自动保存

    // 从资产获取图片
    const asset = assetManager.assets.value.find(a => a.id === record.assetId);
    if (!asset) {
      customMessage.error('未找到关联的图片资产');
      return;
    }

    // 设置图片预览
    imageUrl.value = await assetManager.getAssetUrl(asset);
    
    // 设置 store 状态
    store.setCurrentImage(record.assetId, record.sourceImageName);
    store.setAnalysisResult(record.analysisResult);
    
    // 恢复手动取色板
    if (record.manualPalette) {
      // 需要手动赋值，因为 store 中没有 setManualPalette 方法，但 manualPalette 是 ref
      store.manualPalette = [...record.manualPalette];
    } else {
      store.clearManualPalette();
    }

    store.setCurrentRecordId(recordId); // 重新建立关联

    customMessage.success('已加载历史记录');
    logger.info('从历史记录加载成功', { recordId });
  } catch (error) {
    errorHandler.error(error, '加载历史记录失败');
  }
}

// --- Manual Picker Logic ---
function useManualPicker() {
  const isEyeDropperSupported = 'EyeDropper' in window;

  async function openEyeDropper() {
    if (!isEyeDropperSupported) return;

    try {
      // @ts-ignore
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const hex = result.sRGBHex.toUpperCase();
      const rgb = hexToRgb(hex);

      const newColor: Omit<ManualColor, 'id'> = {
        hex,
        rgb,
        position: { x: 0, y: 0 }, // EyeDropper API 不提供坐标
      };
      store.addManualColor(newColor);
      customMessage.success(`已添加颜色: ${hex}`);
    } catch (e) {
      // 用户取消取色
      console.log('EyeDropper cancelled');
    }
  }

  return { openEyeDropper, isEyeDropperSupported };
}

// --- Auto Save Logic ---

const autoSaveToHistory = useDebounceFn(async () => {
  if (!store.currentRecordId || !store.currentAnalysisResult) return;

  try {
    await updateRecord(store.currentRecordId, {
      analysisResult: store.currentAnalysisResult,
      manualPalette: store.manualPalette,
    });
  } catch (error) {
    logger.warn('自动保存历史记录失败', error);
  }
}, 1000);

watch(
  [() => store.currentAnalysisResult, () => store.manualPalette],
  () => {
    if (store.currentRecordId) {
      autoSaveToHistory();
    }
  },
  { deep: true }
);

// 清理
onUnmounted(() => {
  if (imageUrl.value && imageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl.value);
  }
  cleanup();
});
</script>

<style scoped>
.color-picker-wrapper {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部操作栏 */
.header-bar {
  margin-bottom: 16px;
  flex-shrink: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  padding: 12px 20px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Loading 动画 */
.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 主容器 */
.color-picker-container {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
  min-height: 0;
}

/* 左侧面板 */
.left-panel {
  flex: 3;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-card {
  height: 100%;
}

.preview-card :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.image-preview-area {
  width: 100%;
  height: 100%;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: border-color 0.2s, background-color 0.2s;
  overflow: hidden;
}

.image-preview-area.highlight {
  border-color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.1);
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}


/* 右侧面板 */
.right-panel {
  flex: 2;
  min-width: 0;
  overflow: hidden;
}

/* 响应式 */
@media (max-width: 1200px) {
  .color-picker-container {
    flex-direction: column;
  }

  .left-panel {
    height: 400px;
  }

  .right-panel {
    flex: 1;
  }
}

@media (max-width: 768px) {
  .color-picker-wrapper {
    padding: 12px;
  }

  .header-bar {
    padding: 8px 12px;
  }

  .page-title {
    font-size: 16px;
  }
}
</style>
