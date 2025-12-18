<script setup lang="ts">
import {
  Collection,
  ChatDotRound,
  WarningFilled,
  MagicStick,
  Scissor,
} from "@element-plus/icons-vue";
import type { ContextPreviewData } from "../../../types/context";

interface Props {
  stats: ContextPreviewData["statistics"] | null;
  maxContextTokens: number;
  enabled: boolean;
  hasActivePostProcessingRules: boolean;
}

defineProps<Props>();
</script>

<template>
  <div v-if="stats" class="context-stats-card">
    <!-- 核心指标卡片 -->
    <div class="summary-card">
      <!-- 总数 -->
      <div class="total-section">
        <div class="stat-label">Total Tokens</div>
        <div class="total-value">
          <span class="number">{{ stats.totalTokenCount?.toLocaleString() ?? "---" }}</span>
        </div>

        <!-- 使用率展示 -->
        <div
          v-if="enabled && maxContextTokens > 0 && stats.totalTokenCount !== undefined"
          class="usage-info"
        >
          <div class="usage-text">
            <span>
              使用率
              {{ Math.round((stats.totalTokenCount / maxContextTokens) * 100) }}%
            </span>
            <span class="limit-text">/ {{ maxContextTokens.toLocaleString() }}</span>
          </div>
          <el-progress
            :percentage="
              Math.min(100, Math.round((stats.totalTokenCount / maxContextTokens) * 100))
            "
            :color="
              stats.totalTokenCount > maxContextTokens
                ? '#F56C6C'
                : stats.totalTokenCount > maxContextTokens * 0.8
                  ? '#E6A23C'
                  : '#67C23A'
            "
            :show-text="false"
            :stroke-width="6"
            class="mini-progress"
          />
        </div>

        <div v-if="stats.isEstimated" class="estimate-badge">
          <el-icon><WarningFilled /></el-icon>
          <span>估算值 ({{ stats.tokenizerName }})</span>
        </div>
        <div v-else class="tokenizer-badge">
          <span>{{ stats.tokenizerName }}</span>
        </div>
      </div>

      <!-- 分布详情 -->
      <div class="breakdown-section">
        <!-- 预设消息 -->
        <div class="breakdown-item">
          <div class="item-icon preset-icon">
            <el-icon><Collection /></el-icon>
          </div>
          <div class="item-content">
            <div class="item-header">
              <span class="item-label">预设消息</span>
              <span class="item-value">
                {{
                  stats.presetMessagesTokenCount?.toLocaleString() ??
                  stats.presetMessagesCharCount.toLocaleString() + " 字符"
                }}
              </span>
            </div>
            <div
              class="progress-bg"
              v-if="stats.totalTokenCount && stats.presetMessagesTokenCount !== undefined"
            >
              <div
                class="progress-bar preset-bar"
                :style="{
                  width: `${((stats.presetMessagesTokenCount / stats.totalTokenCount) * 100).toFixed(1)}%`,
                }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 会话历史 -->
        <div class="breakdown-item">
          <div class="item-icon history-icon">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          <div class="item-content">
            <div class="item-header">
              <span class="item-label">会话历史</span>
              <span class="item-value">
                {{
                  stats.chatHistoryTokenCount?.toLocaleString() ??
                  stats.chatHistoryCharCount.toLocaleString() + " 字符"
                }}
              </span>
            </div>
            <div
              class="progress-bg"
              v-if="stats.totalTokenCount && stats.chatHistoryTokenCount !== undefined"
            >
              <div
                class="progress-bar history-bar"
                :style="{
                  width: `${((stats.chatHistoryTokenCount / stats.totalTokenCount) * 100).toFixed(1)}%`,
                }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Token 截断 -->
        <div class="breakdown-item" v-if="stats.savedTokenCount && stats.savedTokenCount > 0">
          <div class="item-icon saved-icon">
            <el-icon><Scissor /></el-icon>
          </div>
          <div class="item-content">
            <div class="item-header">
              <span class="item-label">Token 截断</span>
              <span class="item-value saved-value">
                -{{ stats.savedTokenCount.toLocaleString() }}
              </span>
            </div>
            <div class="item-sub-info" v-if="stats.savedCharCount">
              字符截断: -{{ stats.savedCharCount.toLocaleString() }}
            </div>
            <div class="progress-bg" v-if="stats.totalTokenCount">
              <div
                class="progress-bar saved-bar"
                :style="{
                  width: `${Math.min(100, (stats.savedTokenCount / stats.totalTokenCount) * 100).toFixed(1)}%`,
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 后处理消耗 -->
      <div
        class="breakdown-item"
        v-if="hasActivePostProcessingRules && stats.postProcessingTokenCount !== undefined"
      >
        <div class="item-icon post-process-icon">
          <el-icon><MagicStick /></el-icon>
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-label">后处理消耗</span>
            <span class="item-value">
              {{ stats.postProcessingTokenCount.toLocaleString() }}
            </span>
          </div>
          <div class="progress-bg" v-if="stats.totalTokenCount">
            <div
              class="progress-bar post-process-bar"
              :style="{
                width: `${((stats.postProcessingTokenCount / stats.totalTokenCount) * 100).toFixed(1)}%`,
              }"
            ></div>
          </div>
        </div>
      </div>

      <!-- 底部辅助信息 -->
      <div class="stats-footer">
        <div class="footer-item">
          <span class="label">总字符数:</span>
          <span class="value">
            {{ stats.totalCharCount.toLocaleString() }}
            <template v-if="stats.savedCharCount && stats.savedCharCount > 0">
              <span class="original-value">/ {{ (stats.totalCharCount + stats.savedCharCount).toLocaleString() }}</span>
            </template>
          </span>
        </div>
        <div class="footer-item" v-if="stats.totalTokenCount">
          <span class="label">Token/字符:</span>
          <span class="value">{{
            (stats.totalTokenCount / (stats.totalCharCount || 1)).toFixed(3)
          }}</span>
        </div>
        <div class="footer-item" v-if="stats.truncatedMessageCount">
          <span class="label">已截断消息:</span>
          <span class="value">{{ stats.truncatedMessageCount }} 条</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 上下文统计卡片 */
