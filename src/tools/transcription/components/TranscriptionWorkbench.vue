<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useSendToChat } from "@/composables/useSendToChat";
import { useImageViewer } from "@/composables/useImageViewer";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { isTextFile, getExtension } from "@/utils/fileTypeDetector";
import { getLanguageDefinition } from "@/utils/codeLanguages";
import type { Asset } from "@/types/asset-management";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import {
  Play,
  XCircle,
  FileText,
  Copy,
  Download,
  Upload,
  MessageSquare,
  Save,
  Loader2,
} from "lucide-vue-next";

const logger = createModuleLogger("TranscriptionWorkbench");

// 组件引用
const dropAreaRef = ref<HTMLElement | undefined>();

// 状态
const store = useTranscriptionStore();
const manager = useTranscriptionManager();
const { sendToChat } = useSendToChat();
const { show: showImage } = useImageViewer();

const currentAsset = ref<Asset | null>(null);
const previewUrl = ref<string>("");
const posterUrl = ref<string>("");
const previewType = ref<"image" | "video" | "audio" | "document" | "text" | null>(null);
const editorLanguage = ref("markdown");
const isProcessing = ref(false);
const isSaving = ref(false);
const resultText = ref("");
const basePath = ref<string>("");

const showResult = ref(false);

// 判断当前资产是否正在导入中
const isImporting = computed(() => {
  if (!currentAsset.value) return false;
  return (
    currentAsset.value.importStatus === "pending" || currentAsset.value.importStatus === "importing"
  );
});

// 文件交互
const { isDraggingOver } = useFileInteraction({
  element: dropAreaRef,
  pasteMode: "asset",
  sourceModule: "transcription",
  onAssets: (assets) => {
    if (assets.length > 0) {
      handleAssetSelect(assets[0]);
    }
  },
  onPaths: async (paths) => {
    if (paths.length > 0) {
      try {
        const asset = await assetManagerEngine.importAssetFromPath(paths[0], {
          origin: {
            type: "local",
            source: "file",
            sourceModule: "transcription",
          },
        });
        handleAssetSelect(asset);
      } catch (e) {
        // 错误已由 assetManagerEngine 处理
      }
    }
  },
});

/**
 * 尝试加载已有的转写结果
 * 优先级：Store 任务缓存 > 资产元数据记录
 */
const tryLoadExistingResult = async (asset: Asset) => {
  // 1. 先看 Store 里有没有已完成的任务
  const existingTask = store.getTaskByAssetId(asset.id);
  if (existingTask?.status === "completed") {
    if (existingTask.resultText) {
      resultText.value = existingTask.resultText;
      showResult.value = true;
      return true;
    }
    if (existingTask.resultPath) {
      try {
        const uint8Array = await readFile(existingTask.resultPath);
        const text = new TextDecoder().decode(uint8Array);
        resultText.value = text;
        existingTask.resultText = text; // 存入缓存
        showResult.value = true;
        return true;
      } catch (e) {
        logger.warn("读取任务路径结果失败", e);
      }
    }
  }

  // 2. 再看资产元数据里有没有记录（秒传命中的情况）
  const metadataText = await manager.getTranscriptionText(asset);
  if (metadataText) {
    resultText.value = metadataText;
    showResult.value = true;
    // 同步到 Store，避免下次还要读取磁盘
    store.addTask({
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetType: asset.type as any,
      path: asset.path,
      status: "completed",
      resultText: metadataText,
      createdAt: Date.now(),
      mimeType: asset.mimeType,
      filename: asset.name,
      retryCount: 0,
    });
    return true;
  }

  return false;
};

