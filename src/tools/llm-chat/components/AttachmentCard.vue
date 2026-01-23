<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ElTooltip, ElDropdown, ElDropdownMenu, ElDropdownItem } from "element-plus";
import {
  Play,
  FileText,
  AlertCircle,
  FilePenLine,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import type { Asset } from "@/types/asset-management";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import { generateVideoThumbnail } from "@/utils/mediaThumbnailUtils";

const logger = createModuleLogger("AttachmentCard");
const errorHandler = createModuleErrorHandler("AttachmentCard");

interface Props {
  asset: Asset;
  removable?: boolean;
  size?: "small" | "medium" | "large" | "extra-large";
  /** 所有附件列表，用于图片预览时的图片切换 */
  allAssets?: Asset[];
  /** Token 计数 */
  tokenCount?: number;
  /** 是否为估算值 */
  tokenEstimated?: boolean;
  /** Token 计算错误信息 */
  tokenError?: string;
  /** 是否将使用转写 */
  willUseTranscription?: boolean;
}

interface Emits {
  (e: "remove", asset: Asset): void;
  (e: "preview-document", asset: Asset): void;
}

const props = withDefaults(defineProps<Props>(), {
  removable: true,
  size: "medium",
});

const emit = defineEmits<Emits>();

const { show: showImage } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { previewPlaylist: previewAudioPlaylist } = useAudioViewer();
const transcriptionViewer = useTranscriptionViewer();
const { saveAssetThumbnail } = useAssetManager();
const {
  tasks,
  getTranscriptionStatus,
  getTranscriptionText,
  retryTranscription,
  cancelTranscription,
  updateTranscriptionContent,
  addTask,
} = useTranscriptionManager();

const internalAsset = ref<Asset>(props.asset);

watch(
  () => props.asset,
  async (newAsset, oldAsset) => {
    // 1. 如果 ID 变了，必须去后端取最新的，因为 metadata 肯定不通用
    if (newAsset.id !== oldAsset?.id) {
      const latestAsset = await assetManagerEngine.getAssetById(newAsset.id);
      if (latestAsset) {
        internalAsset.value = latestAsset;
      } else {
        logger.debug("无法立即获取资产信息 (可能是新资产)，临时使用 props", { assetId: newAsset.id });
        internalAsset.value = newAsset;
      }
      return;
    }

    // 2. 如果 ID 没变，但 newAsset 对象引用变了（说明父组件同步了新对象）
    if (newAsset !== internalAsset.value) {
      // 只要新对象含有转写路径，或者旧对象没有而新对象有（即状态升级），就同步
      const newPath = newAsset.metadata?.derived?.transcription?.path;
      if (newPath || (newAsset.metadata && !internalAsset.value.metadata)) {
        internalAsset.value = newAsset;
      }
    }
  },
  { immediate: true, deep: false }
);

const assetUrl = ref<string>("");
const isLoadingUrl = ref(true);
const loadError = ref(false);
const basePath = ref<string>("");
const showDocumentPreview = ref(false);

// 预览文件的路径
const previewFilePath = computed(() => {
  const isPending =
    props.asset.importStatus === "pending" || props.asset.importStatus === "importing";
  return isPending ? props.asset.originalPath || props.asset.path : props.asset.path;
});

// 格式化文件大小
const formattedSize = computed(() => {
  const bytes = props.asset.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
});

// 是否为图片类型
const isImage = computed(() => props.asset.type === "image");
// 是否为视频类型
const isVideo = computed(() => props.asset.type === "video");
// 是否为音频类型
const isAudio = computed(() => props.asset.type === "audio");

// 是否应该使用长条形式（非图片类型都用长条）
const isBarLayout = computed(() => !isImage.value);

// 是否为文档类型（可以点击预览）
const isDocument = computed(() => props.asset.type === "document");

// 获取文件后缀名
const fileExtension = computed(() => {
  const name = props.asset.name;
  const index = name.lastIndexOf(".");
  if (index === -1) return "";
  return name.slice(index + 1).toUpperCase();
});

// 强制依赖 tasks.length，确保任何任务变动都能触发重新计算
const transcriptionStatus = computed(() => {
  void tasks.value.length; // 访问属性以建立依赖
  return getTranscriptionStatus(internalAsset.value);
});

const isTranscribable = computed(
  () => props.asset.type === "image" || props.asset.type === "audio" || props.asset.type === "video"
);

// 判断当前模型是否需要使用转写（模型不支持该媒体类型时需要转写）
// 优先使用 prop，如果未提供则为 undefined
const willUseTranscription = computed(() => props.willUseTranscription);

// 判断是否为硬错误（真正的错误 vs 有转写可用的提示）
const isHardTokenError = computed(() => {
  if (!props.tokenError) return false;
  // 如果错误信息包含"转写内容可用"，则不是硬错误
  return !props.tokenError.includes("转写内容可用");
});

const transcriptionStatusText = computed(() => {
  const status = transcriptionStatus.value;
  const willUse = willUseTranscription.value;

  // 正在导入文件
  if (isImporting.value) {
    return "正在上传/处理文件资产...";
  }

  // 如果父组件未提供 willUseTranscription 信息，则显示通用提示
  if (willUse === undefined) {
    switch (status) {
      case "pending":
        return "等待转写...";
      case "processing":
        return "正在转写...";
      case "success":
        return "转写完成 (点击查看/编辑)";
      case "warning":
        return "转写完成但内容为空 (点击查看/编辑)";
      case "error":
        return "转写失败 (点击重试)";
      case "none":
        return "点击开始转写";
      default:
        return "";
    }
  }

  // 父组件提供了 willUseTranscription 信息
  switch (status) {
    case "pending":
      return "等待转写...";
    case "processing":
      return "正在转写...";
    case "success":
      return willUse
        ? "转写完成，将作为文本发送 (点击查看/编辑)"
        : "已有转写，但当前模型支持直接处理 (点击查看/编辑)";
    case "warning":
      return "转写完成但内容为空 (点击查看/编辑)";
    case "error":
      return "转写失败 (点击重试)";
    case "none":
      return willUse ? "需要转写，点击开始" : "当前模型支持直接处理，无需转写";
    default:
      return "";
  }
});

const handleTranscriptionClick = async (e: Event) => {
  e.stopPropagation();

  if (isImporting.value) {
    customMessage.info("请等待文件上传完成后再开始转写");
    return;
  }

  if (transcriptionStatus.value === "success" || transcriptionStatus.value === "warning") {
    const text = await getTranscriptionText(internalAsset.value);
    transcriptionViewer.show({
      asset: internalAsset.value,
      initialContent: text || "",
      onSave: async (content) => {
        await updateTranscriptionContent(internalAsset.value, content);
        customMessage.success("转写内容已更新");
        transcriptionViewer.close();
      },
      onRegenerate: (payload) => {
        retryTranscription(internalAsset.value, {
          modelId: payload.modelId,
          additionalPrompt: payload.prompt,
          enableRepetitionDetection: payload.enableRepetitionDetection,
        });
        transcriptionViewer.close();
      },
    });
  } else if (transcriptionStatus.value === "error") {
    retryTranscription(internalAsset.value);
  } else if (transcriptionStatus.value === "none") {
    addTask(internalAsset.value);
  }
};

// 加载资产 URL
const loadAssetUrl = async () => {
  isLoadingUrl.value = true;
  loadError.value = false;
  try {
    // 判断是否为 pending/importing 状态
    const isPending =
      props.asset.importStatus === "pending" || props.asset.importStatus === "importing";

    if (!basePath.value && !isPending) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }

    if (isPending) {
      // pending 状态
      const originalPath = props.asset.originalPath || props.asset.path;
      if (!originalPath) throw new Error("缺少原始路径");

      // 如果是 blob URL，直接使用，不需要转换
      const fileUrl = originalPath.startsWith("blob:")
        ? originalPath
        : convertFileSrc(originalPath);

      if (isVideo.value) {
        // 视频：尝试生成预览
        assetUrl.value = await generateVideoThumbnail(fileUrl);
      } else if (isImage.value) {
        // 图片：直接使用文件 URL
        assetUrl.value = fileUrl;
      } else {
        // 音频或其他：暂时显示图标，等待后端处理完成
        assetUrl.value = "";
      }
    } else {
      // 已导入状态
      if (props.asset.thumbnailPath) {
        // 有缩略图（图片、音频、或者后端生成的视频缩略图）
        assetUrl.value = assetManagerEngine.convertToAssetProtocol(
          props.asset.thumbnailPath,
          basePath.value
        );
      } else if (isImage.value) {
        // 图片本身
        assetUrl.value = assetManagerEngine.convertToAssetProtocol(
          props.asset.path,
          basePath.value
        );
      } else if (isVideo.value) {
        // 视频且无缩略图：前端动态生成并保存
        const videoPathUrl = assetManagerEngine.convertToAssetProtocol(
          props.asset.path,
          basePath.value
        );
        try {
          const base64 = await generateVideoThumbnail(videoPathUrl);
          assetUrl.value = base64;
          // 异步保存到后端
          saveAssetThumbnail(props.asset.id, base64).catch((err) => {
            logger.warn("保存视频缩略图失败", { error: err, assetId: props.asset.id });
          });
        } catch (e) {
          logger.warn("生成视频缩略图失败", { error: e, asset: props.asset });
        }
      } else {
        // 其他情况（如没有封面的音频），不设置 assetUrl，使用默认图标
        assetUrl.value = "";
      }
    }
  } catch (error) {
    logger.warn("加载资产预览失败", { error, asset: props.asset });
    // 不设置 loadError，这样会显示默认图标而不是错误图标
    assetUrl.value = "";
  }

  isLoadingUrl.value = false;
};

