<template>
  <div class="similarity-arena">
    <div class="arena-layout">
      <!-- 左侧：输入与配置 -->
      <div class="config-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">对比设置</span>
            <span class="panel-subtitle">配置基准文本与对比组</span>
          </div>
          <el-button
            type="primary"
            :loading="isLoading"
            @click="handleCompare"
            :disabled="!store.selectedProfile || !store.selectedModelId"
            class="run-btn"
          >
            <el-icon class="mr-1"><Play /></el-icon>
            开始对比
          </el-button>
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="config-section">
            <label class="section-label">对比算法</label>
            <el-select v-model="store.similarityAlgorithm" class="w-full custom-select">
              <el-option label="Cosine Similarity (余弦相似度)" value="cosine" />
              <el-option label="Euclidean Distance (欧氏距离)" value="euclidean" />
              <el-option label="Dot Product (点积)" value="dot" />
              <el-option label="Manhattan Distance (曼哈顿距离)" value="manhattan" />
            </el-select>
            <p class="section-tip">注：距离类算法已转换为相似度分数 (1/(1+d))。</p>
          </div>

          <div class="config-section">
            <label class="section-label">基准文本 (Anchor)</label>
            <el-input
              v-model="store.anchorText"
              type="textarea"
              :rows="2"
              placeholder="输入作为对比基准的中心文本..."
              class="custom-textarea"
            />
          </div>

          <div class="config-section">
            <div class="flex items-center justify-between mb-2">
              <label class="section-label m-0">对比文本组</label>
              <el-button type="primary" link :icon="Plus" @click="addText" size="small">添加文本</el-button>
            </div>
            <div class="comparison-list">
              <div v-for="(_, index) in store.comparisonTexts" :key="index" class="comparison-item">
                <el-input
                  v-model="store.comparisonTexts[index]"
                  placeholder="输入对比文本..."
                  class="custom-input"
                />
                <el-button
                  type="danger"
                  link
                  :icon="X"
                  @click="removeText(index)"
                  class="remove-btn"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分割线 -->
      <div class="divider"></div>

      <!-- 右侧：结果展示 -->
      <div class="result-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">语义相似度排行</span>
            <span v-if="results.length" class="panel-subtitle">基于向量空间的语义距离计算</span>
          </div>
          <el-tag v-if="results.length" type="info" size="small" effect="plain" class="count-tag">
            {{ results.length }} 条结果
          </el-tag>
        </div>

        <div class="panel-content scrollbar-custom">
          <div v-if="results.length" class="results-list">
            <div
              v-for="(item, index) in sortedResults"
              :key="index"
              class="result-card"
              :style="{ '--score-color': getScoreColor(item.score) }"
            >
              <div class="card-bg-progress" :style="{ width: `${item.score * 100}%` }"></div>
              <div class="card-content">
                <div class="text-info">
                  <span class="rank-num">#{{ index + 1 }}</span>
                  <span class="main-text">{{ item.text }}</span>
                </div>
                <div class="score-info">
                  <span class="score-label">相似度</span>
                  <span class="score-value">{{ item.score.toFixed(4) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            <el-icon class="empty-icon"><BarChart3 /></el-icon>
            <p>准备就绪</p>
            <span>点击“开始对比”查看语义距离排行</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useEmbeddingPlaygroundStore } from '../store';
import { useEmbeddingRunner } from '../composables/useEmbeddingRunner';
import { useVectorMath } from '../composables/useVectorMath';
import { Plus, X, Play, BarChart3 } from 'lucide-vue-next';
import { customMessage } from '@/utils/customMessage';

const store = useEmbeddingPlaygroundStore();
const { isLoading, runEmbedding } = useEmbeddingRunner();
const { calculateSimilarity } = useVectorMath();

const results = ref<{ text: string; score: number }[]>([]);

const sortedResults = computed(() => {
  return [...results.value].sort((a, b) => b.score - a.score);
});

const addText = () => {
  store.comparisonTexts.push('');
};

const removeText = (index: number) => {
  store.comparisonTexts.splice(index, 1);
};

const getScoreColor = (score: number) => {
  if (score > 0.8) return 'var(--el-color-success)';
  if (score > 0.5) return 'var(--el-color-warning)';
  return 'var(--el-color-danger)';
};

const handleCompare = async () => {
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning('请先选择 Profile 和模型');
    return;
  }

  const allTexts = [store.anchorText, ...store.comparisonTexts.filter(t => t.trim())];
  if (allTexts.length < 2) {
    customMessage.warning('至少需要一个基准文本和一个对比文本');
    return;
  }

  // 批量获取 Embedding
  const response = await runEmbedding(store.selectedProfile, {
    modelId: store.selectedModelId,
    input: allTexts,
    taskType: 'SEMANTIC_SIMILARITY'
  });

  if (response && response.data.length === allTexts.length) {
    const anchorVec = response.data[0].embedding;
    const newResults = [];

    for (let i = 1; i < response.data.length; i++) {
      const compareVec = response.data[i].embedding;
      const score = calculateSimilarity(anchorVec, compareVec, store.similarityAlgorithm);
      newResults.push({
        text: allTexts[i],
        score: score
      });
    }

    results.value = newResults;
  }
};
</script>

<style scoped>
.similarity-arena {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.arena-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 面板通用样式 */
.config-panel, .result-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.config-panel {
  flex: 0 0 400px;
}

.result-panel {
  flex: 1;
  background-color: rgba(0, 0, 0, 0.01);
}

.panel-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;
}

.title-group {
  display: flex;
  flex-direction: column;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-subtitle {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 1px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 分割线 */
.divider {
  width: 1px;
  background-color: var(--border-color);
  flex-shrink: 0;
}

/* 配置项样式 */
.config-section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
}

.section-tip {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 6px;
}

.comparison-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comparison-item {
  display: flex;
  gap: 8px;
}

.remove-btn {
  padding: 0 4px;
}

/* 结果卡片样式 */
.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-card {
  position: relative;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  height: 64px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.result-card:hover {
  border-color: var(--score-color);
  transform: translateX(4px);
  box-shadow: var(--shadow-sm);
}

.card-bg-progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background-color: var(--score-color);
  opacity: 0.08;
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.card-content {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 1;
}

.text-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.rank-num {
  font-family: "Consolas", monospace;
  font-size: 16px;
  font-weight: 700;
  color: var(--score-color);
  opacity: 0.6;
}

.main-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.score-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 20px;
}

.score-label {
  font-size: 10px;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-value {
  font-family: "Consolas", monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--score-color);
}

/* 空状态 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.empty-state span {
  font-size: 13px;
}

/* 自定义滚动条 */
.scrollbar-custom::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 10px;
}

.scrollbar-custom::-webkit-scrollbar-track {
  background: transparent;
}
</style>