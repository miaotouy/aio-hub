<template>
  <div class="media-info-reader-container">
    <!-- 左侧：图片预览区 -->
    <div class="left-panel">
      <InfoCard title="图片预览" class="preview-card">
        <template #headerExtra>
          <div v-if="previewSrc" class="preview-actions">
            <el-text type="info" size="small">拖放或粘贴以替换</el-text>
            <el-button :icon="FolderOpened" size="small" @click.stop="openFilePicker">
              替换
            </el-button>
            <el-button :icon="Delete" size="small" @click.stop="clearWorkspace"> 清除 </el-button>
          </div>
        </template>
        <div ref="dropAreaRef" class="image-preview-area" :class="{ highlight: isDraggingOver }">
          <div v-if="!previewSrc" class="upload-prompt">
            <el-icon :size="64"><Upload /></el-icon>
            <p>拖放图片到此处，或粘贴图片</p>
            <el-button type="primary" @click.stop="openFilePicker">
              <el-icon><FolderOpened /></el-icon>
              选择图片
            </el-button>
          </div>

          <template v-else>
            <img :src="previewSrc" class="preview-image" />
          </template>
        </div>
      </InfoCard>
    </div>

    <!-- 右侧：信息展示区 -->
    <div class="right-panel">
      <div v-if="!hasData && !previewSrc" class="empty-state">
        <el-empty description="请先上传图片以查看信息" />
      </div>

      <div v-else-if="!hasData && previewSrc" class="empty-state">
        <el-empty description="未检测到 AI 生成信息" />
      </div>

      <el-tabs v-else v-model="activeTab" class="info-tabs" type="border-card">
        <!-- WebUI Tab -->
        <el-tab-pane
          label="WebUI Info"
          name="webui"
          v-if="webuiInfo.positivePrompt || webuiInfo.negativePrompt"
        >
          <div class="tab-content scrollable">
            <div class="info-section">
              <div class="section-header">
                <span class="label">Positive Prompt</span>
                <CopyButton :text="webuiInfo.positivePrompt" />
              </div>
              <el-input
                type="textarea"
                :model-value="webuiInfo.positivePrompt"
                :autosize="{ minRows: 3, maxRows: 10 }"
                readonly
                resize="none"
                class="prompt-input"
              />
            </div>

            <div class="info-section" v-if="webuiInfo.negativePrompt">
              <div class="section-header">
                <span class="label">Negative Prompt</span>
                <CopyButton :text="webuiInfo.negativePrompt" />
              </div>
              <el-input
                type="textarea"
                :model-value="webuiInfo.negativePrompt"
                :autosize="{ minRows: 3, maxRows: 10 }"
                readonly
                resize="none"
                class="prompt-input"
              />
            </div>

            <div class="info-section" v-if="webuiInfo.generationInfo">
              <div class="section-header">
                <span class="label">Generation Info</span>
                <CopyButton :text="webuiInfo.generationInfo" />
              </div>
              <div class="params-box">
                <div
                  v-for="(line, index) in webuiInfo.generationInfo.split('\n')"
                  :key="index"
                  class="param-line"
                >
                  {{ line }}
                </div>
              </div>
            </div>

            <div
              class="info-section"
              v-if="webuiInfo.civitaiResources && webuiInfo.civitaiResources.length > 0"
            >
              <div class="section-header">
                <span class="label">Civitai Resources</span>
              </div>
              <div class="resources-grid">
                <div
                  v-for="(resource, idx) in webuiInfo.civitaiResources"
                  :key="idx"
                  class="resource-card"
                >
                  <div class="card-header">
                    <el-tag
                      size="small"
                      effect="dark"
                      :type="getResourceTypeTag(resource.type)"
                      class="resource-type-tag"
                    >
                      {{ resource.type }}
                    </el-tag>
                    <el-tag
                      v-if="resource.weight !== undefined"
                      size="small"
                      type="info"
                      effect="plain"
                      class="weight-tag"
                    >
                      w: {{ resource.weight }}
                    </el-tag>
                  </div>
                  <div class="model-info">
                    <div class="model-name" :title="resource.modelName">
                      {{ resource.modelName }}
                    </div>
                    <div class="version-name" :title="resource.modelVersionName">
                      {{ resource.modelVersionName }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ComfyUI Tab -->
        <el-tab-pane label="ComfyUI Workflow" name="comfyui" v-if="comfyuiWorkflow">
          <div class="editor-container">
            <RichCodeEditor
              :model-value="comfyuiWorkflow"
              language="json"
              :read-only="true"
              :minimap="false"
            />
          </div>
        </el-tab-pane>

        <!-- ST Character Tab -->
        <el-tab-pane label="ST Character" name="st" v-if="stCharacterInfo">
          <StCharacterInfo :st-character-info="stCharacterInfo" />
        </el-tab-pane>

        <!-- Full Info Tab -->
        <el-tab-pane label="完整元数据" name="full">
          <div class="full-info-wrapper">
            <div class="section-header full-info-header">
              <span class="label">Full Metadata JSON</span>
              <CopyButton :text="fullExifInfo" />
            </div>
            <div class="editor-container-flex">
              <RichCodeEditor
                :model-value="fullExifInfo"
                language="json"
                :read-only="true"
                :minimap="false"
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElButton, ElEmpty, ElIcon, ElTag } from "element-plus";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Delete, Upload, FolderOpened } from "@element-plus/icons-vue";

