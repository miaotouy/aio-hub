<template>
  <div class="vcp-tool-node" :class="{ 'is-pending': isExecuting }">
    <div class="vcp-header" @click="toggleCollapse">
      <div class="vcp-title">
        <span class="vcp-icon" :class="{ 'is-expanded': !isCollapsed }">
          <ChevronRight :size="16" />
        </span>
        <component
          :is="statusIcon"
          class="status-icon"
          :class="{ spinning: isExecuting, 'is-success': isSuccess, 'is-error': isError }"
        />
        <span class="tool-name">
          {{ tool_name || "Unknown Tool" }}
          <span v-if="!closed && !isExecuting" class="interrupted-text">(内容中断)</span>
        </span>
        <el-tag
          v-if="isResult"
          size="small"
          :type="isSuccess ? 'success' : 'danger'"
          effect="plain"
          class="vcp-tag result-tag"
        >
          {{ isSuccess ? "SUCCESS" : "ERROR" }}
        </el-tag>
        <el-tag v-else-if="command" size="small" type="success" effect="light" class="vcp-tag">{{
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
      <!-- 结果内容 -->
      <div v-if="isResult && resultContent" class="vcp-body result-body">
        <div class="result-label">返回内容:</div>
        <div v-if="parsedJson" class="result-json">
          <el-table
            v-if="isJsonArray"
            :data="parsedJson"
            size="small"
            border
            stripe
            style="width: 100%"
            class="vcp-json-table"
          >
            <el-table-column
              v-for="key in tableColumns"
              :key="key"
              :prop="key"
              :label="key"
              show-overflow-tooltip
            />
          </el-table>
          <div v-else class="json-object-view">
            <div v-for="(val, key) in parsedJson" :key="key" class="json-row">
              <span class="json-key">{{ key }}:</span>
              <span class="json-val">{{ formatJsonVal(val) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="result-text">
          {{ resultContent }}
          <span v-if="!closed" class="streaming-cursor"></span>
        </div>
      </div>

      <!-- 参数列表 -->
      <div v-if="hasArgs" class="vcp-body">
        <div class="args-list">
          <div v-for="(value, key, index) in args" :key="key" class="arg-item">
            <span class="arg-key">{{ key }}:</span>
            <span class="arg-value">
              {{ value
              }}<span
                v-if="!closed && index === Object.keys(args).length - 1"
                class="streaming-cursor"
              ></span>
            </span>
          </div>
        </div>
      </div>

      <div v-if="!closed" class="vcp-footer" :class="{ 'interrupted-footer': !isExecuting }">
        <div class="loading-status">
          <Loader2 v-if="isExecuting" class="spinning" :size="12" />
          <AlertCircle v-else :size="12" />
          <span class="pulse-text">{{ isExecuting ? "正在调度工具资源..." : "内容生成中断" }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from "vue";
import {
  Settings,
  Loader2,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
} from "lucide-vue-next";
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
  isResult?: boolean;
  status?: string;
  resultContent?: string;
  isPending?: boolean;
}>();

const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);

const isCollapsed = ref(false);
const copied = ref(false);

// 判断是否正在执行中
const isExecuting = computed(() => {
  // 如果已经闭合（执行完毕），则肯定不在执行中
  if (props.closed) return false;
  // 如果上下文明确说流已经结束了，说明内容生成中断了，不再执行
  if (context?.isStreaming && !context.isStreaming.value) return false;
  // 如果还在流式传输中，且未闭合，则认为正在执行
  return true;
});

const isSuccess = computed(() => props.status?.includes("SUCCESS"));
const isError = computed(() => props.status?.includes("ERROR"));

const statusIcon = computed(() => {
  if (isExecuting.value) return Loader2;
  // 未闭合且不在执行中，说明是内容中断
  if (!props.closed) return AlertCircle;
  if (props.isResult) {
    return isSuccess.value ? CheckCircle2 : AlertCircle;
  }
  return Settings;
});

const hasArgs = computed(() => Object.keys(props.args).length > 0);

const parsedJson = computed(() => {
  if (!props.resultContent) return null;
  const trimmed = props.resultContent.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return null;
  }
});

const isJsonArray = computed(() => Array.isArray(parsedJson.value));

const tableColumns = computed(() => {
  if (!isJsonArray.value || !parsedJson.value.length) return [];
  // 提取所有对象的键作为列
  const keys = new Set<string>();
  parsedJson.value.forEach((item: any) => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach((k) => keys.add(k));
    }
  });
  return Array.from(keys);
});

const formatJsonVal = (val: any) => {
  if (val === null) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

onMounted(() => {
  // 优先级：如果是结果块则默认折叠 > Props 传入 > 上下文全局设置 > 默认不折叠(false)
  if (props.isResult) {
    isCollapsed.value = true;
  } else {
    isCollapsed.value =
      props.collapsedByDefault ?? context?.defaultToolCallCollapsed?.value ?? false;
  }
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

.status-icon.is-success {
  color: var(--el-color-success);
  opacity: 1;
}

.status-icon.is-error {
  color: var(--el-color-danger);
  opacity: 1;
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
  display: flex;
  align-items: center;
  gap: 4px;
}

.interrupted-text {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-color-danger);
  opacity: 0.8;
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
  max-height: 800px;
  overflow-y: auto;
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

.result-body {
  background: rgba(var(--el-color-info-rgb), 0.03);
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
}

.result-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.result-json {
  margin-top: 4px;
}

.vcp-json-table {
  --el-table-border-color: var(--border-color);
  --el-table-header-bg-color: var(--el-fill-color-light);
  border-radius: 4px;
  overflow: hidden;
}

.json-object-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: rgba(var(--el-color-primary-rgb), 0.02);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.json-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.json-key {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  min-width: 60px;
}

.json-val {
  color: var(--el-text-color-primary);
  word-break: break-all;
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
  position: relative;
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--el-color-success);
  margin-left: 2px;
  vertical-align: middle;
  animation: cursor-blink 1s infinite;
}

@keyframes cursor-blink {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}

.vcp-footer {
  padding: 8px 12px;
  background: rgba(var(--el-color-success-rgb), 0.05);
  border-top: 1px dashed var(--border-color);
}

.interrupted-footer {
  background: rgba(var(--el-color-danger-rgb), 0.05);
  color: var(--el-color-danger);
}

.interrupted-footer .loading-status {
  color: var(--el-color-danger);
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
