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
            <div class="editor-container">
              <RichCodeEditor
                v-model="store.anchorText"
                language="markdown"
                placeholder="输入作为对比基准的中心文本..."
                height="200px"
              />
            </div>
          </div>

          <div class="config-section">
            <div class="flex items-center justify-between mb-2">
              <label class="section-label m-0">对比文本组</label>
              <el-button type="primary" link :icon="Plus" @click="addText" size="small"
                >添加文本</el-button
              >
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
          <div v-if="results.length" class="header-actions">
            <el-tag type="info" size="small" effect="plain" class="count-tag">
              {{ results.length }} 条结果
            </el-tag>
            <el-tooltip content="复制排行结果" placement="top">
              <el-button
                circle
                size="small"
                :icon="isCopied ? Check : Copy"
                @click="copyResults"
                class="copy-btn"
              />
            </el-tooltip>
          </div>
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
import { ref, computed, watch } from "vue";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingRunner } from "../composables/useEmbeddingRunner";
import { useVectorMath } from "../composables/useVectorMath";
import { Plus, X, BarChart3, Copy, Check } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const store = useEmbeddingPlaygroundStore();
const errorHandler = createModuleErrorHandler("EmbeddingPlayground/SimilarityArena");
const { isLoading, runEmbedding } = useEmbeddingRunner();
const { calculateSimilarity } = useVectorMath();

const results = ref<{ text: string; score: number }[]>([]);

// 缓存机制
// 结构: Map<ModelId, Map<TextContent, EmbeddingVector>>
const embeddingCache = ref<Map<string, Map<string, number[]>>>(new Map());

// 当前展示用的向量数据
const currentEmbeddings = ref<number[][]>([]);
// 记录当前参与计算的文本列表，用于后续重算分数
const currentTexts = ref<string[]>([]);

const isCopied = ref(false);

const sortedResults = computed(() => {
  return [...results.value].sort((a, b) => b.score - a.score);
});

const addText = () => {
  store.comparisonTexts.push("");
};

const removeText = (index: number) => {
  store.comparisonTexts.splice(index, 1);
};

const getScoreColor = (score: number) => {
  if (score > 0.8) return "var(--el-color-success)";
  if (score > 0.5) return "var(--el-color-warning)";
  return "var(--el-color-danger)";
};

const copyResults = async () => {
  if (sortedResults.value.length === 0) return;

  const header = `语义相似度排行 (算法: ${store.similarityAlgorithm})\n基准文本: ${store.anchorText}\n\n`;
  const content = sortedResults.value
    .map((item, index) => `#${index + 1} [${item.score.toFixed(4)}] ${item.text}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(header + content);
    isCopied.value = true;
    customMessage.success("结果已复制到剪贴板");
    setTimeout(() => {
      isCopied.value = false;
    }, 200);
  } catch (err) {
    customMessage.error("复制失败");
  }
};

// 纯计算逻辑
const updateScores = () => {
  if (currentEmbeddings.value.length < 2 || currentTexts.value.length < 2) return;

  const anchorVec = currentEmbeddings.value[0];
  const newResults = [];

  // 从索引 1 开始，因为 0 是 Anchor
  for (let i = 1; i < currentEmbeddings.value.length; i++) {
    const compareVec = currentEmbeddings.value[i];
    const score = calculateSimilarity(anchorVec, compareVec, store.similarityAlgorithm);
    newResults.push({
      text: currentTexts.value[i],
      score: score,
    });
  }

  results.value = newResults;
};

// 监听算法变化，自动重算
watch(
  () => store.similarityAlgorithm,
  () => {
    if (currentEmbeddings.value.length > 0) {
      updateScores();
    }
  }
);

/**
 * 核心逻辑：增量 Embedding
 */
const handleCompare = async () => {
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning("请先选择 Profile 和模型");
    return;
  }

  // 1. 准备数据
  const modelId = store.selectedModelId;
  const allTexts = [store.anchorText, ...store.comparisonTexts.filter((t) => t.trim())];

  if (allTexts.length < 2) {
    customMessage.warning("至少需要一个基准文本和一个对比文本");
    return;
  }

  // 2. 初始化该模型的缓存池
  if (!embeddingCache.value.has(modelId)) {
    embeddingCache.value.set(modelId, new Map());
  }
  const modelCache = embeddingCache.value.get(modelId)!;

  // 3. 找出未缓存的文本
  const textsToEmbed: string[] = [];
  const textIndicesToFetch: number[] = []; // 记录需要请求的文本在 allTexts 中的原始索引

  allTexts.forEach((text, index) => {
    if (!modelCache.has(text)) {
      textsToEmbed.push(text);
      textIndicesToFetch.push(index);
    }
  });

  // 4. 如果有未命中的，发起请求
  if (textsToEmbed.length > 0) {
    const response = await runEmbedding(store.selectedProfile, {
      modelId: modelId,
      input: textsToEmbed,
      taskType: "SEMANTIC_SIMILARITY",
    });

    if (!response || response.data.length !== textsToEmbed.length) {
      // 错误处理已在 useEmbeddingRunner 中完成，这里直接中断
      return;
    }

    // 5. 将新结果存入缓存
    response.data.forEach((item, i) => {
      const text = textsToEmbed[i];
      modelCache.set(text, item.embedding);
    });
  }

  // 6. 从缓存中组装最终的向量列表
  // 此时所有文本在 modelCache 中都应该有值了
  const finalEmbeddings: number[][] = [];

for (const text of allTexts) {
  const vec = modelCache.get(text);
  if (vec) {
    finalEmbeddings.push(vec);
  } else {
    // 理论上不应执行到这里，除非上面的请求失败了但没被捕获
    errorHandler.error(`无法获取文本向量: ${text.slice(0, 10)}...`);
    return;
  }
}

  // 7. 更新状态并计算分数
  currentEmbeddings.value = finalEmbeddings;
  currentTexts.value = allTexts;
  updateScores();
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
.config-panel,
.result-panel {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.copy-btn {
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
}

.copy-btn:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
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
</style>