import InfoCard from "@components/common/InfoCard.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import CopyButton from "./components/CopyButton.vue";
import StCharacterInfo from "./components/StCharacterInfo.vue";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { useMediaInfoParser } from "./composables/useMediaInfoParser";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { useAssetManager, type Asset } from "@/composables/useAssetManager";

const logger = createModuleLogger("MediaInfoReader");
const errorHandler = createModuleErrorHandler("MediaInfoReader");

// 使用 composable 获取解析功能
const { parseImageBuffer } = useMediaInfoParser();
const { importAssetFromPath, importAssetFromBytes, getAssetUrl, getAssetBinary } =
  useAssetManager();

const previewSrc = ref("");
const activeTab = ref("webui");
const dropAreaRef = ref<HTMLElement>();

const webuiInfo = ref<{
  positivePrompt: string;
  negativePrompt: string;
  generationInfo: string;
  civitaiResources?: any[];
}>({ positivePrompt: "", negativePrompt: "", generationInfo: "" });
const comfyuiWorkflow = ref("");
const stCharacterInfo = ref("");
const fullExifInfo = ref("");

const hasData = computed(
  () =>
    webuiInfo.value.positivePrompt ||
    comfyuiWorkflow.value ||
    stCharacterInfo.value ||
    fullExifInfo.value
);

const clearWorkspace = () => {
  previewSrc.value = "";
  webuiInfo.value = { positivePrompt: "", negativePrompt: "", generationInfo: "" };
  comfyuiWorkflow.value = "";
  stCharacterInfo.value = "";
  fullExifInfo.value = "";
};

const getResourceTypeTag = (type: string) => {
  switch (type?.toLowerCase()) {
    case "checkpoint":
      return "success";
    case "lora":
      return "warning";
    case "lycoris":
      return "danger";
    case "embedding":
      return "info";
    default:
      return "primary";
  }
};

const openFilePicker = async () => {
  try {
    const result = await openDialog({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });

    if (result) {
      let path: string;
      interface FileResponse {
        path: string;
        name?: string;
      }

      if (typeof result === "string") {
        path = result;
      } else if (Array.isArray(result)) {
        path = (result as FileResponse[])[0].path;
      } else {
        path = (result as FileResponse).path;
      }

      // 接入资产系统：从路径导入
      const asset = await importAssetFromPath(path, {
        sourceModule: "media-info-reader",
        origin: {
          type: "local",
          source: path,
          sourceModule: "media-info-reader",
        },
      });

      await handleAsset(asset);
    }
  } catch (error) {
    errorHandler.error(error, "打开文件失败");
  }
};

const handleAsset = async (asset: Asset) => {
  try {
    // 获取预览 URL
    previewSrc.value = await getAssetUrl(asset);

    // 获取二进制数据进行解析
    const buffer = await getAssetBinary(asset.path);
    await parseImageFromBuffer(new Uint8Array(buffer), asset.name);
  } catch (error) {
    errorHandler.error(error, "处理资产失败");
  }
};

