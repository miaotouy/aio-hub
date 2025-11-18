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
      <div class="right-panel">
        <!-- 分析设置 -->
        <InfoCard title="分析设置" class="settings-card">
          <div class="control-section">
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
        </InfoCard>

        <!-- 分析结果 -->
        <InfoCard title="分析结果" class="results-card">
          <PaletteDisplay
            :algorithm="store.selectedAlgorithm"
            :quantize-result="store.currentAnalysisResult?.quantize"
            :vibrant-result="store.currentAnalysisResult?.vibrant"
            :average-result="store.currentAnalysisResult?.average"
            :format="store.preferredFormat"
          />
        </InfoCard>

        <!-- 精确取色 -->
        <InfoCard title="精确取色" class="picker-card">
          <template #headerExtra>
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
          </template>
          <div class="manual-picker-content">
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

            <div v-if="store.manualPalette.length > 0" class="manual-palette-grid">
              <el-tooltip
                v-for="color in store.manualPalette"
                :key="color.id"
                :content="color.hex"
                placement="top"
              >
                <div class="manual-color-item" :style="{ backgroundColor: color.hex }">
                  <div class="color-actions">
                    <el-icon class="action-icon" @click.stop="copyColor(color.hex)">
                      <DocumentCopy />
                    </el-icon>
                    <el-icon class="action-icon" @click.stop="store.removeManualColor(color.id)">
                      <Close />
                    </el-icon>
                  </div>
                </div>
              </el-tooltip>
            </div>
            <el-empty v-else description="暂未拾取颜色" :image-size="60" />
          </div>
        </InfoCard>
      </div>
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
  DocumentCopy,
  Close,
} from '@element-plus/icons-vue';
import { Pipette } from 'lucide-vue-next';
import { useColorPickerStore, type ManualColor } from './colorPicker.store';
import { useColorExtractor } from './composables/useColorExtractor';
import { useColorHistory } from './composables/useColorHistory';
import { useAssetManager } from '@/composables/useAssetManager';
import { useFileInteraction } from '@/composables/useFileInteraction';
import { hexToRgb, copyToClipboard } from './composables/useColorConverter';
import { customMessage } from '@/utils/customMessage';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { createModuleLogger } from '@/utils/logger';
import InfoCard from '@/components/common/InfoCard.vue';
import PaletteDisplay from './components/PaletteDisplay.vue';
import HistoryDialog from './components/HistoryDialog.vue';

const errorHandler = createModuleErrorHandler('color-picker/ColorPicker');
const logger = createModuleLogger('color-picker/ColorPicker');
const store = useColorPickerStore();
const assetManager = useAssetManager();
const { extractColors, extractQuantizeColors } = useColorExtractor();
const { addRecord, loadFullRecord } = useColorHistory();

// const { imageRef, onImageLoad } = useColorAnalysis();
const imageRef = ref<HTMLImageElement | null>(null);
const { isHistoryDialogVisible } = useDialogs();
const { openEyeDropper, isEyeDropperSupported, copyColor } = useManualPicker();

const dropAreaRef = ref<HTMLElement | undefined>();
const fileInputRef = ref<HTMLInputElement | null>(null);
const imageUrl = ref<string | null>(null);
const isDraggingOver = ref(false);
const currentImageBlob = ref<Blob | null>(null);

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
    const asset = await assetManager.importAssetFromBytes(buffer, fileName);
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
      await addRecord(
        {
          assetId: asset.id,
          sourceImageName: asset.name,
          createdAt: Date.now(),
          analysisResult: result,
        },
        asset
      );
      logger.info('已保存分析结果到历史记录', { assetId: asset.id });
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
    store.clearManualPalette();

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

  async function copyColor(hexColor: string) {
    await copyToClipboard(
      hexColor,
      () => customMessage.success(`已复制: ${hexColor}`),
      (error) => customMessage.error(`复制失败: ${error.message}`)
    );
  }

  return { openEyeDropper, isEyeDropperSupported, copyColor };
}

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
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  overflow-y: auto;
}

.settings-card,
.results-card,
.picker-card {
  flex-shrink: 0;
}

.results-card {
  flex: 1;
  min-height: 0;
}

.results-card :deep(.el-card__body) {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 控制区域 */
.control-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  width: 80px;
  flex-shrink: 0;
}

/* 精确取色 */
.manual-picker-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.support-warning {
  font-size: 12px;
  color: var(--el-color-warning);
  margin: 0;
}

.manual-palette-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px;
  padding-top: 8px;
}

.manual-color-item {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.manual-color-item:hover .color-actions {
  opacity: 1;
}

.color-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.action-icon {
  color: white;
  font-size: 16px;
  padding: 4px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: background-color 0.2s;
}

.action-icon:hover {
  background-color: rgba(255, 255, 255, 0.4);
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
