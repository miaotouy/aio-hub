<template>
  <div class="retrieval-simulator">
    <div class="simulator-layout">
      <!-- 左侧：知识库管理 -->
      <div class="library-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">模拟知识库</span>
            <span class="panel-subtitle"
              >管理用于检索的文档片段 ({{ store.knowledgeBase.length }})</span
            >
          </div>
          <div class="header-actions">
            <el-button
              type="primary"
              size="small"
              :loading="isLoading"
              @click="handleBatchEmbedding"
              :disabled="!store.selectedProfile || store.knowledgeBase.length === 0"
            >
              一键向量化
            </el-button>
            <el-button :icon="Plus" @click="addDocument" size="small" circle />
            <el-button
              v-if="store.knowledgeBase.length > 0"
              type="danger"
              plain
              :icon="Trash2"
              @click="clearKnowledgeBase"
              size="small"
              circle
            />
          </div>
        </div>

        <div class="panel-content scrollbar-custom">
          <div v-if="store.knowledgeBase.length === 0" class="empty-docs">
            <el-empty :image-size="60" description="暂无文档">
              <el-button type="primary" plain size="small" @click="addDocument">立即添加</el-button>
            </el-empty>
          </div>
          <div v-else class="doc-list">
            <div
              v-for="(item, index) in store.knowledgeBase"
              :key="index"
              class="doc-item"
              :class="{ 'is-embedded': item.embedding }"
              @click="openEditDialog(index)"
            >
              <div class="doc-item-header">
                <div class="doc-index">#{{ store.knowledgeBase.length - index }}</div>
                <div class="doc-meta">
                  <span class="char-count">{{ item.text.length }} 字符</span>
                  <el-tag
                    v-if="item.embedding"
                    size="small"
                    type="success"
                    effect="light"
                    class="status-tag"
                    >已向量化</el-tag
                  >
                </div>
                <div class="item-actions">
                  <el-button
                    type="primary"
                    link
                    :icon="Edit3"
                    @click.stop="openEditDialog(index)"
                  />
                  <el-button type="danger" link :icon="X" @click.stop="removeDocument(index)" />
                </div>
              </div>
              <div class="doc-content-wrapper">
                <div class="doc-preview" :class="{ 'is-empty': !item.text.trim() }">
                  {{ item.text.trim() || "点击输入文档内容..." }}
                </div>
              </div>
            </div>
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
              clearable
              @keyup.enter="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" :loading="isLoading" @click="handleSearch"> 检索 </el-button>
          </div>

          <!-- 检索结果 -->
          <div class="results-section">
            <div class="search-config-bar">
              <div class="config-item">
                <span class="config-label">Top-K</span>
                <el-input-number
                  v-model="store.searchTopK"
                  :min="1"
                  :max="50"
                  size="small"
                  controls-position="right"
                  class="k-input"
                />
              </div>
              <div class="config-item">
                <span class="config-label">相似度算法</span>
                <el-select v-model="store.similarityAlgorithm" size="small" style="width: 110px">
                  <el-option value="cosine" label="余弦相似度" />
                  <el-option value="euclidean" label="欧氏距离" />
                  <el-option value="dot" label="内积" />
                  <el-option value="manhattan" label="曼哈顿距离" />
                </el-select>
              </div>
              <div class="config-item threshold-item">
                <span class="config-label"
                  >搜索阈值: {{ (store.searchThreshold * 100).toFixed(0) }}%</span
                >
                <el-slider
                  v-model="store.searchThreshold"
                  :min="0"
                  :max="1"
                  :step="0.01"
                  :show-tooltip="false"
                  size="small"
                />
              </div>
            </div>

            <div v-if="searchResults.length" class="hit-list">
              <div v-for="(item, index) in searchResults" :key="index" class="hit-card">
                <div class="hit-header">
                  <div class="hit-rank">TOP {{ index + 1 }}</div>
                  <div class="hit-score-wrapper">
                    <div class="hit-score">
                      <span class="label">Similarity</span>
                      <span class="value">{{ (item.score * 100).toFixed(2) }}%</span>
                    </div>
                    <div class="score-bar-bg">
                      <div class="score-bar-fill" :style="{ width: `${item.score * 100}%` }"></div>
                    </div>
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

  <!-- 编辑对话框 -->
  <BaseDialog v-model="isEditDialogVisible" title="编辑文档片段" width="800px">
    <div v-if="editingIndex !== null" class="edit-dialog-content">
      <div class="dialog-editor-wrapper">
        <RichCodeEditor
          v-model="store.knowledgeBase[editingIndex].text"
          language="markdown"
          placeholder="请输入文档内容..."
          height="400px"
        />
      </div>
      <div class="edit-dialog-tip">修改内容后，需要重新点击“一键向量化”以更新检索索引。</div>
    </div>
    <template #footer>
      <el-button type="primary" @click="isEditDialogVisible = false">完成</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingRunner } from "../composables/useEmbeddingRunner";
