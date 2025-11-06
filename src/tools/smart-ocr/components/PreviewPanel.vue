<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { customMessage } from '@/utils/customMessage';
import { Upload, Delete, Picture, Scissor, Plus } from '@element-plus/icons-vue';
import type { ImageBlock, CutLine, UploadedImage } from '../types';
import { useFileDrop } from '@composables/useFileDrop';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '@utils/logger';
import { useImageViewer } from '@/composables/useImageViewer';
import { detectFileType } from '@/utils/fileTypeDetector';

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
  'sliceImage': [imageId: string];
  'sliceAllImages': [];
  'clearAllImages': [];
}>();

// 预览容器引用
const canvasRef = ref<HTMLCanvasElement>();
const fileInputRef = ref<HTMLInputElement>();
const dropZoneRef = ref<HTMLDivElement>();
const previewBodyRef = ref<HTMLDivElement>();

// 拖拽状态 - 浏览器内部拖拽
const isDragging = ref(false);

// 全局图片查看器
const imageViewer = useImageViewer();

// Tauri 文件拖放处理（用于从外部应用拖拽）
const { isDraggingOver: isTauriDragging } = useFileDrop({
  element: previewBodyRef,
  fileOnly: true,
  multiple: true,
  accept: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
  onDrop: async (paths: string[]) => {
    // 将文件路径转换为 File 对象
    const files: File[] = [];
    for (const path of paths) {
      try {
        // 获取文件名
        const fileName = path.split(/[/\\]/).pop() || 'image';
        
        // 使用新的文件类型检测工具获取 MIME 类型
        const { mimeType } = await detectFileType(path, fileName);
        
        // 使用 Tauri 命令读取文件为 base64
        const base64Data = await invoke<string>('read_file_as_base64', { path });
        
        // 将 base64 转换为 Blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        
        // 创建 File 对象
        const file = new File([blob], fileName, { type: mimeType });
        files.push(file);
      } catch (error) {
        const fileName = path.split(/[/\\]/).pop() || path;
        logger.error('PreviewPanel', '文件读取失败', error, {
          action: 'readFileAsTauriDrop',
          filePath: path,
          fileName
        });
        customMessage.error(`读取文件失败: ${fileName}`);
      }
    }
    
    if (files.length > 0) {
      await handleFiles(files);
    }
  }
});

// 合并拖拽状态（浏览器拖拽 + Tauri拖拽）
const isAnyDragging = computed(() => isDragging.value || isTauriDragging.value);

// 当前预览模式：original（原图+切割线） | blocks（切割后的图片块）
const previewMode = ref<'original' | 'blocks'>('original');

// Canvas 尺寸（响应式）
const canvasWidth = ref(0);
const canvasHeight = ref(0);

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

// 计算实际使用的切割线位置（从图片块中提取）
const usedCutLineYPositions = computed(() => {
  if (currentImageBlocks.value.length === 0) return new Set<number>();
  
  const positions = new Set<number>();
  // 从图片块的 endY 提取切割位置（除了最后一块）
  currentImageBlocks.value.forEach((block, index) => {
    if (index < currentImageBlocks.value.length - 1) {
      positions.add(block.endY);
    }
  });
  
  return positions;
});

