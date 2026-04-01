<script setup lang="ts">
import { ref, computed } from "vue";
import { useFileDownload } from "@/composables/useFileDownload";
import { useDownloadStore } from "@/stores/downloadStore";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import {
  Download,
  FileText,
  FileJson,
  Image as ImageIcon,
  FileBox,
  Upload,
  Settings2,
  History,
  FolderOpen,
} from "lucide-vue-next";
import DownloadManager from "@/components/DownloadManager.vue";
import DropZone from "@/components/common/DropZone.vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const logger = createModuleLogger("DownloadTester");
const errorHandler = createModuleErrorHandler("DownloadTester");
const { downloadFile } = useFileDownload();
const downloadStore = useDownloadStore();
const appSettingsStore = useAppSettingsStore();

logger.info("下载测试组件已加载");

const downloadMode = ref<"auto" | "manual">("auto");
const lastDroppedFile = ref<{ name: string; content: Uint8Array } | null>(null);

const downloadSettings = computed(() => appSettingsStore.settings.download);
const hasHistory = computed(() => downloadStore.history.length > 0);

/**
 * 选择下载目录快捷设置
 */
const handleSelectDownloadPath = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: downloadSettings.value?.defaultDownloadPath,
    });

    if (selected) {
      appSettingsStore.update({
        download: {
          alwaysAskSavePath: downloadSettings.value?.alwaysAskSavePath ?? false,
          showNotification: downloadSettings.value?.showNotification ?? true,
          openFolderAfterDownload: downloadSettings.value?.openFolderAfterDownload ?? false,
          showDownloadButtonInTitleBar: downloadSettings.value?.showDownloadButtonInTitleBar ?? true,
          ...downloadSettings.value,
          defaultDownloadPath: selected as string,
        },
      });
      customMessage.success("下载目录已更新");
    }
  } catch (error) {
    errorHandler.error(error as Error, "选择下载目录失败");
  }
};

/**
 * 测试简单文本下载
 */
const testTextDownload = async () => {
  await downloadFile({
    content: "这是一段测试文本内容。\n生成时间：" + new Date().toLocaleString(),
    filename: "test-text.txt",
    mode: downloadMode.value,
    type: "text",
  });
};

/**
 * 测试 JSON 下载
 */
const testJsonDownload = async () => {
  const data = {
    id: 1,
    name: "Component Tester",
    timestamp: Date.now(),
    features: ["Download", "Upload", "Test"],
  };
  await downloadFile({
    content: JSON.stringify(data, null, 2),
    filename: "test-data.json",
    mode: downloadMode.value,
    type: "text",
  });
};

/**
 * 测试图片下载 (从 URL 获取)
 */
const testImageDownload = async () => {
  try {
    const response = await fetch("https://picsum.photos/400/300");
    const blob = await response.blob();
    await downloadFile({
      content: blob,
      filename: `random-image-${Date.now()}.jpg`,
      mode: downloadMode.value,
      type: "binary",
    });
  } catch (error) {
    errorHandler.error(error as Error, "获取测试图片失败");
  }
};

/**
 * 测试大文件下载 (生成 10MB 数据)
 */
const testLargeFileDownload = async () => {
  const size = 10 * 1024 * 1024; // 10MB
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  await downloadFile({
    content: data,
    filename: "large-test-file.bin",
    mode: downloadMode.value,
    type: "binary",
  });
};

/**
 * 处理文件拖放
 */
const handleFileDrop = async (files: File[]) => {
  if (files.length === 0) return;

  const file = files[0];
  try {
    const buffer = await file.arrayBuffer();
    lastDroppedFile.value = {
      name: file.name,
      content: new Uint8Array(buffer),
    };
    customMessage.success(`已加载文件: ${file.name}`);
  } catch (error) {
    errorHandler.error(error as Error, "加载拖放文件失败");
  }
};

/**
 * 清空下载历史
 */
const handleClearHistory = async () => {
  await downloadStore.clearHistory();
  customMessage.success("已清空下载历史");
};

