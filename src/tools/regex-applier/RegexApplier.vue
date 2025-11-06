<template>
  <div class="regex-applier-container">
    <!-- 顶部操作栏 -->
    <el-card shadow="never" class="box-card header-section">
      <div class="header-content">
        <div class="mode-switch">
          <span class="mode-label">处理模式</span>
          <el-radio-group v-model="processingMode" size="large">
            <el-radio-button value="text">文本模式</el-radio-button>
            <el-radio-button value="file">文件模式</el-radio-button>
          </el-radio-group>
        </div>
        <div class="header-actions">
          <el-tooltip placement="bottom" :disabled="selectedPresetIds.length === 0">
            <template #content>
              <div v-if="selectedPresetIds.length > 0">
                <div style="font-weight: bold; margin-bottom: 4px">已启用的预设：</div>
                <div v-for="preset in selectedPresets" :key="preset.id" style="margin: 2px 0">
                  {{ preset.name }} ({{ preset.rules.filter((r: any) => r.enabled).length }} 条规则)
                </div>
              </div>
            </template>
            <el-button
              @click="togglePresetSection"
              :icon="showPresetSection ? 'ArrowUp' : 'ArrowDown'"
              text
            >
              {{ showPresetSection ? "隐藏预设" : "显示预设" }}
            </el-button>
          </el-tooltip>
          <el-badge :value="errorLogCount" :hidden="errorLogCount === 0" :max="99" type="danger">
            <el-button @click="openLogDialog" :icon="List">
              查看日志{{ logs.length > 0 ? `(${logs.length})` : "" }}
            </el-button>
          </el-badge>
          <el-button type="primary" @click="goToManageRules" :icon="Setting"> 管理规则 </el-button>
        </div>
      </div>
    </el-card>

    <!-- 预设选择区域 -->
    <el-card v-show="showPresetSection" shadow="never" class="box-card preset-section">
      <template #header>
        <div class="card-header">
          <span>选择预设 (按顺序应用)</span>
          <el-dropdown @command="handleAddPreset">
            <el-button type="primary" :icon="Plus">添加预设</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="preset in availablePresets"
                  :key="preset.id"
                  :command="preset.id"
                  :disabled="selectedPresetIds.includes(preset.id)"
                >
                  {{ preset.name }}
                </el-dropdown-item>
                <el-dropdown-item v-if="availablePresets.length === 0" disabled>
                  暂无可用预设
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>

      <div class="preset-tags-container">
        <el-empty v-if="selectedPresetIds.length === 0" description="请添加要应用的预设" />
        <VueDraggableNext
          v-else
          v-model="selectedPresets"
          item-key="id"
          @start="onDragStart"
          @end="onDragEnd"
          class="preset-tags"
          ghost-class="ghost"
          drag-class="drag"
          :force-fallback="true"
        >
          <div v-for="preset in selectedPresets" :key="preset.id" class="preset-tag">
            <span class="preset-tag-content">
              {{ preset.name }}
              <span class="rules-count">{{
                preset.rules.filter((r: any) => r.enabled).length
              }}</span>
            </span>
            <el-icon class="close-icon" @click="removePreset(preset.id)">
              <Close />
            </el-icon>
          </div>
        </VueDraggableNext>
      </div>
    </el-card>

    <!-- 文本模式界面 -->
    <div v-if="processingMode === 'text'" class="text-mode-container">
      <el-row :gutter="20" class="input-output-section">
        <el-col :span="12">
          <el-card shadow="never" class="box-card text-card">
            <template #header>
              <div class="card-header">
                <span>输入文本</span>
                <div class="card-actions">
                  <el-button text @click="pasteToSource">粘贴</el-button>
                  <el-button
                    type="success"
                    @click="oneClickProcess"
                    :icon="MagicStick"
                    :disabled="selectedPresetIds.length === 0"
                  >
                    一键处理
                  </el-button>
                </div>
              </div>
            </template>
            <el-input
              v-model="sourceText"
              :rows="20"
              type="textarea"
              placeholder="请输入待处理的文本..."
            />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="box-card text-card">
            <template #header>
              <div class="card-header">
                <span>输出文本</span>
                <div class="card-actions">
                  <el-button text @click="copyResult">复制</el-button>
                  <el-button text type="success" @click="sendResultToChat">发送到聊天</el-button>
                </div>
              </div>
            </template>
            <el-input
              v-model="resultText"
              :rows="20"
              type="textarea"
              placeholder="处理结果将显示在这里..."
              readonly
            />
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 文件模式界面 -->
    <div v-if="processingMode === 'file'" class="file-mode-container">
      <el-row :gutter="20">
        <el-col :span="16">
          <InfoCard title="待处理文件" class="full-height-card">
            <template #headerExtra>
              <el-button
                :icon="Delete"
                text
                circle
                @click="clearFiles"
                :disabled="files.length === 0"
              />
            </template>
            <div class="source-controls">
              <el-input
                v-model="filePathInput"
                placeholder="输入或拖拽文件/文件夹路径"
                @keyup.enter="addFilePathFromInput"
              />
              <el-tooltip content="选择文件" placement="top">
                <el-button @click="selectFiles" :icon="Document" circle />
              </el-tooltip>
              <el-tooltip content="选择文件夹" placement="top">
                <el-button @click="selectFolders" :icon="FolderOpened" circle />
              </el-tooltip>
              <el-button @click="addFilePathFromInput" type="primary">添加</el-button>
            </div>
            <div
              ref="fileDropArea"
              class="drop-area"
              data-drop-target="files"
              :class="{ dragover: hoveredTarget === 'files' }"
              @dragenter="handleDragEnter($event, 'files')"
              @dragover="handleDragOver($event, 'files')"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
            >
              <el-scrollbar class="file-list-scrollbar">
                <div v-if="files.length === 0" class="empty-state">
                  <el-icon><FolderAdd /></el-icon>
                  <p>将要处理的文件或文件夹拖拽至此</p>
                </div>
                <div v-else class="file-list">
                  <div v-for="(file, index) in files" :key="file.path" class="file-item">
                    <el-icon class="file-icon"><Document /></el-icon>
                    <div class="file-details">
                      <div class="file-name" :title="file.name">{{ file.name }}</div>
                      <div class="file-path" :title="file.path">{{ file.path }}</div>
                      <div
                        v-if="file.status !== 'pending'"
                        class="file-status"
                        :class="`status-${file.status}`"
                      >
                        {{ getStatusText(file.status) }}
                      </div>
                    </div>
                    <el-button
                      @click="removeFile(index)"
                      :icon="Delete"
                      text
                      circle
                      size="small"
                      class="remove-btn"
                    />
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </InfoCard>
        </el-col>
        <el-col :span="8">
          <InfoCard title="输出设置" class="output-settings-card">
            <div class="setting-group">
              <label>输出目录</label>
              <div
                ref="outputDropArea"
                class="target-control"
                data-drop-target="output"
                :class="{ dragover: hoveredTarget === 'output' }"
                @dragenter="handleDragEnter($event, 'output')"
                @dragover="handleDragOver($event, 'output')"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
              >
                <el-input v-model="outputDirectory" placeholder="输入、拖拽或点击选择输出目录" />
                <el-button @click="selectOutputDirectory" :icon="FolderOpened">选择</el-button>
              </div>
            </div>

            <div class="setting-group">
              <label>文件名后缀</label>
              <el-input v-model="filenameSuffix" placeholder="可选，例如 _processed" clearable>
                <template #prepend>原文件名</template>
                <template #append>.扩展名</template>
              </el-input>
              <div class="setting-hint">在原文件名后添加后缀，方便区分处理后的文件</div>
            </div>

            <div class="setting-group">
              <el-checkbox v-model="forceTxt" label="强制保存为 .txt 格式" />
              <div class="setting-hint">忽略原始文件扩展名，统一保存为 .txt</div>
            </div>

            <div class="setting-group">
              <el-checkbox v-model="clearProcessedFiles" label="处理后清除成功的文件" />
              <div class="setting-hint">处理成功的文件将自动从列表中移除</div>
            </div>

            <el-button
              type="primary"
              @click="processFiles"
              :loading="isProcessing"
              :disabled="
                isProcessing ||
                files.length === 0 ||
                !outputDirectory ||
                selectedPresetIds.length === 0
              "
              class="execute-btn"
              size="large"
            >
              <el-icon><Rank /></el-icon>
              {{ isProcessing ? "处理中..." : "开始处理文件" }}
            </el-button>
          </InfoCard>
        </el-col>
      </el-row>
    </div>

    <!-- 预设管理弹窗 -->
    <BaseDialog
      :visible="presetManagerVisible"
      @update:visible="handlePresetManagerClose"
      title="管理预设规则"
      width="90%"
      height="90%"
      :close-on-backdrop-click="false"
    >
      <template #content>
        <PresetManager />
      </template>
    </BaseDialog>

    <!-- 日志弹窗 -->
    <BaseDialog
      :visible="logDialogVisible"
      @update:visible="logDialogVisible = $event"
      title="日志"
      width="800px"
      height="auto"
      :close-on-backdrop-click="false"
    >
      <template #content>
        <div class="log-dialog-content">
          <div class="log-output">
            <p v-for="(log, index) in logs" :key="index" :class="`log-${log.type}`">
              [{{ log.time }}] {{ log.message }}
            </p>
            <p v-if="logs.length === 0" class="empty-log">暂无日志</p>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="clearLogs">清空日志</el-button>
        <el-button type="primary" @click="logDialogVisible = false">关闭</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import {
  Delete,
  Rank,
  Document,
  FolderOpened,
  FolderAdd,
  Plus,
  Setting,
  MagicStick,
  List,
  Close,
} from "@element-plus/icons-vue";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import debounce from "lodash/debounce";
import { VueDraggableNext } from "vue-draggable-next";
import InfoCard from "@components/common/InfoCard.vue";
import BaseDialog from "@components/common/BaseDialog.vue";
import PresetManager from "./PresetManager.vue";
import { usePresetStore } from "./store";
import type { LogEntry, RegexPreset } from "./types";
import { loadAppConfig, createDebouncedSave, type AppConfig } from "./appConfig";
import { createModuleLogger } from "@utils/logger";
import { serviceRegistry } from "@/services/registry";
import type RegexApplierService from "./regexApplier.service";
import { useSendToChat } from "@/composables/useSendToChat";