const parseImageFromBuffer = async (buffer: Uint8Array, fileName?: string) => {
  try {
    logger.debug("开始解析图片", { fileName });

    const result = await parseImageBuffer(buffer);

    webuiInfo.value = result.webuiInfo;
    comfyuiWorkflow.value =
      typeof result.comfyuiWorkflow === "object"
        ? JSON.stringify(result.comfyuiWorkflow, null, 2)
        : result.comfyuiWorkflow;
    stCharacterInfo.value = result.stCharacterInfo
      ? JSON.stringify(result.stCharacterInfo, null, 2)
      : "";
    fullExifInfo.value = result.fullExifInfo ? JSON.stringify(result.fullExifInfo, null, 2) : "";

    // 自动选择合适的标签页
    if (webuiInfo.value.positivePrompt) {
      activeTab.value = "webui";
    } else if (comfyuiWorkflow.value) {
      activeTab.value = "comfyui";
    } else if (stCharacterInfo.value) {
      activeTab.value = "st";
    } else {
      activeTab.value = "full";
    }

    logger.debug("图片解析成功", { fileName });
  } catch (error) {
    errorHandler.error(error, "解析图片信息失败", { context: { fileName } });
    webuiInfo.value = { positivePrompt: "", negativePrompt: "", generationInfo: "" };
    comfyuiWorkflow.value = "";
    stCharacterInfo.value = "";
    if (error instanceof Error) {
      fullExifInfo.value = `无法解析 EXIF 数据: ${error.message}`;
    } else {
      fullExifInfo.value = "无法解析 EXIF 数据，发生未知错误。";
    }
  }
};

// 处理拖放的文件路径
const handlePaths = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];

  try {
    const asset = await importAssetFromPath(path, {
      sourceModule: "media-info-reader",
      origin: {
        type: "local",
        source: path,
        sourceModule: "media-info-reader",
      },
    });
    await handleAsset(asset);
  } catch (error) {
    errorHandler.error(error, "导入文件失败", { context: { path } });
  }
};

// 处理粘贴的文件对象
const handleFiles = async (files: File[]) => {
  if (files.length === 0) return;
  const file = files[0];

  try {
    const buffer = await file.arrayBuffer();
    const asset = await importAssetFromBytes(buffer, file.name, {
      sourceModule: "media-info-reader",
      origin: {
        type: "clipboard",
        source: "paste",
        sourceModule: "media-info-reader",
      },
    });
    await handleAsset(asset);
  } catch (error) {
    errorHandler.error(error, "导入粘贴文件失败", { context: { fileName: file.name } });
  }
};

// 使用文件拖放交互 composable
const { isDraggingOver } = useFileInteraction({
  element: dropAreaRef,
  onPaths: handlePaths,
  onFiles: handleFiles,
  multiple: false,
  imageOnly: true,
  accept: [".png", ".jpg", ".jpeg", ".webp"],
  showPasteMessage: false,
});
</script>

<style scoped>
.media-info-reader-container {
  display: flex;
  gap: 16px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* Left Panel */
.left-panel {
  flex: 2;
  min-width: 500px;
  width: 60vw;
  display: flex;
  flex-direction: column;
}

.preview-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preview-card :deep(.el-card__body) {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-preview-area {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
  overflow: hidden;
  background-color: var(--card-bg);
  box-sizing: border-box;
  margin: 0; /* Reset margin */
}

.image-preview-area.highlight {
  border-color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.1);
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-placeholder);
  padding: 20px;
  text-align: center;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* Right Panel */
.right-panel {
  flex: 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: none;
  box-shadow: none;
}

.info-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.info-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-content {
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-weight: bold;
  color: var(--text-color);
  font-size: 0.95em;
}

.prompt-input :deep(.el-textarea__inner) {
  font-family: var(--font-code);
  line-height: 1.6;
  background-color: var(--input-bg);
}

.params-box {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  font-family: var(--font-code);
  font-size: 0.9em;
  color: var(--text-color-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.param-line {
  margin-bottom: 4px;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.resource-card {
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
}

.resource-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--primary-color);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.resource-type-tag {
  text-transform: uppercase;
  font-weight: bold;
  font-size: 0.7em;
}

.weight-tag {
  font-family: var(--font-code);
  font-size: 0.8em;
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-name {
  font-weight: 600;
  font-size: 0.95em;
  line-height: 1.4;
  color: var(--text-color);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.version-name {
  font-size: 0.85em;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-container {
  height: 100%;
  width: 100%;
}

.full-info-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.full-info-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.editor-container-flex {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

/* Responsive */
@media (max-width: 1000px) {
  .media-info-reader-container {
    flex-direction: column;
    overflow-y: auto;
  }

  .left-panel {
    max-width: none;
    min-height: 300px;
    flex: none;
  }

  .right-panel {
    flex: 1;
    min-height: 800px;
  }
}
</style>
