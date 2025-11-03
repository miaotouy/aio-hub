<script setup lang="ts">
import { computed } from 'vue';
import { customMessage } from '@/utils/customMessage';
import { CopyDocument, Loading, CircleCheck, CircleClose, Refresh, Hide, ChatDotRound } from '@element-plus/icons-vue';
import type { OcrResult, UploadedImage, ImageBlock } from '../types';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { createModuleLogger } from '@utils/logger';
import { useSendToChat } from '@/composables/useSendToChat';

const logger = createModuleLogger('smart-ocr/ResultPanel');

// 获取发送到聊天功能
const { sendToChat } = useSendToChat();

const props = defineProps<{
  ocrResults: OcrResult[];
  isProcessing: boolean;
  uploadedImages: UploadedImage[];
  imageBlocksMap: Map<string, ImageBlock[]>;
}>();

const emit = defineEmits<{
  retryBlock: [blockId: string];
  toggleIgnore: [blockId: string];
}>();

// 按图片分组结果
const groupedResults = computed(() => {
  const groups = new Map<string, OcrResult[]>();
  
  props.ocrResults.forEach(result => {
    if (!groups.has(result.imageId)) {
      groups.set(result.imageId, []);
    }
    groups.get(result.imageId)!.push(result);
  });
  
  return groups;
});

// 计算已完成的数量
const completedCount = computed(() => {
  return props.ocrResults.filter(r => r.status === 'success').length;
});

// 计算总文本（排除被忽略的块）
const allText = computed(() => {
  return props.ocrResults
    .filter(r => r.status === 'success' && !r.ignored)
    .map(r => r.text)
    .join('\n\n');
});

// 获取图片名称
const getImageName = (imageId: string) => {
  const image = props.uploadedImages.find(img => img.id === imageId);
  return image?.name || '未知图片';
};

// 获取块在图片中的索引
const getBlockIndex = (imageId: string, blockId: string) => {
  const blocks = props.imageBlocksMap.get(imageId) || [];
  return blocks.findIndex(b => b.id === blockId) + 1;
};

// 复制文本
const copyText = async (text: string, context: string = '单个结果') => {
  try {
    await writeText(text);
    customMessage.success('已复制到剪贴板');
  } catch (error) {
    logger.error(`复制${context}到剪贴板失败`, error, {
      context,
      textLength: text.length,
    });
    customMessage.error('复制失败');
  }
};

// 复制所有文本
const copyAllText = async () => {
  if (!allText.value) {
    customMessage.warning('暂无可复制的内容');
    return;
  }
  await copyText(allText.value, '全部结果');
};

// 发送所有文本到聊天
const sendAllToChat = () => {
  if (!allText.value) {
    customMessage.warning('暂无可发送的内容');
    return;
  }
  sendToChat(allText.value, {
    successMessage: '已将OCR识别结果发送到聊天',
  });
};

// 获取状态图标
const getStatusIcon = (status: OcrResult['status']) => {
  switch (status) {
    case 'success':
      return CircleCheck;
    case 'error':
      return CircleClose;
    case 'processing':
      return Loading;
    default:
      return Loading;
  }
};

// 获取状态类型
const getStatusType = (status: OcrResult['status']): 'success' | 'danger' | 'warning' | 'info' => {
  switch (status) {
    case 'success':
      return 'success';
    case 'error':
      return 'danger';
    case 'processing':
      return 'warning';
    default:
      return 'info';
  }
};

// 获取状态文本
const getStatusText = (status: OcrResult['status']) => {
  switch (status) {
    case 'success':
      return '完成';
    case 'error':
      return '失败';
    case 'processing':
      return '识别中';
    default:
      return '等待中';
  }
};

// 处理重试
const handleRetry = (blockId: string) => {
  emit('retryBlock', blockId);
};

// 处理忽略切换
const handleToggleIgnore = (blockId: string) => {
  emit('toggleIgnore', blockId);
};
</script>