// 处理资产选择
// 处理资产选择
const handleAssetSelect = async (asset: Asset) => {
  logger.info("处理资产选择", { id: asset.id, name: asset.name, status: asset.importStatus });
  currentAsset.value = asset;

  // 识别文本类型
  const isText = isTextFile(asset.name, asset.mimeType || "");
  logger.debug("识别文本类型结果", { name: asset.name, isText });

  previewType.value = isText ? "text" : (asset.type as any);

  // 如果是纯文本，尝试直接读取内容展示
  if (isText) {
    // 设置编辑器语言
    const ext = getExtension(asset.name);
    const langDef = getLanguageDefinition(ext);
    editorLanguage.value = langDef ? langDef.id : "plaintext";
    // 判断是否可以直接读取：
    // 1. importStatus 为 complete
    // 2. 或者 importStatus 未定义但 path 存在且不是 blob URL（说明是已存在的资产）
    const isPending = asset.importStatus === "pending" || asset.importStatus === "importing";
    const hasValidPath = asset.path && !asset.path.startsWith("blob:");
    const canReadDirectly = asset.importStatus === "complete" || (!isPending && hasValidPath);
    logger.debug("纯文本处理路径", {
      importStatus: asset.importStatus,
      path: asset.path,
      isPending,
      hasValidPath,
      canReadDirectly,
    });

    if (canReadDirectly) {
      try {
        logger.info("尝试读取纯文本资产内容", { path: asset.path });
        const buffer = await assetManagerEngine.getAssetBinary(asset.path);
        const text = new TextDecoder("utf-8").decode(buffer);
        logger.debug("读取到纯文本内容长度", { length: text.length });
        resultText.value = text;
        showResult.value = true;
        isProcessing.value = false;

        if (!basePath.value) {
          basePath.value = await assetManagerEngine.getAssetBasePath();
        }
        previewUrl.value = assetManagerEngine.convertToAssetProtocol(asset.path, basePath.value);
        return;
      } catch (e) {
        logger.warn("读取纯文本内容失败", e);
      }
    } else {
      // 还在导入中，先清空结果
      logger.debug("纯文本资产正在导入中，等待完成");
      resultText.value = "";
      showResult.value = false;
    }
  }

  // 判断是否为 pending/importing 状态
  const isPending = asset.importStatus === "pending" || asset.importStatus === "importing";

  if (isPending) {
    // pending 状态：使用 originalPath（blob URL）作为预览
    const originalPath = (asset as any).originalPath || asset.path;
    if (originalPath) {
      // 如果是 blob URL，直接使用；否则使用 convertFileSrc
      previewUrl.value = originalPath.startsWith("blob:")
        ? originalPath
        : convertFileSrc(originalPath);
    }
    posterUrl.value = "";
    logger.debug("资产正在导入中，使用临时预览", {
      assetId: asset.id,
      originalPath,
    });
    resultText.value = "";
    showResult.value = false;
  } else {
    // 已导入状态：使用正常的资产 URL
    if (!basePath.value) {
      basePath.value = await assetManagerEngine.getAssetBasePath();
    }
    previewUrl.value = assetManagerEngine.convertToAssetProtocol(asset.path, basePath.value);

    // 加载缩略图/封面
    if (asset.thumbnailPath) {
      posterUrl.value = assetManagerEngine.convertToAssetProtocol(
        asset.thumbnailPath,
        basePath.value
      );
    } else {
      posterUrl.value = "";
    }

    // 尝试加载已有结果
    const hasResult = await tryLoadExistingResult(asset);

    // 如果不是纯文本且有结果，或者是转写任务，结果通常是 markdown
    if (hasResult && !isText) {
      editorLanguage.value = "markdown";
    }

    if (!hasResult) {
      resultText.value = "";
      showResult.value = false;

      // 如果开启了自动转写，且没有正在进行的任务，则自动开始
      // 注意：只有在导入完成后且非纯文本才触发，如果还在导入中，由 watch 处理
      const existingTask = store.getTaskByAssetId(asset.id);
      if (
        asset.importStatus === "complete" &&
        !isText &&
        store.config.autoStartOnImport &&
        !existingTask
      ) {
        logger.info("检测到已导入资产且开启了自动转写，触发任务", { assetId: asset.id });
        startTranscription();
      }
    }
  }
};

