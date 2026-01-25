<template>
  <BaseDialog
    v-model="localVisible"
    title="上下文分析器"
    width="90%"
    height="85vh"
    :close-on-backdrop-click="true"
    content-class="context-analyzer-dialog-content"
  >
    <template #content>
      <div v-if="loading" class="loading-container">
        <el-icon class="loading-icon" :size="32"><Loading /></el-icon>
        <p>正在分析上下文...</p>
      </div>

      <div v-else-if="error" class="error-container">
        <el-icon class="error-icon" :size="32"><WarningFilled /></el-icon>
        <p>{{ error }}</p>
      </div>
      <div v-else-if="contextData" class="analyzer-content">
        <el-tabs v-model="activeTab" class="analyzer-tabs">
          <el-tab-pane label="结构化视图" name="structured">
            <StructuredView :context-data="contextData" />
          </el-tab-pane>

          <el-tab-pane label="原始请求" name="raw">
            <RawRequestView :context-data="contextData" />
          </el-tab-pane>

          <el-tab-pane label="内容分析" name="analysis">
            <AnalysisChartView :context-data="contextData" :is-active="activeTab === 'analysis'" />
          </el-tab-pane>

          <el-tab-pane label="宏调试" name="macro">
            <MacroDebugView :context-data="contextData" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </template>

    <template #footer>
      <el-button @click="localVisible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Loading, WarningFilled } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import StructuredView from "./StructuredView.vue";
import RawRequestView from "./RawRequestView.vue";
import AnalysisChartView from "./AnalysisChartView.vue";
import MacroDebugView from "./MacroDebugView.vue";
import { useChatHandler, type ContextPreviewData } from "../../composables/chat/useChatHandler";
import type { ChatSession } from "../../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/context-analyzer-dialog");
const errorHandler = createModuleErrorHandler("llm-chat/context-analyzer-dialog");

const props = defineProps<{
  visible: boolean;
  nodeId: string | null;
  session: ChatSession | null;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const activeTab = ref<"structured" | "raw" | "analysis" | "macro">("structured");
const loading = ref(false);
const error = ref<string | null>(null);
const contextData = ref<ContextPreviewData | null>(null);

// 当对话框打开时，分析上下文
watch(
  () => props.visible,
  async (newVisible) => {
    if (newVisible && props.nodeId && props.session) {
      await analyzeContext();
    } else if (!newVisible) {
      // 关闭时重置状态
      contextData.value = null;
      error.value = null;
      activeTab.value = "structured";
    }
  },
  { immediate: true }
);

const analyzeContext = async () => {
  if (!props.nodeId || !props.session) {
    error.value = "缺少必要参数";
    return;
  }

  loading.value = true;
  error.value = null;
  contextData.value = null;

  try {
    const { getLlmContextForPreview } = useChatHandler();
    const node = props.session.nodes[props.nodeId];
    const historicalAgentId = node?.metadata?.agentId;

    if (!historicalAgentId) {
      logger.warn("在消息节点元数据中找不到 agentId，将回退到当前智能体", { nodeId: props.nodeId });
    }

    const result = await getLlmContextForPreview(props.session, props.nodeId, historicalAgentId);

    if (!result) {
      error.value = "无法生成上下文预览数据";
      logger.warn("上下文分析失败", { nodeId: props.nodeId });
      return;
    }

    contextData.value = result;
    logger.info("上下文分析成功", {
      nodeId: props.nodeId,
      totalChars: result.statistics.totalCharCount,
      messageCount: result.statistics.messageCount,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "分析上下文时发生错误";
    errorHandler.handle(err as Error, {
      userMessage: "上下文分析异常",
      context: { nodeId: props.nodeId },
      showToUser: false,
    });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 16px;
}

.loading-icon {
  animation: rotate 1s linear infinite;
  color: var(--el-color-primary);
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  color: var(--el-color-danger);
}
.analyzer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.analyzer-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
}

:deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
  flex: 1;
}

/* 移除 BaseDialog 默认的 content padding 和滚动 */
:deep(.context-analyzer-dialog-content) {
  padding: 0 !important;
  overflow: hidden !important;
}
</style>
