<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Delete, Picture } from '@element-plus/icons-vue';
import type { ImageBlock, CutLine, UploadedImage } from '../types';

const props = defineProps<{
  uploadedImages: UploadedImage[];
  selectedImageId: string | null;
  cutLinesMap: Map<string, CutLine[]>;
  imageBlocksMap: Map<string, ImageBlock[]>;
}>();

const emit = defineEmits<{
  'imagesUpload': [images: UploadedImage[]];
  'imageRemove': [imageId: string];
  'imageSelect': [imageId: string];
}>();

// 预览容器引用
const previewContainerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLCanvasElement>();
const fileInputRef = ref<HTMLInputElement>();
const dropZoneRef = ref<HTMLDivElement>();

// 拖拽状态
const isDragging = ref(false);

// 当前预览模式：original（原图+切割线） | blocks（切割后的图片块）
const previewMode = ref<'original' | 'blocks'>('original');

// 缩放比例
const scale = ref(1);

// 计算当前选中的图片
const selectedImage = computed(() => {
  if (!props.selectedImageId) return null;
  return props.uploadedImages.find(img => img.id === props.selectedImageId);
});

// 计算当前图片的切割线
const currentCutLines = computed(() => {
  if (!props.selectedImageId) return [];
  return props.cutLinesMap.get(props.selectedImageId) || [];
});

// 计算当前图片的图片块
const currentImageBlocks = computed(() => {
  if (!props.selectedImageId) return [];
  return props.imageBlocksMap.get(props.selectedImageId) || [];
});

// 处理文件上传
const handleFiles = async (files: FileList | File[]) => {
  const fileArray = Array.from(files);
  const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
  
  if (imageFiles.length === 0) {
    ElMessage.warning('请选择图片文件');
    return;
  }
  
  const uploadedImages: UploadedImage[] = [];
  
  for (const file of imageFiles) {
    try {
      const img = await loadImage(file);
      const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      uploadedImages.push({
        id,
        file,
        img,
        name: file.name,
        size: file.size,
        dataUrl: img.src
      });
    } catch (error) {
      ElMessage.error(`加载图片 ${file.name} 失败`);
      console.error('图片加载失败:', error);
    }
  }
  
  if (uploadedImages.length > 0) {
    emit('imagesUpload', uploadedImages);
    ElMessage.success(`成功上传 ${uploadedImages.length} 张图片`);
  }
};

// 加载图片
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

// 文件选择处理
const handleFileSelect = () => {
  fileInputRef.value?.click();
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFiles(target.files);
    // 清空input，允许重复选择同一文件
    target.value = '';
  }
};

// 拖拽处理
const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = true;
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // 只有离开dropZone才设置为false
  if (e.target === dropZoneRef.value) {
    isDragging.value = false;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = false;
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFiles(files);
  }
};

// 粘贴处理
const handlePaste = async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  const imageItems: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        imageItems.push(file);
      }
    }
  }
  
  if (imageItems.length > 0) {
    e.preventDefault();
    await handleFiles(imageItems);
  }
};

// 绘制原图和切割线
const drawOriginalWithLines = () => {
  if (!selectedImage.value || !canvasRef.value) return;
  
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d')!;
  const img = selectedImage.value.img;
  
  // 设置canvas尺寸
  canvas.width = img.width;
  canvas.height = img.height;
  
  // 绘制原图
  ctx.drawImage(img, 0, 0);
  
  // 绘制切割线
  if (currentCutLines.value.length > 0) {
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    currentCutLines.value.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(0, line.y);
      ctx.lineTo(canvas.width, line.y);
      ctx.stroke();
    });
    
    ctx.setLineDash([]);
  }
  
  // 计算适合容器的缩放比例
  if (previewContainerRef.value) {
    const containerWidth = previewContainerRef.value.clientWidth - 40;
    const containerHeight = previewContainerRef.value.clientHeight - 120;
    const scaleX = containerWidth / canvas.width;
    const scaleY = containerHeight / canvas.height;
    scale.value = Math.min(scaleX, scaleY, 1);
  }
};

// 监听选中图片和切割线变化
watch([selectedImage, currentCutLines], () => {
  if (previewMode.value === 'original') {
    drawOriginalWithLines();
  }
}, { immediate: true });

// 监听图片块变化
watch(currentImageBlocks, (blocks) => {
  if (blocks.length > 0 && previewMode.value === 'original') {
    // 自动切换到块视图
    previewMode.value = 'blocks';
  }
});

// 切换预览模式
const togglePreviewMode = () => {
  previewMode.value = previewMode.value === 'original' ? 'blocks' : 'original';
  if (previewMode.value === 'original') {
    drawOriginalWithLines();
  }
};

