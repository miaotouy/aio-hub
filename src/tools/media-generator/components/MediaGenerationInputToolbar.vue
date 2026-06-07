<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { isAudioOutputTaskType } from "../types";
import {
  Image as ImageIcon,
  Info,
  Music,
  Sparkles,
  MessageSquare,
  Target,
  Video,
} from "lucide-vue-next";
import type { ContextToggleMode } from "../utils/contextToggleUi";

const logger = createModuleLogger("media-generator/InputToolbar");

const props = defineProps<{
  disabled?: boolean;
  isGenerating: boolean;
  hasAttachments: boolean;
  promptText: string;
  includeContext: boolean;
  showContextToggle?: boolean;
  contextToggleLabel?: string;
  contextToggleTooltip?: string;
  contextToggleMode?: ContextToggleMode;
}>();

const emit = defineEmits<{
  (e: "update:includeContext", value: boolean): void;
  (e: "send"): void;
  (e: "abort"): void;
  (e: "trigger-attachment"): void;
}>();

const store = useMediaGenStore();
const { sendRequest } = useLlmRequest();

const attachmentButton = computed(() => {
  const activeType = store.currentConfig.activeType;
  const isAudioMode = isAudioOutputTaskType(activeType);
  const isVideoMode = activeType === "video";
  return {
    label: isVideoMode ? "参考素材" : isAudioMode ? "参考音频" : "参考图",
    title: isVideoMode
      ? "添加参考图、参考视频或参考音频"
      : isAudioMode
        ? "添加参考音频"
        : "添加参考图",
    isAudioMode,
    isVideoMode,
  };
});

const contextToggleLabel = computed(
  () => props.contextToggleLabel || "上下文"
);
const contextToggleTooltip = computed(
  () =>
    props.contextToggleTooltip ||
    "Chat / Responses 路由会携带历史消息；普通生成端点仅可把会话中上一轮结果作为参考输入"
);

// 提示词优化逻辑
const isOptimizing = ref(false);
const showOptimizePopover = ref(false);
const optimizedResult = ref("");
const optimizeModelId = ref("");
const optimizePrompt = ref("");

// 初始化优化配置
watch(
  () => store.settings.promptOptimization,
  (config) => {
    if (config) {
      optimizeModelId.value = config.modelCombo || "";
      optimizePrompt.value = "";
    }
  },
  { immediate: true }
);