// 是否正在导入
const isImporting = computed(
  () => props.asset.importStatus === "pending" || props.asset.importStatus === "importing"
);

// 是否导入失败
const hasImportError = computed(() => props.asset.importStatus === "error");

// 处理点击预览
const handlePreview = async () => {
  // 图片类型：打开图片查看器
  if (isImage.value) {
    await handleImagePreview();
    return;
  }

  // 视频类型：打开视频预览
  if (isVideo.value) {
    // 传入当前缩略图作为 poster，提升体验
    previewVideo(props.asset, { poster: assetUrl.value });
    return;
  }

  // 音频类型：打开音频预览
  if (isAudio.value) {
    await handleAudioPreview();
    return;
  }

  // 文档类型：打开预览对话框
  if (isDocument.value) {
    showDocumentPreview.value = true;
    return;
  }
};

// 处理音频预览
const handleAudioPreview = async () => {
  try {
    // 获取所有音频类型的附件
    const allAssets = props.allAssets || [props.asset];
    const audioAssets = allAssets.filter((asset) => asset.type === "audio");

    // 查找当前音频在音频列表中的索引
    const currentIndex = audioAssets.findIndex((asset) => asset.id === props.asset.id);

    // 传递音频数组和当前索引给音频查看器
    await previewAudioPlaylist(audioAssets, currentIndex >= 0 ? currentIndex : 0);
  } catch (error) {
    errorHandler.error(error, "打开音频预览失败");
  }
};