// 创建模块日志器
const logger = createModuleLogger("RegexApplier");

// 获取服务实例
const regexService = serviceRegistry.getService<RegexApplierService>('regex-applier')!;

// 获取发送到聊天功能
const { sendToChat } = useSendToChat();

const store = usePresetStore();

interface FileItem {
  path: string;
  name: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

type ProcessingMode = "text" | "file";
type DropTarget = "files" | "output";

// ===== 状态定义 =====
const processingMode = ref<ProcessingMode>("text");

// 预设选择
const selectedPresetIds = ref<string[]>([]);
const showPresetSection = ref(true);

// 文本模式状态
const sourceText = ref("");
const resultText = ref("");

// 文件模式状态
const filePathInput = ref("");
const files = ref<FileItem[]>([]);
const outputDirectory = ref("");
const forceTxt = ref(false);
const filenameSuffix = ref("");
const clearProcessedFiles = ref(false);
const isProcessing = ref(false);
const hoveredTarget = ref<DropTarget | null>(null);

// 日志状态
const logs = ref<LogEntry[]>([]);
const logDialogVisible = ref(false);

// 预设管理弹窗状态
const presetManagerVisible = ref(false);

// 应用配置
const appConfig = ref<AppConfig | null>(null);
const debouncedSaveConfig = createDebouncedSave(500);

// 模板引用
const fileDropArea = ref<HTMLElement | null>(null);
const outputDropArea = ref<HTMLElement | null>(null);

// ===== 计算属性 =====
const availablePresets = computed(() => store.presets);

// 使用 ref 而不是 computed 来避免响应性问题
const selectedPresets = ref<RegexPreset[]>([]);

// 计算错误和警告日志数量
const errorLogCount = computed(
  () => logs.value.filter((log) => log.type === "error" || log.type === "warn").length
);

// 监听 selectedPresetIds 变化，更新 selectedPresets
watch(
  selectedPresetIds,
  (ids) => {
    selectedPresets.value = ids
      .map((id) => store.presets.find((p) => p.id === id))
      .filter((p): p is RegexPreset => !!p);
  },
  { immediate: true, deep: true }
);

// 拖拽事件处理
const onDragStart = () => {
  logger.debug("开始拖拽预设");
  addLog("开始调整预设顺序", "info");
};

const onDragEnd = () => {
  logger.debug("拖拽结束，新顺序", {
    presets: selectedPresets.value.map((p) => ({ id: p.id, name: p.name })),
  });
  // 更新 selectedPresetIds 以保持同步
  selectedPresetIds.value = selectedPresets.value.map((p) => p.id);
  addLog("预设顺序已更新", "info");
};

// ===== 初始化 =====
onMounted(async () => {
  // 加载预设
  await store.loadPresets();

  // 加载应用配置
  try {
    const config = await loadAppConfig();
    appConfig.value = config;

    // 恢复界面设置
    processingMode.value = config.processingMode;
    showPresetSection.value = config.showPresetSection;

    // 恢复选中的预设（过滤掉已删除的预设）
    const validPresetIds = config.selectedPresetIds.filter((id) =>
      store.presets.some((p) => p.id === id)
    );
    selectedPresetIds.value = validPresetIds;

    // 恢复文件模式设置
    if (config.fileMode.outputDirectory) {
      outputDirectory.value = config.fileMode.outputDirectory;
    }
    forceTxt.value = config.fileMode.forceTxt;
    filenameSuffix.value = config.fileMode.filenameSuffix;
    clearProcessedFiles.value = config.fileMode.clearProcessedFiles;

    addLog("已恢复上次的设置", "info");
  } catch (error) {
    logger.error("加载应用配置失败", error);
    // 如果没有选中的预设，默认选中第一个
    if (selectedPresetIds.value.length === 0 && store.presets.length > 0) {
      selectedPresetIds.value = [store.presets[0].id];
    }
  }

  setupFileDropListener();
  addLog("应用已就绪", "info");
});

// ===== 配置自动保存 =====
const saveCurrentConfig = () => {
  if (!appConfig.value) return;

  const config: AppConfig = {
    ...appConfig.value,
    processingMode: processingMode.value,
    selectedPresetIds: selectedPresetIds.value,
    showPresetSection: showPresetSection.value,
    fileMode: {
      outputDirectory: outputDirectory.value,
      forceTxt: forceTxt.value,
      filenameSuffix: filenameSuffix.value,
      clearProcessedFiles: clearProcessedFiles.value,
    },
  };

  appConfig.value = config;
  debouncedSaveConfig(config);
};

// 监听设置变化并自动保存
watch(processingMode, saveCurrentConfig);
watch(selectedPresetIds, saveCurrentConfig, { deep: true });
watch(showPresetSection, saveCurrentConfig);
watch(outputDirectory, saveCurrentConfig);
watch(forceTxt, saveCurrentConfig);
watch(filenameSuffix, saveCurrentConfig);
watch(clearProcessedFiles, saveCurrentConfig);

// ===== 日志 =====
const addLog = (message: string, type: LogEntry["type"] = "info") => {
  const time = new Date().toLocaleTimeString();
  logs.value.push({ time, message, type });
};

const clearLogs = () => {
  logs.value = [];
  customMessage.success("日志已清空");
};

const openLogDialog = () => {
  logDialogVisible.value = true;
};

// ===== 预设操作 =====
const togglePresetSection = () => {
  showPresetSection.value = !showPresetSection.value;
};

const goToManageRules = () => {
  presetManagerVisible.value = true;
};

// 处理预设管理器关闭事件
const handlePresetManagerClose = async () => {
  presetManagerVisible.value = false;
  // 重新加载预设以获取最新数据
  await store.loadPresets();
  // 更新选中的预设列表（移除已删除的预设）
  selectedPresetIds.value = selectedPresetIds.value.filter((id) =>
    store.presets.some((p) => p.id === id)
  );
};

const handleAddPreset = (presetId: string) => {
  if (!selectedPresetIds.value.includes(presetId)) {
    selectedPresetIds.value.push(presetId);
    const preset = store.presets.find((p) => p.id === presetId);
    if (preset) {
      addLog(`已添加预设: ${preset.name}`);
    }
  }
};

const removePreset = (presetId: string) => {
  const index = selectedPresetIds.value.indexOf(presetId);
  if (index !== -1) {
    const preset = store.presets.find((p) => p.id === presetId);
    selectedPresetIds.value.splice(index, 1);
    if (preset) {
      addLog(`已移除预设: ${preset.name}`);
    }
  }
};

// ===== 文本模式处理 =====
const debouncedProcessText = debounce(() => {
  processText();
}, 300);

watch(sourceText, debouncedProcessText);
watch(selectedPresetIds, debouncedProcessText, { deep: true });

const processText = async () => {
  if (!sourceText.value) {
    resultText.value = "";
    return;
  }

  if (selectedPresetIds.value.length === 0) {
    resultText.value = sourceText.value;
    return;
  }

  // 使用服务处理文本
  const result = await regexService.processText({
    sourceText: sourceText.value,
    presetIds: selectedPresetIds.value,
  });

  if (result) {
    resultText.value = result.text;
    // 添加日志
    result.logs.forEach((log) => logs.value.push(log));
  }
};

const pasteToSource = async () => {
  const text = await regexService.pasteFromClipboard();
  if (text !== null) {
    sourceText.value = text;
    addLog("已从剪贴板粘贴内容到输入框。");
  }
};

const copyResult = async () => {
  const success = await regexService.copyToClipboard(resultText.value);
  if (success) {
    addLog("处理结果已复制到剪贴板。");
  }
};

const sendResultToChat = () => {
  sendToChat(resultText.value, {
    successMessage: '已将处理结果发送到聊天',
  });
  addLog("处理结果已发送到聊天输入框。");
};

const oneClickProcess = async () => {
  if (selectedPresetIds.value.length === 0) {
    customMessage.warning("请先选择至少一个预设");
    return;
  }
  addLog("执行一键处理剪贴板...");
  
  const result = await regexService.oneClickProcess({
    presetIds: selectedPresetIds.value,
  });
  
  if (result) {
    addLog(result.summary);
  }
};

// ===== 文件模式处理 =====
let unlistenDrop: (() => void) | null = null;
let unlistenDragEnter: (() => void) | null = null;
let unlistenDragOver: (() => void) | null = null;
let unlistenDragLeave: (() => void) | null = null;

const isPositionInRect = (position: { x: number; y: number }, rect: DOMRect) => {
  const ratio = window.devicePixelRatio || 1;
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  );
};

