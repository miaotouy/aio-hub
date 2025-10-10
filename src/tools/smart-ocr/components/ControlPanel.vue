<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import type { OcrEngineConfig, SlicerConfig, ImageBlock, CutLine, OcrResult, UploadedImage } from '../types';
import { useImageSlicer } from '../composables/useImageSlicer';
import { useOcrRunner } from '../composables/useOcrRunner';

const props = defineProps<{
  engineConfig: OcrEngineConfig;
  slicerConfig: SlicerConfig;
  uploadedImages: UploadedImage[];
  selectedImageId: string | null;
  isProcessing: boolean;
}>();

const emit = defineEmits<{
  'update:engineConfig': [config: OcrEngineConfig];
  'update:slicerConfig': [config: SlicerConfig];
  'sliceComplete': [imageId: string, blocks: ImageBlock[], lines: CutLine[]];
  'ocrStart': [];
  'ocrResultUpdate': [results: OcrResult[]];
  'ocrComplete': [];
}>();

// 使用 composables
const { sliceImage } = useImageSlicer();
const { runOcr } = useOcrRunner();

// 计算属性
const localEngineConfig = computed({
  get: () => props.engineConfig,
  set: (value) => emit('update:engineConfig', value)
});

const localSlicerConfig = computed({
  get: () => props.slicerConfig,
  set: (value) => emit('update:slicerConfig', value)
});

// 获取选中的图片
const selectedImage = computed(() => {
  if (!props.selectedImageId) return null;
  return props.uploadedImages.find(img => img.id === props.selectedImageId);
});

// 开始识别
const handleStartOcr = async () => {
  if (!selectedImage.value) {
    ElMessage.warning('请先上传并选择图片');
    return;
  }
  
  emit('ocrStart');
  
  try {
    const img = selectedImage.value.img;
    const imageId = selectedImage.value.id;
    
    // 检查是否需要切图
    const needSlice = props.slicerConfig.enabled && 
      (img.height / img.width) > props.slicerConfig.aspectRatioThreshold;
    
    let blocks: ImageBlock[] = [];
    let lines: CutLine[] = [];
    
    if (needSlice) {
      // 执行智能切图
      const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
      blocks = sliceResult.blocks;
      lines = sliceResult.lines;
      emit('sliceComplete', imageId, blocks, lines);
      ElMessage.success(`检测到 ${blocks.length} 个图片块`);
    } else {
      // 不切图，直接使用整张图片
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      blocks = [{
        id: 'full',
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: 0,
        endY: img.height,
        width: img.width,
        height: img.height
      }];
      emit('sliceComplete', imageId, blocks, []);
    }
    
    // 执行OCR识别
    const results = await runOcr(blocks, props.engineConfig, (updatedResults: OcrResult[]) => {
      emit('ocrResultUpdate', updatedResults);
    });
    
    emit('ocrResultUpdate', results);
    emit('ocrComplete');
    ElMessage.success('识别完成');
    
  } catch (error) {
    console.error('OCR处理失败:', error);
    ElMessage.error('识别失败: ' + (error as Error).message);
    emit('ocrComplete');
  }
};

