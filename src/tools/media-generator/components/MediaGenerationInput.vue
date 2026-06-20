<script setup lang="ts">
import { ref, watch, computed, toRef, nextTick } from "vue";
import { useElementSize } from "@vueuse/core";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { useAssetManager } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useInputResize } from "../composables/useInputResize";
import { useMiniMaxCoverWorkflow } from "../composables/useMiniMaxCoverWorkflow";
import AttachmentCard from "@/tools/llm-chat/components/AttachmentCard.vue";
import MediaGenerationInputToolbar from "./MediaGenerationInputToolbar.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleLogger } from "@/utils/logger";
import { getMediaContextToggleUi } from "../utils/contextToggleUi";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import type { Asset } from "@/types/asset-management";
import { isAudioOutputTaskType, type MediaTaskType } from "../types";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    mode?: "session" | "quick";
  }>(),
  {
    mode: "session",
  }
);

const emit = defineEmits<{
  (e: "send", options: any, mediaType: string): void;
}>();

const logger = createModuleLogger("media-generator/MediaGenerationInput");

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();
const { isGenerating, abort } = useMediaGenerationManager();
const { ensureTwoStepReady } = useMiniMaxCoverWorkflow();
const assetManager = useAssetManager();
const { getProfileById, saveProfile } = useLlmProfiles();

const currentTypeConfig = computed(
  () => store.currentConfig.types[store.currentConfig.activeType]
);

const containerRef = ref<HTMLElement>();
const textareaRef = ref<HTMLTextAreaElement>();
const attachmentsContainerRef = ref<HTMLDivElement>();
const { height: attachmentsHeight } = useElementSize(attachmentsContainerRef);

const {
  editorHeight,
  editorMaxHeight,
  handleInputResizeStart,
  handleResizeDoubleClick,
  adjustHeight,
} = useInputResize({
  textareaRef,
  extraHeight: attachmentsHeight,
});

const resolveSelectedModelInfo = (
  mediaType: MediaTaskType = store.currentConfig.activeType
) => {
  const modelCombo = store.currentConfig.types[mediaType].modelCombo;
  if (!modelCombo) return null;

  const [profileId, modelId] = parseModelCombo(modelCombo);
  const profile = getProfileById(profileId);
  const model = profile?.models.find((item) => item.id === modelId);

  return { profile, model };
};

const getIncludeContextDefault = (
  profile: LlmProfile | undefined,
  model: LlmModelInfo | undefined,
  mediaType: MediaTaskType
) => {
  const supportsConversation =
    profile?.type === "openai-responses" ||
    model?.capabilities?.preferChat === true;
  if (!getMediaContextToggleUi(mediaType, supportsConversation).visible) {
    return false;
  }

  const iterativeRefinement = model?.capabilities?.iterativeRefinement;
  return iterativeRefinement !== undefined
    ? iterativeRefinement
    : supportsConversation;
};

const updateIncludeContext = async (value: boolean) => {
  currentTypeConfig.value.includeContext = value;
  store.currentConfig.includeContext = value;

  const info = resolveSelectedModelInfo();
  if (!info?.profile || !info.model) return;

  if (!info.model.capabilities) info.model.capabilities = {};
  info.model.capabilities.iterativeRefinement = value;

  try {
    await saveProfile(JSON.parse(JSON.stringify(info.profile)));
  } catch (error) {
    logger.error("保存上下文开关到模型配置失败", error);
    customMessage.error("保存上下文开关失败");
  }
};

const getIncludeContextForType = (mediaType: MediaTaskType) => {
  const typeConfig = store.currentConfig.types[mediaType];
  const info = resolveSelectedModelInfo(mediaType);
  const supportsConversation =
    info?.profile?.type === "openai-responses" ||
    info?.model?.capabilities?.preferChat === true;
  if (!getMediaContextToggleUi(mediaType, supportsConversation).visible) {
    return false;
  }

  if (typeConfig.includeContext !== undefined) {
    return typeConfig.includeContext;
  }

  return getIncludeContextDefault(info?.profile, info?.model, mediaType);
};