// 设置 Tauri 后端的文件拖放监听器
const setupFileDropListener = async () => {
  // 监听拖动进入事件
  unlistenDragEnter = await listen("custom-drag-enter", (event: any) => {
    if (processingMode.value !== "file") return;

    const { position } = event.payload;
    const fileRect = fileDropArea.value?.getBoundingClientRect();
    const outputRect = outputDropArea.value?.getBoundingClientRect();

    if (outputRect && isPositionInRect(position, outputRect)) {
      hoveredTarget.value = "output";
      logger.debug("拖动进入输出目录区域", { position });
      addLog("拖动进入输出目录区域", "info");
    } else if (fileRect && isPositionInRect(position, fileRect)) {
      hoveredTarget.value = "files";
      logger.debug("拖动进入文件区域", { position });
      addLog("拖动进入文件区域", "info");
    }
  });

  // 监听拖动移动事件
  unlistenDragOver = await listen("custom-drag-over", (event: any) => {
    if (processingMode.value !== "file") return;

    const { position } = event.payload;
    const fileRect = fileDropArea.value?.getBoundingClientRect();
    const outputRect = outputDropArea.value?.getBoundingClientRect();

    let newTarget: DropTarget | null = null;

    if (outputRect && isPositionInRect(position, outputRect)) {
      newTarget = "output";
    } else if (fileRect && isPositionInRect(position, fileRect)) {
      newTarget = "files";
    }

    if (newTarget !== hoveredTarget.value) {
      hoveredTarget.value = newTarget;
      if (newTarget) {
        logger.debug("拖动目标切换", { target: newTarget, position });
      }
    }
  });

  // 监听拖动离开事件
  unlistenDragLeave = await listen("custom-drag-leave", () => {
    if (processingMode.value !== "file") return;

    hoveredTarget.value = null;
    logger.debug("拖动离开窗口");
    addLog("拖动离开窗口", "info");
  });

  // 监听文件放下事件
  unlistenDrop = await listen("custom-file-drop", (event: any) => {
    if (processingMode.value !== "file") return;

    const { paths, position } = event.payload;

    // 清除高亮状态
    hoveredTarget.value = null;

    if (!paths || (Array.isArray(paths) && paths.length === 0)) {
      return;
    }

    const pathArray = Array.isArray(paths) ? paths : [paths];

    const fileRect = fileDropArea.value?.getBoundingClientRect();
    const outputRect = outputDropArea.value?.getBoundingClientRect();

    if (outputRect && isPositionInRect(position, outputRect)) {
      if (pathArray.length > 1) {
        customMessage.warning("输出目录只能选择一个文件夹，已自动选择第一个。");
      }
      outputDirectory.value = pathArray[0];
      customMessage.success(`已设置输出目录: ${pathArray[0]}`);
      addLog(`已设置输出目录: ${pathArray[0]}`);
    } else if (fileRect && isPositionInRect(position, fileRect)) {
      addFiles(pathArray);
    } else {
      // 默认添加到文件列表
      addFiles(pathArray);
    }
  });
};

