<template>
  <div class="retrieval-simulator">
    <div class="simulator-layout">
      <!-- 左侧：知识库管理 -->
      <div class="library-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">知识库 (Knowledge Base)</span>
            <span class="panel-subtitle">管理用于检索的文档片段</span>
          </div>
          <el-button type="primary" link :icon="Plus" @click="addDocument" size="small"
            >添加文档</el-button
          >
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="doc-list">
            <div v-for="(item, index) in store.knowledgeBase" :key="index" class="doc-item">
              <div class="doc-content-wrapper">
                <el-input
                  v-model="store.knowledgeBase[index].text"
                  type="textarea"
                  :rows="2"
                  placeholder="输入文档内容..."
                  class="doc-input"
                />
              </div>
              <div class="doc-actions">
                <el-tag
                  v-if="item.embedding"
                  size="small"
                  type="success"
                  effect="plain"
                  class="status-tag"
                  >已向量化</el-tag
                >
                <el-button
                  type="danger"
                  link
                  :icon="X"
                  @click="removeDocument(index)"
                  class="remove-btn"
                />
              </div>
            </div>
          </div>

          <div class="batch-actions mt-4">
            <el-button
              class="w-full"
              type="primary"
              plain
              :loading="isLoading"
              @click="handleBatchEmbedding"
              :disabled="!store.selectedProfile || store.knowledgeBase.length === 0"
            >
              <el-icon class="mr-1"><Cpu /></el-icon>
              一键向量化知识库
            </el-button>
          </div>
        </div>
      </div>

      <!-- 分割线 -->
      <div class="divider"></div>

      <!-- 右侧：查询与检索 -->
      <div class="search-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">检索模拟</span>
            <span class="panel-subtitle">测试不同查询语句的召回效果</span>
          </div>
        </div>

        <div class="panel-content scrollbar-custom">
          <!-- 查询输入区 -->
          <div class="search-box-section">
            <el-input
              v-model="store.searchQuery"
              placeholder="输入查询语句，按回车开始检索..."
              class="search-input"
              @keyup.enter="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
              <template #append>
                <el-button :loading="isLoading" @click="handleSearch">检索</el-button>
              </template>
            </el-input>
          </div>

          <!-- 检索结果 -->
          <div class="results-section">
            <div class="section-header-mini">
              <span>Top-K 检索结果</span>
              <el-select v-model="topK" size="small" style="width: 80px" class="ml-2">
                <el-option :value="3" label="K=3" />
                <el-option :value="5" label="K=5" />
                <el-option :value="10" label="K=10" />
              </el-select>
            </div>

            <div v-if="searchResults.length" class="hit-list">
              <div v-for="(item, index) in searchResults" :key="index" class="hit-card">
                <div class="hit-header">
                  <div class="hit-rank">TOP {{ index + 1 }}</div>
                  <div class="hit-score">
                    <span class="label">Score</span>
                    <span class="value">{{ item.score.toFixed(4) }}</span>
                  </div>
                </div>
                <div class="hit-text">{{ item.text }}</div>
              </div>
            </div>
            <div v-else class="empty-state">
              <el-icon class="empty-icon"><Target /></el-icon>
              <p>准备检索</p>
              <span>在上方输入查询语句并点击检索</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingRunner } from "../composables/useEmbeddingRunner";
import { useVectorMath } from "../composables/useVectorMath";
import { Plus, X, Search, Cpu, Target } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

const store = useEmbeddingPlaygroundStore();
const { isLoading, runEmbedding } = useEmbeddingRunner();
const { calculateSimilarity } = useVectorMath();

const topK = ref(3);
const searchResults = ref<{ text: string; score: number }[]>([]);

const addDocument = () => {
  store.knowledgeBase.unshift({ text: "" });
};

const removeDocument = (index: number) => {
  store.knowledgeBase.splice(index, 1);
};

const handleBatchEmbedding = async () => {
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning("请先选择 Profile 和模型");
    return;
  }

  const texts = store.knowledgeBase.map((d) => d.text).filter((t) => t.trim());
  if (texts.length === 0) return;

  const response = await runEmbedding(store.selectedProfile, {
    modelId: store.selectedModelId,
    input: texts,
    taskType: "RETRIEVAL_DOCUMENT",
  });

  if (response) {
    // 回填 Embedding
    let respIdx = 0;
    store.knowledgeBase.forEach((doc) => {
      if (doc.text.trim()) {
        doc.embedding = response.data[respIdx++].embedding;
      }
    });
    customMessage.success("知识库向量化完成");
  }
};

const handleSearch = async () => {
  if (!store.searchQuery.trim()) return;
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning("请先选择 Profile 和模型");
    return;
  }

  // 先获取查询语句的 Embedding
  const response = await runEmbedding(store.selectedProfile, {
    modelId: store.selectedModelId,
    input: store.searchQuery,
    taskType: "RETRIEVAL_QUERY",
  });

  if (response) {
    const queryVec = response.data[0].embedding;

    // 计算相似度并排序
    const results = store.knowledgeBase
      .filter((doc) => doc.embedding)
      .map((doc) => ({
        text: doc.text,
        score: calculateSimilarity(queryVec, doc.embedding!, "cosine"),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK.value);

    searchResults.value = results;
    if (results.length === 0) {
      customMessage.warning("知识库中没有已向量化的文档，请先执行“一键向量化”");
    }
  }
};
</script>

<style scoped>
.retrieval-simulator {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.simulator-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 面板通用样式 */
.library-panel,
.search-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.library-panel {
  flex: 0 0 380px;
}

.search-panel {
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

/* 知识库列表 */
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.doc-item {
  background-color: var(--bg-color-soft);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-input :deep(.el-textarea__inner) {
  background-color: var(--input-bg);
  font-size: 13px;
  padding: 8px;
}

.doc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-tag {
  font-size: 10px;
}

/* 检索区 */
.search-box-section {
  margin-bottom: 24px;
}

.search-input :deep(.el-input-group__append) {
  background-color: var(--primary-color);
  color: white;
  border: none;
}

.section-header-mini {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.hit-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hit-card {
  background-color: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease;
}

.hit-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary-color);
}

.hit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-color-light);
}

.hit-rank {
  font-size: 12px;
  font-weight: 800;
  color: var(--primary-color);
  background-color: var(--primary-color-light);
  padding: 2px 8px;
  border-radius: 4px;
}

.hit-score {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hit-score .label {
  font-size: 10px;
  color: var(--text-color-secondary);
  text-transform: uppercase;
}

.hit-score .value {
  font-family: "Consolas", monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-color-success);
}

.hit-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
}

/* 空状态 */
.empty-state {
  height: 300px;
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
