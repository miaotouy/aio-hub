<template>
  <div class="search-panel">
    <div class="search-header">
      <el-input
        v-model="query"
        :placeholder="placeholder || '搜索知识库...'"
        :prefix-icon="SearchIcon"
        clearable
        @input="debouncedSearch"
        @keyup.enter="search"
      >
        <template #append>
          <el-button :loading="loading" @click="search">搜索</el-button>
        </template>
      </el-input>
    </div>

    <div class="search-filters">
      <el-checkbox v-model="filters.enabledOnly">仅启用</el-checkbox>
      <el-select
        v-model="filters.kbIds"
        multiple
        collapse-tags
        placeholder="指定知识库"
        style="width: 200px"
        @change="search"
      >
        <el-option
          v-for="base in kbStore.bases"
          :key="base.id"
          :label="base.name"
          :value="base.id"
        />
      </el-select>
    </div>

    <div v-loading="loading" class="search-results custom-scrollbar">
      <template v-if="results.length > 0">
        <div
          v-for="result in results"
          :key="result.caiu.id"
          class="result-item"
          @click="emit('select', result)"
        >
          <div class="result-meta">
            <span class="match-type" :class="result.matchType">
              {{ result.matchType === "vector" ? "向量" : "关键词" }}
            </span>
            <span class="score">{{ (result.score * 10).toFixed(1) }}</span>
            <span class="kb-name">{{ result.kbName || "未知库" }}</span>
          </div>
          <div class="result-key">{{ result.caiu.key }}</div>
          <div
            class="result-highlight"
            v-html="formatHighlight(result.highlight || result.caiu.content)"
          ></div>
        </div>
      </template>
      <el-empty v-else-if="!loading && query" description="未找到相关内容" />
      <div v-else class="search-placeholder">输入关键词开始搜索</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { Search as SearchIcon } from "lucide-vue-next";
import { useKnowledgeSearch } from "../composables/useKnowledgeSearch";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { SearchResult } from "../types/search";
import DOMPurify from "dompurify";

const props = defineProps<{
  engineId?: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "select", result: SearchResult): void;
}>();

const kbStore = useKnowledgeBaseStore();
const { query, results, loading, filters, search, debouncedSearch } = useKnowledgeSearch();

// 同步引擎 ID
watch(
  () => props.engineId,
  (newId) => {
    if (newId) {
      filters.value.engineId = newId;
    }
  },
  { immediate: true }
);

function formatHighlight(text: string) {
  // 简单的 HTML 转义和高亮处理 (后端已经处理了部分，这里主要是安全净化)
  return DOMPurify.sanitize(text.replace(/\n/g, " "));
}
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 12px;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.search-filters {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
}

.result-item:hover {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.match-type {
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.match-type.vector {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}

.match-type.keyword {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.score {
  color: var(--el-text-color-secondary);
}

.kb-name {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

.result-key {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
}

.result-highlight {
  font-size: 13px;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.search-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}
</style>