// 切换媒体类型时恢复该类型保存的上下文开关；不把类型切换当成模型切换。
watch(
  () => {
    const mediaType = store.currentConfig.activeType;
    return [
      mediaType,
      store.currentConfig.types[mediaType].modelCombo,
    ] as const;
  },
  ([mediaType]) => {
    const typeConfig = store.currentConfig.types[mediaType];
    const includeContext = getIncludeContextForType(mediaType);
    typeConfig.includeContext = includeContext;
    store.currentConfig.includeContext = typeConfig.includeContext ?? false;
  },
  { immediate: true }
);

// 使用 store 中的状态，确保刷新保持
const prompt = toRef(store, "inputPrompt");

watch(prompt, () => {
  nextTick(adjustHeight);
});

const isDisabled = computed(() => isGenerating.value || props.disabled);

const selectedProviderType = computed(() => {
  const mediaType = store.currentConfig.activeType;
  const modelCombo = store.currentConfig.types[mediaType]?.modelCombo;
  if (!modelCombo) return "";
  const [profileId] = parseModelCombo(modelCombo);
  return getProfileById(profileId)?.type || "";
});

const isMiniMaxMusic = computed(
  () =>
    store.currentConfig.activeType === "music" &&
    selectedProviderType.value === "minimax-music"
);

const selectedMiniMaxModelId = computed(() => {
  if (!isMiniMaxMusic.value) return "";
  return resolveSelectedModelInfo("music")?.model?.id || "";
});

const isMiniMaxCoverModel = computed(() =>
  selectedMiniMaxModelId.value.startsWith("music-cover")
);

const supportsConversationalContext = computed(() => {
  const info = resolveSelectedModelInfo();
  return (
    info?.profile?.type === "openai-responses" ||
    info?.model?.capabilities?.preferChat === true
  );
});

const contextToggleUi = computed(() =>
  getMediaContextToggleUi(
    store.currentConfig.activeType,
    supportsConversationalContext.value
  )
);

type ReferenceAttachmentKind = "image" | "audio" | "media";

const referenceAttachmentConfig = computed(() => {
  const activeType = store.currentConfig.activeType;
  const isAudioMode = isAudioOutputTaskType(activeType);
  const isVideoMode = activeType === "video";

  if (isVideoMode) {
    return {
      kind: "media" as ReferenceAttachmentKind,
      label: "参考素材",
      supportedLabel: "参考图、参考视频或参考音频",
      pickerTitle: "选择参考图、参考视频或参考音频",
      dragText: "释放以添加参考素材",
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
        {
          name: "Videos",
          extensions: ["mp4", "mov", "webm", "mkv", "avi"],
        },
        {
          name: "Audio",
          extensions: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"],
        },
      ],
    };
  }

  return {
    kind: (isAudioMode ? "audio" : "image") as ReferenceAttachmentKind,
    label: isAudioMode ? "参考音频" : "参考图",
    supportedLabel: isAudioMode ? "参考音频" : "参考图",
    pickerTitle: isAudioMode ? "选择参考音频" : "选择参考图",
    dragText: isAudioMode ? "释放以添加参考音频" : "释放以添加参考图",
    filters: [
      isAudioMode
        ? {
            name: "Audio",
            extensions: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"],
          }
        : {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
    ],
  };
});

const isAllowedReferenceAsset = (asset: Asset) => {
  if (referenceAttachmentConfig.value.kind === "media") {
    return (
      asset.type === "image" ||
      asset.type === "video" ||
      asset.type === "audio" ||
      asset.mimeType?.startsWith("image/") ||
      asset.mimeType?.startsWith("video/") ||
      asset.mimeType?.startsWith("audio/")
    );
  }
  if (referenceAttachmentConfig.value.kind === "audio") {
    return asset.type === "audio" || asset.mimeType?.startsWith("audio/");
  }
  return asset.type === "image" || asset.mimeType?.startsWith("image/");
};

const addReferenceAsset = (asset: Asset) => {
  if (!isAllowedReferenceAsset(asset)) return "unsupported";
  return inputManager.addAsset(asset) ? "added" : "ignored";
};

