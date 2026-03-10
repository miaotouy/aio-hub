<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { useSymlinkMoverLogic } from "./composables/useSymlinkMover";
import FileListPanel from "./components/FileListPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import LogDialog from "./components/LogDialog.vue";
import type { FileItem, OperationLog, LinkType, OperationMode } from "./types";

const logic = useSymlinkMoverLogic();

// UI 状态
const sourceFiles = ref<FileItem[]>([]);
const targetDirectory = ref("");
const baseSourceDir = ref("");
const mirrorMode = ref(false);
const linkType = ref<LinkType>("symlink");
const operationMode = ref<OperationMode>("move");
const isProcessing = ref(false);

// 进度相关状态
const showProgress = ref(false);
const currentProgress = ref(0);
const currentFile = ref("");
const copiedBytes = ref(0);
const totalBytes = ref(0);

// 操作日志相关
const latestLog = ref<OperationLog | null>(null);
const showLogDialog = ref(false);
const allLogs = ref<OperationLog[]>([]);
const tickerKey = ref(0);

// 计算属性
const canExecute = computed(() => {
  return sourceFiles.value.length > 0 && (operationMode.value === "link-only" || !!targetDirectory.value);
});

// 生命周期钩子
onMounted(async () => {
  await logic.startProgressListener((progress) => {
    currentFile.value = progress.currentFile;
    currentProgress.value = progress.progressPercentage;
    copiedBytes.value = progress.copiedBytes;
    totalBytes.value = progress.totalBytes;
    showProgress.value = true;
  });

  await loadLatestLog();

  watch(latestLog, (newLog, oldLog) => {
    if (newLog && (!oldLog || newLog.timestamp !== oldLog.timestamp)) {
      tickerKey.value++;
    }
  });
});

onUnmounted(async () => {
  await logic.stopProgressListener();
});

// UI 事件处理方法
const loadLatestLog = async () => {
  latestLog.value = await logic.getLatestLog();
};

const loadAllLogs = async () => {
  allLogs.value = await logic.getAllLogs();
};

const openLogDialog = async () => {
  await loadAllLogs();
  showLogDialog.value = true;
};

// 验证文件列表
const validateFiles = async () => {
  if (!targetDirectory.value || sourceFiles.value.length === 0) {
    return;
  }

  sourceFiles.value = await logic.validateFiles(
    sourceFiles.value,
    targetDirectory.value,
    linkType.value,
    operationMode.value
  );
};

// 监听目标目录和链接类型变化，触发验证
watch([targetDirectory, linkType, operationMode], () => {
  validateFiles();
});

// 文件处理方法
const addSourceFiles = (paths: string[]) => {
  const newFiles = logic.parsePathsToFileItems(paths);
  const mergedFiles = logic.mergeFileItems(sourceFiles.value, newFiles);
  const addedCount = mergedFiles.length - sourceFiles.value.length;

  if (addedCount > 0) {
    sourceFiles.value = mergedFiles;
    customMessage.success(`已添加 ${addedCount} 个文件/文件夹`);
    validateFiles();
  }
};

const removeFile = (index: number) => {
  sourceFiles.value = logic.removeFileByIndex(sourceFiles.value, index);
};

// 文件/目录选择
const selectSourceFiles = async () => {
  const selected = await open({
    multiple: true,
    title: "选择要搬家的文件",
  });
  if (Array.isArray(selected) && selected.length > 0) {
    addSourceFiles(selected);
  } else if (typeof selected === "string") {
    addSourceFiles([selected]);
  }
};

const selectSourceFolders = async () => {
  const selected = await open({
    multiple: true,
    directory: true,
    title: "选择要搬家的文件夹",
  });
  if (Array.isArray(selected) && selected.length > 0) {
    addSourceFiles(selected);
  } else if (typeof selected === "string") {
    addSourceFiles([selected]);
  }
};