onUnmounted(() => {
  unlistenDrop?.();
  unlistenDragEnter?.();
  unlistenDragOver?.();
  unlistenDragLeave?.();
});

// 前端拖放事件处理 - 用于视觉反馈
const handleDragEnter = (e: DragEvent, target: DropTarget) => {
  logger.debug("前端拖拽进入事件", { target });
  e.preventDefault();
  e.stopPropagation();
  hoveredTarget.value = target;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
  addLog(`拖动进入${target === "files" ? "文件区域" : "输出目录区域"}`, "info");
};

const handleDragOver = (e: DragEvent, target: DropTarget) => {
  e.preventDefault();
  e.stopPropagation();
  // 保持高亮状态
  if (hoveredTarget.value !== target) {
    hoveredTarget.value = target;
    logger.debug("前端拖拽悬停目标切换", { target });
  }
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // 检查是否真的离开了拖放区域
  const related = e.relatedTarget as HTMLElement;
  const currentTarget = e.currentTarget as HTMLElement;

  // 如果移动到子元素，不要移除高亮
  if (!currentTarget.contains(related)) {
    logger.debug("前端拖拽离开事件");
    hoveredTarget.value = null;
    addLog("拖动离开区域", "info");
  }
};

const handleDrop = (e: DragEvent) => {
  logger.debug("前端拖拽放下事件");
  e.preventDefault();
  e.stopPropagation();
  // 清除高亮状态
  hoveredTarget.value = null;
  addLog("文件已放下，等待处理...", "info");
  // 实际的文件处理由 Tauri 后端的 custom-file-drop 事件处理
};

