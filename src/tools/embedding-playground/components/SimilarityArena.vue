<template>
  <div class="similarity-arena">
    <div class="arena-layout">
      <div class="config-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">1:N 语义排行</span>
            <span class="panel-subtitle">单模型下验证 Anchor 与文本组的相似度</span>
          </div>
          <el-button
            type="primary"
            :loading="isLoading"
            :disabled="!store.similarityProfile || !store.similarityModelId"
            class="run-btn"
            @click="handleCompare"
          >
            开始对比
          </el-button>
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="config-section">
            <label class="section-label">Embedding 模型</label>
            <EmbeddingModelPicker v-model="similarityModelCombo" />
          </div>

          <div class="config-section">
            <label class="section-label">对比算法</label>
            <el-select
              v-model="store.similarityAlgorithm"
              class="w-full custom-select"
            >
              <el-option label="Cosine Similarity (余弦相似度)" value="cosine" />
              <el-option label="Euclidean Distance (欧氏距离)" value="euclidean" />
              <el-option label="Dot Product (点积)" value="dot" />
              <el-option
                label="Manhattan Distance (曼哈顿距离)"
                value="manhattan"
              />
            </el-select>
            <p class="section-tip">
              距离类算法会转换为相似度分数，数值越大表示越相近。
            </p>
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
            <div class="section-heading-row">
              <label class="section-label m-0">对比文本组</label>
              <el-button
                type="primary"
                link
                :icon="Plus"
                size="small"
                @click="addText"
              >
                添加文本
              </el-button>
            </div>
            <div class="comparison-list">
              <div
                v-for="(_, index) in store.comparisonTexts"
                :key="index"
                class="comparison-item"
              >
                <el-input
                  v-model="store.comparisonTexts[index]"
                  placeholder="输入对比文本..."
                  class="custom-input"
                />
                <el-button
                  type="danger"
                  link
                  :icon="X"
                  class="remove-btn"
                  @click="removeText(index)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="result-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">语义相似度排行</span>
            <span v-if="results.length" class="panel-subtitle">
              {{ selectedModelLabel }} · {{ results.length }} 条结果
            </span>
          </div>
          <div v-if="results.length" class="header-actions">
            <el-tag type="info" size="small" effect="plain">
              {{ currentDimension }} 维
            </el-tag>
            <el-tag type="success" size="small" effect="plain">
              {{ lastExecutionTime }}ms
            </el-tag>
            <el-tooltip content="复制排行结果" placement="top">
              <div>
                <el-button
                  circle
                  size="small"
                  :icon="isCopied ? Check : Copy"
                  class="copy-btn"
                  @click="copyResults"
                />
              </div>
            </el-tooltip>
          </div>
        </div>

        <div class="panel-content scrollbar-custom">
          <div v-if="results.length" class="results-list">
            <div
              v-for="(item, index) in sortedResults"
              :key="`${item.text}-${index}`"
              class="result-card"
              :style="{ '--score-color': getScoreColor(item.score) }"
            >
              <div
                class="card-bg-progress"
                :style="{ width: `${toPercent(item.score)}%` }"
              ></div>
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
            <span>选择模型后点击“开始对比”查看语义距离排行</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BarChart3, Check, Copy, Plus, X } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingCache } from "../composables/useEmbeddingCache";
import { useEmbeddingModelOptions } from "../composables/useEmbeddingModelOptions";
import { useVectorMath } from "../composables/useVectorMath";
import EmbeddingModelPicker from "./EmbeddingModelPicker.vue";

const store = useEmbeddingPlaygroundStore();
const { calculateSimilarity } = useVectorMath();
const { embedTexts } = useEmbeddingCache();
const { resolveModelCombo, buildSingleModelCombo } = useEmbeddingModelOptions();

const isLoading = ref(false);
const isCopied = ref(false);
const results = ref<{ text: string; score: number }[]>([]);
const currentEmbeddings = ref<number[][]>([]);
const currentTexts = ref<string[]>([]);
const currentDimension = ref(0);
const lastExecutionTime = ref(0);
const selectedModelLabel = ref("");

const similarityModelCombo = computed({
  get: () =>
    buildSingleModelCombo(store.similarityProfile, store.similarityModelId),
  set: (value: string | string[]) => {
    const target = resolveModelCombo(Array.isArray(value) ? value[0] : value);
    store.similarityProfile = target?.profile ?? null;
    store.similarityModelId = target?.modelId ?? "";
    selectedModelLabel.value = target?.label ?? "";
  },
});

const sortedResults = computed(() =>
  [...results.value].sort((a, b) => b.score - a.score)
);

const addText = () => {
  store.comparisonTexts.push("");
};

const removeText = (index: number) => {
  store.comparisonTexts.splice(index, 1);
};

const toPercent = (score: number) => Math.max(0, Math.min(100, score * 100));

const getScoreColor = (score: number) => {
  if (score > 0.8) return "var(--el-color-success)";
  if (score > 0.5) return "var(--el-color-warning)";
  return "var(--el-color-danger)";
};

const updateScores = () => {
  if (currentEmbeddings.value.length < 2 || currentTexts.value.length < 2) {
    results.value = [];
    return;
  }

  const anchorVec = currentEmbeddings.value[0];
  results.value = currentEmbeddings.value.slice(1).map((compareVec, index) => ({
    text: currentTexts.value[index + 1],
    score: calculateSimilarity(
      anchorVec,
      compareVec,
      store.similarityAlgorithm
    ),
  }));
};

watch(
  () => store.similarityAlgorithm,
  () => {
    if (currentEmbeddings.value.length > 0) updateScores();
  }
);

const copyResults = async () => {
  if (sortedResults.value.length === 0) return;

  const header = `语义相似度排行 (算法: ${store.similarityAlgorithm})\n模型: ${selectedModelLabel.value}\n基准文本: ${store.anchorText}\n\n`;
  const content = sortedResults.value
    .map(
      (item, index) => `#${index + 1} [${item.score.toFixed(4)}] ${item.text}`
    )
    .join("\n");

  try {
    await navigator.clipboard.writeText(header + content);
    isCopied.value = true;
    customMessage.success("结果已复制到剪贴板");
    setTimeout(() => {
      isCopied.value = false;
    }, 800);
  } catch {
    customMessage.error("复制失败");
  }
};

const handleCompare = async () => {
  const target = resolveModelCombo(similarityModelCombo.value);
  if (!target) {
    customMessage.warning("请先选择 Embedding 模型");
    return;
  }

  const allTexts = [
    store.anchorText,
    ...store.comparisonTexts.filter((text) => text.trim()),
  ];

  if (allTexts.length < 2) {
    customMessage.warning("至少需要一个基准文本和一个对比文本");
    return;
  }

  isLoading.value = true;
  try {
    const result = await embedTexts(target, allTexts, {
      taskType: "SEMANTIC_SIMILARITY",
    });
    if (!result) return;

    currentEmbeddings.value = result.embeddings;
    currentTexts.value = allTexts;
    currentDimension.value = result.embeddings[0]?.length ?? 0;
    lastExecutionTime.value = result.executionTime;
    selectedModelLabel.value = target.label;
    updateScores();
  } finally {
    isLoading.value = false;
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
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px;
  flex-shrink: 0;
}

.title-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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

.divider {
  width: 1px;
  background-color: var(--border-color);
  flex-shrink: 0;
}

.config-section {
  margin-bottom: 24px;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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
  transition: width 0.45s ease;
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
  opacity: 0.65;
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
}

.score-value {
  font-family: "Consolas", monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--score-color);
}

.empty-state {
  height: 100%;
  min-height: 320px;
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
