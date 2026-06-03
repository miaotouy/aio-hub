<script setup lang="ts">
import { ElTooltip, ElPopover } from "element-plus";
import { AtSign, X, Sparkles, Brush } from "lucide-vue-next";
import { ref } from "vue";
import MiniCanvasControl from "../MiniCanvasControl.vue";
import type { ContextPreviewData } from "../../../types/context";
import { useAgentStore } from "../../../stores/agentStore";
import { useMessageInputStore } from "../../../stores/messageInputStore";
import { DEFAULT_TOOL_CALL_CONFIG } from "../../../types/agent";

const props = defineProps<{
  isDetached?: boolean;
  isCanvasEnabled: boolean;
  canvasBindingInfo: { id: string; name: string } | null;
  hasCanvasPendingChanges: boolean;
  contextStats: ContextPreviewData["statistics"] | null;
}>();

const emit = defineEmits<{
  (e: "canvas-visible-change", visible: boolean): void;
}>();

const canvasControlVisible = ref(false);
const agentStore = useAgentStore();
const inputStore = useMessageInputStore();

const unbindCanvas = () => {
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  if (!agent) return;
  if (!agent.toolCallConfig) {
    agent.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (!agent.toolCallConfig!.toolSettings) {
    agent.toolCallConfig!.toolSettings = {};
  }
  agent.toolCallConfig!.toolSettings!["web-canvas"] = { canvasId: null };
  agentStore.persistAgent(agent);
};

const onCanvasVisibleChange = (val: boolean) => {
  canvasControlVisible.value = val;
  emit("canvas-visible-change", val);
};
</script>

<template>
  <!-- 续写模型 -->
  <el-tooltip
    v-if="inputStore.continuationModelInfo"
    :content="`续写模型: ${inputStore.continuationModelInfo.profileName} - ${inputStore.continuationModelInfo.modelName}`"
    placement="top"
    :show-after="500"
  >
    <div class="temporary-model-indicator continuation-model">
      <Sparkles :size="14" />
      <span class="model-name">{{
        inputStore.continuationModelInfo.modelName
      }}</span>
      <button class="clear-btn" @click="inputStore.clearContinuationModel()">
        <X :size="14" />
      </button>
    </div>
  </el-tooltip>

  <!-- 临时模型 -->
  <el-tooltip
    v-if="inputStore.temporaryModelInfo"
    :content="`临时模型: ${inputStore.temporaryModelInfo.profileName} - ${inputStore.temporaryModelInfo.modelName}`"
    placement="top"
    :show-after="500"
  >
    <div class="temporary-model-indicator">
      <AtSign :size="14" />
      <span class="model-name">{{
        inputStore.temporaryModelInfo.modelName
      }}</span>
      <button class="clear-btn" @click="inputStore.clearTemporaryModel()">
        <X :size="14" />
      </button>
    </div>
  </el-tooltip>

  <!-- 画布状态胶囊 -->
  <el-tooltip
    v-if="props.isCanvasEnabled"
    :content="
      props.canvasBindingInfo
        ? `当前绑定画布: ${props.canvasBindingInfo.name} (点击管理)`
        : '画布未绑定 (点击管理)'
    "
    placement="top"
    :show-after="500"
  >
    <div>
      <el-popover
        v-model:visible="canvasControlVisible"
        :placement="props.isDetached ? 'bottom-end' : 'top-end'"
        :width="320"
        trigger="click"
        :popper-class="[
          'canvas-control-popover',
          { 'detached-popover': props.isDetached },
        ]"
        @show="onCanvasVisibleChange(true)"
        @hide="onCanvasVisibleChange(false)"
      >
        <template #reference>
          <div
            class="temporary-model-indicator canvas-indicator"
            :class="{
              'has-pending': props.hasCanvasPendingChanges,
              'is-unbound': !props.canvasBindingInfo,
              'is-active': canvasControlVisible,
            }"
          >
            <Brush :size="14" />
            <span class="model-name">
              {{
                props.canvasBindingInfo
                  ? props.canvasBindingInfo.name
                  : "未绑定"
              }}
            </span>
            <div
              v-if="props.hasCanvasPendingChanges"
              class="pending-pulse"
            ></div>
            <button
              v-if="props.canvasBindingInfo"
              class="clear-btn"
              @click.stop="unbindCanvas"
            >
              <X :size="14" />
            </button>
          </div>
        </template>
        <div v-if="canvasControlVisible"><MiniCanvasControl /></div>
      </el-popover>
    </div>
  </el-tooltip>

  <!-- 历史上下文统计 -->
  <el-tooltip
    v-if="
      inputStore.settings.showTokenUsage &&
      props.contextStats &&
      props.contextStats.totalTokenCount !== undefined
    "
    placement="top"
    :show-after="500"
  >
    <template #content>
      <div style="text-align: left; line-height: 1.6">
        <div style="font-weight: 600; margin-bottom: 4px">历史上下文统计</div>
        <div style="font-size: 12px">
          <div>
            总计:
            {{ props.contextStats.totalTokenCount.toLocaleString() }} tokens
          </div>
          <div v-if="props.contextStats.presetMessagesTokenCount">
            预设消息:
            {{ props.contextStats.presetMessagesTokenCount.toLocaleString() }}
            tokens
          </div>
          <div v-if="props.contextStats.worldbookTokenCount">
            世界书:
            {{ props.contextStats.worldbookTokenCount.toLocaleString() }} tokens
          </div>
          <div v-if="props.contextStats.chatHistoryTokenCount">
            会话历史:
            {{ props.contextStats.chatHistoryTokenCount.toLocaleString() }}
            tokens
          </div>
          <div v-if="props.contextStats.postProcessingTokenCount">
            后处理:
            {{ props.contextStats.postProcessingTokenCount.toLocaleString() }}
            tokens
          </div>
          <div
            v-if="props.contextStats.truncatedMessageCount"
            style="color: var(--el-color-warning); margin-top: 2px"
          >
            已截断: {{ props.contextStats.truncatedMessageCount }} 条消息
            <span v-if="props.contextStats.savedTokenCount">
              (省
              {{ props.contextStats.savedTokenCount.toLocaleString() }} tokens)
            </span>
          </div>
          <div
            v-if="props.contextStats.tokenizerName"
            style="margin-top: 4px; opacity: 0.8"
          >
            {{ props.contextStats.isEstimated ? "字符估算" : "Token 计算" }}
            - {{ props.contextStats.tokenizerName }}
          </div>
        </div>
      </div> </template
    ><span class="token-count context-total">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="margin-right: 4px"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path
          d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        ></path>
      </svg>
      <span
        >{{ props.contextStats.totalTokenCount.toLocaleString()
        }}{{ props.contextStats.isEstimated ? "~" : "" }}</span
      >
    </span>
  </el-tooltip>

  <!-- 当前输入 Token 计数 -->
  <el-tooltip
    v-if="
      inputStore.settings.showTokenUsage &&
      (inputStore.tokenCount > 0 || inputStore.isCalculatingTokens)
    "
    :content="
      inputStore.tokenEstimated
        ? '当前输入 Token 数量（估算值）'
        : '当前输入 Token 数量'
    "
    placement="top"
    :show-after="500"
  >
    <span class="token-count input-tokens">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="margin-right: 4px"
      >
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
      <span
        >{{ inputStore.tokenCount.toLocaleString()
        }}{{ inputStore.tokenEstimated ? "~" : "" }}</span
      >
    </span>
  </el-tooltip>
