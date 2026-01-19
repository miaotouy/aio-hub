<template>
  <div class="chain-card-content" :class="{ 'is-expanded': isExpanded }">
    <div class="chain-header">
      <div class="chain-name">
        <el-icon><GitBranch /></el-icon>
        <span>元思考链: {{ message.chainName }}</span>
      </div>
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

    <div class="query-section" v-if="message.query" @click.stop="toggleExpand">
      <div class="query-text" :class="{ 'is-truncated': !isExpanded }">
        {{ message.query }}
      </div>
    </div>

    <div class="stages-list" v-if="message.stages && message.stages.length > 0">
      <!-- 阶段路径预览 -->
      <div class="stage-path" @click.stop="toggleExpand">
        <div
          v-for="(stage, index) in message.stages"
          :key="stage.stage"
          class="path-node-wrapper"
        >
          <div class="path-node" :title="stage.clusterName">
            <span class="node-index">{{ stage.stage }}</span>
            <span class="node-name">{{ stage.clusterName }}</span>
          </div>
          <div v-if="index < message.stages.length - 1" class="path-connector">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
      </div>

      <!-- 阶段详情列表 -->
      <div class="stages-container">
        <div
          v-for="stage in displayStages"
          :key="stage.stage"
          class="stage-item"
          @click.stop="toggleExpand"
        >
          <div class="stage-header">
            <span class="stage-number">#{{ stage.stage }}</span>
            <span class="stage-cluster">{{ stage.clusterName }}</span>
            <span class="stage-count">{{ stage.resultCount }} results</span>
          </div>
          <div
            class="stage-results"
            v-if="stage.results && stage.results.length > 0"
          >
            <div
              v-for="(result, idx) in (isExpanded ? stage.results : stage.results.slice(0, 1))"
              :key="idx"
              class="mini-result"
            >
              <div class="result-meta">
                <span class="mini-score">{{ result.score.toFixed(3) }}</span>
                <span class="result-source" v-if="result.source">{{ result.source }}</span>
              </div>
              <div class="mini-text" :class="{ 'is-truncated': !isExpanded }">
                {{ isExpanded ? result.text : truncateText(result.text, 100) }}
              </div>
            </div>
          </div>
          <div v-else class="no-results">本阶段无结果</div>
        </div>
        
        <div v-if="!isExpanded && message.stages.length > 3" class="more-stages-hint" @click.stop="toggleExpand">
          ... 还有 {{ message.stages.length - 3 }} 个阶段，点击展开详情
        </div>

        <div v-if="isExpanded" class="expand-actions">
          <el-button link size="small" @click.stop="toggleExpand">收起详情</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowRight, Document } from "@element-plus/icons-vue";
import { GitBranch } from "lucide-vue-next";
import type { ThinkingChainMessage } from "../../types/protocol";

const props = defineProps<{
  message: ThinkingChainMessage;
}>();

defineEmits<{
  'show-json': [message: any];
}>();

const isExpanded = ref(false);

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

const displayStages = computed(() => {
  return isExpanded.value ? props.message.stages : props.message.stages.slice(0, 3);
});

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
</script>

<style scoped lang="css">
.chain-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chain-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chain-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #9b59b6;
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
  border-left: 3px solid rgba(155, 89, 182, 0.4);
}

.query-text.is-truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-path {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
  background: rgba(155, 89, 182, 0.05);
  border-radius: 8px;
  border: 1px dashed rgba(155, 89, 182, 0.2);
  cursor: pointer;
}

.path-node-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.path-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  background: #9b59b6;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.node-index {
  opacity: 0.8;
}

.node-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-connector {
  color: #9b59b6;
  font-size: 12px;
  display: flex;
  align-items: center;
  opacity: 0.6;
}

.stages-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stage-item {
  padding: 12px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s;
  cursor: pointer;
}

.stage-item:hover {
  background: rgba(0, 0, 0, 0.15);
  border-color: rgba(155, 89, 182, 0.4);
}

.stage-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
}

.stage-number {
  font-weight: bold;
  color: #9b59b6;
  background: rgba(155, 89, 182, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
}

.stage-cluster {
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.stage-count {
  color: var(--el-text-color-tertiary);
  margin-left: auto;
  font-size: 11px;
}

.stage-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mini-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--el-bg-color);
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}

.result-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mini-score {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: #9b59b6;
  font-weight: 700;
  padding: 1px 6px;
  background: rgba(155, 89, 182, 0.1);
  border-radius: 4px;
}

.result-source {
  font-size: 10px;
  color: var(--el-text-color-tertiary);
  opacity: 0.6;
}

.mini-text {
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.5;
}

.mini-text.is-truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.no-results {
  font-size: 12px;
  font-style: italic;
  color: var(--el-text-color-tertiary);
  text-align: center;
  padding: 8px;
}

.more-stages-hint {
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
