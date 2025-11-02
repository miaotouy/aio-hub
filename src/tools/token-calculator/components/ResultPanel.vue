<template>
  <div ref="rootEl" class="result-panel">
    <div class="panel-header">
      <span class="panel-title">Token 分析</span>
      <div v-if="isCalculating" class="calculating-indicator">
        <el-icon class="is-loading"><Loading /></el-icon>
        计算中...
      </div>
    </div>
    <div class="panel-content">
      <!-- Token 统计信息 -->
      <div class="stats-section">
        <div class="stat-card">
          <div class="stat-label">Token 数量</div>
          <div class="stat-value">{{ calculationResult.count }}</div>
          <div v-if="calculationResult.isEstimated" class="stat-note">
            <el-icon><WarningFilled /></el-icon>
            估算值
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">使用的分词器</div>
          <div class="stat-value tokenizer-name">{{ calculationResult.tokenizerName }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">字符数</div>
          <div class="stat-value">{{ characterCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Token/字符比</div>
          <div class="stat-value">
            {{ characterCount > 0 ? (calculationResult.count / characterCount).toFixed(3) : '0' }}
          </div>
        </div>
      </div>

      <!-- Token 可视化区域 -->
      <div class="visualization-section">
        <div class="section-header">
          <div class="section-title">Token 分块可视化</div>
          <div v-if="tokenizedText.length > 0 && calculationResult.count > tokenizedText.length" class="truncation-notice">
            <el-icon><WarningFilled /></el-icon>
            显示 {{ tokenizedText.length }} / {{ calculationResult.count }} 个 Token
          </div>
        </div>
        <div v-if="tokenizedText.length > 0" class="token-blocks">
          <span
            v-for="(token, index) in tokenizedText"
            :key="index"
            class="token-block"
            :style="{ backgroundColor: getTokenColor(index) }"
            :title="`Token ${index + 1}: ${token.text}`"
          >
            {{ token.text }}
          </span>
        </div>
        <div v-else class="empty-placeholder">
          暂无数据
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Loading, WarningFilled } from '@element-plus/icons-vue';
import type { TokenCalculationResult, TokenBlock } from '@/composables/useTokenCalculator';

interface Props {
  isCalculating: boolean;
  calculationResult: TokenCalculationResult;
  tokenizedText: TokenBlock[];
  characterCount: number;
  getTokenColor: (index: number) => string;
}

defineProps<Props>();

// 暴露根元素引用
const rootEl = ref<HTMLElement | null>(null);
defineExpose({ rootEl });
</script>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.calculating-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--primary-color);
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 统计信息区域 */
.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.stat-card {
  background-color: rgba(var(--primary-color-rgb), 0.05);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  text-align: center;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.stat-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-light);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--primary-color);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.stat-value.tokenizer-name {
  font-size: 18px;
  color: var(--text-color);
}

.stat-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: #f59e0b;
}

/* 可视化区域 */
.visualization-section {
  background-color: rgba(var(--primary-color-rgb), 0.03);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 18px;
  box-sizing: border-box;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.truncation-notice {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #f59e0b;
  font-weight: 500;
}

.token-blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.8;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: flex-start;
  padding-right: 4px;
}

.token-block {
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: default;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.token-block:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.12);
  z-index: 1;
}

.empty-placeholder {
  text-align: center;
  color: var(--text-color-light);
  padding: 40px 0;
}
</style>