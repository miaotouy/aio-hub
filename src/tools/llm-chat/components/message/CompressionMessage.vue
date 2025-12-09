<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageNode } from "../../types";
import { FoldVertical, Expand, Database, Eye, EyeOff } from "lucide-vue-next";

interface Props {
  message: ChatMessageNode;
  isExpanded: boolean; // 是否处于临时展开状态（查看被压缩的消息）
}

interface Emits {
  (e: "toggle-expand"): void;
  (e: "toggle-enabled"): void;
  (e: "delete"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 压缩节点是否启用（影响上下文构建）
const isEnabled = computed(() => props.message.isEnabled !== false);

// 统计信息
const stats = computed(() => {
  const meta = props.message.metadata || {};
  return {
    msgCount: meta.originalMessageCount || 0,
    tokens: meta.originalTokenCount || 0,
    ratio:
      meta.originalTokenCount && meta.contentTokens
        ? Math.round((1 - meta.contentTokens / meta.originalTokenCount) * 100)
        : 0,
  };
});

// 格式化时间
const formattedTime = computed(() => {
  if (!props.message.timestamp) return "";
  return new Date(props.message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
});
</script>

<template>
  <div
    class="compression-message"
    :class="{ 'is-disabled': !isEnabled, 'is-expanded': isExpanded }"
  >
    <!-- 装饰性侧边栏 -->
    <div class="compression-bar" @click="emit('toggle-expand')">
      <div class="bar-line"></div>
      <div class="bar-icon">
        <FoldVertical v-if="!isExpanded" :size="14" />
        <Expand v-else :size="14" />
      </div>
      <div class="bar-line"></div>
    </div>

    <div class="compression-content-wrapper">
      <!-- 头部信息 -->
      <div class="compression-header">
        <div class="header-left">
          <span class="badge">上下文压缩</span>
          <span class="time">{{ formattedTime }}</span>
        </div>
        <div class="header-right">
          <!-- 操作按钮 -->
          <button
            class="action-btn"
            :title="isExpanded ? '收起原始消息' : '查看原始消息'"
            @click="emit('toggle-expand')"
          >
            <Eye v-if="!isExpanded" :size="14" />
            <EyeOff v-else :size="14" />
          </button>

          <button
            class="action-btn"
            :title="isEnabled ? '禁用压缩 (恢复上下文)' : '启用压缩'"
            @click="emit('toggle-enabled')"
          >
            <Database :size="14" :class="{ 'text-primary': isEnabled }" />
          </button>

          <!-- 暂时不支持重新生成摘要，预留位置 -->
          <!-- <button class="action-btn" title="重新生成摘要"><RotateCcw :size="14" /></button> -->
        </div>
      </div>

      <!-- 摘要内容 -->
      <div class="compression-summary">
        {{ message.content }}
      </div>

      <!-- 底部统计 -->
      <div class="compression-footer">
        <span class="stat-item" title="原始消息数量"> 包含 {{ stats.msgCount }} 条消息 </span>
        <span class="divider">•</span>
        <span class="stat-item" title="原始 Token 数"> 原始 {{ stats.tokens }} tokens </span>
        <span class="divider">•</span>
        <span class="stat-item highlight"> 节省 {{ stats.ratio }}% </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compression-message {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  margin: 8px 0;
  background-color: var(--card-bg);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.compression-message:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-color-soft);
}

.compression-message.is-disabled {
  opacity: 0.7;
  border-style: dotted;
  background-color: transparent;
}

.compression-message.is-expanded {
  border-style: solid;
  border-color: var(--primary-color-light);
  background-color: var(--bg-color-soft);
}

/* 左侧装饰条 */
.compression-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  cursor: pointer;
  color: var(--text-color-light);
}

.compression-bar:hover {
  color: var(--primary-color);
}

.bar-line {
  flex: 1;
  width: 2px;
  background-color: currentColor;
  opacity: 0.2;
  border-radius: 1px;
}

.bar-icon {
  padding: 4px 0;
}

/* 内容区域 */
.compression-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0; /* 防止文本溢出 */
}

.compression-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--primary-color-light-opacity);
  color: var(--primary-color);
}

.time {
  font-size: 11px;
  color: var(--text-color-light);
}

.header-right {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-color-primary);
}

.text-primary {
  color: var(--primary-color);
}

.compression-summary {
  font-family: var(--font-family-mono);
  line-height: 1.5;
  color: var(--text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.compression-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-light);
}

.divider {
  opacity: 0.5;
}

.highlight {
  color: var(--success-color);
  font-weight: 50;
}
</style>
