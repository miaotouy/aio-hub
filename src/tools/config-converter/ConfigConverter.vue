<template>
  <div class="config-converter-container">
    <!-- 顶部工具栏 -->
    <FormatToolbar
      v-model:mode="mode"
      v-model:single-from="singleFrom"
      v-model:single-to="singleTo"
      v-model:batch-to="batchTo"
      v-model:output-mode="outputMode"
      v-model:scan-options="scanOptions"
      :single-options="singleOptions"
      :batch-options="batchOptions"
      :output-directory="outputDirectory"
      :is-converting="isConverting"
      @select-directory="selectOutputDirectory"
      @convert="convertBatch"
    />

    <!-- 主体内容区 -->
    <div class="converter-body">
      <!-- 单文件模式 -->
      <template v-if="mode === 'single'">
        <div class="single-layout">
          <SinglePreview
            v-model="singleInput"
            :output="singleOutput"
            :from-format="singleFrom"
            :to-format="singleTo"
            :error="singleError"
            :warnings="singleWarnings"
          />
          <!-- overlay 拖放层 -->
          <DropZone overlay bare hide-content :show-overlay-on-drag="true" :multiple="true" @drop="handleSingleImport" />
        </div>
      </template>

      <!-- 批量模式 -->
      <template v-else>
        <!-- 列表为空时展示拖放区 -->
        <div v-if="batchItems.length === 0" class="empty-zone-wrapper">
          <FileInputZone @add-paths="addFiles" />
        </div>

        <!-- 列表不为空时展示表格 + overlay 拖放 -->
        <div v-else class="batch-layout">
          <BatchFileList
            :items="batchItems"
            @remove="removeFile"
            @clear="clearFiles"
            @select-files="selectFiles"
            @select-directory="selectDirectory"
          />
          <!-- overlay 拖放层 -->
          <DropZone overlay bare hide-content :show-overlay-on-drag="true" :multiple="true" @drop="addFiles" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useConfigConverter } from "./composables/useConfigConverter";
import FormatToolbar from "./components/FormatToolbar.vue";
import FileInputZone from "./components/FileInputZone.vue";
import BatchFileList from "./components/BatchFileList.vue";
import SinglePreview from "./components/SinglePreview.vue";
import DropZone from "@/components/common/DropZone.vue";

const errorHandler = createModuleErrorHandler("ConfigConverter/View");

const {
  mode,
  singleInput,
  singleOutput,
  singleFrom,
  singleTo,
  singleError,
  singleWarnings,
  singleOptions,
  handleSingleImport,
  batchItems,
  batchTo,
  batchOptions,
  scanOptions,
  outputMode,
  outputDirectory,
  isConverting,
  selectOutputDirectory,
  addFiles,
  removeFile,
  clearFiles,
  convertBatch,
} = useConfigConverter();

/**
 * 侧边栏选择文件
 */
const selectFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择配置文件",
      filters: [
        {
          name: "配置文件",
          extensions: ["json", "yaml", "yml", "toml", "ini", "cfg", "xml", "env"],
        },
      ],
    });

    if (selected && Array.isArray(selected)) {
      addFiles(selected);
    } else if (selected) {
      addFiles([selected as string]);
    }
  } catch (error: any) {
    errorHandler.error(error, "选择文件失败");
  }
};

/**
 * 侧边栏选择目录
 */
const selectDirectory = async () => {
  try {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "选择配置目录",
    });

    if (selected) {
      addFiles([selected as string]);
    }
  } catch (error: any) {
    errorHandler.error(error, "选择目录失败");
  }
};
</script>

<style scoped>
.config-converter-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: transparent;
}

.converter-body {
  flex: 1;
  padding: 16px 0px;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.empty-zone-wrapper {
  flex: 1;
  display: flex;
  min-height: 0;
}

.single-layout {
  position: relative;
  flex: 1;
  min-height: 0;
}

.batch-layout {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.drop-zone {
  border-radius: 8px !important;
}
</style>