<template>
  <div class="result-panel">
    <div class="panel-header">
      <h3>识别结果</h3>
      <div class="header-actions">
        <el-tag v-if="ocrResults.length > 0" size="small">
          {{ completedCount }} / {{ ocrResults.length }}
        </el-tag>
        <el-button
          v-if="allText"
          size="small"
          :icon="CopyDocument"
          @click="copyAllText"
        >
          复制全部
        </el-button>
        <el-button
          v-if="allText"
          size="small"
          type="success"
          :icon="ChatDotRound"
          @click="sendAllToChat"
        >
          发送到聊天
        </el-button>
      </div>
    </div>
    
    <div class="panel-content">
      <template v-if="ocrResults.length === 0 && !isProcessing">
        <div class="empty-state">
          <el-empty description="暂无识别结果" />
        </div>
      </template>
      
      <template v-else>
        <div class="result-list">
          <!-- 按图片分组显示 -->
          <div
            v-for="[imageId, results] in groupedResults"
            :key="imageId"
            class="image-group"
          >
            <div class="group-header">
              <el-text class="group-title" type="primary" size="large">
                {{ getImageName(imageId) }}
              </el-text>
              <el-tag size="small">
                {{ results.filter(r => r.status === 'success').length }} / {{ results.length }}
              </el-tag>
            </div>
            
            <div class="group-content">
              <div
                v-for="result in results"
                :key="result.blockId"
                class="result-item"
                :class="{ 'is-ignored': result.ignored }"
              >
                <div class="result-header">
                  <div class="header-left">
                    <el-tag size="small">块 {{ getBlockIndex(imageId, result.blockId) }}</el-tag>
                    <el-tag
                      :type="getStatusType(result.status)"
                      size="small"
                      :icon="getStatusIcon(result.status)"
                    >
                      {{ getStatusText(result.status) }}
                    </el-tag>
                    <el-tag v-if="result.ignored" size="small" type="info">已忽略</el-tag>
                  </div>
                  <div class="header-actions">
                    <el-button
                      v-if="result.status === 'error' || result.status === 'success'"
                      size="small"
                      :icon="Refresh"
                      @click="handleRetry(result.blockId)"
                    >
                      重试
                    </el-button>
                    <el-button
                      v-if="result.status === 'success'"
                      size="small"
                      :icon="Hide"
                      :type="result.ignored ? 'primary' : 'default'"
                      @click="handleToggleIgnore(result.blockId)"
                    >
                      {{ result.ignored ? '取消忽略' : '忽略' }}
                    </el-button>
                    <el-button
                      v-if="result.status === 'success' && result.text"
                      size="small"
                      :icon="CopyDocument"
                      @click="copyText(result.text)"
                    >
                      复制
                    </el-button>
                  </div>
                </div>
                
                <div class="result-content">
                  <template v-if="result.status === 'processing'">
                    <div class="loading-state">
                      <el-icon class="is-loading"><Loading /></el-icon>
                      <el-text type="info">正在识别...</el-text>
                    </div>
                  </template>
                  
                  <template v-else-if="result.status === 'error'">
                    <div class="error-state">
                      <el-text type="danger">{{ result.error || '识别失败' }}</el-text>
                    </div>
                  </template>
                  
                  <template v-else-if="result.status === 'success'">
                    <div class="text-content">
                      <pre>{{ result.text || '(无文本)' }}</pre>
                    </div>
                    <div v-if="result.confidence" class="confidence">
                      <el-text size="small" type="info">
                        置信度: {{ (result.confidence * 100).toFixed(1) }}%
                      </el-text>
                    </div>
                  </template>
                  
                  <template v-else>
                    <div class="pending-state">
                      <el-text type="info">等待处理...</el-text>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
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
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

:deep(.el-button) {
    margin-left: 2px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.image-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.group-title {
  font-weight: 600;
  font-size: 15px;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 8px;
}

.result-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
  transition: opacity 0.2s;
}

.result-item.is-ignored {
  opacity: 0.5;
}
.result-header {
  padding: 12px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.result-content {
  padding: 16px;
}

.loading-state,
.error-state,
.pending-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 4px;
  background-color: var(--bg-color);
}

.loading-state {
  color: var(--primary-color);
}

.text-content {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
}

.text-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
}

.confidence {
  text-align: right;
}

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
</style>