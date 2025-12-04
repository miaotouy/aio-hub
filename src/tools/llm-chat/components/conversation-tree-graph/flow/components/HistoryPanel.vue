<template>
  <div class="history-panel">
    <!-- 头部 -->
    <div class="history-panel-header">
      <div class="title">
        <el-icon><Clock /></el-icon>
        <span>操作历史</span>
      </div>
      <el-button text :icon="Close" size="small" @click="emit('close')" />
    </div>

    <!-- 历史记录列表 -->
    <div v-if="historyStack.length > 0" ref="historyListRef" class="history-list">
      <div
        v-for="(entry, index) in historyStack"
        :key="index"
        :ref="(el) => (historyItemRefs[index] = el as HTMLElement)"
        class="history-item"
        :class="{
          active: index === currentIndex,
          future: index > currentIndex,
          snapshot: entry.isSnapshot,
        }"
        @click="handleJumpTo(index)"
      >
        <!-- 左侧指示器 -->
        <div class="item-indicator">
          <div v-if="index === currentIndex" class="indicator-dot current" />
          <div v-else-if="index < currentIndex" class="indicator-dot past" />
          <div v-else class="indicator-dot future" />
          <div v-if="index < historyStack.length - 1" class="indicator-line" />
        </div>

        <!-- 内容区 -->
        <div class="item-content">
          <!-- 操作类型和时间 -->
          <div class="item-header">
            <div class="action-info">
              <el-tag :type="getActionTagType(entry.actionTag)" size="small" effect="plain">
                {{ getActionLabel(entry.actionTag) }}
              </el-tag>
              <el-tag v-if="entry.isSnapshot" size="small" type="info">
                <el-icon><Camera /></el-icon>
                快照
              </el-tag>
            </div>
            <span class="timestamp">{{ formatTime(entry.timestamp) }}</span>
          </div>

          <!-- 详细信息 -->
          <div v-if="entry.context" class="item-details">
            <div v-if="entry.context.affectedNodeCount" class="detail-item">
              <el-icon><DocumentCopy /></el-icon>
              <span>影响 {{ entry.context.affectedNodeCount }} 个节点</span>
            </div>
            <div v-if="entry.context.targetNodeId" class="detail-item">
              <el-icon><Position /></el-icon>
              <span>目标: {{ entry.context.targetNodeId.slice(0, 8) }}...</span>
            </div>
          </div>

          <!-- 快照摘要 -->
          <div v-if="entry.isSnapshot && entry.snapshot" class="snapshot-summary">
            <el-icon><DataAnalysis /></el-icon>
            <span>包含 {{ Object.keys(entry.snapshot).length }} 个节点</span>
          </div>

          <!-- Delta 摘要 -->
          <div v-if="!entry.isSnapshot && entry.deltas" class="delta-summary">
            <span class="delta-count">{{ entry.deltas.length }} 个变更</span>
            <div class="delta-types">
              <el-tag
                v-for="(type, idx) in getDeltaTypes(entry.deltas)"
                :key="idx"
                size="small"
                effect="plain"
              >
                {{ type }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="暂无操作历史" :image-size="80" />

    <!-- 底部统计 -->
    <div v-if="historyStack.length > 0" class="history-footer">
      <div class="stats">
        <span>总计 {{ historyStack.length }} 条记录</span>
        <span>当前位置: {{ currentIndex + 1 }}/{{ historyStack.length }}</span>
      </div>
      <el-button v-if="currentIndex > 0" size="small" text @click="handleJumpTo(0)">
        <el-icon><Back /></el-icon>
        返回初始状态
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, onMounted } from "vue";
import type { HistoryEntry, HistoryActionTag, HistoryDelta } from "../../../../types";
import {
  Clock,
  Close,
  Camera,
  DocumentCopy,
  Position,
  DataAnalysis,
  Back,
} from "@element-plus/icons-vue";
interface Props {
  historyStack: HistoryEntry[];
  currentIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "jump-to", index: number): void;
}>();

const historyListRef = ref<HTMLElement | null>(null);
const historyItemRefs = ref<HTMLElement[]>([]);

// 自动滚动到当前条目
onMounted(() => {
  nextTick(() => {
    const activeItem = historyItemRefs.value[props.currentIndex];
    if (activeItem) {
      activeItem.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  });
});

// 操作标签映射
const actionLabels: Record<HistoryActionTag, string> = {
  INITIAL_STATE: "初始状态",
  NODE_EDIT: "编辑节点",
  NODE_DELETE: "删除节点",
  NODES_DELETE: "批量删除",
  NODE_TOGGLE_ENABLED: "切换启用",
  NODE_MOVE: "移动节点",
  BRANCH_GRAFT: "嫁接分支",
  BRANCH_CREATE: "创建分支",
  BRANCH_CREATE_FROM_EDIT: "编辑创建分支",
  ACTIVE_NODE_SWITCH: "切换节点",
};

// 操作标签颜色
const actionTagTypes: Record<HistoryActionTag, any> = {
  INITIAL_STATE: "info",
  NODE_EDIT: "primary",
  NODE_DELETE: "danger",
  NODES_DELETE: "danger",
  NODE_TOGGLE_ENABLED: "warning",
  NODE_MOVE: "success",
  BRANCH_GRAFT: "success",
  BRANCH_CREATE: "success",
  BRANCH_CREATE_FROM_EDIT: "success",
  ACTIVE_NODE_SWITCH: "info",
};

// Delta 类型映射
const deltaTypeLabels: Record<string, string> = {
  create: "创建",
  delete: "删除",
  update: "更新",
  relation: "关系变更",
  active_leaf_change: "切换活动节点",
};

function getActionLabel(tag: HistoryActionTag): string {
  return actionLabels[tag] || tag;
}

function getActionTagType(tag: HistoryActionTag) {
  return actionTagTypes[tag] || "";
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于1分钟
  if (diff < 60000) {
    return "刚刚";
  }

  // 小于1小时
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  }

  // 小于24小时
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  }

  // 显示日期时间
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDeltaTypes(deltas: HistoryDelta[]): string[] {
  const types = new Set<string>();
  deltas.forEach((delta) => {
    types.add(deltaTypeLabels[delta.type] || delta.type);
  });
  return Array.from(types);
}

function handleJumpTo(index: number): void {
  if (index === props.currentIndex) return;
  emit("jump-to", index);
}
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  max-height: 600px;
}

.history-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.history-panel-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.history-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.history-item:hover {
  background-color: var(--el-fill-color-light);
}

.history-item.active {
  background-color: var(--el-color-primary-light-9);
}

.history-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
}

.history-item.future {
  opacity: 0.5;
}

.item-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
}

.indicator-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  z-index: 1;
}

.indicator-dot.current {
  background-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-7);
}

.indicator-dot.past {
  background-color: var(--el-color-success);
}

.indicator-dot.future {
  background-color: var(--el-border-color);
}

.indicator-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background-color: var(--el-border-color-lighter);
  margin-top: 4px;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.timestamp {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.item-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-item .el-icon {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.snapshot-summary,
.delta-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  padding: 4px 8px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.delta-summary {
  flex-direction: column;
  align-items: flex-start;
}

.delta-count {
  font-weight: 500;
}

.delta-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.history-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 暗色主题适配 */
.dark .history-item:hover {
  background-color: var(--el-fill-color);
}

.dark .history-item.active {
  background-color: rgba(var(--el-color-primary-rgb), 0.15);
}
</style>
