<template>
  <div class="llm-think-node" :class="{ 'is-collapsed': isCollapsed, 'is-thinking': isThinking }">
    <div class="llm-think-header" @click="toggleCollapse">
      <div class="llm-think-title">
        <span class="llm-think-icon" :class="{ 'is-expanded': !isCollapsed }">
          <ChevronRight :size="16" />
        </span>
        <span class="llm-think-label">{{ isThinking ? "思考中" : props.displayName }}</span>
        <el-tag size="small" type="primary" effect="light">{{ props.rawTagName }}</el-tag>
        <!-- 思考用时显示 -->
        <span v-if="thinkingTimeFormatted" class="thinking-time">{{ thinkingTimeFormatted }}</span>
        <!-- 思考中指示器 -->
        <div v-if="isThinking" class="thinking-indicator">
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
        </div>
      </div>

      <!-- 思考预览（仅在折叠时显示） -->
      <div v-if="isCollapsed && previewContent" class="think-preview">
        {{ previewContent }}
      </div>

      <div class="header-actions">
        <!-- 切换渲染/原始视图 -->
        <el-tooltip :content="showRaw ? '显示渲染内容' : '显示原始文本'" :show-after="300">
          <button
            class="action-btn"
            :class="{ 'action-btn-active': showRaw }"
            @click.stop="toggleRawView"
          >
            <Code2 :size="14" />
          </button>
        </el-tooltip>

        <!-- 复制按钮 -->
        <el-tooltip :content="copied ? '已复制' : '复制内容'" :show-after="300">
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
    <div v-show="!isCollapsed" class="llm-think-content">
      <!-- 原始文本视图 -->
      <pre v-if="showRaw" class="raw-content">{{ props.rawContent }}</pre>
      <!-- 渲染内容视图 -->
      <div v-else class="rendered-content">
        <!-- 使用默认插槽渲染内部 AST，由 AstNodeRenderer 递归提供 -->
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { Copy, Check, Code2, ChevronRight } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

interface Props {
  rawTagName: string;
  ruleId: string;
  displayName: string;
  collapsedByDefault: boolean;
  rawContent?: string; // 原始文本内容
  isThinking?: boolean; // 是否正在思考中
  generationMeta?: {
    requestStartTime?: number;
    requestEndTime?: number;
    reasoningStartTime?: number;
    reasoningEndTime?: number;
    firstTokenTime?: number;
    tokensPerSecond?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    modelId?: string;
  };
}

const props = withDefaults(defineProps<Props>(), {
  isThinking: false,
});

const isCollapsed = ref(props.collapsedByDefault);
const showRaw = ref(false);
const copied = ref(false);
const isThinking = computed(() => props.isThinking);

// 实时计时状态（用于流式传输期间的实时显示和持久化）
const realtimeDurationMs = ref<number | null>(null);
const timerId = ref<number | null>(null);
// 本地记录的开始时间（用于正文捕获等没有 meta 信息的场景）
const localStartTime = ref<number | null>(null);
// 估算时长（用于历史记录回显）
const estimatedDurationMs = ref<number | null>(null);

// 格式化时间（毫秒 -> 可读字符串）
const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

// 计算并格式化思考时间
const thinkingTimeFormatted = computed(() => {
  // 1. 优先使用实时计时结果（流式期间或持久化后）
  if (realtimeDurationMs.value !== null) {
    return formatDuration(realtimeDurationMs.value);
  }

  // 2. 尝试从元数据计算（仅限 reasoning-metadata 节点）
  if (props.ruleId === "reasoning-metadata" && props.generationMeta) {
    const meta = props.generationMeta;
    
    // 方案A: 优先使用思考时间戳
    if (meta.reasoningEndTime && meta.reasoningStartTime) {
      return formatDuration(meta.reasoningEndTime - meta.reasoningStartTime);
    }

    // 方案B: 使用请求时间戳（降级）
    if (meta.requestEndTime && meta.requestStartTime) {
      return formatDuration(meta.requestEndTime - meta.requestStartTime);
    }
  }

  // 3. 使用估算时间（用于普通 think 节点的回显）
  if (estimatedDurationMs.value !== null) {
    return `~${formatDuration(estimatedDurationMs.value)}`;
  }

  return null;
});

// 估算思考时间（针对非 metadata 节点）
const calculateEstimatedTime = async () => {
  // 如果已有实时时间或正在思考，无需估算
  if (realtimeDurationMs.value !== null || props.isThinking) return;

  const meta = props.generationMeta;
  const tps = meta?.tokensPerSecond;
  const modelId = meta?.modelId;

  // 只有当存在生成速度、模型ID且有内容时才进行估算
  if (!tps || !modelId || !props.rawContent) return;

  try {
    const result = await tokenCalculatorService.calculateTokens(props.rawContent, modelId);
    const tokenCount = result.count;
    
    if (tokenCount > 0) {
      // 估算耗时 = (Token数 / 每秒Token数) * 1000
      estimatedDurationMs.value = Math.round((tokenCount / tps) * 1000);
    }
  } catch (e) {
    console.warn("[LlmThinkNode] Failed to estimate duration:", e);
  }
};

// 获取预览内容（最后一行非空文本）
const previewContent = computed(() => {
  if (!props.rawContent) return "";

  const lines = props.rawContent.split("\n");
  // 从后往前找第一个非空行
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line) {
      return line;
    }
  }
  return "";
});

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

const toggleRawView = () => {
  showRaw.value = !showRaw.value;
};