// 处理图片预览
const handleImagePreview = async () => {
  try {
    // 获取所有图片类型的附件
    const allAssets = props.allAssets || [props.asset];
    const imageAssets = allAssets.filter((asset) => asset.type === "image");

    // 查找当前图片在图片列表中的索引
    const currentIndex = imageAssets.findIndex((asset) => asset.id === props.asset.id);

    // 确保有 basePath
    if (!basePath.value) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }

    // 为所有图片生成 URL
    const imageUrls: string[] = [];
    for (const imageAsset of imageAssets) {
      const isPending =
        imageAsset.importStatus === "pending" || imageAsset.importStatus === "importing";

      if (isPending) {
        // pending 状态：使用 convertFileSrc 创建 URL
        const originalPath = imageAsset.originalPath || imageAsset.path;
        if (originalPath) {
          // 如果是 blob URL，直接使用，不需要转换
          const url = originalPath.startsWith("blob:")
            ? originalPath
            : convertFileSrc(originalPath);
          imageUrls.push(url);
        }
      } else {
        // 已导入状态：使用 asset:// 协议
        const url = assetManagerEngine.convertToAssetProtocol(imageAsset.path, basePath.value);
        imageUrls.push(url);
      }
    }

    // 传递图片数组和当前索引给图片查看器
    showImage(imageUrls, currentIndex >= 0 ? currentIndex : 0);
  } catch (error) {
    errorHandler.error(error, "打开图片预览失败");
  }
};

