<template>
  <div class="multi-model-arena">
    <div class="arena-layout">
      <div class="config-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">多模型竞技场</span>
            <span class="panel-subtitle">横向评估模型分数分布与排序变化</span>
          </div>
          <el-button
            type="primary"
            :loading="isLoading"
            :disabled="store.multiArenaCombos.length === 0"
            @click="handleRun"
          >
            开始评估
          </el-button>
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="config-section">
            <label class="section-label">参与模型</label>
            <EmbeddingModelPicker
              v-model="store.multiArenaCombos"
              multiple
              :max-collapse-tags="4"
              placeholder="选择至少一个 Embedding 模型"
            />
            <p class="section-tip">
              多模型将并行请求未缓存文本，用于比较绝对分数和排序抖动。
            </p>
          </div>

          <div class="config-section">
            <label class="section-label">相似度算法</label>
            <el-select v-model="store.similarityAlgorithm" class="w-full">
              <el-option
                label="Cosine Similarity (余弦相似度)"
                value="cosine"
              />
              <el-option
                label="Euclidean Distance (欧氏距离)"
                value="euclidean"
              />
              <el-option label="Dot Product (点积)" value="dot" />
              <el-option
                label="Manhattan Distance (曼哈顿距离)"
                value="manhattan"
              />
            </el-select>
          </div>

          <div class="config-section">
            <label class="section-label">Anchor 文本</label>
            <RichCodeEditor
              v-model="store.anchorText"
              language="markdown"
              placeholder="输入检索查询或基准文本..."
              height="160px"
            />
          </div>

          <div class="config-section">
            <div class="section-heading-row">
              <label class="section-label m-0">对比文本集</label>
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
                />
                <el-button
                  type="danger"
                  link
                  :icon="X"
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
            <span class="panel-title">评估结果</span>
            <span v-if="modelResults.length" class="panel-subtitle">
              {{ modelResults.length }} 个模型 · {{ matrixRows.length }} 个样本
            </span>
          </div>
        </div>

        <div class="panel-content scrollbar-custom">
          <div v-if="modelResults.length" class="result-stack">
            <section class="result-section">
              <div class="section-title-row">
                <span class="section-title">打分矩阵</span>
                <el-tag effect="plain" size="small">Heatmap</el-tag>
              </div>

              <div class="matrix-wrapper">
                <table class="score-matrix">
                  <thead>
                    <tr>
                      <th class="text-col">文本</th>
                      <th
                        v-for="model in modelResults"
                        :key="model.combo"
                        class="score-col"
                      >
                        {{ model.modelLabel }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in matrixRows" :key="row.id">
                      <td class="text-cell">{{ row.text }}</td>
                      <td
                        v-for="model in modelResults"
                        :key="model.combo"
                        class="score-cell"
                        :style="getHeatmapStyle(row.scores[model.combo] ?? 0)"
                      >
                        {{ (row.scores[model.combo] ?? 0).toFixed(4) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="result-section">
              <div class="section-title-row">
                <span class="section-title">排序一致性</span>
                <el-tag effect="plain" size="small" type="info">
                  Top {{ Math.min(5, matrixRows.length) }}
                </el-tag>
              </div>

              <div class="rank-grid">
                <div
                  v-for="model in modelResults"
                  :key="model.combo"
                  class="rank-card"
                >
                  <div class="rank-card-title">{{ model.modelLabel }}</div>
                  <div class="rank-list">
                    <div
                      v-for="item in model.sortedScores.slice(0, 5)"
                      :key="`${model.combo}-${item.text}`"
                      class="rank-row"
                    >
                      <span class="rank-index">#{{ item.rank }}</span>
                      <span class="rank-text">{{ item.text }}</span>
                      <span class="rank-score">{{
                        item.score.toFixed(3)
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="result-section calibrator-section">
              <div class="section-title-row">
                <span class="section-title">跨模型阈值校准器</span>
                <el-tag
                  v-if="matrixRows.length < 3"
                  effect="plain"
                  size="small"
                  type="warning"
                >
                  样本偏少
                </el-tag>
              </div>

              <div class="calibrator-controls">
                <el-select
                  v-model="baseCombo"
                  placeholder="选择基准模型"
                  class="base-select"
                >
                  <el-option
                    v-for="model in modelResults"
                    :key="model.combo"
                    :label="model.modelLabel"
                    :value="model.combo"
                  />
                </el-select>
                <div class="threshold-control">
                  <span>基准阈值 {{ baseThreshold.toFixed(2) }}</span>
                  <el-slider
                    v-model="baseThreshold"
                    :min="0"
                    :max="1"
                    :step="0.01"
                    :show-tooltip="false"
                  />
                </div>
              </div>

              <div class="calibration-list">
                <div
                  v-for="item in calibrationResults"
                  :key="item.combo"
                  class="calibration-row"
                >
                  <span class="calibration-model">{{ item.modelLabel }}</span>
                  <span class="calibration-note">{{ item.note }}</span>
                  <span class="calibration-value">{{ item.threshold }}</span>
                </div>
              </div>
            </section>
          </div>

          <div v-else class="empty-state">
            <el-icon class="empty-icon"><Swords /></el-icon>
            <p>等待评估</p>
            <span>选择多个模型后运行，查看分数矩阵和阈值校准建议</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Swords, X } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingCache } from "../composables/useEmbeddingCache";
import { useEmbeddingModelOptions } from "../composables/useEmbeddingModelOptions";
import { useVectorMath } from "../composables/useVectorMath";
import EmbeddingModelPicker from "./EmbeddingModelPicker.vue";

interface ScoreItem {
  index: number;
  text: string;
  score: number;
  rank: number;
}

interface ModelArenaResult {
  combo: string;
  modelLabel: string;
  dimension: number;
  executionTime: number;
  sortedScores: ScoreItem[];
}

const store = useEmbeddingPlaygroundStore();
const { calculateSimilarity } = useVectorMath();
const { embedTexts } = useEmbeddingCache();
const { resolveModelCombo } = useEmbeddingModelOptions();

const isLoading = ref(false);
const modelResults = ref<ModelArenaResult[]>([]);
const baseCombo = ref("");
const baseThreshold = ref(0.75);

const addText = () => {
  store.comparisonTexts.push("");
};

const removeText = (index: number) => {
  store.comparisonTexts.splice(index, 1);
};

const matrixRows = computed(() => {
  const rows = store.comparisonTexts
    .filter((text) => text.trim())
    .map((text, index) => ({
      id: `${index}-${text}`,
      index,
      text,
      scores: {} as Record<string, number>,
    }));

  modelResults.value.forEach((model) => {
    model.sortedScores.forEach((item) => {
      const row = rows.find((rowItem) => rowItem.index === item.index);
      if (row) row.scores[model.combo] = item.score;
    });
  });

  return rows;
});

const sortedScoresForThreshold = (combo: string) => {
  const model = modelResults.value.find((item) => item.combo === combo);
  return model
    ? model.sortedScores.map((item) => item.score).sort((a, b) => a - b)
    : [];
};

const percentileRank = (scores: number[], threshold: number) => {
  if (scores.length === 0) return 0;
  const belowOrEqual = scores.filter((score) => score <= threshold).length;
  return belowOrEqual / scores.length;
};

const quantile = (scores: number[], percentile: number) => {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];

  const clamped = Math.max(0, Math.min(1, percentile));
  const position = clamped * (scores.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return scores[lower];

  const ratio = position - lower;
  return scores[lower] + (scores[upper] - scores[lower]) * ratio;
};

const calibrationResults = computed(() => {
  const baseScores = sortedScoresForThreshold(baseCombo.value);
  const percentile = percentileRank(baseScores, baseThreshold.value);
  const hasEnoughSamples = baseScores.length >= 3;

  return modelResults.value.map((model) => {
    if (model.combo === baseCombo.value) {
      return {
        combo: model.combo,
        modelLabel: model.modelLabel,
        threshold: baseThreshold.value.toFixed(4),
        note: "基准模型",
      };
    }

    const targetScores = sortedScoresForThreshold(model.combo);
    const recommended = quantile(targetScores, percentile);
    return {
      combo: model.combo,
      modelLabel: model.modelLabel,
      threshold: recommended.toFixed(4),
      note: hasEnoughSamples
        ? `对齐到 P${Math.round(percentile * 100)}`
        : "样本少，仅作粗略参考",
    };
  });
});

watch(
  () => store.similarityAlgorithm,
  () => {
    if (modelResults.value.length > 0) {
      void handleRun();
    }
  }
);

watch(modelResults, () => {
  if (!baseCombo.value && modelResults.value.length > 0) {
    baseCombo.value = modelResults.value[0].combo;
  }
});

const getHeatmapStyle = (score: number) => {
  const alpha = Math.max(0.06, Math.min(0.26, score * 0.22));
  return {
    backgroundColor: `color-mix(in srgb, var(--primary-color) ${alpha * 100}%, transparent)`,
    color: score > 0.78 ? "var(--primary-color)" : "var(--text-color)",
  };
};

const buildModelResult = async (
  combo: string,
  allTexts: string[]
): Promise<ModelArenaResult | null> => {
  const target = resolveModelCombo(combo);
  if (!target) return null;

  const result = await embedTexts(target, allTexts, {
    taskType: "SEMANTIC_SIMILARITY",
  });
  if (!result) return null;

  const anchorVec = result.embeddings[0];
  const scored = result.embeddings.slice(1).map((embedding, index) => ({
    index,
    text: allTexts[index + 1],
    score: calculateSimilarity(anchorVec, embedding, store.similarityAlgorithm),
    rank: 0,
  }));

  const sortedScores = scored
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    combo: target.combo,
    modelLabel: target.label,
    dimension: result.embeddings[0]?.length ?? 0,
    executionTime: result.executionTime,
    sortedScores,
  };
};

const handleRun = async () => {
  const allTexts = [
    store.anchorText,
    ...store.comparisonTexts.filter((text) => text.trim()),
  ];

  if (!store.anchorText.trim() || allTexts.length < 2) {
    customMessage.warning("至少需要一个 Anchor 和一个对比文本");
    return;
  }

  if (store.multiArenaCombos.length === 0) {
    customMessage.warning("请先选择参与对比的模型");
    return;
  }

  isLoading.value = true;
  try {
    const results = (
      await Promise.all(
        store.multiArenaCombos.map((combo) => buildModelResult(combo, allTexts))
      )
    ).filter((item): item is ModelArenaResult => !!item);

    modelResults.value = results;
    if (!results.some((item) => item.combo === baseCombo.value)) {
      baseCombo.value = results[0]?.combo ?? "";
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.multi-model-arena {
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
  flex: 0 0 420px;
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

.panel-title,
.section-title,
.rank-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-subtitle,
.section-tip {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 2px;
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
  margin-bottom: 22px;
}

.section-heading-row,
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
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

.result-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.result-section {
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  background-color: var(--bg-color);
  padding: 16px;
}

.matrix-wrapper {
  overflow-x: auto;
}

.score-matrix {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
}

.score-matrix th,
.score-matrix td {
  border-bottom: 1px solid var(--border-color-light);
  padding: 10px 12px;
  text-align: left;
}

.score-matrix tbody tr:last-child td {
  border-bottom: none;
}

.score-col,
.score-cell {
  width: 140px;
  text-align: right;
  font-family: "Consolas", monospace;
}

.text-col,
.text-cell {
  min-width: 240px;
  max-width: 360px;
}

.text-cell {
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-cell {
  font-weight: 700;
  border-radius: 6px;
}

.rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.rank-card {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 12px;
  background-color: var(--card-bg);
}

.rank-card-title {
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 54px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.rank-index,
.rank-score {
  font-family: "Consolas", monospace;
  color: var(--primary-color);
  font-weight: 700;
}

.rank-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color-secondary);
}

.calibrator-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.base-select {
  width: 240px;
  flex-shrink: 0;
}

.threshold-control {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.calibration-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.calibration-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 90px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color-light);
  font-size: 13px;
}

.calibration-row:last-child {
  border-bottom: none;
}

.calibration-model {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-color);
}

.calibration-note {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.calibration-value {
  font-family: "Consolas", monospace;
  font-weight: 800;
  color: var(--primary-color);
  text-align: right;
}

.empty-state {
  height: 100%;
  min-height: 360px;
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
