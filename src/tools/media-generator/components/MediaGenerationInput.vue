<script setup lang="ts">
import { ref, watch, computed, toRef } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { useAssetManager } from "@/composables/useAssetManager";
import { useModelMetadata } from "@/composables/useModelMetadata";
import AttachmentCard from "../../llm-chat/components/AttachmentCard.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  Send,
  Image as ImageIcon,
  Info,
  Sparkles,
  Loader2,
  MessageSquare,
  Target,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleLogger } from "@/utils/logger";

const props = defineProps<{
  disabled?: boolean;
}>();

const logger = createModuleLogger("media-generator/MediaGenerationInput");

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();
const { startGeneration, isGenerating } = useMediaGenerationManager();
const { sendRequest } = useLlmRequest();
const assetManager = useAssetManager();
const { getMatchedProperties } = useModelMetadata();

// 监听模型切换，自动更新上下文开关
watch(
  () => {
    const mediaType = store.currentConfig.activeType;
    return store.currentConfig.types[mediaType].modelCombo;
  },
  (modelCombo) => {
    if (modelCombo) {
      const [_, modelId] = modelCombo.split(":");
      const props = getMatchedProperties(modelId);
      // 如果模型支持迭代微调，默认开启上下文
      if (props?.iterativeRefinement) {
        store.currentConfig.includeContext = true;
      }
    }
  },
  { immediate: true }
);

// 使用 store 中的状态，确保刷新保持
const prompt = toRef(store, "inputPrompt");
const containerRef = ref<HTMLElement>();

const isDisabled = computed(() => isGenerating.value || props.disabled);

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useFileInteraction({
  element: containerRef,
  sourceModule: "media-generator",
  pasteMode: "asset",
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths });
    let successCount = 0;
    for (const path of paths) {
      try {
        const asset = await assetManager.importAssetFromPath(path, {
          sourceModule: "media-generator",
          origin: {
            type: "local",
            source: "drag-and-drop",
            sourceModule: "media-generator",
          },
        });
        if (asset && inputManager.addAsset(asset)) {
          successCount++;
        }
      } catch (err) {
        logger.error("导入文件失败", err, { path });
      }
    }
    if (successCount > 0) {
      customMessage.success(`已添加 ${successCount} 个参考图`);
    }
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    const successCount = inputManager.addAssets(assets);
    if (successCount > 0) {
      customMessage.success(`已添加 ${successCount} 个参考图`);
    }
  },
  disabled: isDisabled,
});

