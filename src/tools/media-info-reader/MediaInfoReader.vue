<template>
  <div class="media-info-reader-container">
    <!-- 左侧：图片预览区 -->
    <ImagePreviewPanel
      :preview-src="state.previewSrc"
      @open-picker="openFilePicker"
      @clear="clearWorkspace"
      @paths="handlePaths"
      @files="handleFiles"
    />

    <!-- 右侧：信息展示区 -->
    <div class="right-panel">
      <div v-if="!hasData && !state.previewSrc" class="empty-state">
        <el-empty description="请先上传图片以查看信息" />
      </div>

      <div v-else-if="!hasData && state.previewSrc" class="empty-state">
        <el-empty description="未检测到 AI 生成信息" />
      </div>

      <el-tabs v-else v-model="state.activeTab" class="info-tabs" type="border-card">
        <!-- WebUI Tab -->
        <el-tab-pane
          label="WebUI Info"
          name="webui"
          v-if="state.webuiInfo.positivePrompt || state.webuiInfo.negativePrompt"
        >
          <WebUIInfoTab :info="state.webuiInfo" />
        </el-tab-pane>

        <!-- ComfyUI Tab -->
        <el-tab-pane label="ComfyUI Workflow" name="comfyui" v-if="state.comfyuiWorkflow">
          <div class="editor-container">
            <RichCodeEditor
              :model-value="state.comfyuiWorkflow"
              language="json"
              :read-only="true"
              :minimap="false"
            />
          </div>
        </el-tab-pane>

        <!-- ST Character Tab -->
        <el-tab-pane label="ST Character" name="st" v-if="state.stCharacterInfo">
          <StCharacterInfo :st-character-info="state.stCharacterInfo" />
        </el-tab-pane>

        <!-- AIO Bundle Tab -->
        <el-tab-pane label="AIO Bundle" name="aio" v-if="state.aioInfo">
          <div class="editor-container">
            <RichCodeEditor
              :model-value="state.aioInfo"
              :language="state.aioFormat"
              :read-only="true"
              :minimap="false"
            />
          </div>
        </el-tab-pane>

        <!-- Full Info Tab -->
        <el-tab-pane label="完整元数据" name="full">
          <div class="full-info-wrapper">
            <div class="section-header full-info-header">
              <span class="label">Full Metadata JSON</span>
              <CopyButton :text="state.fullExifInfo" />
            </div>
            <div class="editor-container-flex">
              <RichCodeEditor
                :model-value="state.fullExifInfo"
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
import { ElEmpty, ElTabs, ElTabPane } from "element-plus";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import CopyButton from "./components/CopyButton.vue";
import StCharacterInfo from "./components/StCharacterInfo.vue";
import WebUIInfoTab from "./components/WebUIInfoTab.vue";
import ImagePreviewPanel from "./components/ImagePreviewPanel.vue";

import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { useMediaInfoParser } from "./composables/useMediaInfoParser";
import { useAssetManager, type Asset } from "@/composables/useAssetManager";
import { useMediaInfoState } from "./composables/useMediaInfoState";

const logger = createModuleLogger("MediaInfoReader");
const errorHandler = createModuleErrorHandler("MediaInfoReader");

// 使用 composable
const { parseImageBuffer } = useMediaInfoParser();
const { importAssetFromPath, importAssetFromBytes, getAssetUrl, getAssetBinary } =
  useAssetManager();
const { state, hasData, clearWorkspace, updateFromResult, setError } = useMediaInfoState();

const handleAsset = async (asset: Asset) => {
  try {
    // 获取预览 URL
    state.value.previewSrc = await getAssetUrl(asset);

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
    updateFromResult(result);
    logger.debug("图片解析成功", { fileName });
  } catch (error) {
    errorHandler.error(error, "解析图片信息失败", { context: { fileName } });
    const message =
      error instanceof Error
        ? `无法解析 EXIF 数据: ${error.message}`
        : "无法解析 EXIF 数据，发生未知错误。";
    setError(message);
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
      if (typeof result === "string") {
        path = result;
      } else if (Array.isArray(result)) {
        path = (result as any)[0].path;
      } else {
        path = (result as any).path;
      }

      const asset = await importAssetFromPath(path, {
        sourceModule: "media-info-reader",
        origin: { type: "local", source: path, sourceModule: "media-info-reader" },
      });

      await handleAsset(asset);
    }
  } catch (error) {
    errorHandler.error(error, "打开文件失败");
  }
};

const handlePaths = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];

  try {
    const asset = await importAssetFromPath(path, {
      sourceModule: "media-info-reader",
      origin: { type: "local", source: path, sourceModule: "media-info-reader" },
    });
    await handleAsset(asset);
  } catch (error) {
    errorHandler.error(error, "导入文件失败", { context: { path } });
  }
};

const handleFiles = async (files: File[]) => {
  if (files.length === 0) return;
  const file = files[0];

  try {
    const buffer = await file.arrayBuffer();
    const asset = await importAssetFromBytes(buffer, file.name, {
      sourceModule: "media-info-reader",
      origin: { type: "clipboard", source: "paste", sourceModule: "media-info-reader" },
    });
    await handleAsset(asset);
  } catch (error) {
    errorHandler.error(error, "导入粘贴文件失败", { context: { fileName: file.name } });
  }
};
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

  .right-panel {
    flex: 1;
    min-height: 800px;
  }
}
</style>