const selectTargetDirectory = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择目标目录",
  });
  if (typeof selected === "string") {
    targetDirectory.value = selected;
  }
};

const selectBaseSourceDir = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择基准源目录",
  });
  if (typeof selected === "string") {
    baseSourceDir.value = selected;
  }
};

// 取消操作
const cancelOperation = async () => {
  const success = await logic.cancelOperation();
  if (success) {
    customMessage.info("正在取消操作...");
  }
};

// 核心操作
const executeMoveAndLink = async () => {
  if (sourceFiles.value.length === 0) {
    customMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!targetDirectory.value && operationMode.value === "move") {
    customMessage.warning("请选择目标目录");
    return;
  }

  // 重置进度状态
  showProgress.value = false;
  currentProgress.value = 0;
  currentFile.value = "";
  copiedBytes.value = 0;
  totalBytes.value = 0;

  isProcessing.value = true;
  sourceFiles.value.forEach((file) => (file.status = "processing"));

  const sourcePaths = sourceFiles.value.map((file) => file.path);
  let result: string | null;

  const options = {
    sourcePaths,
    targetDir: targetDirectory.value,
    linkType: linkType.value,
    baseSourceDir: mirrorMode.value ? baseSourceDir.value : undefined,
  };

  if (operationMode.value === "move") {
    result = await logic.moveAndLink(options);
  } else {
    result = await logic.createLinksOnly(options);
  }

  if (result === null) {
    sourceFiles.value.forEach((file) => {
      if (file.status === "processing") {
        file.status = "error";
        file.error = "处理失败";
      }
    });
  } else {
    if (result.includes("已被用户取消")) {
      customMessage.warning(result);
      sourceFiles.value.forEach((file) => {
        if (file.status === "processing") {
          file.status = "pending";
        }
      });
    } else if (result.includes("个错误")) {
      customMessage.error(result);
      sourceFiles.value.forEach((file) => {
        if (file.status === "processing") {
          file.status = "error";
          file.error = "处理失败，请查看错误详情";
        }
      });
    } else {
      customMessage.success(result || "操作完成");
      sourceFiles.value.forEach((file) => (file.status = "success"));
    }
  }

  isProcessing.value = false;
  setTimeout(() => {
    showProgress.value = false;
  }, 1000);
  await loadLatestLog();
};
</script>

<template>
  <div class="symlink-mover-container">
    <div class="column">
      <FileListPanel
        :files="sourceFiles"
        @update:files="sourceFiles = $event"
        @add-files="addSourceFiles"
        @remove-file="removeFile"
        @select-files="selectSourceFiles"
        @select-folders="selectSourceFolders"
      />
    </div>

    <div class="column settings-column">
      <SettingsPanel
        :operation-mode="operationMode"
        @update:operation-mode="operationMode = $event"
        :mirror-mode="mirrorMode"
        @update:mirror-mode="mirrorMode = $event"
        :base-source-dir="baseSourceDir"
        @update:base-source-dir="baseSourceDir = $event"
        :target-directory="targetDirectory"
        @update:target-directory="targetDirectory = $event"
        :link-type="linkType"
        @update:link-type="linkType = $event"
        :is-processing="isProcessing"
        :show-progress="showProgress"
        :current-progress="currentProgress"
        :current-file="currentFile"
        :copied-bytes="copiedBytes"
        :total-bytes="totalBytes"
        :latest-log="latestLog"
        :ticker-key="tickerKey"
        :can-execute="canExecute"
        @select-base-dir="selectBaseSourceDir"
        @select-target-dir="selectTargetDirectory"
        @execute="executeMoveAndLink"
        @cancel="cancelOperation"
        @open-log="openLogDialog"
      />
    </div>

    <LogDialog v-model="showLogDialog" :logs="allLogs" />
  </div>
</template>

<style scoped>
.symlink-mover-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.column:first-child {
  flex: 3;
  min-width: 300px;
}

.settings-column {
  flex: 2;
  min-width: 250px;
}
</style>
