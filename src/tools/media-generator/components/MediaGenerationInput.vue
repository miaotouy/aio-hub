<script setup lang="ts">
import { ref, watch, computed, toRef } from "vue";
import { useElementSize } from "@vueuse/core";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { useAssetManager } from "@/composables/useAssetManager";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useInputResize } from "../composables/useInputResize";
import AttachmentCard from "@/tools/llm-chat/components/AttachmentCard.vue";
import MediaGenerationInputToolbar from "./MediaGenerationInputToolbar.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleLogger } from "@/utils/logger";

const props = defineProps<{
  disabled?: boolean;
}>();

const logger = createModuleLogger("media-generator/MediaGenerationInput");

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();
const { startGeneration, isGenerating, abort } = useMediaGenerationManager();
const assetManager = useAssetManager();
const { getMatchedProperties } = useModelMetadata();

const containerRef = ref<HTMLElement>();
const textareaRef = ref<HTMLTextAreaElement>();
const attachmentsContainerRef = ref<HTMLDivElement>();
const { height: attachmentsHeight } = useElementSize(attachmentsContainerRef);

const { editorHeight, editorMaxHeight, handleInputResizeStart, handleResizeDoubleClick, adjustHeight } = useInputResize(
  {
    textareaRef,
    extraHeight: attachmentsHeight,
  },
);

// 监听模型切换，自动更新上下文开关
watch(
  () => {
    const mediaType = store.currentConfig.activeType;
    return store.currentConfig.types[mediaType].modelCombo;
  },
  (modelCombo) => {
    if (modelCombo) {
      const [_, modelId] = parseModelCombo(modelCombo);
      const matchedProps = getMatchedProperties(modelId);
      // 如果模型支持迭代微调，默认开启上下文
      if (matchedProps?.iterativeRefinement) {
        store.currentConfig.includeContext = true;
      }
    }
  },
  { immediate: true },
);

// 使用 store 中的状态，确保刷新保持
const prompt = toRef(store, "inputPrompt");

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

const handleAbort = () => {
  abort();
  customMessage.info("已尝试中止生成任务");
};

const handleSend = async (e?: KeyboardEvent | MouseEvent) => {
  if (e instanceof KeyboardEvent) {
    // 强制使用 Ctrl + Enter 发送，单 Enter 换行
    if (!e.ctrlKey) return;
  }

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

  const [profileId, modelId] = parseModelCombo(modelCombo);
  const currentPrompt = prompt.value;
  const currentAttachments = [...store.attachments];

  prompt.value = "";

  const options = {
    ...params,
    prompt: currentPrompt,
    modelId,
    profileId,
    inputAttachments: currentAttachments,
    includeContext: store.currentConfig.includeContext,
    // 映射 UI 参数到 API 参数
    numInferenceSteps: params.steps,
    guidanceScale: params.cfgScale,
  };

  await startGeneration(options as any, mediaType);

  // 等节点创建完成后才清空附件
  store.clearAttachments();

  // 重置高度
  adjustHeight();
};
</script>

<template>
  <div ref="containerRef" :class="['input-container', { 'dragging-over': isDraggingOver }]">
    <!-- 调整高度手柄 - 在顶部 -->
    <div
      class="resize-handle"
      @mousedown="handleInputResizeStart"
      @dblclick="handleResizeDoubleClick"
      title="拖拽调整高度（双击重置）"
    ></div>

    <div class="input-main-area">
      <!-- 附件展示区 -->
      <div v-if="store.hasAttachments" ref="attachmentsContainerRef" class="attachments-area">
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
          ref="textareaRef"
          v-model="prompt"
          class="native-textarea"
          placeholder="描述你想要生成的画面..."
          :style="{
            height: editorHeight === 'auto' ? 'auto' : editorHeight + 'px',
            maxHeight: editorMaxHeight,
          }"
          :disabled="isDisabled"
          @keydown.enter.stop="
            (e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                handleSend(e);
              }
            }
          "
          @input="adjustHeight"
        ></textarea>
      </div>

      <MediaGenerationInputToolbar
        :disabled="isDisabled"
        :is-generating="isGenerating"
        :has-attachments="store.hasAttachments"
        :prompt-text="prompt"
        :include-context="store.currentConfig.includeContext"
        @update:include-context="store.currentConfig.includeContext = $event"
        @send="handleSend"
        @abort="handleAbort"
        @trigger-attachment="handleTriggerAttachment"
      />
    </div>
  </div>
</template>

<style scoped>
.input-container {
  position: relative;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 24px;
  padding: 12px;
  padding-top: 8px;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    box-shadow 0.3s;
  overflow: visible;
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.input-container.dragging-over {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 15px rgba(var(--el-color-primary-rgb), 0.2);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
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
  box-shadow: none;
  overflow-y: auto;
}

.native-textarea:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

/* 拖拽调整大小手柄 - 位于顶部 */
.resize-handle {
  position: absolute;
  top: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 94%;
  height: 6px;
  cursor: row-resize;
  z-index: 10;
  border-radius: 3px;
  transition: background-color 0.2s;
}

.resize-handle:hover {
  background-color: rgba(var(--el-color-primary-rgb), 0.3);
}
</style>
