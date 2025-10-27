<script setup lang="ts">
import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Asset } from '@/types/asset-management';
import { useImageViewer } from '@/composables/useImageViewer';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('AttachmentCard');

interface Props {
  asset: Asset;
  removable?: boolean;
}

interface Emits {
  (e: 'remove', asset: Asset): void;
}

const props = withDefaults(defineProps<Props>(), {
  removable: true,
});

const emit = defineEmits<Emits>();

const { show: showImage } = useImageViewer();
const assetUrl = ref<string>('');
const isLoadingUrl = ref(true);
const loadError = ref(false);

// 格式化文件大小
const formattedSize = computed(() => {
  const bytes = props.asset.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
});

// 是否为图片类型
const isImage = computed(() => props.asset.type === 'image');

// 获取文件后缀名
const fileExtension = computed(() => {
  const name = props.asset.name;
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === name.length - 1) {
    return '';
  }
  return name.substring(lastDotIndex);
});

// 获取文件类型图标
const fileTypeIcon = computed(() => {
  switch (props.asset.type) {
    case 'image':
      return '🖼️';
    case 'audio':
      return '🎵';
    case 'video':
      return '🎬';
    case 'document':
      return '📄';
    default:
      return '📎';
  }
});

// 加载资产 URL
const loadAssetUrl = async () => {
  try {
    isLoadingUrl.value = true;
    loadError.value = false;
    
    // 优先使用缩略图，否则使用原图
    const path = props.asset.thumbnailPath || props.asset.path;
    
    // 获取二进制数据
    const bytes = await invoke<number[]>('get_asset_binary', {
      relativePath: path,
    });
    
    // 转换为 Uint8Array
    const uint8Array = new Uint8Array(bytes);
    
    // 创建 Blob
    const blob = new Blob([uint8Array], { type: props.asset.mimeType });
    
    // 创建 Blob URL
    const url = URL.createObjectURL(blob);
    assetUrl.value = url;
  } catch (error) {
    logger.error('加载资产 URL 失败', error, { asset: props.asset });
    loadError.value = true;
  } finally {
    isLoadingUrl.value = false;
  }
};

// 处理点击预览
const handlePreview = async () => {
  if (!isImage.value) return;
  
  try {
    // 获取原始图片的二进制数据
    const bytes = await invoke<number[]>('get_asset_binary', {
      relativePath: props.asset.path,
    });
    
    // 转换为 Uint8Array 并创建 Blob URL
    const uint8Array = new Uint8Array(bytes);
    const blob = new Blob([uint8Array], { type: props.asset.mimeType });
    const url = URL.createObjectURL(blob);
    
    showImage(url);
  } catch (error) {
    logger.error('打开图片预览失败', error);
  }
};

// 处理移除
const handleRemove = (e: Event) => {
  e.stopPropagation();
  emit('remove', props.asset);
};

// 组件挂载时加载 URL
loadAssetUrl();

// 组件卸载时释放 Blob URL
import { onUnmounted } from 'vue';
onUnmounted(() => {
  if (assetUrl.value && assetUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(assetUrl.value);
  }
});
</script>

<template>
  <div class="attachment-card" :class="{ 'is-image': isImage, 'has-error': loadError }">
    <!-- 预览区域 -->
    <div class="attachment-preview" @click="handlePreview">
      <template v-if="isLoadingUrl">
        <div class="loading-placeholder">
          <div class="spinner"></div>
        </div>
      </template>
      <template v-else-if="loadError">
        <div class="error-placeholder">
          <span class="icon">⚠️</span>
          <span class="text">加载失败</span>
        </div>
      </template>
      <template v-else>
        <img
          v-if="isImage && assetUrl"
          :src="assetUrl"
          :alt="asset.name"
          class="preview-image"
          :class="{ 'clickable': isImage }"
        />
        <div v-else class="file-icon">
          <span class="icon">{{ fileTypeIcon }}</span>
        </div>
      </template>
    </div>

    <!-- 信息区域 -->
    <div class="attachment-info">
      <div class="attachment-name" :title="asset.name">{{ asset.name }}</div>
      <div class="attachment-meta">
        <span class="attachment-size">{{ formattedSize }}</span>
        <span v-if="fileExtension" class="attachment-ext">{{ fileExtension }}</span>
      </div>
    </div>

    <!-- 移除按钮 -->
    <button
      v-if="removable"
      class="remove-button"
      @click="handleRemove"
      title="移除附件"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.attachment-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 90px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
  transition: all 0.2s;
  flex-shrink: 0;
}

.attachment-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.attachment-card.has-error {
  border-color: var(--error-color);
}

.attachment-preview {
  position: relative;
  width: 100%;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--container-bg);
  overflow: hidden;
}

.attachment-preview.clickable {
  cursor: pointer;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-image.clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.preview-image.clickable:hover {
  transform: scale(1.05);
}

.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.file-icon .icon {
  font-size: 36px;
}

.loading-placeholder,
.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--text-color-light);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-placeholder .icon {
  font-size: 32px;
}

.error-placeholder .text {
  font-size: 12px;
}
.attachment-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%);
  backdrop-filter: blur(2px);
}

.attachment-name {
  font-size: 11px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-size {
  flex-shrink: 0;
}

.attachment-ext {
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.remove-button {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 2;
}

.attachment-card:hover .remove-button {
  opacity: 1;
}

.remove-button:hover {
  background: var(--error-color);
  transform: scale(1.1);
}
</style>