// 处理移除
const handleRemove = (e?: Event) => {
  e?.stopPropagation();
  emit("remove", props.asset);
};

const handleCancelTranscription = (e?: Event) => {
  e?.stopPropagation();
  cancelTranscription(props.asset.id);
};

// 监听 asset 变化，重新加载 URL
watch(
  () => props.asset,
  () => {
    // 如果旧 URL 是 Blob URL，先释放
    if (assetUrl.value && assetUrl.value.startsWith("blob:")) {
      URL.revokeObjectURL(assetUrl.value);
    }
    loadAssetUrl();
  },
  { immediate: true }
);

// 组件卸载时释放 Blob URL（只有 pending 状态的才是 Blob URL）
import { onUnmounted } from "vue";
onUnmounted(() => {
  if (assetUrl.value && assetUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(assetUrl.value);
  }
});
</script>

<template>
  <el-dropdown trigger="contextmenu" class="attachment-card-dropdown" placement="bottom-start">
    <div
      class="attachment-card"
      :class="[
        `size-${size}`,
        {
          'is-image': isImage,
          // 'is-video': isVideo, // 视频现在也是横条布局，不再需要特殊的顶层类
          'is-bar-layout': isBarLayout,
          'is-document': isDocument,
          'has-error': loadError || hasImportError,
          'is-importing': isImporting,
        },
      ]"
    >
      <!-- 长条布局（非图片类型） -->
      <template v-if="isBarLayout">
        <div
          class="bar-layout-container"
          :class="{ clickable: isDocument || isVideo || isAudio }"
          @click="handlePreview"
        >
          <!-- 文件图标区域 -->
          <div class="bar-icon-wrapper">
            <template v-if="isLoadingUrl && !assetUrl && (isImage || isVideo)">
              <Loader2 class="spinner-small" />
            </template>
            <template v-else-if="loadError || hasImportError">
              <TriangleAlert class="icon-emoji error" :size="16" />
            </template>
            <template v-else>
              <div v-if="assetUrl" class="bar-thumbnail-wrapper">
                <img :src="assetUrl" class="bar-thumbnail-image" alt="预览" />
                <!-- 视频需要播放图标暗示，音频封面直接展示即可 -->
                <div v-if="isVideo" class="bar-media-overlay">
                  <Play class="play-icon" :size="16" fill="currentColor" />
                </div>
              </div>
              <div v-else class="file-type-badge" :data-type="asset.type">
                <FileIcon :file-name="asset.name" :file-type="asset.type" :size="20" />
              </div>
            </template>

            <!-- 导入状态指示器 (仅在没有 URL 时显示，避免遮挡已有预览) -->
            <div v-if="isImporting && !assetUrl" class="bar-import-overlay">
              <Loader2 class="import-spinner-small" />
            </div>
          </div>

          <!-- 文件信息区域 -->
          <div class="bar-info-wrapper">
            <div class="bar-header">
              <el-tooltip :content="asset.name" placement="top" :show-after="500">
                <div class="bar-file-name">{{ asset.name }}</div>
              </el-tooltip>
            </div>

            <div class="bar-meta-row">
              <span class="bar-file-size">{{ formattedSize }}</span>

              <template v-if="fileExtension">
                <span class="bar-meta-divider">·</span>
                <span class="bar-file-ext">{{ fileExtension }}</span>
              </template>

              <!-- Token 信息 -->
              <template v-if="tokenError || tokenCount !== undefined">
                <span class="bar-meta-divider">·</span>
                <el-tooltip
                  v-if="tokenError"
                  :content="tokenError"
                  placement="top"
                  :show-after="500"
                >
                  <span class="bar-token-tag" :class="isHardTokenError ? 'error' : 'warning'">
                    {{ isHardTokenError ? "Token 错误" : "Token 未知" }}
                  </span>
                </el-tooltip>
                <span v-else class="bar-token-tag" :class="{ estimated: tokenEstimated }">
                  {{ tokenCount!.toLocaleString() }} tokens
                </span>
              </template>

              <!-- 转写状态 (长条模式) -->
              <template v-if="isTranscribable">
                <span class="bar-meta-divider">·</span>
                <el-tooltip :content="transcriptionStatusText" placement="top" :show-after="500">
                  <div
                    class="transcription-status-icon bar-mode"
                    :class="[
                      transcriptionStatus,
                      {
                        'will-use': willUseTranscription,
                        'wont-use': !willUseTranscription,
                        'is-loading': isImporting,
                      },
                    ]"
                    @click="handleTranscriptionClick"
                  >
                    <Loader2
                      v-if="
                        isImporting ||
                        transcriptionStatus === 'processing' ||
                        transcriptionStatus === 'pending'
                      "
                      class="spinner-micro"
                    />
                    <FileText v-else-if="transcriptionStatus === 'success'" :size="12" />
                    <TriangleAlert v-else-if="transcriptionStatus === 'warning'" :size="12" />
                    <AlertCircle v-else-if="transcriptionStatus === 'error'" :size="12" />
                    <!-- None 状态图标 -->
                    <FilePenLine v-else :size="12" class="icon-none" />
                  </div>
                </el-tooltip>
              </template>
            </div>
          </div>
        </div>
      </template>

      <!-- 方形卡片布局（仅图片） -->
      <template v-else>
        <!-- 预览区域 -->
        <div class="attachment-preview" @click="handlePreview">
          <template v-if="isLoadingUrl && !assetUrl && (isImage || isVideo)">
            <div class="loading-placeholder">
              <Loader2 class="spinner" />
            </div>
          </template>
          <template v-else-if="loadError || hasImportError">
            <div class="error-placeholder">
              <TriangleAlert class="icon" />
              <span class="text">{{ hasImportError ? "导入失败" : "加载失败" }}</span>
            </div>
          </template>
          <template v-else>
            <img
              v-if="isImage && assetUrl"
              :src="assetUrl"
              :alt="asset.name"
              class="preview-image"
              :class="{ clickable: isImage }"
            />
            <div v-else class="file-icon">
              <FileIcon :file-name="asset.name" :file-type="asset.type" :size="36" />
            </div>
          </template>

          <!-- 导入状态指示器 (仅在没有预览时显示大转圈) -->
          <div
            v-if="isImporting && !assetUrl"
            class="import-status-overlay"
            :class="{ 'mini-mode': isImage && assetUrl }"
          >
            <Loader2 class="import-spinner" />
          </div>

          <!-- Token 信息标签（方形布局专用） -->
          <div v-if="!isBarLayout && (tokenError || tokenCount !== undefined)" class="token-badge">
            <el-tooltip v-if="tokenError" :content="tokenError" placement="top" :show-after="500">
              <span class="token-tag" :class="isHardTokenError ? 'error' : 'warning'">
                {{ isHardTokenError ? "Token 错误" : "?" }}
              </span>
            </el-tooltip>
            <span v-else class="token-tag" :class="{ estimated: tokenEstimated }">
              {{ tokenCount!.toLocaleString() }}
            </span>
          </div>

          <!-- 转写进度条 (方形模式 - Processing) -->
          <div
            v-if="
              !isBarLayout &&
              (transcriptionStatus === 'processing' || transcriptionStatus === 'pending')
            "
            class="transcription-progress-bar"
          >
            <el-tooltip content="正在转写..." placement="top" :show-after="500">
              <div class="progress-fill"></div>
            </el-tooltip>
          </div>
        </div>

        <!-- 转写操作/状态按钮 (方形模式 - 右下角) -->
        <div v-if="!isBarLayout && isTranscribable">
          <el-tooltip :content="transcriptionStatusText" placement="top" :show-after="500">
            <div
              class="transcription-action-btn"
              :class="[
                transcriptionStatus,
                { 'will-use': willUseTranscription, 'wont-use': !willUseTranscription },
              ]"
              @click="handleTranscriptionClick"
            >
              <!-- Importing or Processing: 加载图标 -->
              <Loader2
                v-if="
                  isImporting ||
                  transcriptionStatus === 'processing' ||
                  transcriptionStatus === 'pending'
                "
                class="spinner-micro"
              />
              <!-- Success: 文档图标 -->
              <FileText v-else-if="transcriptionStatus === 'success'" :size="14" />
              <!-- Warning: 警告图标 -->
              <TriangleAlert v-else-if="transcriptionStatus === 'warning'" :size="14" />
              <!-- Error: 警示图标 -->
              <AlertCircle v-else-if="transcriptionStatus === 'error'" :size="14" />
              <!-- None: 编辑/转写图标 -->
              <FilePenLine v-else-if="transcriptionStatus === 'none'" :size="14" />
            </div>
          </el-tooltip>
        </div>
      </template>

      <!-- 移除按钮 (统一使用外部悬浮按钮) -->
      <el-tooltip v-if="removable" content="移除附件" placement="top" :show-after="500">
        <button class="remove-button" @click="handleRemove">
          <X :size="12" />
        </button>
      </el-tooltip>

      <!-- 文档预览对话框 -->
      <BaseDialog
        v-model="showDocumentPreview"
        :title="asset.name"
        width="80vw"
        height="80vh"
        :show-close-button="true"
        :close-on-backdrop-click="true"
      >
        <DocumentViewer
          v-if="showDocumentPreview"
          :file-path="previewFilePath"
          :file-name="asset.name"
          :show-engine-switch="true"
        />
      </BaseDialog>
    </div>

    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-if="isDocument || isVideo || isAudio" @click="handlePreview">
          预览文件
        </el-dropdown-item>

        <template v-if="isTranscribable">
          <el-dropdown-item
            v-if="transcriptionStatus === 'success' || transcriptionStatus === 'warning'"
            @click="handleTranscriptionClick"
          >
            查看/编辑转写
          </el-dropdown-item>
          <el-dropdown-item v-if="transcriptionStatus === 'none'" @click="handleTranscriptionClick">
            开始转写
          </el-dropdown-item>
          <el-dropdown-item
            v-if="
              transcriptionStatus === 'success' ||
              transcriptionStatus === 'warning' ||
              transcriptionStatus === 'error'
            "
            @click="retryTranscription(internalAsset)"
          >
            重新转写
          </el-dropdown-item>
          <el-dropdown-item
            v-if="transcriptionStatus === 'processing' || transcriptionStatus === 'pending'"
            @click="handleCancelTranscription"
          >
            取消转写
          </el-dropdown-item>
        </template>

        <el-dropdown-item divided class="remove-item" @click="handleRemove">
          移除附件
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.attachment-card {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: visible;
  background: var(--bg-color);
  transition: all 0.2s;
  flex-shrink: 0;
  align-self: flex-start; /* 防止在 flex 容器中被拉伸 */
}