const copyContent = async () => {
  try {
    const textToCopy = showRaw.value ? props.rawContent || "" : props.rawContent || "";
    await navigator.clipboard.writeText(textToCopy);
    copied.value = true;
    customMessage.success("内容已复制");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error("[LlmThinkNode] 复制失败:", error);
    customMessage.error("复制失败");
  }
};

// 监听思考状态和开始时间，启动/停止实时计时器
watch(
  [
    () => props.isThinking,
    () => props.generationMeta?.requestStartTime,
    () => props.generationMeta?.reasoningStartTime,
  ],
  ([thinking, requestStartTime, reasoningStartTime]) => {
    // 1. 确定有效的开始时间
    let startTime: number | undefined;

    // 只有特定的元数据节点才使用传入的 meta 时间
    if (props.ruleId === "reasoning-metadata") {
      startTime = reasoningStartTime || requestStartTime;
    }

    // 如果正在思考且没有确定开始时间（或者是普通节点），使用本地时间
    if (thinking && !startTime) {
      if (!localStartTime.value) {
        localStartTime.value = Date.now();
      }
      startTime = localStartTime.value;
    }

    // 2. 停止逻辑: 思考结束
    if (!thinking) {
      if (timerId.value !== null) {
        clearInterval(timerId.value);
        timerId.value = null;
      }

      // 思考结束时，计算最终时长
      const meta = props.generationMeta;
      
      // 只有元数据节点才尝试从 meta 计算最终时长
      if (props.ruleId === "reasoning-metadata") {
        if (meta?.reasoningEndTime && meta?.reasoningStartTime) {
          // 场景A: 有完整的 reasoning meta 信息，优先使用
          realtimeDurationMs.value = meta.reasoningEndTime - meta.reasoningStartTime;
        } else if (meta?.requestEndTime && meta?.requestStartTime) {
          // 场景B: 有完整的 request meta 信息，降级使用
          realtimeDurationMs.value = meta.requestEndTime - meta.requestStartTime;
        } else if (localStartTime.value) {
          realtimeDurationMs.value = Date.now() - localStartTime.value;
        }
      } else if (localStartTime.value) {
        // 普通节点：仅使用本地计时定格
        realtimeDurationMs.value = Date.now() - localStartTime.value;
      } else {
        // 既没有实时计时，也不是 metadata 节点（例如历史记录回显），尝试触发估算
        calculateEstimatedTime();
      }
      return;
    }

    // 3. 启动逻辑: 正在思考且有有效开始时间
    if (thinking && startTime && timerId.value === null) {
      const effectiveStartTime = startTime; // 闭包捕获
      timerId.value = window.setInterval(() => {
        realtimeDurationMs.value = Date.now() - effectiveStartTime;
      }, 100);
    }
  },
  { immediate: true }
);

onMounted(() => {
  isCollapsed.value = props.collapsedByDefault;
  // 组件挂载时，如果不是思考状态且没有实时时间，尝试估算
  if (!props.isThinking && realtimeDurationMs.value === null) {
    calculateEstimatedTime();
  }
});

onBeforeUnmount(() => {
  // 清理定时器
  if (timerId.value !== null) {
    clearInterval(timerId.value);
  }
});
</script>

<style scoped>
.llm-think-node {
  margin: 12px 0;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  background: var(--card-bg, rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(var(--ui-blur, 8px));
  overflow: hidden;
  transition: all 0.2s ease;
}

.llm-think-node:hover {
  border-color: var(--el-color-primary, #409eff);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.llm-think-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  user-select: none;
  background: var(--el-fill-color-lighter);
  transition: background 0.2s ease;
  cursor: pointer;
}

.llm-think-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  /* 移除 flex: 1，让它只占用必要空间，以便给 preview 留出空间 */
  flex-shrink: 0;
}

.llm-think-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary, #409eff);
  transition: transform 0.2s ease;
}

.llm-think-icon.is-expanded {
  transform: rotate(90deg);
}

.llm-think-label {
  font-size: 14px;
}

.llm-think-title .el-tag {
  font-family: "Monaco", "Consolas", monospace;
}

.thinking-time {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  font-family: "Monaco", "Consolas", monospace;
}

.think-preview {
  flex: 1;
  margin: 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "Monaco", "Consolas", monospace;
  animation: fadeIn 0.3s ease;
  user-select: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 0.6;
    transform: translateY(0);
  }
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
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: -1;
}

.action-btn:hover:not(:disabled) {
  color: var(--el-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.llm-think-content {
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
  animation: slideDown 0.2s ease;
}

.rendered-content {
  padding: 14px;
}

.raw-content {
  margin: 0;
  padding: 14px;
  font-family: "Monaco", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  background: var(--code-block-bg, var(--container-bg));
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
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

/* 思考中状态的扫光特效 */
.llm-think-node.is-thinking {
  position: relative;
  overflow: hidden;
}

.llm-think-node.is-thinking::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(64, 158, 255, 0.15) 50%, transparent);
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

/* 思考中指示器 */
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  animation: thinkingPulse 1.4s infinite ease-in-out;
}

.thinking-dot:nth-child(1) {
  animation-delay: 0s;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinkingPulse {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 思考中时的边框呼吸效果 */
.llm-think-node.is-thinking {
  animation: breathingBorder 2s infinite;
}

@keyframes breathingBorder {
  0%,
  100% {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 10px rgba(64, 158, 255, 0.2);
  }
  50% {
    border-color: var(--el-color-primary-light-3);
    box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  }
}

/* 确保内容在扫光效果之上 */
.llm-think-node.is-thinking .llm-think-header,
.llm-think-node.is-thinking .llm-think-content {
  position: relative;
  z-index: 2;
}
</style>
