<template>
  <div class="vcp-tool-node" :class="{ 'is-pending': !closed }">
    <div class="vcp-header" @click="toggleCollapse">
      <div class="vcp-title">
        <span class="vcp-icon" :class="{ 'is-expanded': !isCollapsed }">
          <ChevronRight :size="16" />
        </span>
        <component :is="statusIcon" class="status-icon" :class="{ spinning: !closed }" />
        <span class="tool-name">{{ tool_name || "Unknown Tool" }}</span>
        <el-tag v-if="command" size="small" type="success" effect="light" class="vcp-tag">{{
          command
        }}</el-tag>
        <span v-if="maid" class="maid-info">{{ maid }}</span>
      </div>

      <div class="header-actions">
        <!-- 复制按钮 -->
        <el-tooltip :content="copied ? '已复制' : '复制调用详情'" :show-after="300">
          <button
            class="action-btn"
            :class="{ 'action-btn-active': copied }"
            @click.stop="copyContent"
          >
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <div v-show="!isCollapsed" class="vcp-content">
      <div v-if="hasArgs" class="vcp-body">
        <div class="args-list">
          <div v-for="(value, key) in args" :key="key" class="arg-item">
            <span class="arg-key">{{ key }}:</span>
            <span class="arg-value">{{ value }}</span>
          </div>
        </div>
      </div>

      <div v-if="!closed" class="vcp-footer">
        <div class="loading-status">
          <Loader2 class="spinning" :size="12" />
          <span class="pulse-text">正在调度工具资源...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from "vue";
import { Settings, Loader2, ChevronRight, Copy, Check } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

const props = defineProps<{
  tool_name: string;
  command: string;
  maid?: string;
  args: Record<string, string>;
  closed: boolean;
  raw: string;
  collapsedByDefault?: boolean;
}>();

const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);

const isCollapsed = ref(false);
const copied = ref(false);

const statusIcon = computed(() => {
  if (!props.closed) return Loader2;
  return Settings;
});

const hasArgs = computed(() => Object.keys(props.args).length > 0);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

onMounted(() => {
  // 优先级：Props 传入 > 上下文全局设置 > 默认不折叠(false)
  isCollapsed.value = props.collapsedByDefault ?? context?.defaultToolCallCollapsed?.value ?? false;
});

const copyContent = async () => {
  try {
    await navigator.clipboard.writeText(props.raw);
    copied.value = true;
    customMessage.success("已复制工具调用原始文本");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    customMessage.error("复制失败");
  }
};
</script>

<style scoped>
.vcp-tool-node {
  margin: 12px 0;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  background: var(--card-bg, rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(var(--ui-blur, 8px));
  overflow: hidden;
  transition: all 0.2s ease;
}

.vcp-tool-node:hover {
  border-color: var(--el-color-success, #67c23a);
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.1);
}

.vcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  user-select: none;
  background: var(--el-fill-color-lighter);
  transition: background 0.2s ease;
  cursor: pointer;
}

.vcp-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.vcp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-success);
  transition: transform 0.2s ease;
}

.vcp-icon.is-expanded {
  transform: rotate(90deg);
}

.status-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.tool-name {
  font-size: 14px;
  font-weight: 600;
}

.vcp-tag {
  font-family: var(--el-font-family-mono);
  font-weight: bold;
}

.maid-info {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  opacity: 0.7;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover {
  color: var(--el-color-success);
  background-color: var(--el-fill-color);
  transform: translateY(-1px);
}

.action-btn-active {
  background-color: var(--el-color-success);
  color: white;
}

.vcp-content {
  border-top: 1px solid var(--border-color, rgba(255, 255, 0.05));
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.vcp-body {
  padding: 14px;
}

.args-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.arg-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.arg-key {
  font-family: var(--el-font-family-mono);
  color: var(--el-text-color-secondary);
  font-weight: 500;
  min-width: 80px;
  text-align: right;
  flex-shrink: 0;
  opacity: 0.8;
}

.arg-value {
  color: var(--el-text-color-primary);
  word-break: break-all;
  white-space: pre-wrap;
  flex-grow: 1;
}

.vcp-footer {
  padding: 8px 12px;
  background: rgba(var(--el-color-success-rgb), 0.05);
  border-top: 1px dashed var(--border-color);
}

.loading-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-success);
}

.pulse-text {
  font-size: 12px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* 正在执行时的扫光特效 */
.vcp-tool-node.is-pending {
  position: relative;
  overflow: hidden;
  animation: breathingBorder 2s infinite;
}

.vcp-tool-node.is-pending::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(103, 194, 58, 0.15) 50%, transparent);
  animation: shimmer 2s infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

@keyframes breathingBorder {
  0%,
  100% {
    border-color: var(--el-color-success);
    box-shadow: 0 0 10px rgba(103, 194, 58, 0.2);
  }
  50% {
    border-color: var(--el-color-success-light-3);
    box-shadow: 0 0 20px rgba(103, 194, 58, 0.4);
  }
}

:deep(.dark) .vcp-body {
  background: rgba(255, 255, 0.02);
}
</style>
