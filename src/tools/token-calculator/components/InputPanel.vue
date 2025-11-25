<template>
  <div ref="rootEl" class="input-panel">
    <div class="panel-header">
      <span class="panel-title">输入内容</span>
      <el-tag type="info" size="small" effect="plain">{{ sanitizedCharacterCount }} 字符</el-tag>
    </div>
    
    <div class="panel-content">
      <!-- 文本输入区域 -->
      <div class="text-area-wrapper">
        <el-input
          :model-value="inputText"
          @update:model-value="$emit('update:inputText', $event)"
          type="textarea"
          placeholder="请输入或粘贴要计算 Token 的文本..."
          class="input-textarea"
          resize="none"
        />
      </div>

      <!-- 媒体附件区域 -->
      <div class="media-section">
        <div class="media-toolbar">
          <el-button-group size="small">
            <el-button @click="openAddDialog('image')">
              <el-icon class="el-icon--left"><Picture /></el-icon>添加图片
            </el-button>
            <el-button @click="openAddDialog('video')">
              <el-icon class="el-icon--left"><VideoCamera /></el-icon>添加视频
            </el-button>
            <el-button @click="openAddDialog('audio')">
              <el-icon class="el-icon--left"><Microphone /></el-icon>添加音频
            </el-button>
          </el-button-group>
        </div>

        <!-- 媒体列表 -->
        <div v-if="mediaItems.length > 0" class="media-list">
          <div v-for="item in mediaItems" :key="item.id" class="media-item">
            <div class="media-icon">
              <el-icon v-if="item.type === 'image'"><Picture /></el-icon>
              <el-icon v-else-if="item.type === 'video'"><VideoCamera /></el-icon>
              <el-icon v-else><Microphone /></el-icon>
            </div>
            <div class="media-info">
              <div class="media-name">{{ getMediaDescription(item) }}</div>
              <div class="media-token-count" v-if="item.tokenCount !== undefined">
                {{ item.tokenCount }} tokens
              </div>
            </div>
            <el-button 
              link 
              type="danger" 
              class="delete-btn"
              @click="$emit('remove-media', item.id)"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加媒体对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="400px"
      append-to-body
      destroy-on-close
    >
      <el-form :model="mediaForm" label-width="80px">
        <template v-if="currentMediaType === 'image'">
          <el-form-item label="宽度 (px)">
            <el-input-number v-model="mediaForm.width" :min="1" :step="1" />
          </el-form-item>
          <el-form-item label="高度 (px)">
            <el-input-number v-model="mediaForm.height" :min="1" :step="1" />
          </el-form-item>
        </template>
        
        <template v-else>
          <el-form-item label="时长 (秒)">
            <el-input-number v-model="mediaForm.duration" :min="1" :step="1" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmAddMedia">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { Picture, VideoCamera, Microphone, Close } from '@element-plus/icons-vue';
import type { MediaItem, MediaType } from '../composables/useTokenCalculatorState';

interface Props {
  inputText: string;
  sanitizedCharacterCount: number;
  mediaItems: MediaItem[];
}

interface Emits {
  (e: 'update:inputText', value: string): void;
  (e: 'add-media', item: Omit<MediaItem, 'id' | 'tokenCount'>): void;
  (e: 'remove-media', id: string): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

// 暴露根元素引用
const rootEl = ref<HTMLElement | null>(null);
defineExpose({ rootEl });

// === Dialog 逻辑 ===
const dialogVisible = ref(false);
const currentMediaType = ref<MediaType>('image');

const mediaForm = reactive({
  width: 1024,
  height: 1024,
  duration: 60,
});

const dialogTitle = computed(() => {
  switch (currentMediaType.value) {
    case 'image': return '添加图片';
    case 'video': return '添加视频';
    case 'audio': return '添加音频';
    default: return '添加媒体';
  }
});

const openAddDialog = (type: MediaType) => {
  currentMediaType.value = type;
  // 重置表单默认值
  if (type === 'image') {
    mediaForm.width = 1024;
    mediaForm.height = 1024;
  } else {
    mediaForm.duration = 60;
  }
  dialogVisible.value = true;
};

const confirmAddMedia = () => {
  const item: Omit<MediaItem, 'id' | 'tokenCount'> = {
    type: currentMediaType.value,
    name: '', // 将在下面生成
    params: {}
  };

  if (currentMediaType.value === 'image') {
    item.params = { width: mediaForm.width, height: mediaForm.height };
    item.name = `Image ${mediaForm.width}x${mediaForm.height}`;
  } else {
    item.params = { duration: mediaForm.duration };
    const prefix = currentMediaType.value === 'video' ? 'Video' : 'Audio';
    item.name = `${prefix} ${mediaForm.duration}s`;
  }

  emit('add-media', item);
  dialogVisible.value = false;
};

const getMediaDescription = (item: MediaItem) => {
  return item.name;
};
</script>

<style scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-content {
  flex: 1;
  overflow: hidden;
  padding: 0 20px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.text-area-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.input-textarea {
  height: 100%;
  box-sizing: border-box;
}

.input-textarea :deep(.el-textarea__inner) {
  height: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  box-sizing: border-box;
  /* 让输入框背景稍微透明一点，配合整体风格 */
  background-color: var(--input-bg, rgba(255, 255, 255, 0.05));
}

/* 媒体区域 */
.media-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 30%; /* 限制最大高度 */
  overflow: hidden;
}

.media-toolbar {
  display: flex;
  gap: 8px;
}

.media-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-y: auto;
  padding: 4px; /* 留出阴影空间 */
}

.media-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  transition: all 0.2s;
}

.media-item:hover {
  background-color: var(--el-fill-color);
  border-color: var(--el-border-color-hover);
}

.media-icon {
  display: flex;
  align-items: center;
  color: var(--text-color-secondary);
}

.media-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.media-name {
  font-weight: 500;
  color: var(--text-color);
}

.media-token-count {
  font-size: 10px;
  color: var(--text-color-secondary);
}

.delete-btn {
  padding: 2px;
  margin-left: 4px;
  height: auto;
  color: var(--text-color-secondary);
}

.delete-btn:hover {
  color: var(--el-color-danger);
}
</style>