const handleTriggerAttachment = async () => {
  try {
    const selected = await open({
      multiple: true,
      title: "选择参考图",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      let successCount = 0;
      for (const path of paths) {
        try {
          const asset = await assetManager.importAssetFromPath(path, {
            sourceModule: "media-generator",
            origin: {
              type: "local",
              source: "file-picker",
              sourceModule: "media-generator",
            },
          });
          if (asset && inputManager.addAsset(asset)) {
            successCount++;
          }
        } catch (err) {
          logger.error("导入文件失败", err, { path });
        }
      }
      if (successCount > 0) {
        customMessage.success(`已添加 ${successCount} 个参考图`);
      }
    }
  } catch (error) {
    customMessage.error("选择文件失败");
  }
};

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
  if (!prompt.value.trim()) {
    customMessage.warning("请先输入需要优化的提示词");
    return;
  }

  const config = store.settings.promptOptimization;
  const modelCombo = optimizeModelId.value || config.modelCombo;

  if (!modelCombo) {
    customMessage.warning("请先选择优化模型");
    return;
  }

  const [profileId, modelId] = modelCombo.split(":");
  if (!profileId || !modelId) {
    customMessage.warning("优化模型配置无效");
    return;
  }

  isOptimizing.value = true;
  optimizedResult.value = "";
  try {
    let finalPrompt = config.prompt.replace("{text}", prompt.value);
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
    prompt.value = optimizedResult.value;
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

const handleSend = async (e?: KeyboardEvent | MouseEvent) => {
  if (e instanceof KeyboardEvent && e.shiftKey) return; // Shift + Enter 换行

  if (!prompt.value.trim() && !store.hasAttachments) return;
  if (isGenerating.value) {
    customMessage.warning("正在生成中，请稍候...");
    return;
  }

  const mediaType = store.currentConfig.activeType;
  const { modelCombo, params } = store.currentConfig.types[mediaType];

  if (!modelCombo) {
    customMessage.warning("请先选择生成模型");
    return;
  }

  const [profileId, modelId] = modelCombo.split(":");
  const currentPrompt = prompt.value;
  const currentAttachments = [...store.attachments];

  prompt.value = "";
  store.clearAttachments();

  const options = {
    ...params,
    prompt: currentPrompt,
    modelId,
    profileId,
    attachments: currentAttachments,
    includeContext: store.currentConfig.includeContext,
    // 映射 UI 参数到 API 参数
    numInferenceSteps: params.steps,
    guidanceScale: params.cfgScale,
  };

  await startGeneration(options as any, mediaType);
};
</script>

<template>
  <div ref="containerRef" :class="['input-container', { 'dragging-over': isDraggingOver }]">
    <!-- 附件展示区 -->
    <div v-if="store.hasAttachments" class="attachments-area">
      <div class="attachments-list">
        <AttachmentCard
          v-for="asset in store.attachments"
          :key="asset.id"
          :asset="asset"
          :all-assets="store.attachments"
          :removable="true"
          size="small"
          @remove="store.removeAttachment(asset.id)"
        />
      </div>
    </div>

    <div class="input-main">
      <textarea
        v-model="prompt"
        class="native-textarea"
        placeholder="描述你想要生成的画面..."
        rows="1"
        :disabled="isDisabled"
        @keydown.enter.prevent="handleSend($event)"
        @input="
          (e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }
        "
      ></textarea>
    </div>

    <!-- 上下文提示区 -->
    <div
      v-if="store.currentConfig.includeContext && store.messages.length > 1"
      class="context-selection-area"
    >
      <div class="context-info">
        <span
          ><el-icon><History /></el-icon> 正在引用对话上下文</span
        >
        <span class="context-count">包含前 {{ store.messages.length - 1 }} 条消息</span>
      </div>
    </div>

    <div class="input-toolbar">
      <div class="toolbar-left">
        <el-tooltip content="开启后将携带历史对话上下文，支持多轮迭代生成" placement="top">
          <button
            class="tool-btn"
            :class="{ 'is-active': store.currentConfig.includeContext }"
            @click="store.currentConfig.includeContext = !store.currentConfig.includeContext"
          >
            <el-icon v-if="store.currentConfig.includeContext"><MessageSquare /></el-icon>
            <el-icon v-else><Target /></el-icon>
            <span>上下文</span>
          </button>
        </el-tooltip>
        <div class="v-divider" />
        <button
          class="tool-btn"
          :disabled="isDisabled"
          @click="handleTriggerAttachment"
          title="添加参考图"
        >
          <el-icon><ImageIcon /></el-icon>
          <span>参考图</span>
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
            <button class="tool-btn" :disabled="isDisabled" title="提示词优化">
              <el-icon :class="{ 'is-loading': isOptimizing }"><Sparkles /></el-icon>
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
                <el-button size="small" @click="optimizedResult = ''">重新生成</el-button>
                <el-button size="small" type="primary" @click="applyOptimizedPrompt">
                  确认并应用
                </el-button>
              </template>
            </div>
          </div>
        </el-popover>
      </div>

      <div class="toolbar-right">
        <button
          class="native-send-btn"
          :disabled="isDisabled || (!prompt.trim() && !store.hasAttachments)"
          @click="() => handleSend()"
        >
          <el-icon v-if="!isGenerating"><Send /></el-icon>
          <el-icon v-else class="is-loading"><Loader2 /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-container {
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 12px;
  padding-top: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-container.dragging-over {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 15px var(--el-color-primary-light-7);
  background-color: var(--el-color-primary-light-9);
  position: relative;
}

.input-container.dragging-over::after {
  content: "释放以添加参考图";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.05);
  color: var(--el-color-primary);
  font-size: 18px;
  font-weight: bold;
  pointer-events: none;
  z-index: 100;
  border-radius: inherit;
}

.input-container:focus-within {
  border-color: var(--el-color-primary);
  background-color: var(--card-bg);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.12);
}

.context-selection-area {
  padding: 4px 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 12px;
  margin-bottom: 4px;
}

.context-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-color-primary);
}

.context-count {
  font-weight: 600;
}

.attachments-area {
  padding: 8px;
  border-radius: 8px;
  background: var(--container-bg);
  border: 1px dashed var(--border-color);
  margin-bottom: 4px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

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
  gap: 4px;
  background: transparent;
  border: none;
  outline: none;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
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

.input-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.native-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--el-text-color-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 4px 8px;
  resize: none;
  min-height: 36px;
  max-height: 200px;
  box-shadow: none;
}

.native-textarea:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.native-send-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: var(--el-color-primary);
  color: white;
  border: none;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.native-send-btn:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-3);
  transform: translateY(-1px);
}

.native-send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.native-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: var(--el-text-color-disabled);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.is-loading {
  animation: spin 1s linear infinite;
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