// 处理文件上传
const handleFiles = async (files: FileList | File[]) => {
  const fileArray = Array.from(files);
  const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
  
  if (imageFiles.length === 0) {
    customMessage.warning('请选择图片文件');
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
      logger.error('PreviewPanel', '图片加载失败', error, {
        action: 'loadImage',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      customMessage.error(`加载图片 ${file.name} 失败`);
    }
  }
  
  if (uploadedImages.length > 0) {
    emit('imagesUpload', uploadedImages);
    customMessage.success(`成功上传 ${uploadedImages.length} 张图片`);
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
  // 只有离开 previewBody 才设置为 false
  if (e.target === previewBodyRef.value) {
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

// 计算缩放比例
const updateScale = () => {
  if (!canvasRef.value || !dropZoneRef.value) return;
  
  const canvas = canvasRef.value;
  const containerWidth = dropZoneRef.value.clientWidth - 40;
  // 优先按宽度缩放，让图片充分利用水平空间
  const scaleX = containerWidth / canvas.width;
  scale.value = Math.min(scaleX, 1);
};

// 绘制原图和切割线
const drawOriginalWithLines = () => {
  if (!selectedImage.value || !canvasRef.value) return;
  
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d')!;
  const img = selectedImage.value.img;
  
  // 设置canvas尺寸（同时更新响应式 ref）
  canvas.width = img.width;
  canvas.height = img.height;
  canvasWidth.value = img.width;
  canvasHeight.value = img.height;
  
  // 绘制原图
  ctx.drawImage(img, 0, 0);
  
  // 绘制切割线
  if (currentCutLines.value.length > 0) {
    const usedPositions = usedCutLineYPositions.value;
    
    currentCutLines.value.forEach(line => {
      const isUsed = usedPositions.has(line.y);
      
      // 实际使用的切割线：绿色实线
      // 未使用的切割线：红色虚线
      ctx.strokeStyle = isUsed ? '#00cc66' : '#ff4444';
      ctx.lineWidth = isUsed ? 2.5 : 1.5;
      ctx.setLineDash(isUsed ? [] : [5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(0, line.y);
      ctx.lineTo(canvas.width, line.y);
      ctx.stroke();
    });
    
    ctx.setLineDash([]);
  }
  
  // 使用 requestAnimationFrame 确保布局完成后再计算缩放
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updateScale();
    });
  });
};

// 监听选中图片和切割线变化
watch([selectedImage, currentCutLines], async () => {
  if (previewMode.value === 'original') {
    await nextTick();
    drawOriginalWithLines();
  }
}, { immediate: true });

// 监听图片块变化
watch(currentImageBlocks, (blocks) => {
  if (blocks.length > 0 && previewMode.value === 'original') {
    // 自动切换到块视图
    previewMode.value = 'blocks';
  } else if (blocks.length === 0 && previewMode.value === 'blocks') {
    // 没有图片块时，切回原图视图
    previewMode.value = 'original';
  }
});

// 切换预览模式
const togglePreviewMode = async () => {
  previewMode.value = previewMode.value === 'original' ? 'blocks' : 'original';
  
  if (previewMode.value === 'original') {
    await nextTick();
    drawOriginalWithLines();
  }
};

// 计算canvas样式
const canvasStyle = computed(() => ({
  width: `${canvasWidth.value * scale.value}px`,
  height: `${canvasHeight.value * scale.value}px`
}));

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 查看图片大图
const handleViewImage = (imageId: string) => {
  const image = props.uploadedImages.find(img => img.id === imageId);
  if (image) {
    imageViewer.show(image.dataUrl);
  }
};

// 查看原图
const handleViewOriginal = () => {
  if (selectedImage.value) {
    imageViewer.show(selectedImage.value.dataUrl);
  }
};

// 查看图片块
const handleViewBlock = (block: ImageBlock) => {
  imageViewer.show(block.dataUrl);
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
    <!-- 隐藏的文件选择器 -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      style="display: none"
      @change="handleFileChange"
    />
    
    <div class="panel-header">
      <h3>图片预览</h3>
      <div class="header-actions">
        <el-tag v-if="uploadedImages.length > 0" type="info" size="small">
          {{ uploadedImages.length }} 张图片
        </el-tag>
        <el-button
          v-if="uploadedImages.length > 0"
          size="small"
          type="danger"
          :icon="Delete"
          @click="emit('clearAllImages')"
        >
          清除全部
        </el-button>
        <el-button
          v-if="uploadedImages.length > 0"
          size="small"
          type="warning"
          :icon="Scissor"
          @click="emit('sliceAllImages')"
        >
          批量切图
        </el-button>
      </div>
    </div>
    
    <div
      ref="previewBodyRef"
      class="preview-body"
      :class="{ 'body-dragging': isAnyDragging }"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- 图片列表 -->
      <div v-if="uploadedImages.length > 0" class="images-list">
        <div
          v-for="image in uploadedImages"
          :key="image.id"
          class="image-item"
          :class="{ active: image.id === selectedImageId }"
          @click="emit('imageSelect', image.id)"
        >
          <el-tooltip content="双击查看大图" placement="top">
            <img
              :src="image.dataUrl"
              :alt="image.name"
              @dblclick.stop="handleViewImage(image.id)"
              class="thumbnail-image"
            />
          </el-tooltip>
          <div class="image-info">
            <el-tooltip :content="image.name" placement="top">
              <span class="image-name">{{ image.name }}</span>
            </el-tooltip>
            <span class="image-size">{{ formatFileSize(image.size) }}</span>
          </div>
          <!-- 图片块数量徽章 -->
          <div
            v-if="imageBlocksMap.get(image.id)?.length"
            class="block-count-badge"
          >
            {{ imageBlocksMap.get(image.id)!.length }}
          </div>
          <div class="image-actions">
            <el-tooltip content="切图" placement="top">
              <el-button
                class="action-btn slice-btn"
                type="warning"
                size="small"
                :icon="Scissor"
                circle
                @click.stop="emit('sliceImage', image.id)"
              />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button
                class="action-btn delete-btn"
                type="danger"
                size="small"
                :icon="Delete"
                circle
                @click.stop="emit('imageRemove', image.id)"
              />
            </el-tooltip>
          </div>
        </div>
        
        <!-- 添加图片按钮 -->
        <el-tooltip content="添加图片" placement="top">
          <div class="add-image-btn" @click="handleFileSelect">
            <el-icon :size="32" color="var(--el-color-primary)">
              <Plus />
            </el-icon>
            <span>添加图片</span>
          </div>
        </el-tooltip>
      </div>
      
      <!-- 预览内容 -->
      <div
        ref="dropZoneRef"
        class="preview-content"
      >
        <template v-if="uploadedImages.length === 0">
          <div class="empty-state">
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
          <div v-if="isAnyDragging" class="drag-overlay">
            <el-icon :size="64" color="#409EFF">
              <Upload />
            </el-icon>
            <p>释放以上传图片</p>
          </div>
          
          <!-- 视图切换按钮 -->
          <div v-if="currentImageBlocks.length > 0" class="preview-toolbar">
            <el-button
              size="small"
              @click="togglePreviewMode"
            >
              {{ previewMode === 'original' ? '查看图片块' : '查看原图' }}
            </el-button>
          </div>
          
          <!-- 原图+切割线视图 -->
          <div v-if="previewMode === 'original'" class="original-view">
            <el-tooltip content="点击查看大图" placement="top">
              <canvas
                ref="canvasRef"
                :style="canvasStyle"
                @click="handleViewOriginal"
                class="clickable-canvas"
              ></canvas>
            </el-tooltip>
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
                <el-tooltip content="点击查看大图" placement="top">
                  <img
                    :src="block.dataUrl"
                    :alt="`块 ${index + 1}`"
                    @click="handleViewBlock(block)"
                    class="clickable-block"
                  />
                </el-tooltip>
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
  flex-wrap: wrap;
}

.preview-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.preview-body.body-dragging {
  background-color: var(--el-color-primary-light-10);
}

.preview-body.body-dragging::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed var(--el-color-primary);
  pointer-events: none;
  z-index: 5;
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
  flex-shrink: 0;
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

.block-count-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background-color: var(--el-color-primary);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
}

.image-item:hover .image-actions {
  opacity: 1;
}

.action-btn {
  transition: transform 0.2s;
}

.action-btn:hover {
  transform: scale(1.1);
}

.add-image-btn {
  border: 2px dashed var(--el-color-primary-light-5);
  border-radius: 8px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--bg-color);
  flex-shrink: 0;
}

.add-image-btn:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-11);
  transform: translateY(-2px);
}

.add-image-btn span {
  font-size: 13px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  position: relative;
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

.preview-toolbar {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
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

.clickable-canvas {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.clickable-canvas:hover {
  transform: scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.thumbnail-image {
  cursor: pointer;
  transition: opacity 0.2s;
}

.thumbnail-image:hover {
  opacity: 0.9;
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

.clickable-block {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.clickable-block:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
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