const showReferenceImportResult = (successCount: number, skippedCount = 0) => {
  const { label, supportedLabel } = referenceAttachmentConfig.value;
  if (successCount > 0) {
    customMessage.success(`已添加 ${successCount} 个${label}`);
  }
  if (skippedCount > 0) {
    customMessage.warning(
      `已跳过 ${skippedCount} 个不支持的文件，当前模式仅支持${supportedLabel}`
    );
  }
};

const promptPlaceholder = computed(() => {
  const mediaType = store.currentConfig.activeType;
  const params = store.currentConfig.types[mediaType]?.params || {};

  if (mediaType === "image") return "描述你想要生成的画面...";
  if (mediaType === "video") return "描述你想要生成的视频...";

  if (mediaType === "music") {
    if (isMiniMaxMusic.value) {
      if (isMiniMaxCoverModel.value) return "描述翻唱风格，并添加参考音频...";
      if (params.minimax_music_mode === "instrumental")
        return "描述纯音乐风格、情绪和场景...";
      if (params.lyrics_source === "manual")
        return "描述编曲、演唱风格和情绪...";
      return "描述歌曲风格、情绪和场景...";
    }
    return params.suno_mode === "custom"
      ? "输入歌词..."
      : "描述你想要生成的歌曲...";
  }
  if (mediaType === "speech") return "输入要合成语音的文本...";

  return "输入生成提示词...";
});

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useFileInteraction({
  element: containerRef,
  sourceModule: "media-generator",
  pasteMode: "asset",
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths });
    let successCount = 0;
    let skippedCount = 0;
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
        if (asset) {
          const result = addReferenceAsset(asset);
          if (result === "added") successCount++;
          if (result === "unsupported") skippedCount++;
        }
      } catch (err) {
        logger.error("导入文件失败", err, { path });
      }
    }
    showReferenceImportResult(successCount, skippedCount);
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    let successCount = 0;
    let skippedCount = 0;
    for (const asset of assets) {
      const result = addReferenceAsset(asset);
      if (result === "added") successCount++;
      if (result === "unsupported") skippedCount++;
    }
    showReferenceImportResult(successCount, skippedCount);
  },
  disabled: isDisabled,
});

const handleTriggerAttachment = async () => {
  try {
    const { pickerTitle, filters } = referenceAttachmentConfig.value;
    const selected = await open({
      multiple: true,
      title: pickerTitle,
      filters: [...filters],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      let successCount = 0;
      let skippedCount = 0;
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
          if (asset) {
            const result = addReferenceAsset(asset);
            if (result === "added") successCount++;
            if (result === "unsupported") skippedCount++;
          }
        } catch (err) {
          logger.error("导入文件失败", err, { path });
        }
      }
      showReferenceImportResult(successCount, skippedCount);
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

  try {
    ensureTwoStepReady();
  } catch (error) {
    customMessage.warning(
      error instanceof Error ? error.message : String(error)
    );
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

  if (props.mode === "quick") {
    emit("send", options, mediaType);
  } else {
    await store.submitTaskInSession(options, mediaType);
  }

  // 清空附件
  store.clearAttachments();

  // 重置高度
  adjustHeight();
};
</script>

<template>
  <div
    ref="containerRef"
    :class="['input-container', { 'dragging-over': isDraggingOver }]"
    :data-drag-text="referenceAttachmentConfig.dragText"
  >
    <!-- 调整高度手柄 - 在顶部 -->
    <div
      class="resize-handle"
      @mousedown="handleInputResizeStart"
      @dblclick="handleResizeDoubleClick"
      title="拖拽调整高度（双击重置）"
    ></div>

    <div class="input-main-area">
      <!-- 附件展示区 -->
      <div
        v-if="store.hasAttachments"
        ref="attachmentsContainerRef"
        class="attachments-area"
      >
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
          :placeholder="promptPlaceholder"
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
        :include-context="
          props.mode === 'session' ? store.currentConfig.includeContext : false
        "
        :show-context-toggle="
          props.mode === 'session' && contextToggleUi.visible
        "
        :context-toggle-label="contextToggleUi.toolbarLabel"
        :context-toggle-tooltip="contextToggleUi.tooltip"
        :context-toggle-mode="contextToggleUi.mode"
        @update:include-context="updateIncludeContext"
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
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
  content: attr(data-drag-text);
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