/* 尺寸变体 */
.attachment-card.size-small {
  width: 52px;
}

.attachment-card.size-small .attachment-preview {
  height: 52px;
}

.attachment-card.size-small .file-icon .icon {
  font-size: 28px;
}

.attachment-card.size-medium {
  width: 80px;
}

.attachment-card.size-medium .attachment-preview {
  height: 80px;
}

.attachment-card.size-medium .file-icon .icon {
  font-size: 36px;
}

.attachment-card.size-large {
  width: 120px;
}

.attachment-card.size-large .attachment-preview {
  height: 120px;
}

.attachment-card.size-large .file-icon .icon {
  font-size: 48px;
}

.attachment-card.size-extra-large {
  width: 100%;
}

.attachment-card.size-extra-large .attachment-preview {
  width: 100%;
  height: auto;
  min-height: 50px;
}

.attachment-card.size-extra-large .preview-image {
  height: auto;
  object-fit: contain;
}

.attachment-card.size-extra-large .file-icon .icon {
  font-size: 64px;
}

/* 针对 extra-large 模式下长条布局的覆盖 */
.attachment-card.size-extra-large.is-bar-layout {
  width: 100%;
  max-width: 100%;
}

.attachment-card-dropdown {
  display: flex;
  flex-shrink: 0;
}