// 监听当前资产的导入状态变化
watch(
  () => currentAsset.value?.importStatus,
  async (newStatus, oldStatus) => {
    if (!currentAsset.value) return;
    logger.debug("资产导入状态变化", { oldStatus, newStatus, assetId: currentAsset.value.id });

    // 当资产变为 complete 时，更新预览 URL（放宽条件，只要变为 complete 就处理）
    if (newStatus === "complete") {
      logger.info("资产导入完成，更新状态", {
        assetId: currentAsset.value.id,
        name: currentAsset.value.name,
        newStatus,
      });

      // 识别文本类型
      const isText = isTextFile(currentAsset.value.name, currentAsset.value.mimeType || "");
      logger.debug("导入完成后重新识别文本类型", { isText });

      // 更新资产类型（上传后可能识别得更准确）
      previewType.value = isText ? "text" : (currentAsset.value.type as any);

      // 如果是纯文本，设置语言
      if (isText) {
        const ext = getExtension(currentAsset.value.name);
        const langDef = getLanguageDefinition(ext);
        editorLanguage.value = langDef ? langDef.id : "plaintext";
      } else {
        editorLanguage.value = "markdown";
      }

      // 重新获取资产 URL
      if (!basePath.value) {
        basePath.value = await assetManagerEngine.getAssetBasePath();
      }
      previewUrl.value = assetManagerEngine.convertToAssetProtocol(
        currentAsset.value.path,
        basePath.value
      );

      // 加载缩略图/封面
      if (currentAsset.value.thumbnailPath) {
        posterUrl.value = assetManagerEngine.convertToAssetProtocol(
          currentAsset.value.thumbnailPath,
          basePath.value
        );
      }

      // 1. 如果是纯文本，直接读取展示
      if (isText) {
        try {
          logger.info("导入完成，读取纯文本内容", { path: currentAsset.value.path });
          const buffer = await assetManagerEngine.getAssetBinary(currentAsset.value.path);
          const text = new TextDecoder("utf-8").decode(buffer);
          logger.debug("读取到文本内容长度", { length: text.length });
          resultText.value = text;
          showResult.value = true;
          return;
        } catch (e) {
          logger.warn("读取纯文本内容失败", e);
        }
      }

      // 2. 资产导入完成，首先检查是否命中了已有结果（秒传）
      const hasResult = await tryLoadExistingResult(currentAsset.value);

      // 3. 如果没有结果且启用了自动转写，立即触发
      if (!hasResult && store.config.autoStartOnImport) {
        logger.info("资产后台上传完成，自动触发转写任务", { assetId: currentAsset.value.id });
        startTranscription();
      }
    }
  }
);

// 开始转写
const startTranscription = async () => {
  if (!currentAsset.value) return;

  // 检查资产是否正在导入
  if (isImporting.value) {
    customMessage.warning("请等待文件上传完成后再开始转写");
    return;
  }

  if (previewType.value === "text") {
    customMessage.info("该文件已经是纯文本，无需转写");
    return;
  }

  // 检查是否支持
  const supportedTypes = ["image", "audio", "video", "document"];
  if (!supportedTypes.includes(currentAsset.value.type)) {
    customMessage.error(`不支持转写 ${currentAsset.value.type} 类型的文件`);
    return;
  }

  // 提交任务到 Store，由 Registry 执行
  // 使用当前全局配置
  store.submitTask(currentAsset.value, { ...store.config });
  showResult.value = true;
};

// 监听当前资产的任务状态变化
watch(
  () => store.getTaskByAssetId(currentAsset.value?.id || ""),
  async (task) => {
    if (!task) {
      isProcessing.value = false;
      return;
    }

    isProcessing.value = task.status === "processing" || task.status === "pending";

    if (task.status === "completed") {
      // 转写结果通常是 markdown
      editorLanguage.value = "markdown";

      if (task.resultText) {
        resultText.value = task.resultText;
      } else if (task.resultPath) {
        try {
          const uint8Array = await readFile(task.resultPath);
          resultText.value = new TextDecoder().decode(uint8Array);
          // 回填到任务对象中，下次直接用
          task.resultText = resultText.value;
        } catch (e) {
          console.error("读取转写结果失败", e);
        }
      }
    } else if (task.status === "error") {
      resultText.value = `## 转写失败\n\n${task.error || "未知错误"}`;
    }
  },
  { deep: true }
);

// 复制结果
const copyResult = async () => {
  try {
    await navigator.clipboard.writeText(resultText.value);
    customMessage.success("已复制到剪贴板");
  } catch (e) {
    customMessage.error("复制失败");
  }
};

// 保存结果
const saveResult = async () => {
  if (!currentAsset.value || !resultText.value) return;
  const task = store.getTaskByAssetId(currentAsset.value.id);
  if (!task || !task.resultPath) return;

  isSaving.value = true;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(resultText.value);
    await writeFile(task.resultPath, data);
    task.resultText = resultText.value;
    customMessage.success("保存成功");
  } catch (e) {
    customMessage.error("保存失败");
    console.error(e);
  } finally {
    isSaving.value = false;
  }
};

// 图片预览
const handleImagePreview = () => {
  if (previewUrl.value) {
    showImage([previewUrl.value], 0);
  }
};

