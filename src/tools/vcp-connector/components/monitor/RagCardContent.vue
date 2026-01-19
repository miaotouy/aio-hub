<template>
  <div class="rag-card-content" :class="{ 'is-expanded': isExpanded }">
    <div class="info-row">
      <span class="db-name">{{ message.dbName }}</span>
      <el-tag size="small" type="info" class="meta-pill"> k={{ message.k }} </el-tag>
      <span class="use-time">{{ message.useTime }}</span>
      <el-button
        link
        size="small"
        class="json-btn"
        @click.stop="$emit('show-json', message)"
        title="查看原始 JSON"
      >
        <el-icon><Document /></el-icon>
      </el-button>
    </div>

    <div class="query-section" @click.stop="toggleExpand">
      <div class="query-text" :class="{ 'is-truncated': !isExpanded }">
        {{ message.query }}
      </div>
    </div>

    <div
      class="tags-row"
      v-if="message.coreTags && message.coreTags.length > 0"
    >
      <el-tag
        v-for="tag in message.coreTags"
        :key="tag"
        size="small"
        type="warning"
        effect="dark"
        class="core-tag"
      >
        ✨ {{ tag }}
      </el-tag>
    </div>

    <div
      class="results-list"
      v-if="message.results && message.results.length > 0"
    >
      <div
        v-for="(result, index) in displayResults"
        :key="index"
        class="result-item"
        @click.stop="toggleExpand"
      >
        <div class="result-header">
          <div class="score-wrapper">
            <span class="result-score" :class="[scoreClass(result.score), { 'is-boosted': isBoosted(result) }]">
              {{ result.score !== undefined ? result.score.toFixed(3) : "Time" }}
              <span v-if="isBoosted(result)" class="boost-icon">⚡</span>
            </span>
          </div>
          <div class="result-tags" v-if="result.matchedTags && result.matchedTags.length > 0">
            <span v-for="tag in result.matchedTags" :key="tag" class="match-tag" :class="{ 'is-core': isCoreMatched(tag, result) }">
              #{{ tag }}
            </span>
          </div>
          <span class="result-source" v-if="result.source">
            {{ result.source }}
          </span>
        </div>
        <div class="result-text" :class="{ 'is-truncated': !isExpanded }" v-html="renderText(result)"></div>
      </div>
      
      <div v-if="!isExpanded && message.results.length > 3" class="more-results-hint" @click.stop="toggleExpand">
        + 还有 {{ message.results.length - 3 }} 条结果，点击展开详情
      </div>
      
      <div v-if="isExpanded" class="expand-actions">
        <el-button link size="small" @click.stop="toggleExpand">收起详情</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Document } from "@element-plus/icons-vue";
import type { RagRetrievalMessage, RagResult } from "../../types/protocol";

const props = defineProps<{
  message: RagRetrievalMessage;
}>();

defineEmits<{
  'show-json': [message: any];
}>();

const isExpanded = ref(false);

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

const displayResults = computed(() => {
  return isExpanded.value ? props.message.results : props.message.results.slice(0, 3);
});

function scoreClass(score: number | undefined): string {
  if (score === undefined) return "";
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function isBoosted(result: RagResult): boolean {
  return result.originalScore !== undefined && result.originalScore !== result.score;
}

function isCoreMatched(tag: string, result: RagResult): boolean {
  return result.coreTagsMatched?.includes(tag) ?? false;
}

function renderText(result: RagResult): string {
  let text = result.text;
  if (!isExpanded.value && text.length > 150) {
    text = text.substring(0, 150) + "...";
  }
  
  if (!result.matchedTags || result.matchedTags.length === 0) return text;

  let html = text;
  const sortedTags = [...result.matchedTags].sort((a, b) => b.length - a.length);

  sortedTags.forEach((tag) => {
    const isCore = isCoreMatched(tag, result);
    const regex = new RegExp(`(${tag})`, "gi");
    const className = isCore ? "highlight-tag is-core" : "highlight-tag";
    html = html.replace(regex, `<span class="${className}">$1</span>`);
  });

  return html;
}
</script>

<style scoped lang="css">
.rag-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.db-name {
  font-weight: 700;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.meta-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--el-border-color-lighter);
}

.use-time {
  color: var(--el-text-color-tertiary);
  margin-left: auto;
  font-family: monospace;
}

.json-btn {
  opacity: 0.5;
  transition: opacity 0.2s;
}

.json-btn:hover {
  opacity: 1;
}

.query-section {
  cursor: pointer;
}

.query-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.6;
  padding: 10px 12px;
  background: var(--el-bg-color-page);
  border-radius: 8px;
  border-left: 3px solid var(--el-border-color);
}

.query-text.is-truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.core-tag {
  animation: shine 2s infinite;
  font-weight: bold;
}

@keyframes shine {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.3); box-shadow: 0 0 10px rgba(230, 162, 60, 0.4); }
  100% { filter: brightness(1); }
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-item {
  padding: 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s;
  cursor: pointer;
}

.result-item:hover {
  background: rgba(0, 0, 0, 0.2);
  border-color: var(--el-color-primary-light-7);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.score-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.result-score {
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

.result-score.high {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.1);
  border: 1px solid rgba(46, 204, 113, 0.3);
}

.result-score.medium {
  color: #f1c40f;
  background: rgba(241, 196, 15, 0.1);
  border: 1px solid rgba(241, 196, 15, 0.3);
}

.result-score.low {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.result-score.is-boosted {
  background: linear-gradient(135deg, rgba(241, 196, 15, 0.2), rgba(241, 196, 15, 0.1));
  border-color: #f1c40f;
  box-shadow: 0 0 8px rgba(241, 196, 15, 0.2);
}

.boost-icon {
  margin-left: 2px;
  font-size: 10px;
}

.result-tags {
  display: flex;
  gap: 6px;
  margin: 0 12px;
  flex: 1;
  overflow: hidden;
}

.match-tag {
  font-size: 10px;
  color: var(--el-text-color-tertiary);
  white-space: nowrap;
}

.match-tag.is-core {
  color: #f1c40f;
  font-weight: bold;
  text-shadow: 0 0 4px rgba(241, 196, 15, 0.3);
}

.result-source {
  font-size: 10px;
  color: var(--el-text-color-tertiary);
  text-transform: uppercase;
  opacity: 0.6;
}

.result-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.6;
  word-break: break-word;
}

.result-text.is-truncated {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  mask-image: linear-gradient(180deg, #000 60%, transparent);
}

:deep(.highlight-tag) {
  color: #3498db;
  font-weight: 500;
  background: rgba(52, 152, 219, 0.1);
  padding: 0 2px;
  border-radius: 2px;
}

:deep(.highlight-tag.is-core) {
  color: #f1c40f;
  font-weight: 700;
  background: rgba(241, 196, 15, 0.15);
}

.more-results-hint {
  font-size: 12px;
  color: var(--el-text-color-tertiary);
  text-align: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px dashed var(--el-border-color-lighter);
  cursor: pointer;
}

.expand-actions {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
</style>