.remove-item {
  color: var(--el-color-danger);
}

.attachment-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.attachment-card.has-error {
  border-color: var(--error-color);
}

.attachment-card.is-importing {
  opacity: 0.8;
}

.attachment-card.is-document {
  cursor: pointer;
}

.attachment-preview {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--container-bg);
  overflow: hidden;
  border-radius: 8px;
}

.attachment-preview.clickable {
  cursor: pointer;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-image.clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.preview-image.clickable:hover {
  transform: scale(1.05);
}

.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.file-icon .icon {
  font-size: 36px;
}

.loading-placeholder,
.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--text-color-light);
}

.spinner {
  width: 24px;
  height: 24px;
  color: var(--primary-color);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-placeholder .icon {
  font-size: 32px;
}

.error-placeholder .text {
  font-size: 12px;
}
.attachment-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.5) 60%,
    transparent 100%
  );
  backdrop-filter: blur(2px);
}

.attachment-name {
  font-size: 11px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.attachment-size {
  flex-shrink: 0;
}

.attachment-ext {
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.remove-button {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 2;
}

.attachment-card:hover .remove-button {
  opacity: 1;
}

.remove-button:hover {
  background: var(--error-color);
  transform: scale(1.1);
}

.import-status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
  z-index: 2;
  transition: all 0.3s ease;
}

/* 迷你模式：仅在右下角显示小转圈，不遮挡图片 */
.import-status-overlay.mini-mode {
  top: auto;
  left: auto;
  right: 4px;
  bottom: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  backdrop-filter: none;
  pointer-events: none; /* 允许点击穿透查看图片 */
}

.import-spinner {
  width: 20px;
  height: 20px;
  color: #fff;
  animation: spin 0.6s linear infinite;
}

.import-status-overlay.mini-mode .import-spinner {
  width: 12px;
  height: 12px;
}

/* 长条布局样式 */
.attachment-card.is-bar-layout {
  width: fit-content;
  min-width: 160px;
  max-width: 320px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-direction: row;
  padding: 0;
  transition: all 0.2s ease;
}

.attachment-card.is-bar-layout:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.bar-layout-container {
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  width: 100%;
  height: 100%;
}

.bar-layout-container.clickable {
  cursor: pointer;
}

.bar-icon-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-type-badge {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-dark);
  border-radius: 8px;
  font-size: 20px;
  transition: transform 0.2s;
}

