<template>
  <div class="filter-panel">
    <div class="panel-section">
      <h4 class="section-title">消息过滤</h4>

      <div class="filter-group">
        <label class="filter-label">消息类型</label>
        <el-checkbox-group v-model="selectedTypes" @change="handleTypeChange">
          <div class="checkbox-item">
            <el-checkbox value="RAG_RETRIEVAL_DETAILS" size="small">
              <span class="type-tag rag">RAG</span>
              检索详情
            </el-checkbox>
          </div>
          <div class="checkbox-item">
            <el-checkbox value="META_THINKING_CHAIN" size="small">
              <span class="type-tag chain">Chain</span>
              思考链
            </el-checkbox>
          </div>
          <div class="checkbox-item">
            <el-checkbox value="AGENT_PRIVATE_CHAT_PREVIEW" size="small">
              <span class="type-tag agent">Agent</span>
              私聊预览
            </el-checkbox>
          </div>
          <div class="checkbox-item">
            <el-checkbox value="AI_MEMO_RETRIEVAL" size="small">
              <span class="type-tag memo">Memo</span>
              记忆回溯
            </el-checkbox>
          </div>
          <div class="checkbox-item">
            <el-checkbox value="PLUGIN_STEP_STATUS" size="small">
              <span class="type-tag plugin">Plugin</span>
              插件步骤
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>

      <div class="filter-group">
        <label class="filter-label">关键词搜索</label>
        <el-input
          v-model="keyword"
          placeholder="搜索..."
          size="small"
          clearable
          @input="handleKeywordChange"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <div class="panel-section stats-section">
      <h4 class="section-title">统计信息</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value rag">{{ stats.ragCount }}</span>
          <span class="stat-label">RAG</span>
        </div>
        <div class="stat-item">
          <span class="stat-value chain">{{ stats.chainCount }}</span>
          <span class="stat-label">Chain</span>
        </div>
        <div class="stat-item">
          <span class="stat-value agent">{{ stats.agentCount }}</span>
          <span class="stat-label">Agent</span>
        </div>
        <div class="stat-item">
          <span class="stat-value memo">{{ stats.memoCount }}</span>
          <span class="stat-label">Memo</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Search } from "@element-plus/icons-vue";
import { useVcpStore } from "../../stores/vcpStore";
import type { VcpMessageType } from "../../types/protocol";

const store = useVcpStore();

const selectedTypes = ref<VcpMessageType[]>([...store.filter.types]);
const keyword = ref(store.filter.keyword);

const stats = computed(() => store.stats);

function handleTypeChange() {
  store.setFilter({ types: selectedTypes.value });
}

function handleKeywordChange() {
  store.setFilter({ keyword: keyword.value });
}

watch(
  () => store.filter.types,
  (types) => {
    selectedTypes.value = [...types];
  },
);

watch(
  () => store.filter.keyword,
  (kw) => {
    keyword.value = kw;
  },
);
</script>

<style scoped lang="css">
.filter-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}

.panel-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.filter-group {
  margin-bottom: 16px;
}

.filter-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.checkbox-item {
  margin-bottom: 4px;
}

.type-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  margin-right: 4px;
}

.type-tag.rag {
  background: rgba(52, 152, 219, 0.2);
  color: #3498db;
}

.type-tag.chain {
  background: rgba(155, 89, 182, 0.2);
  color: #9b59b6;
}

.type-tag.agent {
  background: rgba(241, 196, 15, 0.2);
  color: #f1c40f;
}

.type-tag.memo {
  background: rgba(26, 188, 156, 0.2);
  color: #1abc9c;
}

.type-tag.plugin {
  background: rgba(52, 73, 94, 0.2);
  color: #34495e;
}

.stats-section {
  flex: 1;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  background: var(--el-bg-color-page);
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
}

.stat-value.rag {
  color: #3498db;
}
.stat-value.chain {
  color: #9b59b6;
}
.stat-value.agent {
  color: #f1c40f;
}
.stat-value.memo {
  color: #1abc9c;
}

.stat-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
