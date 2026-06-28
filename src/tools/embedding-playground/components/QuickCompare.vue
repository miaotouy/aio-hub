<template>
  <div class="quick-compare">
    <div class="quick-layout">
      <div class="input-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">极简 A vs B</span>
            <span class="panel-subtitle">两个文本，直接查看向量相似度</span>
          </div>
          <el-button
            type="primary"
            :loading="isLoading"
            :disabled="!canRun"
            class="run-btn"
            @click="handleCompare"
          >
            立即对比
          </el-button>
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="mode-row">
            <span class="section-label">模型模式</span>
            <el-segmented
              v-model="modeValue"
              :options="modeOptions"
              size="small"
            />
          </div>

          <div class="config-section">
            <label class="section-label">Embedding 模型</label>
            <EmbeddingModelPicker
              v-if="store.quickCompareIsMulti"
              v-model="store.quickCompareCombos"
              multiple
              :max-collapse-tags="4"
              placeholder="选择多个 Embedding 模型"
            />
            <EmbeddingModelPicker
              v-else
              v-model="quickModelCombo"
              placeholder="选择一个 Embedding 模型"
            />
          </div>

          <div class="text-grid">
            <div class="text-block">
              <div class="text-block-header">
                <span class="text-badge">A</span>
                <span>{{ store.anchorText.length }} 字符</span>
              </div>
              <RichCodeEditor
                v-model="store.anchorText"
                language="markdown"
                placeholder="输入文本 A..."
                height="260px"
              />
            </div>

            <div class="text-block">
              <div class="text-block-header">
                <span class="text-badge">B</span>
                <span>{{ quickTextB.length }} 字符</span>
              </div>
              <RichCodeEditor
                v-model="quickTextB"
                language="markdown"
                placeholder="输入文本 B..."
                height="260px"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="result-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">对比结果</span>
            <span v-if="singleResult" class="panel-subtitle">
              {{ singleResult.modelLabel }} · {{ singleResult.dimension }} 维
            </span>
            <span v-else-if="multiResults.length" class="panel-subtitle">
              {{ multiResults.length }} 个模型横向对比
            </span>
          </div>
          <el-tag v-if="resultCount" effect="plain" size="small" type="info">
            {{ resultCount }} 条结果
          </el-tag>
        </div>

        <div class="panel-content result-content scrollbar-custom">
          <div
            v-if="!store.quickCompareIsMulti && singleResult"
            class="single-result"
          >
            <div
              class="score-ring"
              :style="{ '--score-angle': `${toPercent(singleResult.score) * 3.6}deg` }"
            >
              <div class="score-ring-inner">
                <span class="score-main">
                  {{ (singleResult.score * 100).toFixed(2) }}%
                </span>
                <span class="score-caption">Similarity</span>
              </div>
            </div>

            <div class="metric-strip">
              <div class="metric-item">
                <span class="metric-label">原始分数</span>
                <span class="metric-value">{{ singleResult.score.toFixed(6) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">维度</span>
                <span class="metric-value">{{ singleResult.dimension }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">耗时</span>
                <span class="metric-value">{{ singleResult.executionTime }}ms</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Tokens</span>
                <span class="metric-value">{{ singleResult.tokens }}</span>
              </div>
            </div>
          </div>

          <div
            v-else-if="store.quickCompareIsMulti && multiResults.length"
            class="multi-result-list"
          >
            <div
              v-for="item in sortedMultiResults"
              :key="item.combo"
              class="multi-result-card"
            >
              <div class="model-row">
                <span class="model-name">{{ item.modelLabel }}</span>
                <span class="model-score">{{ (item.score * 100).toFixed(2) }}%</span>
              </div>
              <div class="score-track">
                <div
                  class="score-fill"
                  :style="{ width: `${toPercent(item.score)}%` }"
                ></div>
              </div>
              <div class="model-meta">
                <span>{{ item.score.toFixed(6) }}</span>
                <span>{{ item.dimension }} 维</span>
                <span>{{ item.executionTime }}ms</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <el-icon class="empty-icon"><GitCompare /></el-icon>
            <p>等待对比</p>
            <span>填入 A 和 B，选择模型后即可得到相似度分数</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { GitCompare } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingCache } from "../composables/useEmbeddingCache";
import { useEmbeddingModelOptions } from "../composables/useEmbeddingModelOptions";
import { useVectorMath } from "../composables/useVectorMath";
import EmbeddingModelPicker from "./EmbeddingModelPicker.vue";

interface QuickResult {
  combo: string;
  modelLabel: string;
  score: number;
  dimension: number;
  executionTime: number;
  tokens: number;
}

const store = useEmbeddingPlaygroundStore();
const { calculateSimilarity } = useVectorMath();
const { embedTexts } = useEmbeddingCache();
const { resolveModelCombo, buildSingleModelCombo } = useEmbeddingModelOptions();

const isLoading = ref(false);
const singleResult = ref<QuickResult | null>(null);
const multiResults = ref<QuickResult[]>([]);

const modeOptions = [
  { label: "单模型", value: "single" },
  { label: "多模型", value: "multi" },
];

const modeValue = computed({
  get: () => (store.quickCompareIsMulti ? "multi" : "single"),
  set: (value: string | number | boolean) => {
    store.quickCompareIsMulti = value === "multi";
  },
});

const quickModelCombo = computed({
  get: () =>
    buildSingleModelCombo(
      store.quickCompareProfile,
      store.quickCompareModelId
    ),
  set: (value: string | string[]) => {
    const target = resolveModelCombo(Array.isArray(value) ? value[0] : value);
    store.quickCompareProfile = target?.profile ?? null;
    store.quickCompareModelId = target?.modelId ?? "";
  },
});

const quickTextB = computed({
  get: () => store.comparisonTexts[0] ?? "",
  set: (value: string) => {
    if (store.comparisonTexts.length === 0) {
      store.comparisonTexts.push(value);
    } else {
      store.comparisonTexts[0] = value;
    }
  },
});

const canRun = computed(() => {
  const hasTexts = !!store.anchorText.trim() && !!quickTextB.value.trim();
  if (!hasTexts) return false;
  if (store.quickCompareIsMulti) return store.quickCompareCombos.length > 0;
  return !!store.quickCompareProfile && !!store.quickCompareModelId;
});

const resultCount = computed(() =>
  store.quickCompareIsMulti ? multiResults.value.length : singleResult.value ? 1 : 0
);

const sortedMultiResults = computed(() =>
  [...multiResults.value].sort((a, b) => b.score - a.score)
);

const toPercent = (score: number) => Math.max(0, Math.min(100, score * 100));

const runForCombo = async (combo: string): Promise<QuickResult | null> => {
  const target = resolveModelCombo(combo);
  if (!target) return null;

  const result = await embedTexts(
    target,
    [store.anchorText, quickTextB.value],
    {
      taskType: "SEMANTIC_SIMILARITY",
    }
  );
  if (!result) return null;

  const score = calculateSimilarity(
    result.embeddings[0],
    result.embeddings[1],
    store.similarityAlgorithm
  );

  return {
    combo: target.combo,
    modelLabel: target.label,
    score,
    dimension: result.embeddings[0]?.length ?? 0,
    executionTime: result.executionTime,
    tokens: result.response?.usage?.totalTokens ?? 0,
  };
};

const handleCompare = async () => {
  if (!store.anchorText.trim() || !quickTextB.value.trim()) {
    customMessage.warning("请先填写文本 A 和文本 B");
    return;
  }

  const combos = store.quickCompareIsMulti
    ? store.quickCompareCombos
    : [quickModelCombo.value];
  const validCombos = combos.filter(Boolean);

  if (validCombos.length === 0) {
    customMessage.warning("请先选择 Embedding 模型");
    return;
  }

  isLoading.value = true;
  try {
    const results = (await Promise.all(validCombos.map(runForCombo))).filter(
      (item): item is QuickResult => !!item
    );

    if (store.quickCompareIsMulti) {
      multiResults.value = results;
      singleResult.value = null;
    } else {
      singleResult.value = results[0] ?? null;
      multiResults.value = [];
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.quick-compare {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quick-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.input-panel,
.result-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.input-panel {
  flex: 1.15;
}

.result-panel {
  flex: 0.85;
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

.config-section,
.mode-row {
  margin-bottom: 18px;
}

.mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
}

.text-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.text-block {
  min-width: 0;
}

.text-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.text-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background-color: var(--primary-color-light);
  color: var(--primary-color);
  font-weight: 700;
}

.result-content {
  display: flex;
  flex-direction: column;
}

.single-result {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
}

.score-ring {
  --score-angle: 0deg;
  width: min(280px, 70%);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(
    var(--primary-color) var(--score-angle),
    var(--bg-color-soft) 0
  );
  box-shadow: var(--shadow-sm);
}

.score-ring-inner {
  width: calc(100% - 28px);
  aspect-ratio: 1;
  border-radius: 50%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-main {
  font-family: "Consolas", monospace;
  font-size: clamp(34px, 5vw, 56px);
  font-weight: 800;
  color: var(--text-color);
  line-height: 1;
}

.score-caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-secondary);
  text-transform: uppercase;
}

.metric-strip {
  width: min(520px, 100%);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  overflow: hidden;
}

.metric-item {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--bg-color);
  border-right: 1px solid var(--border-color-light);
}

.metric-item:last-child {
  border-right: none;
}

.metric-label {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.metric-value {
  font-family: "Consolas", monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-color);
  overflow-wrap: anywhere;
}

.multi-result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.multi-result-card {
  padding: 16px;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
}

.model-row,
.model-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-color);
}

.model-score {
  font-family: "Consolas", monospace;
  font-size: 20px;
  font-weight: 800;
  color: var(--primary-color);
}

.score-track {
  height: 8px;
  margin: 12px 0 8px;
  border-radius: 999px;
  overflow: hidden;
  background-color: var(--bg-color-soft);
}

.score-fill {
  height: 100%;
  border-radius: inherit;
  background-color: var(--primary-color);
  transition: width 0.45s ease;
}

.model-meta {
  color: var(--text-color-secondary);
  font-family: "Consolas", monospace;
  font-size: 12px;
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
