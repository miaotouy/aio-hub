<template>
  <div class="raw-debugger p-4">
    <el-row :gutter="20">
      <!-- 输入区 -->
      <el-col :span="12">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="flex items-center justify-between">
              <span>输入设置</span>
              <el-button 
                type="primary" 
                :loading="isLoading" 
                @click="handleRun"
                :disabled="!store.selectedProfile || !store.selectedModelId"
              >
                运行 Embedding
              </el-button>
            </div>
          </template>
          
          <el-form label-position="top">
            <el-form-item label="输入文本">
              <el-input
                v-model="store.rawInput"
                type="textarea"
                :rows="6"
                placeholder="输入要向量化的文本..."
              />
            </el-form-item>
            
            <div class="flex gap-4">
              <el-form-item label="维度 (Optional)" class="flex-1">
                <el-input-number 
                  v-model="store.rawDimensions" 
                  :min="1" 
                  placeholder="默认"
                  class="w-full"
                />
              </el-form-item>
              
              <el-form-item label="任务类型" class="flex-1">
                <el-select v-model="store.rawTaskType" class="w-full">
                  <el-option label="检索查询 (Query)" value="RETRIEVAL_QUERY" />
                  <el-option label="检索文档 (Document)" value="RETRIEVAL_DOCUMENT" />
                  <el-option label="语义相似度" value="SEMANTIC_SIMILARITY" />
                  <el-option label="分类" value="CLASSIFICATION" />
                  <el-option label="聚类" value="CLUSTERING" />
                </el-select>
              </el-form-item>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- 输出区 -->
      <el-col :span="12">
        <el-card shadow="never" class="h-full">
          <template #header>
            <div class="flex items-center justify-between">
              <span>运行结果</span>
              <div v-if="executionTime" class="text-xs text-gray-400">
                耗时: {{ executionTime }}ms
              </div>
            </div>
          </template>

          <div v-if="lastResponse" class="result-content">
            <div class="metadata mb-4 flex gap-4">
              <el-tag type="info">维度: {{ vectorDimension }}</el-tag>
              <el-tag type="success">Tokens: {{ lastResponse.usage.totalTokens }}</el-tag>
            </div>

            <div class="vector-preview mb-4">
              <div class="text-sm font-bold mb-2">向量预览 (前/后 5 个数值):</div>
              <div class="bg-gray-900 text-green-400 p-2 rounded font-mono text-xs">
                [ {{ vectorPreview }} ]
              </div>
            </div>

            <div class="raw-json">
              <div class="text-sm font-bold mb-2">完整响应 JSON:</div>
              <div class="max-h-[300px] overflow-auto">
                <pre class="bg-gray-100 dark:bg-zinc-800 p-2 rounded text-xs">{{ JSON.stringify(lastResponse, null, 2) }}</pre>
              </div>
            </div>
          </div>
          
          <el-empty v-else description="暂无数据，请点击运行" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEmbeddingPlaygroundStore } from '../store';
import { useEmbeddingRunner } from '../composables/useEmbeddingRunner';
import { customMessage } from '@/utils/customMessage';

const store = useEmbeddingPlaygroundStore();
const { isLoading, lastResponse, executionTime, runEmbedding } = useEmbeddingRunner();

const vectorDimension = computed(() => {
  return lastResponse.value?.data[0]?.embedding.length || 0;
});

const vectorPreview = computed(() => {
  const vec = lastResponse.value?.data[0]?.embedding;
  if (!vec) return '';
  if (vec.length <= 10) return vec.join(', ');
  const head = vec.slice(0, 5);
  const tail = vec.slice(-5);
  return `${head.join(', ')} ... ${tail.join(', ')}`;
});

const handleRun = async () => {
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning('请先选择 Profile 和模型');
    return;
  }

  await runEmbedding(store.selectedProfile, {
    modelId: store.selectedModelId,
    input: store.rawInput,
    dimensions: store.rawDimensions,
    taskType: store.rawTaskType,
  });
};
</script>

<style scoped>
.raw-debugger {
  height: 100%;
}
pre {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>