const addFilePathFromInput = () => {
  if (!filePathInput.value) {
    customMessage.warning("请输入文件或文件夹路径");
    return;
  }
  addFiles([filePathInput.value]);
  filePathInput.value = "";
};

const addFiles = (paths: string[]) => {
  const newFiles: FileItem[] = paths.map((path) => {
    const name = path.split(/[/\\]/).pop() || path;
    return { path, name, status: "pending" };
  });

  const uniqueNewFiles = newFiles.filter((nf) => !files.value.some((sf) => sf.path === nf.path));
  if (uniqueNewFiles.length > 0) {
    files.value.push(...uniqueNewFiles);
    customMessage.success(`已添加 ${uniqueNewFiles.length} 个文件/文件夹`);
  }
};

const removeFile = (index: number) => {
  files.value.splice(index, 1);
};

const clearFiles = () => {
  if (files.value.length === 0) return;
  ElMessageBox.confirm("确定要清空所有待处理文件吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      files.value = [];
      customMessage.success("文件列表已清空");
    })
    .catch(() => {});
};

const selectFiles = async () => {
  try {
    const selected = await openFile({
      multiple: true,
      title: "选择要处理的文件",
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFiles(selected);
    } else if (typeof selected === "string") {
      addFiles([selected]);
    }
  } catch (error) {
    logger.error("选择文件失败", error, { operation: "selectFiles" });
    customMessage.error("选择文件失败");
  }
};

const selectFolders = async () => {
  try {
    const selected = await openFile({
      multiple: true,
      directory: true,
      title: "选择要处理的文件夹",
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFiles(selected);
    } else if (typeof selected === "string") {
      addFiles([selected]);
    }
  } catch (error) {
    logger.error("选择文件夹失败", error, { operation: "selectFolders" });
    customMessage.error("选择文件夹失败");
  }
};

const selectOutputDirectory = async () => {
  try {
    const selected = await openFile({
      directory: true,
      multiple: false,
      title: "选择输出目录",
    });
    if (typeof selected === "string") {
      outputDirectory.value = selected;
    }
  } catch (error) {
    logger.error("选择输出目录失败", error, { operation: "selectOutputDirectory" });
    customMessage.error("选择目录失败");
  }
};

const getStatusText = (status: FileItem["status"]) => {
  const statusMap = {
    pending: "待处理",
    processing: "处理中",
    success: "成功",
    error: "失败",
  };
  return statusMap[status];
};

const processFiles = async () => {
  if (files.value.length === 0) {
    customMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!outputDirectory.value) {
    customMessage.warning("请选择输出目录");
    return;
  }
  if (selectedPresetIds.value.length === 0) {
    customMessage.warning("请至少选择一个预设");
    return;
  }

  isProcessing.value = true;
  files.value.forEach((file) => (file.status = "processing"));

  try {
    const filePaths = files.value.map((file) => file.path);
    addLog(`开始处理 ${filePaths.length} 个文件...`);

    // 使用服务处理文件
    const result = await regexService.processFiles({
      filePaths,
      outputDir: outputDirectory.value,
      presetIds: selectedPresetIds.value,
      forceTxt: forceTxt.value,
      filenameSuffix: filenameSuffix.value,
    });

    if (!result) {
      throw new Error("文件处理失败");
    }

    // 添加后端返回的日志
    if (result.logs && Array.isArray(result.logs)) {
      result.logs.forEach((log) => {
        const logType = log.level === "error" ? "error" : log.level === "warn" ? "warn" : "info";
        addLog(log.message, logType);
      });
    }

    // 显示统计摘要
    const summaryMsg = `处理完成: 成功 ${result.success_count} 个，失败 ${result.error_count} 个，总匹配 ${result.total_matches} 次，耗时 ${result.duration_ms?.toFixed(2)}ms`;

    if (result.error_count > 0) {
      customMessage.warning(summaryMsg);
    } else {
      customMessage.success(`所有文件处理完成！共处理 ${result.success_count} 个文件`);
    }

    // 更新文件状态
    const successfulFiles: number[] = [];
    files.value.forEach((file, index) => {
      if (result.errors && result.errors[file.path]) {
        file.status = "error";
        file.error = result.errors[file.path];
        addLog(`文件 ${file.name} 处理失败: ${file.error}`, "error");
      } else {
        file.status = "success";
        successfulFiles.push(index);
      }
    });

    // 如果启用了清除选项，移除成功处理的文件
    if (clearProcessedFiles.value && successfulFiles.length > 0) {
      // 从后往前删除，避免索引问题
      for (let i = successfulFiles.length - 1; i >= 0; i--) {
        files.value.splice(successfulFiles[i], 1);
      }
      addLog(`已从列表中移除 ${successfulFiles.length} 个成功处理的文件`);
    }
  } catch (error: any) {
    logger.error("文件处理失败", error, {
      operation: "processFiles",
      fileCount: files.value.length,
      outputDir: outputDirectory.value,
    });
    customMessage.error(`文件处理失败: ${error}`);
    addLog(`文件处理失败: ${error}`, "error");
    files.value.forEach((file) => {
      if (file.status === "processing") {
        file.status = "error";
        file.error = error.toString();
      }
    });
  } finally {
    isProcessing.value = false;
  }
};
</script>

<style scoped>
.regex-applier-container {
  padding: 20px;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  --primary-color-rgb: 64, 158, 255; /* 默认蓝色的 RGB 值 */
  box-sizing: border-box;
}

.regex-applier-container * {
  box-sizing: border-box;
}

.box-card {
  margin-bottom: 20px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  color: var(--text-color);
}

/* 头部区域 */
.header-section {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-switch {
  display: flex;
  align-items: center;
  gap: 20px;
}

.mode-label {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

/* 预设选择区域 */
.preset-section {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.preset-tags-container {
  min-height: 80px;
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 0;
}

.preset-tag {
  cursor: move;
  font-size: 14px;
  padding: 8px 12px;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  border: 1.5px solid var(--primary-color);
  border-radius: 4px;
  background-color: transparent;
  color: var(--primary-color);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.preset-tag:hover {
  background-color: rgba(var(--primary-color-rgb), 0.08);
  border-color: var(--primary-color);
  box-shadow: 0 2px 6px rgba(var(--primary-color-rgb), 0.15);
}

.preset-tag.ghost {
  opacity: 0.5;
  background: var(--primary-color-light);
}

.preset-tag.drag {
  opacity: 0.8;
  transform: rotate(5deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
}

.preset-tag-content {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  flex: 1;
}

.rules-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.close-icon {
  cursor: pointer;
  font-size: 14px;
  color: var(--primary-color);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-icon:hover {
  color: var(--error-color);
  transform: scale(1.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 文本模式 */
.text-mode-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.input-output-section {
  height: 100%;
}

.text-card {
  height: 100%;
  margin-bottom: 0;
}

.text-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.text-card :deep(.el-textarea) {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.text-card :deep(.el-textarea__inner) {
  flex: 1;
  height: 100% !important;
  resize: none;
  font-family: monospace;
  background-color: var(--input-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

/* 文件模式样式 */
.file-mode-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.file-mode-container .el-row {
  height: 100%;
}

.file-mode-container .el-col {
  height: 100%;
}

.full-height-card {
  height: 100%;
  margin-bottom: 0;
}

.full-height-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.source-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.drop-area {
  flex: 1;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.drop-area.dragover {
  border-color: var(--primary-color);
  background-color: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 15px rgba(64, 158, 255, 0.3);
  transform: scale(1.01);
}

.drop-area.dragover::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 8px;
  background: linear-gradient(45deg, transparent, rgba(64, 158, 255, 0.2), transparent);
  animation: shimmer 2s infinite;
  pointer-events: none;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-color-light);
  text-align: center;
  padding: 20px;
}

.empty-state .el-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.file-list-scrollbar {
  flex: 1;
  height: 100%;
}

.file-list {
  padding: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.file-item:hover {
  background-color: var(--container-bg);
}

.file-item:hover .remove-btn {
  opacity: 1;
}

.file-icon {
  margin-right: 10px;
  color: var(--text-color-light);
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name,
.file-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-name {
  font-size: 14px;
  color: var(--text-color);
}

.file-path {
  font-size: 12px;
  color: var(--text-color-light);
}

.file-status {
  font-size: 12px;
  margin-top: 2px;
}

.status-processing {
  color: #409eff;
}

.status-success {
  color: #67c23a;
}

.status-error {
  color: var(--error-color);
}

.remove-btn {
  margin-left: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.output-settings-card {
  height: 100%;
  margin-bottom: 0;
}

.output-settings-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
  margin-top: -4px;
}

.target-control {
  display: flex;
  gap: 10px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 8px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.target-control.dragover {
  border-color: var(--primary-color);
  background-color: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 15px rgba(64, 158, 255, 0.3);
  transform: scale(1.02);
}

.target-control.dragover::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(64, 158, 255, 0.1), transparent);
  animation: pulse 1.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}

.execute-btn {
  width: 100%;
  font-size: 16px;
  margin-top: auto;
}

/* 日志弹窗样式 */
.log-dialog-content {
  overflow-y: auto;
}

.log-output {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  font-family: monospace;
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.6;
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.log-output p {
  margin: 4px 0;
  padding: 2px 0;
}

.log-info {
  color: var(--text-color);
}

.log-warn {
  color: #e6a23c;
}

.log-error {
  color: var(--error-color);
}

.empty-log {
  color: var(--text-color-light);
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}
</style>