/**
 * 下载已加载的拖放文件
 */
const downloadDroppedFile = async () => {
  if (!lastDroppedFile.value) return;

  await downloadFile({
    content: lastDroppedFile.value.content,
    filename: `copy-${lastDroppedFile.value.name}`,
    mode: downloadMode.value,
    type: "binary",
  });
};
</script>

<template>
  <div class="download-tester">
    <div class="tester-layout">
      <!-- 左侧：控制区 -->
      <div class="control-panel">
        <div class="section-title">
          <Settings2 class="icon" />
          <span>下载配置</span>
        </div>

        <div class="config-group">
          <div class="config-item">
            <span class="label">下载模式</span>
            <el-radio-group v-model="downloadMode" size="small">
              <el-radio-button value="auto">自动 (静默)</el-radio-button>
              <el-radio-button value="manual">手动 (另存为)</el-radio-button>
            </el-radio-group>
          </div>

          <div class="config-item path-config">
            <span class="label">下载目录</span>
            <div class="path-display" :title="downloadSettings?.defaultDownloadPath || '系统默认'">
              {{ downloadSettings?.defaultDownloadPath || "系统默认" }}
            </div>
            <el-button circle size="small" @click="handleSelectDownloadPath">
              <el-icon><FolderOpen :size="14" /></el-icon>
            </el-button>
          </div>
        </div>

        <el-divider />

        <div class="section-title">
          <Download class="icon" />
          <span>预设测试</span>
        </div>

        <div class="button-grid">
          <el-button @click="testTextDownload" type="primary" plain>
            <template #icon><FileText :size="16" /></template>
            文本下载
          </el-button>
          <el-button @click="testJsonDownload" type="success" plain>
            <template #icon><FileJson :size="16" /></template>
            JSON 下载
          </el-button>
          <el-button @click="testImageDownload" type="warning" plain>
            <template #icon><ImageIcon :size="16" /></template>
            图片下载
          </el-button>
          <el-button @click="testLargeFileDownload" type="danger" plain>
            <template #icon><FileBox :size="16" /></template>
            10MB 大文件
          </el-button>
        </div>

        <el-divider />

        <div class="section-title">
          <Upload class="icon" />
          <span>拖放测试</span>
        </div>

        <div class="drop-area-container">
          <DropZone
            @files-dropped="handleFileDrop"
            placeholder="将文件拖到此处加载，然后点击下方按钮重新下载"
            class="tester-dropzone"
          />

          <div v-if="lastDroppedFile" class="dropped-info">
            <div class="file-meta">
              <FileText :size="14" />
              <span>{{ lastDroppedFile.name }}</span>
              <span class="size">({{ (lastDroppedFile.content.length / 1024).toFixed(2) }} KB)</span>
            </div>
            <el-button type="primary" size="small" @click="downloadDroppedFile"> 重新下载此文件 </el-button>
          </div>
        </div>
      </div>

      <!-- 右侧：管理区 -->
      <div class="history-panel">
        <div class="section-title history-title">
          <div class="title-left">
            <History class="icon" />
            <span>下载历史</span>
          </div>
          <el-button v-if="hasHistory" type="danger" link size="small" @click="handleClearHistory">
            清空历史
          </el-button>
        </div>
        <div class="manager-wrapper">
          <DownloadManager />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.download-tester {
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.tester-layout {
  display: grid;
  grid-template-columns: 450px 1fr;
  gap: 24px;
  height: 100%;
}

.control-panel,
.history-panel {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--text-color);
}

.history-title {
  justify-content: space-between;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title .icon {
  width: 18px;
  height: 18px;
  color: var(--primary-color);
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-item .label {
  font-size: 14px;
  color: var(--text-color-secondary);
}

.button-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.drop-area-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 200px;
}

.tester-dropzone {
  flex: 1;
  border-style: dashed !important;
}

.dropped-info {
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-color);
}

.file-meta .size {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.manager-wrapper {
  flex: 1;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

:deep(.download-manager-container) {
  height: 100%;
}
</style>