// 下载结果
const downloadResult = () => {
  const blob = new Blob([resultText.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `转写结果_${currentAsset.value?.name || "unknown"}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// 发送到聊天
const sendResultToChat = () => {
  if (!resultText.value) return;
  sendToChat(resultText.value);
};
// 选择文件
const selectFile = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "多媒体文件",
          extensions: ["png", "jpg", "jpeg", "mp3", "wav", "mp4", "mkv", "pdf", "txt", "md"],
        },
      ],
    });

    if (selected && typeof selected === "string") {
      const asset = await assetManagerEngine.importAssetFromPath(selected, {
        origin: {
          type: "local",
          source: "file",
          sourceModule: "transcription",
        },
      });
      handleAssetSelect(asset);
    }
  } catch (e) {
    logger.error("选择文件失败", e);
  }
};

// 清空预览
const clearPreview = () => {
  currentAsset.value = null;
  previewUrl.value = "";
  previewType.value = null;
  resultText.value = "";
  showResult.value = false;
};
</script>

<template>
  <div class="transcription-workbench" ref="dropAreaRef">
    <!-- 顶部工具栏 -->
    <div class="workbench-toolbar">
      <div class="toolbar-left">
        <span class="title">多模态转写工作台</span>
      </div>

      <!-- 中间核心控制区 -->
      <div class="toolbar-center">
        <div class="auto-start-control">
          <span class="control-label">自动转写</span>
          <el-switch v-model="store.config.autoStartOnImport" />
        </div>

        <el-divider direction="vertical" />

        <el-button
          type="primary"
          :icon="Play"
          :loading="isProcessing"
          :disabled="!currentAsset || isImporting"
          @click="startTranscription"
        >
          {{ isProcessing ? "转写中..." : isImporting ? "上传中..." : "开始转写" }}
        </el-button>
      </div>

      <div class="toolbar-right">
        <template v-if="showResult && resultText">
          <el-button :icon="Copy" link @click="copyResult">复制结果</el-button>
          <el-button :icon="MessageSquare" link @click="sendResultToChat">发送到聊天</el-button>
        </template>
      </div>
    </div>

    <!-- 主工作区 -->
    <div class="workbench-main">
      <!-- 左侧：预览区 -->
      <div class="preview-section" :class="{ 'is-text-preview': previewType === 'text' }">
        <!-- 预览区标题栏：放置核心操作 -->
        <div class="preview-header" v-if="currentAsset">
          <div class="header-left">
            <span class="file-info-label">当前文件:</span>
            <span class="file-name">{{ currentAsset.name }}</span>
          </div>
          <div class="header-right">
            <el-button :icon="XCircle" link size="small" @click="clearPreview">移除文件</el-button>
          </div>
        </div>

        <div class="preview-content">
          <div v-if="!currentAsset" class="upload-area" :class="{ highlight: isDraggingOver }">
            <el-icon :size="64"><Upload /></el-icon>
            <div class="upload-texts">
              <p>拖放文件到此处，或粘贴文件</p>
              <p class="hint-text">支持图片、音频、视频、PDF 或纯文本</p>
            </div>
            <el-button type="primary" plain @click="selectFile">选择文件</el-button>
          </div>
          <div v-else class="asset-preview">
            <!-- 图片预览 -->
            <div v-if="previewType === 'image'" class="image-preview">
              <!-- 导入状态指示器 -->
              <div v-if="isImporting" class="import-overlay">
                <Loader2 class="import-spinner" />
                <span>上传中...</span>
              </div>
              <img :src="previewUrl" alt="预览" @click="handleImagePreview" />
            </div>
            <!-- 视频预览 -->
            <div v-else-if="previewType === 'video'" class="video-preview">
              <!-- 导入状态指示器 -->
              <div v-if="isImporting" class="import-overlay">
                <Loader2 class="import-spinner" />
                <span>上传中...</span>
              </div>
              <VideoPlayer
                v-if="previewUrl"
                :src="previewUrl"
                :title="currentAsset.name"
                :autoplay="false"
              />
            </div>
            <!-- 音频预览 -->
            <div v-else-if="previewType === 'audio'" class="audio-preview">
              <!-- 导入状态指示器 -->
              <div v-if="isImporting" class="import-overlay">
                <Loader2 class="import-spinner" />
                <span>上传中...</span>
              </div>
              <AudioPlayer
                v-if="previewUrl"
                :src="previewUrl"
                :title="currentAsset.name"
                :poster="posterUrl"
                :autoplay="false"
              />
            </div>
            <!-- 文档预览 -->
            <div v-else-if="previewType === 'document'" class="document-preview">
              <div class="file-icon-wrapper">
                <FileIcon
                  :file-name="currentAsset.name"
                  :file-type="currentAsset.type"
                  :size="80"
                />
              </div>
              <div class="file-details">
                <span class="document-name">{{ currentAsset.name }}</span>
                <div class="file-meta">
                  <span class="meta-tag">{{ currentAsset.mimeType }}</span>
                  <span class="meta-tag">{{ (currentAsset.size / 1024).toFixed(1) }} KB</span>
                </div>
              </div>
            </div>
            <!-- 纯文本预览 -->
            <div v-else-if="previewType === 'text'" class="document-preview text-file">
              <div class="file-icon-wrapper">
                <FileIcon :file-name="currentAsset.name" file-type="document" :size="80" />
              </div>
              <div class="file-details">
                <span class="document-name">{{ currentAsset.name }}</span>
                <div class="file-meta">
                  <span class="meta-tag text-type">纯文本</span>
                  <span class="meta-tag">{{ (currentAsset.size / 1024).toFixed(1) }} KB</span>
                </div>
                <p class="hint-text">该文件已是纯文本，已在右侧直接展示内容</p>
              </div>
            </div>
            <!-- 未知类型 -->
            <div v-else class="unknown-preview">
              <div class="file-icon-wrapper grayscale">
                <FileIcon
                  :file-name="currentAsset.name"
                  :file-type="currentAsset.type"
                  :size="80"
                />
              </div>
              <div class="file-details">
                <span class="document-name">{{ currentAsset.name }}</span>
                <p class="error-text">不支持转写此文件类型</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：结果区 -->
      <div class="result-section" :class="{ empty: !showResult || !resultText }">
        <div v-if="showResult && resultText" class="result-container">
          <div class="result-header">
            <span class="title">转写结果</span>
            <div class="actions">
              <el-button :icon="Save" link size="small" :loading="isSaving" @click="saveResult"
                >保存</el-button
              >
              <el-button :icon="Download" link size="small" @click="downloadResult" />
            </div>
          </div>
          <div class="result-editor">
            <RichCodeEditor
              v-model="resultText"
              :language="editorLanguage"
              :line-numbers="true"
              editor-type="codemirror"
              class="editor-instance"
            />
          </div>
        </div>
        <div v-else class="empty-result">
          <el-icon :size="48"><FileText /></el-icon>
          <p>转写结果将在此处并排显示</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transcription-workbench {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

.workbench-toolbar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--sidebar-bg);
  min-height: 50px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.toolbar-left .title {
  font-weight: bold;
  font-size: 15px;
  white-space: nowrap;
}

.toolbar-center {
  flex: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.auto-start-control {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: var(--input-bg);
  padding: 2px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
}

.auto-start-control .control-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.toolbar-right {
  display: flex;
  flex: 1;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.workbench-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  border-right: 1px solid var(--border-color);
  background-color: var(--container-bg);
  transition: flex 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.preview-section.is-text-preview {
  flex: 0 0 300px;
}

.preview-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--sidebar-bg);
  min-height: 40px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
}

.header-left .file-name {
  color: var(--el-text-color-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.upload-area {
  width: 100%;
  height: 100%;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  color: var(--el-text-color-placeholder);
  background-color: var(--input-bg);
  transition: all 0.2s;
  box-sizing: border-box;
  padding: 40px;
}

.upload-texts {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-area.highlight {
  border-color: var(--el-color-primary);
  background-color: rgba(64, 158, 255, 0.05);
  color: var(--el-color-primary);
}

.asset-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  cursor: zoom-in;
}

.image-preview,
.video-preview,
.audio-preview {
  position: relative;
}

.import-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  color: #fff;
  font-size: 12px;
  z-index: 10;
}

.import-spinner {
  width: 14px;
  height: 14px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--vscode-editor-background);
}

.result-section.empty {
  background-color: var(--input-bg);
  justify-content: center;
  align-items: center;
}

.result-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.result-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--sidebar-bg);
}

.result-header .title {
  font-size: 13px;
  font-weight: 600;
}

.result-editor {
  flex: 1;
  overflow: hidden;
}

.empty-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-text-color-placeholder);
}

.editor-instance {
  height: 100%;
}

.video-preview,
.audio-preview {
  width: 100%;
  max-width: 800px;
}

.document-preview,
.unknown-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.document-name {
  font-size: 14px;
  text-align: center;
  word-break: break-all;
}
</style>