const handleOptimizePrompt = async () => {
  if (!props.promptText.trim()) {
    customMessage.warning("请先输入需要优化的提示词");
    return;
  }

  const config = store.settings.promptOptimization;
  const modelCombo = optimizeModelId.value || config.modelCombo;

  if (!modelCombo) {
    customMessage.warning("请先选择优化模型");
    return;
  }

  const [profileId, modelId] = parseModelCombo(modelCombo);
  if (!profileId || !modelId) {
    customMessage.warning("优化模型配置无效");
    return;
  }

  isOptimizing.value = true;
  optimizedResult.value = "";
  try {
    let finalPrompt = config.prompt.replace("{text}", props.promptText);
    if (optimizePrompt.value.trim()) {
      finalPrompt += `\n\n附加要求：${optimizePrompt.value.trim()}`;
    }

    const response = await sendRequest({
      profileId,
      modelId,
      messages: [
        {
          role: "user",
          content: finalPrompt,
        },
      ],
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    if (response && response.content) {
      optimizedResult.value = response.content;
    }
  } catch (error) {
    logger.error("提示词优化失败", error);
    customMessage.error("提示词优化失败，请检查网络或模型配置");
  } finally {
    isOptimizing.value = false;
  }
};

const applyOptimizedPrompt = () => {
  if (optimizedResult.value) {
    store.inputPrompt = optimizedResult.value;
    showOptimizePopover.value = false;
    optimizedResult.value = "";
    optimizePrompt.value = "";
    customMessage.success("已应用优化后的提示词");
  }
};

const cancelOptimize = () => {
  showOptimizePopover.value = false;
  optimizedResult.value = "";
  optimizePrompt.value = "";
};
</script>

<template>
  <div class="input-toolbar">
    <div class="toolbar-left">
      <template v-if="props.showContextToggle !== false">
        <el-tooltip
          :content="contextToggleTooltip"
          placement="top"
        >
          <button
            class="tool-btn"
            :class="{ 'is-active': props.includeContext }"
            @click="emit('update:includeContext', !props.includeContext)"
          >
            <el-icon v-if="props.contextToggleMode === 'conversation'">
              <MessageSquare />
            </el-icon>
            <el-icon v-else><Target /></el-icon>
            <span>{{ contextToggleLabel }}</span>
          </button>
        </el-tooltip>
        <div class="v-divider" />
      </template>
      <button
        class="tool-btn"
        :disabled="props.disabled"
        @click="emit('trigger-attachment')"
        :title="attachmentButton.title"
      >
        <el-icon>
          <Music v-if="attachmentButton.isAudioMode" />
          <Video v-else-if="attachmentButton.isVideoMode" />
          <ImageIcon v-else />
        </el-icon>
        <span>{{ attachmentButton.label }}</span>
      </button>
      <div class="v-divider" />
      <el-popover
        v-model:visible="showOptimizePopover"
        placement="top-start"
        :width="460"
        trigger="click"
        popper-class="optimize-popover"
      >
        <template #reference>
          <button
            class="tool-btn"
            :disabled="props.disabled"
            title="提示词优化"
          >
            <el-icon :class="{ 'is-loading': isOptimizing }"
              ><Sparkles
            /></el-icon>
            <span>提示词优化</span>
          </button>
        </template>

        <div class="optimize-form">
          <div class="form-header">
            <el-icon><Sparkles /></el-icon>
            <span>提示词优化助手</span>
          </div>

          <div class="form-item">
            <label>优化模型</label>
            <LlmModelSelector
              v-model="optimizeModelId"
              placeholder="选择优化模型"
              :capabilities="{ embedding: false, rerank: false }"
              :teleported="true"
              popper-class="optimize-model-popper"
            />
          </div>

          <div class="form-item">
            <label>附加要求 (可选)</label>
            <el-input
              v-model="optimizePrompt"
              type="textarea"
              :rows="3"
              placeholder="输入额外的指令，例如：'增加赛博朋克风格' 或 '强调光影对比'..."
            />
          </div>

          <div v-if="optimizedResult" class="optimize-result">
            <label>优化结果</label>
            <div class="result-content">
              {{ optimizedResult }}
            </div>
          </div>

          <div class="form-tip">
            <el-icon><Info /></el-icon>
            <div class="tip-content">
              <p>优化将基于当前输入框中的内容进行扩展。</p>
            </div>
          </div>

          <div class="form-actions">
            <template v-if="!optimizedResult">
              <el-button size="small" @click="cancelOptimize">取消</el-button>
              <el-button
                size="small"
                type="primary"
                :loading="isOptimizing"
                @click="handleOptimizePrompt"
              >
                开始优化
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="optimizedResult = ''"
                >重新生成</el-button
              >
              <el-button
                size="small"
                type="primary"
                @click="applyOptimizedPrompt"
              >
                确认并应用
              </el-button>
            </template>
          </div>
        </div>
      </el-popover>
    </div>

    <div class="toolbar-right">
      <button
        v-if="!props.isGenerating"
        class="btn-send"
        :disabled="
          props.disabled || (!props.promptText.trim() && !props.hasAttachments)
        "
        @click="emit('send')"
        title="发送 (Ctrl + Enter)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      </button>
      <button v-else class="btn-abort" @click="emit('abort')" title="停止生成">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  border: none;
  outline: none;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: all 0.2s;
}

.tool-btn :deep(.el-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn span {
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.tool-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.v-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 2px;
  opacity: 0.5;
}

/* 发送按钮 - 对齐 MessageInputToolbar 样式 */
.btn-send,
.btn-abort {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send {
  background-color: var(--primary-color);
  color: white;
}

.btn-send:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  background-color: var(--error-color);
  color: white;
}

.btn-abort:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.is-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
/* 全局样式覆盖，用于优化弹窗 */
.optimize-popover {
  padding: 16px !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
}

.optimize-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.optimize-form .form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--el-color-primary);
  margin-bottom: 4px;
}

.optimize-form .form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.optimize-form .form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.optimize-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.optimize-result label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-success);
}

.result-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.form-tip {
  display: flex;
  gap: 8px;
  padding: 10px;
  background-color: var(--el-color-info-light-9);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
}

.form-tip .el-icon {
  font-size: 16px;
  margin-top: 2px;
}

.tip-content p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}
</style>