// 计算canvas样式
const canvasStyle = computed(() => ({
  width: `${(canvasRef.value?.width || 0) * scale.value}px`,
  height: `${(canvasRef.value?.height || 0) * scale.value}px`
}));

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 生命周期
onMounted(() => {
  // 监听全局粘贴事件
  document.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste);
});
</script>

<template>
  <div class="preview-panel">
    <div class="panel-header">
      <h3>图片预览</h3>
      <div class="header-actions">
        <el-tag v-if="uploadedImages.length > 0" type="info" size="small">
          {{ uploadedImages.length }} 张图片
        </el-tag>
        <el-tag v-if="currentCutLines.length > 0" type="success" size="small">
          {{ currentCutLines.length }} 个切割点
        </el-tag>
        <el-tag v-if="currentImageBlocks.length > 0" type="primary" size="small">
          {{ currentImageBlocks.length }} 个图片块
        </el-tag>
        <el-button
          v-if="currentImageBlocks.length > 0"
          size="small"
          @click="togglePreviewMode"
        >
          {{ previewMode === 'original' ? '查看图片块' : '查看原图' }}
        </el-button>
      </div>
    </div>
    
    <div class="preview-body">
      <!-- 图片列表 -->
      <div v-if="uploadedImages.length > 0" class="images-list">
        <div
          v-for="image in uploadedImages"
          :key="image.id"
          class="image-item"
          :class="{ active: image.id === selectedImageId }"
          @click="emit('imageSelect', image.id)"
        >
          <img :src="image.dataUrl" :alt="image.name" />
          <div class="image-info">
            <span class="image-name" :title="image.name">{{ image.name }}</span>
            <span class="image-size">{{ formatFileSize(image.size) }}</span>
          </div>
          <el-button
            class="delete-btn"
            type="danger"
            size="small"
            :icon="Delete"
            circle
            @click.stop="emit('imageRemove', image.id)"
          />
        </div>
      </div>
      
      <!-- 预览内容 -->
      <div
        ref="dropZoneRef"
        class="preview-content"
        :class="{ dragging: isDragging }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <template v-if="uploadedImages.length === 0">
          <div class="empty-state">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="handleFileChange"
            />
            <el-icon :size="64" color="#909399">
              <Picture />
            </el-icon>
            <p class="empty-text">拖拽图片到此处，或</p>
            <el-button type="primary" :icon="Upload" @click="handleFileSelect">
              选择图片
            </el-button>
            <p class="hint-text">支持多图上传，也可以直接粘贴图片（Ctrl+V）</p>
          </div>
        </template>
        
        <template v-else-if="!selectedImage">
          <div class="empty-state">
            <p class="empty-text">请选择一张图片</p>
          </div>
        </template>
        
        <template v-else>
          <!-- 拖拽提示层 -->
          <div v-if="isDragging" class="drag-overlay">
            <el-icon :size="64" color="#409EFF">
              <Upload />
            </el-icon>
            <p>释放以上传图片</p>
          </div>
          
          <!-- 原图+切割线视图 -->
          <div v-if="previewMode === 'original'" class="original-view">
            <canvas ref="canvasRef" :style="canvasStyle"></canvas>
          </div>
          
          <!-- 图片块视图 -->
          <div v-else class="blocks-view">
            <div
              v-for="(block, index) in currentImageBlocks"
              :key="block.id"
              class="block-item"
            >
              <div class="block-header">
                <el-tag size="small">块 {{ index + 1 }}</el-tag>
                <el-text size="small" type="info">
                  {{ block.width }}x{{ block.height }}px
                </el-text>
              </div>
              <div class="block-image">
                <img :src="block.dataUrl" :alt="`块 ${index + 1}`" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.images-list {
  width: 180px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-item {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--bg-color);
}

.image-item:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
}

.image-item.active {
  border-color: var(--el-color-primary);
}

.image-item img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  display: block;
}

.image-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.image-name {
  font-size: 12px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-size {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .delete-btn {
  opacity: 1;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  position: relative;
}

.preview-content.dragging {
  background-color: var(--el-color-primary-light-9);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: rgba(64, 158, 255, 0.1);
  border: 2px dashed var(--el-color-primary);
  border-radius: 8px;
  pointer-events: none;
  z-index: 10;
}

.drag-overlay p {
  margin-top: 16px;
  font-size: 16px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
}

.empty-text {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.original-view {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.original-view canvas {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.blocks-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.block-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
}

.block-header {
  padding: 12px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.block-image {
  padding: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--bg-color);
}

.block-image img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 自定义滚动条 */
.images-list::-webkit-scrollbar,
.preview-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.images-list::-webkit-scrollbar-track,
.preview-content::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.images-list::-webkit-scrollbar-thumb,
.preview-content::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.images-list::-webkit-scrollbar-thumb:hover,
.preview-content::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>