// 批量识别所有图片
const handleBatchOcr = async () => {
  if (props.uploadedImages.length === 0) {
    ElMessage.warning('请先上传图片');
    return;
  }
  
  ElMessage.info(`准备批量识别 ${props.uploadedImages.length} 张图片`);
  emit('ocrStart');
  
  try {
    for (const uploadedImage of props.uploadedImages) {
      const img = uploadedImage.img;
      const imageId = uploadedImage.id;
      
      // 检查是否需要切图
      const needSlice = props.slicerConfig.enabled && 
        (img.height / img.width) > props.slicerConfig.aspectRatioThreshold;
      
      let blocks: ImageBlock[] = [];
      let lines: CutLine[] = [];
      
      if (needSlice) {
        const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
        blocks = sliceResult.blocks;
        lines = sliceResult.lines;
        emit('sliceComplete', imageId, blocks, lines);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        
        blocks = [{
          id: 'full',
          imageId,
          canvas,
          dataUrl: canvas.toDataURL(),
          startY: 0,
          endY: img.height,
          width: img.width,
          height: img.height
        }];
        emit('sliceComplete', imageId, blocks, []);
      }
      
      // 执行OCR识别
      const results = await runOcr(blocks, props.engineConfig, (updatedResults: OcrResult[]) => {
        emit('ocrResultUpdate', updatedResults);
      });
      
      emit('ocrResultUpdate', results);
    }
    
    emit('ocrComplete');
    ElMessage.success('批量识别完成');
    
  } catch (error) {
    console.error('批量OCR处理失败:', error);
    ElMessage.error('批量识别失败: ' + (error as Error).message);
    emit('ocrComplete');
  }
};
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>控制面板</h3>
    </div>
    
    <div class="panel-content">
      <!-- 当前状态 -->
      <el-card v-if="uploadedImages.length > 0" shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><i-ep-picture /></el-icon>
            <span>当前状态</span>
          </div>
        </template>
        
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="已上传">
            {{ uploadedImages.length }} 张图片
          </el-descriptions-item>
          <el-descriptions-item label="当前选中" v-if="selectedImage">
            {{ selectedImage.name }}
          </el-descriptions-item>
          <el-descriptions-item label="当前选中" v-else>
            <el-text type="info">未选择</el-text>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>
      
      <!-- OCR引擎选择 -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>OCR引擎</span>
          </div>
        </template>
        
        <el-form label-position="top" size="small">
          <el-form-item label="引擎类型">
            <el-select v-model="localEngineConfig.type" style="width: 100%">
              <el-option label="Native OCR (系统原生)" value="native" />
              <el-option label="Tesseract.js (本地)" value="tesseract" />
              <el-option label="云端OCR" value="cloud" disabled />
              <el-option label="视觉语言模型" value="vlm" disabled />
            </el-select>
          </el-form-item>
          
          <el-form-item v-if="localEngineConfig.type === 'tesseract'" label="识别语言">
            <el-select v-model="localEngineConfig.language" style="width: 100%">
              <el-option label="简体中文+英文" value="chi_sim+eng" />
              <el-option label="简体中文" value="chi_sim" />
              <el-option label="英文" value="eng" />
              <el-option label="繁体中文+英文" value="chi_tra+eng" />
              <el-option label="日文" value="jpn" />
              <el-option label="韩文" value="kor" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>
      
      <!-- 智能切图配置 -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><i-ep-scissor /></el-icon>
            <span>智能切图</span>
          </div>
        </template>
        
        <el-form label-position="top" size="small">
          <el-form-item>
            <el-switch
              v-model="localSlicerConfig.enabled"
              active-text="启用"
              inactive-text="禁用"
            />
          </el-form-item>
          
          <template v-if="localSlicerConfig.enabled">
            <el-form-item label="长宽比阈值">
              <el-slider
                v-model="localSlicerConfig.aspectRatioThreshold"
                :min="2"
                :max="10"
                :step="0.5"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                当图片高度/宽度 > {{ localSlicerConfig.aspectRatioThreshold }} 时触发切图
              </el-text>
            </el-form-item>
            
            <el-form-item label="空白行阈值">
              <el-slider
                v-model="localSlicerConfig.blankThreshold"
                :min="0.01"
                :max="1"
                :step="0.01"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                单色像素占比 < {{ (localSlicerConfig.blankThreshold * 100).toFixed(0) }}% 视为空白行
              </el-text>
            </el-form-item>
            
            <el-form-item label="最小空白高度">
              <el-slider
                v-model="localSlicerConfig.minBlankHeight"
                :min="10"
                :max="50"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                空白区域至少 {{ localSlicerConfig.minBlankHeight }}px 才切割
              </el-text>
            </el-form-item>
            
            <el-form-item label="最小切割高度">
              <el-slider
                v-model="localSlicerConfig.minCutHeight"
                :min="20"
                :max="1000"
                :step="10"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                切割后的块至少高 {{ localSlicerConfig.minCutHeight }}px，更小的块会被跳过
              </el-text>
            </el-form-item>
          </template>
        </el-form>
      </el-card>
    </div>
    
    <!-- 操作按钮 - 固定在底部 -->
    <div class="panel-footer">
      <el-button
        type="primary"
        size="large"
        :disabled="!selectedImage || isProcessing"
        :loading="isProcessing"
        @click="handleStartOcr"
        style="width: 100%"
      >
        {{ isProcessing ? '识别中...' : '识别当前图片' }}
      </el-button>
      
      <el-button
        v-if="uploadedImages.length > 1"
        type="success"
        size="large"
        :disabled="uploadedImages.length === 0 || isProcessing"
        :loading="isProcessing"
        @click="handleBatchOcr"
        style="width: 100%; margin-top: 12px"
      >
        批量识别全部
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-content {
  flex: 1;
  padding: 20px;
  padding-bottom: 16px;
  overflow-y: auto;
}

.section-card {
  margin-bottom: 16px;
}

.section-card:last-of-type {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.panel-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

/* Element Plus 组件样式覆盖 */
:deep(.el-card__header) {
  padding: 12px 16px;
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-color);
}

:deep(.el-descriptions) {
  --el-descriptions-item-bordered-label-background: var(--bg-color);
}

/* 调整滑块和输入框的宽度占比 */
:deep(.el-slider .el-input-number) {
  width: 65px;
}
</style>