.attachment-card.is-bar-layout:hover .file-type-badge {
  transform: scale(1.05);
}

/* 不同类型的图标背景色微调 */
.file-type-badge[data-type="document"] {
  background: rgba(64, 158, 255, 0.15);
}
.file-type-badge[data-type="audio"] {
  background: rgba(230, 162, 60, 0.15);
}
.file-type-badge[data-type="video"] {
  background: rgba(245, 108, 0.15);
}
.file-type-badge[data-type="image"] {
  background: rgba(103, 194, 58, 0.15);
}

.bar-info-wrapper {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.bar-file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.bar-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.2;
}

.bar-file-size {
  flex-shrink: 0;
  font-family: var(--font-family-mono);
}

.bar-meta-divider {
  color: var(--border-color-darker);
  font-weight: bold;
}

.bar-token-tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  font-family: var(--font-family-mono);
}

.bar-token-tag.estimated {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.bar-token-tag.error {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.bar-token-tag.warning {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.spinner-small {
  width: 16px;
  height: 16px;
  color: var(--primary-color);
  animation: spin 0.8s linear infinite;
}

.bar-import-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(1px);
  border-radius: 8px;
  z-index: 2;
}

.bar-thumbnail-wrapper {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.bar-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bar-media-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.bar-media-overlay .play-icon {
  width: 16px;
  height: 16px;
  fill: rgba(255, 255, 255, 0.9);
  stroke: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.import-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.import-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Token 标签（方形布局专用） */
.token-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  pointer-events: none;
}

.token-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  color: #67c23a;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.token-tag.estimated {
  color: #e6a23c;
}

.token-tag.error {
  color: #f56c6c;
}

.token-tag.warning {
  color: #e6a23c;
}

.bar-file-ext {
  flex-shrink: 0;
  font-family: var(--font-family-mono);
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--text-color-secondary);
  line-height: 1.2;
}

/* 转写状态样式 */
.transcription-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.transcription-status-icon.bar-mode {
  width: 12px;
  height: 12px;
}

.transcription-status-icon .icon-none {
  opacity: 0.5;
  transition: opacity 0.2s;
}

.transcription-status-icon:hover .icon-none {
  opacity: 1;
}

.transcription-status-icon:hover {
  opacity: 0.8;
}

/* 转写状态颜色 - 根据是否会使用转写来区分 */
.transcription-status-icon.success.will-use {
  color: var(--el-color-success);
}

.transcription-status-icon.success.wont-use {
  color: var(--el-color-info);
  opacity: 0.6;
}

.transcription-status-icon.error {
  color: var(--el-color-error);
}

.transcription-status-icon.warning {
  color: var(--el-color-warning);
}

.transcription-status-icon.processing,
.transcription-status-icon.pending {
  color: var(--el-color-warning);
}

/* None 状态 - 根据是否需要转写区分 */
.transcription-status-icon.none.will-use .icon-none {
  opacity: 0.7;
  color: var(--el-color-warning);
}

.transcription-status-icon.none.wont-use .icon-none {
  opacity: 0.3;
  color: var(--el-color-info);
  cursor: default;
}

/* 方形模式下的转写进度条 */
.transcription-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(0, 0, 0, 0.2);
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--primary-color);
  width: 100%;
  transform-origin: left;
  animation: progress-indeterminate 1.5s infinite ease-in-out;
}