.context-stats-card {
  margin-bottom: 20px;
}

/* 汇总卡片布局 */
.summary-card {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary-color) 2%, var(--card-bg)),
    color-mix(in srgb, var(--primary-color) 1%, var(--card-bg))
  );
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 总数区域 */
.total-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
  font-weight: 50;
}

.total-value .number {
  font-size: 36px;
  font-weight: 700;
  color: var(--primary-color);
  font-family: "Consolas", "Monaco", monospace;
  letter-spacing: -1px;
  line-height: 1.2;
}

.estimate-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 2px 8px;
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.tokenizer-badge {
  margin-top: 8px;
  padding: 2px 8px;
  background-color: var(--bg-color-soft);
  color: var(--text-color-secondary);
  border-radius: 4px;
  font-size: 11px;
}

.usage-info {
  width: 100%;
  margin-top: 12px;
}

.usage-text {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  margin-bottom: 4px;
  color: var(--text-color-secondary);
}

.limit-text {
  opacity: 0.7;
}

/* 分布详情 */
.breakdown-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.preset-icon {
  background-color: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}
.history-icon {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0; /* 防止溢出 */
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.item-label {
  color: var(--text-color-secondary);
}

.item-sub-info {
  font-size: 10px;
  color: var(--text-color-secondary);
  opacity: 0.8;
  margin-top: -2px;
}

.item-value {
  font-weight: 600;
  color: var(--text-color);
  font-family: "Consolas", monospace;
}

.progress-bg {
  height: 4px;
  background-color: var(--border-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.preset-bar {
  background-color: #8b5cf6;
}
.history-bar {
  background-color: #10b981;
}
.post-process-icon {
  background-color: rgba(236, 72, 153, 0.1);
  color: #ec4899;
}
.post-process-bar {
  background-color: #ec4899;
}

.saved-icon {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.saved-bar {
  background-color: #10b981;
}
.saved-value {
  color: var(--el-color-success);
}

/* 底部辅助信息 */
.stats-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.footer-item {
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background-color: var(--bg-color-soft);
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.footer-item:hover {
  background-color: var(--border-color-light);
  color: var(--text-color);
}

.footer-item .value {
  font-family: "Consolas", monospace;
  color: var(--text-color);
  font-weight: 500;
}

.original-value {
  font-size: 0.9em;
  opacity: 0.5;
  font-weight: normal;
  margin-left: 2px;
  text-decoration: line-through;
}
</style>
