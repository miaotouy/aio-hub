<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue';
import type { OcrResult } from '../types';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const props = defineProps<{
  ocrResults: OcrResult[];
  isProcessing: boolean;
}>();

// 计算已完成的数量
const completedCount = computed(() => {
  return props.ocrResults.filter(r => r.status === 'success').length;
});

// 计算总文本
const allText = computed(() => {
  return props.ocrResults
    .filter(r => r.status === 'success')
    .map(r => r.text)
    .join('\n\n');
});

// 复制文本
const copyText = async (text: string) => {
  try {
    await writeText(text);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    console.error('复制失败:', error);
    ElMessage.error('复制失败');
  }
};

// 复制所有文本
const copyAllText = async () => {
  if (!allText.value) {
    ElMessage.warning('暂无可复制的内容');
    return;
  }
  await copyText(allText.value);
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
          <div
            v-for="(result, index) in ocrResults"
            :key="result.blockId"
            class="result-item"
          >
            <div class="result-header">
              <div class="header-left">
                <el-tag size="small">块 {{ index + 1 }}</el-tag>
                <el-tag
                  :type="getStatusType(result.status)"
                  size="small"
                  :icon="getStatusIcon(result.status)"
                >
                  {{ getStatusText(result.status) }}
                </el-tag>
              </div>
              <el-button
                v-if="result.status === 'success' && result.text"
                size="small"
                :icon="CopyDocument"
                @click="copyText(result.text)"
              >
                复制
              </el-button>
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
      </template>
    </div>
  </div>
</template>

<style scoped>
.result-panel {
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
  gap: 16px;
}

.result-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
}

.result-header {
  padding: 12px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
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