@keyframes progress-indeterminate {
  0% {
    transform: translateX(-100%) scaleX(0.2);
  }
  50% {
    transform: translateX(0%) scaleX(0.5);
  }
  100% {
    transform: translateX(100%) scaleX(0.2);
  }
}

/* 方形模式下的转写操作按钮 (右下角) */
.transcription-action-btn {
  position: absolute;
  bottom: -6px;
  right: -4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  backdrop-filter: blur(2px);
  cursor: pointer;
  transition: all 0.2s;
  z-index: 3;
  color: #fff;
  opacity: 0; /* 默认隐藏 */
  transform: scale(0.9);
}

.transcription-action-btn svg {
  width: 12px;
  height: 12px;
}

/* 状态颜色 - 根据是否会使用转写来区分 */
.transcription-action-btn.success.will-use {
  color: #67c23a;
  opacity: 1; /* 完成状态常驻显示 */
  transform: scale(1);
}

.transcription-action-btn.success.wont-use {
  color: var(--el-color-info);
  opacity: 0.5; /* 已有但不会用，降低显眼度 */
  transform: scale(1);
}

.transcription-action-btn.warning {
  color: var(--el-color-warning);
  opacity: 1;
  transform: scale(1);
}

.transcription-action-btn.error {
  color: #f56c6c;
  opacity: 1; /* 错误状态常驻显示 */
  transform: scale(1);
}

/* None 状态仅 hover 显示 */
.attachment-card:hover .transcription-action-btn.none.will-use {
  opacity: 1;
  transform: scale(1);
  color: var(--el-color-warning); /* 需要转写时用警告色提示 */
}

.attachment-card:hover .transcription-action-btn.none.wont-use {
  opacity: 0.5;
  transform: scale(1);
  color: var(--el-color-info); /* 不需要时灰显 */
}

/* Processing 或 Importing 状态下，按钮设为常驻显示（显示加载圈） */
.transcription-action-btn.processing,
.transcription-action-btn.pending,
.attachment-card.is-importing .transcription-action-btn {
  display: flex;
  opacity: 1;
  transform: scale(1);
  color: var(--el-color-warning);
}

.transcription-action-btn:hover {
  color: var(--primary-color);
  transform: scale(1.2);
}
.transcription-action-btn.error:hover {
  color: #f56c6c;
}

.spinner-micro {
  width: 8px;
  height: 8px;
  animation: spin 0.8s linear infinite;
}
</style>