</template>

<style scoped>
.token-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-variant-numeric: tabular-nums;
  user-select: none;
  cursor: help;
}

.token-count svg {
  flex-shrink: 0;
}

.token-count.context-total {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 10%, transparent),
    color-mix(in srgb, var(--el-color-primary) 5%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  color: var(--el-color-primary);
  font-weight: 500;
}

.token-count.input-tokens {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 10%, transparent),
    color-mix(in srgb, var(--el-color-success) 5%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--el-color-success) 30%, transparent);
  color: var(--el-color-success);
  font-weight: 500;
}

.temporary-model-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 500;
}

.temporary-model-indicator .model-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.temporary-model-indicator .clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.temporary-model-indicator .clear-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.continuation-model {
  background: var(--el-color-warning-light-9) !important;
  color: var(--el-color-warning) !important;
}

.continuation-model .clear-btn {
  color: var(--el-color-warning) !important;
}

.canvas-indicator {
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}

.canvas-indicator:hover {
  background: rgba(var(--el-color-primary-rgb), 0.2);
  transform: translateY(-1px);
}

.canvas-indicator.has-pending {
  border-color: var(--el-color-warning);
  color: var(--el-color-warning);
  background: rgba(var(--el-color-warning-rgb), 0.1);
}

.canvas-indicator.has-pending .clear-btn {
  color: var(--el-color-warning) !important;
}

.canvas-indicator.is-unbound {
  opacity: 0.6;
  border-style: dashed;
  background: transparent;
}

.canvas-indicator.is-active {
  border-color: var(--primary-color);
  background: rgba(var(--el-color-primary-rgb), 0.2);
}

.pending-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-warning);
  box-shadow: 0 0 0 rgba(var(--el-color-warning-rgb), 0.4);
  animation: pulse-dot 2s infinite;
  margin: 0 2px;
}

@keyframes pulse-dot {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--el-color-warning-rgb), 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(var(--el-color-warning-rgb), 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--el-color-warning-rgb), 0);
  }
}
</style>