import { useVectorMath } from "../composables/useVectorMath";
import { Plus, X, Search, Target, Trash2, Edit3 } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";

const store = useEmbeddingPlaygroundStore();
const { isLoading, runEmbedding } = useEmbeddingRunner();
const { calculateSimilarity } = useVectorMath();

const topK = ref(3);
const searchResults = ref<{ text: string; score: number }[]>([]);

const isEditDialogVisible = ref(false);
const editingIndex = ref<number | null>(null);

const openEditDialog = (index: number) => {
  editingIndex.value = index;
  isEditDialogVisible.value = true;
};

// 缓存查询向量
const lastQueryEmbedding = ref<number[] | null>(null);
const lastQueryInputs = ref<{
  profileId: string;
  modelId: string;
  query: string;
} | null>(null);

const addDocument = () => {
  store.knowledgeBase.unshift({ text: "" });
  openEditDialog(0);
};

const removeDocument = (index: number) => {
  store.knowledgeBase.splice(index, 1);
};

const clearKnowledgeBase = async () => {
  try {
    await ElMessageBox.confirm("确定要清空所有文档吗？此操作不可撤销。", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    store.knowledgeBase = [];
    searchResults.value = [];
    lastQueryEmbedding.value = null;
    customMessage.success("知识库已清空");
  } catch {
    // 用户取消
  }
};

const updateSearchResults = () => {
  if (!lastQueryEmbedding.value) return;

  const results = store.knowledgeBase
    .filter((doc) => doc.embedding)
    .map((doc) => ({
      text: doc.text,
      score: calculateSimilarity(
        lastQueryEmbedding.value!,
        doc.embedding!,
        store.similarityAlgorithm
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK.value);

  searchResults.value = results;
  if (results.length === 0) {
    customMessage.warning("知识库中没有已向量化的文档，请先执行“一键向量化”");
  }
};

// 监听算法或 TopK 变化自动重算
watch([() => store.similarityAlgorithm, topK], () => {
  if (lastQueryEmbedding.value) {
    updateSearchResults();
  }
});

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
    // 如果已有查询，同步更新结果
    if (lastQueryEmbedding.value) {
      updateSearchResults();
    }
  }
};

const handleSearch = async () => {
  if (!store.searchQuery.trim()) return;
  if (!store.selectedProfile || !store.selectedModelId) {
    customMessage.warning("请先选择 Profile 和模型");
    return;
  }

  const currentInputs = {
    profileId: store.selectedProfile.id,
    modelId: store.selectedModelId,
    query: store.searchQuery,
  };

  // 检查缓存
  if (
    lastQueryInputs.value &&
    lastQueryInputs.value.profileId === currentInputs.profileId &&
    lastQueryInputs.value.modelId === currentInputs.modelId &&
    lastQueryInputs.value.query === currentInputs.query &&
    lastQueryEmbedding.value
  ) {
    updateSearchResults();
    return;
  }

  // 先获取查询语句的 Embedding
  const response = await runEmbedding(store.selectedProfile, {
    modelId: store.selectedModelId,
    input: store.searchQuery,
    taskType: "RETRIEVAL_QUERY",
  });

  if (response) {
    lastQueryEmbedding.value = response.data[0].embedding;
    lastQueryInputs.value = currentInputs;
    updateSearchResults();
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
  gap: 16px;
}

.doc-item {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s ease;
  position: relative;
  cursor: pointer;
  user-select: none;
}

.doc-item:hover {
  border-color: var(--primary-color-light);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.doc-item.is-embedded {
  border-left: 4px solid var(--el-color-success);
}

.doc-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.doc-index {
  font-family: "Consolas", monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-color-secondary);
  opacity: 0.6;
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  margin-left: 12px;
}

.char-count {
  font-size: 11px;
  color: var(--text-color-light);
}
.doc-preview {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  min-height: 40px;
}

.doc-preview.is-empty {
  color: var(--text-color-placeholder);
  font-style: italic;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.doc-item:hover .item-actions {
  opacity: 1;
}

.edit-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-dialog-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  background-color: var(--el-color-warning-light-9);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid var(--el-color-warning);
}

.status-tag {
  font-size: 10px;
  height: 18px;
  padding: 0 6px;
}

.empty-docs {
  padding: 40px 0;
}

.header-actions {
  display: flex;
  align-items: center;
}

/* 检索区 */
.search-box-section {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-config-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 24px;
  padding: 12px 16px;
  background-color: var(--bg-color-soft);
  border-radius: 8px;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.config-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.threshold-item {
  flex: 1;
  min-width: 200px;
}

.search-input {
  flex: 1;
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
  font-size: 13px;
  font-weight: 700;
  color: var(--el-color-success);
}

.hit-score-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 120px;
}

.score-bar-bg {
  width: 100%;
  height: 4px;
  background-color: var(--bg-color-soft);
  border-radius: 2px;
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color-light), var(--el-color-success));
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
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

</style>
