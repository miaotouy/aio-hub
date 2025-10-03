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
        <el-button type="primary" @click="goToManageRules" :icon="Setting">
          管理规则
        </el-button>
      </div>
    </el-card>

    <!-- 预设选择区域 -->
    <el-card shadow="never" class="box-card preset-section">
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
          <el-tag
            v-for="preset in selectedPresets"
            :key="preset.id"
            size="large"
            closable
            @close="removePreset(preset.id)"
            class="preset-tag"
          >
            <span class="preset-tag-content">
              {{ preset.name }}
              <el-badge :value="preset.rules.filter((r: any) => r.enabled).length" class="rules-badge" />
            </span>
          </el-tag>
        </VueDraggableNext>
      </div>
    </el-card>

    <!-- 文本模式界面 -->
    <div v-if="processingMode === 'text'" class="text-mode-container">
      <el-row :gutter="20" class="input-output-section">
        <el-col :span="12">
          <el-card shadow="never" class="box-card">
            <template #header>
              <div class="card-header">
                <span>输入文本</span>
                <el-button class="button" text @click="pasteToSource">粘贴</el-button>
              </div>
            </template>
            <el-input
              v-model="sourceText"
              :rows="15"
              type="textarea"
              placeholder="请输入待处理的文本..."
            />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="box-card">
            <template #header>
              <div class="card-header">
                <span>输出文本</span>
                <el-button class="button" text @click="copyResult">复制</el-button>
              </div>
            </template>
            <el-input
              v-model="resultText"
              :rows="15"
              type="textarea"
              placeholder="处理结果将显示在这里..."
              readonly
            />
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="box-card">
        <el-button
          type="success"
          @click="oneClickProcess"
          :icon="MagicStick"
          size="large"
          :disabled="selectedPresetIds.length === 0"
          style="width: 100%"
        >
          一键处理剪贴板
        </el-button>
      </el-card>
    </div>

    <!-- 文件模式界面 -->
    <div v-if="processingMode === 'file'" class="file-mode-container">
      <el-row :gutter="20">
        <el-col :span="16">
          <InfoCard title="待处理文件" class="full-height-card">
            <template #header-extra>
              <el-button :icon="Delete" text circle @click="clearFiles" :disabled="files.length === 0" />
            </template>
            <div class="source-controls">
              <el-input v-model="filePathInput" placeholder="输入或拖拽文件/文件夹路径" @keyup.enter="addFilePathFromInput" />
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
              :class="{ 'dragover': hoveredTarget === 'files' }"
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
                      <div v-if="file.status !== 'pending'" class="file-status" :class="`status-${file.status}`">
                        {{ getStatusText(file.status) }}
                      </div>
                    </div>
                    <el-button @click="removeFile(index)" :icon="Delete" text circle size="small" class="remove-btn" />
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
                :class="{ 'dragover': hoveredTarget === 'output' }"
                @dragover="handleDragOver($event, 'output')"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
              >
                <el-input v-model="outputDirectory" placeholder="输入、拖拽或点击选择输出目录" />
                <el-button @click="selectOutputDirectory" :icon="FolderOpened">选择</el-button>
              </div>
            </div>
            <el-button
              type="primary"
              @click="processFiles"
              :loading="isProcessing"
              :disabled="isProcessing || files.length === 0 || !outputDirectory || selectedPresetIds.length === 0"
              class="execute-btn"
              size="large"
            >
              <el-icon><Rank /></el-icon>
              {{ isProcessing ? '处理中...' : '开始处理文件' }}
            </el-button>
          </InfoCard>
        </el-col>
      </el-row>
    </div>

    <!-- 日志区域 -->
    <el-card shadow="never" class="box-card log-section">
      <template #header>
        <div class="card-header">
          <span>日志</span>
          <el-button text @click="logs = []">清空</el-button>
        </div>
      </template>
      <div class="log-output">
        <p v-for="(log, index) in logs" :key="index" :class="`log-${log.type}`">
          [{{ log.time }}] {{ log.message }}
        </p>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Rank, Document, FolderOpened, FolderAdd, Plus, Setting, MagicStick } from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import debounce from 'lodash/debounce';
import { VueDraggableNext } from 'vue-draggable-next';
import InfoCard from '../../components/common/InfoCard.vue';
import { usePresetStore } from './store';
import type { LogEntry, RegexPreset } from './types';
import { applyRules } from './engine';

const router = useRouter();
const store = usePresetStore();

interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

type ProcessingMode = 'text' | 'file';
type DropTarget = 'files' | 'output';

// ===== 状态定义 =====
const processingMode = ref<ProcessingMode>('text');

// 预设选择
const selectedPresetIds = ref<string[]>([]);

// 文本模式状态
const sourceText = ref('');
const resultText = ref('');

// 文件模式状态
const filePathInput = ref('');
const files = ref<FileItem[]>([]);
const outputDirectory = ref('');
const isProcessing = ref(false);
const hoveredTarget = ref<DropTarget | null>(null);

// 日志状态
const logs = ref<LogEntry[]>([]);

// 模板引用
const fileDropArea = ref<HTMLElement | null>(null);
const outputDropArea = ref<HTMLElement | null>(null);

// ===== 计算属性 =====
const availablePresets = computed(() => store.presets);

// 使用 ref 而不是 computed 来避免响应性问题
const selectedPresets = ref<RegexPreset[]>([]);

// 监听 selectedPresetIds 变化，更新 selectedPresets
watch(selectedPresetIds, (ids) => {
  selectedPresets.value = ids
    .map(id => store.presets.find(p => p.id === id))
    .filter((p): p is RegexPreset => !!p);
}, { immediate: true, deep: true });

// 拖拽事件处理
const onDragStart = () => {
  console.log('开始拖拽预设');
  addLog('开始调整预设顺序', 'info');
};

const onDragEnd = () => {
  console.log('拖拽结束，新顺序:', selectedPresets.value);
  // 更新 selectedPresetIds 以保持同步
  selectedPresetIds.value = selectedPresets.value.map(p => p.id);
  addLog('预设顺序已更新', 'info');
};

// ===== 初始化 =====
onMounted(async () => {
  await store.loadPresets();
  // 默认选中第一个预设
  if (store.presets.length > 0) {
    selectedPresetIds.value = [store.presets[0].id];
  }
  setupFileDropListener();
  addLog('应用已就绪', 'info');
});

// ===== 日志 =====
const addLog = (message: string, type: LogEntry['type'] = 'info') => {
  const time = new Date().toLocaleTimeString();
  logs.value.push({ time, message, type });
};

// ===== 预设操作 =====
const goToManageRules = () => {
  router.push('/regex-manage');
};

const handleAddPreset = (presetId: string) => {
  if (!selectedPresetIds.value.includes(presetId)) {
    selectedPresetIds.value.push(presetId);
    const preset = store.presets.find(p => p.id === presetId);
    if (preset) {
      addLog(`已添加预设: ${preset.name}`);
    }
  }
};

const removePreset = (presetId: string) => {
  const index = selectedPresetIds.value.indexOf(presetId);
  if (index !== -1) {
    const preset = store.presets.find(p => p.id === presetId);
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

const processText = () => {
  if (!sourceText.value) {
    resultText.value = '';
    return;
  }

  if (selectedPresetIds.value.length === 0) {
    resultText.value = sourceText.value;
    return;
  }

  let result = sourceText.value;
  let totalRulesApplied = 0;

  // 按顺序应用每个预设
  for (const presetId of selectedPresetIds.value) {
    const preset = store.presets.find(p => p.id === presetId);
    if (preset) {
      const enabledRules = preset.rules.filter(r => r.enabled);
      const applyResult = applyRules(result, enabledRules);
      result = applyResult.text;
      totalRulesApplied += applyResult.appliedRulesCount;
      
      // 添加日志
      applyResult.logs.forEach(log => logs.value.push(log));
    }
  }

  resultText.value = result;
};

const pasteToSource = async () => {
  try {
    sourceText.value = await readText();
    addLog('已从剪贴板粘贴内容到输入框。');
  } catch (error: any) {
    ElMessage.error(`粘贴失败: ${error.message}`);
    addLog(`粘贴失败: ${error.message}`, 'error');
  }
};

const copyResult = async () => {
  try {
    await writeText(resultText.value);
    ElMessage.success('处理结果已复制到剪贴板！');
    addLog('处理结果已复制到剪贴板。');
  } catch (error: any) {
    ElMessage.error(`复制失败: ${error.message}`);
    addLog(`复制失败: ${error.message}`, 'error');
  }
};

const oneClickProcess = async () => {
  if (selectedPresetIds.value.length === 0) {
    ElMessage.warning('请先选择至少一个预设');
    return;
  }
  addLog('执行一键处理剪贴板...');
  await pasteToSource();
  processText();
  await copyResult();
  addLog('一键处理剪贴板完成。');
};

// ===== 文件模式处理 =====
let unlistenDrop: (() => void) | null = null;

const isPositionInRect = (position: { x: number, y: number }, rect: DOMRect) => {
  const ratio = window.devicePixelRatio || 1;
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  );
};

const setupFileDropListener = async () => {
  unlistenDrop = await listen('custom-file-drop', (event: any) => {
    if (processingMode.value !== 'file') return;
    
    const { paths, position } = event.payload;
    
    if (!paths || (Array.isArray(paths) && paths.length === 0)) {
      return;
    }
    
    const pathArray = Array.isArray(paths) ? paths : [paths];

    const fileRect = fileDropArea.value?.getBoundingClientRect();
    const outputRect = outputDropArea.value?.getBoundingClientRect();

    if (outputRect && isPositionInRect(position, outputRect)) {
      if (pathArray.length > 1) {
        ElMessage.warning("输出目录只能选择一个文件夹，已自动选择第一个。");
      }
      outputDirectory.value = pathArray[0];
      ElMessage.success(`已设置输出目录: ${pathArray[0]}`);
    } else if (fileRect && isPositionInRect(position, fileRect)) {
      addFiles(pathArray);
    } else {
      addFiles(pathArray);
    }
  });
};

onUnmounted(() => {
  unlistenDrop?.();
});

const handleDragOver = (e: DragEvent, target: DropTarget) => {
  e.preventDefault();
  e.stopPropagation();
  hoveredTarget.value = target;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const related = e.relatedTarget as HTMLElement;
  const currentTarget = e.currentTarget as HTMLElement;
  if (!currentTarget.contains(related)) {
    hoveredTarget.value = null;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  hoveredTarget.value = null;
};

const addFilePathFromInput = () => {
  if (!filePathInput.value) {
    ElMessage.warning("请输入文件或文件夹路径");
    return;
  }
  addFiles([filePathInput.value]);
  filePathInput.value = "";
};

const addFiles = (paths: string[]) => {
  const newFiles: FileItem[] = paths.map(path => {
    const name = path.split(/[/\\]/).pop() || path;
    return { path, name, status: 'pending' };
  });

  const uniqueNewFiles = newFiles.filter(nf => !files.value.some(sf => sf.path === nf.path));
  if (uniqueNewFiles.length > 0) {
    files.value.push(...uniqueNewFiles);
    ElMessage.success(`已添加 ${uniqueNewFiles.length} 个文件/文件夹`);
  }
};

const removeFile = (index: number) => {
  files.value.splice(index, 1);
};

const clearFiles = () => {
  if (files.value.length === 0) return;
  ElMessageBox.confirm('确定要清空所有待处理文件吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    files.value = [];
    ElMessage.success('文件列表已清空');
  }).catch(() => {});
};

const selectFiles = async () => {
  try {
    const selected = await openFile({
      multiple: true,
      title: "选择要处理的文件"
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFiles(selected);
    } else if (typeof selected === 'string') {
      addFiles([selected]);
    }
  } catch (error) {
    console.error("选择文件失败:", error);
    ElMessage.error("选择文件失败");
  }
};

const selectFolders = async () => {
  try {
    const selected = await openFile({
      multiple: true,
      directory: true,
      title: "选择要处理的文件夹"
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFiles(selected);
    } else if (typeof selected === 'string') {
      addFiles([selected]);
    }
  } catch (error) {
    console.error("选择文件夹失败:", error);
    ElMessage.error("选择文件夹失败");
  }
};

const selectOutputDirectory = async () => {
  try {
    const selected = await openFile({
      directory: true,
      multiple: false,
      title: "选择输出目录"
    });
    if (typeof selected === 'string') {
      outputDirectory.value = selected;
    }
  } catch (error) {
    console.error("选择目录失败:", error);
    ElMessage.error("选择目录失败");
  }
};

const getStatusText = (status: FileItem['status']) => {
  const statusMap = {
    'pending': '待处理',
    'processing': '处理中',
    'success': '成功',
    'error': '失败'
  };
  return statusMap[status];
};

const processFiles = async () => {
  if (files.value.length === 0) {
    ElMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!outputDirectory.value) {
    ElMessage.warning("请选择输出目录");
    return;
  }
  if (selectedPresetIds.value.length === 0) {
    ElMessage.warning("请至少选择一个预设");
    return;
  }

  // 收集所有选中预设的启用规则
  const allRules = [];
  for (const presetId of selectedPresetIds.value) {
    const preset = store.presets.find(p => p.id === presetId);
    if (preset) {
      const enabledRules = preset.rules.filter(r => r.enabled);
      allRules.push(...enabledRules);
    }
  }

  if (allRules.length === 0) {
    ElMessage.warning("所选预设中没有启用的规则");
    return;
  }

  isProcessing.value = true;
  files.value.forEach(file => file.status = 'processing');

  try {
    const filePaths = files.value.map(file => file.path);
    const rulesForBackend = allRules.map(r => ({
      regex: r.regex,
      replacement: r.replacement
    }));

    addLog(`开始处理 ${filePaths.length} 个文件，应用 ${allRules.length} 条规则...`);
    
    const result: any = await invoke('process_files_with_regex', {
      filePaths,
      outputDir: outputDirectory.value,
      rules: rulesForBackend
    });

    addLog(`处理完成: 成功 ${result.success_count} 个，失败 ${result.error_count} 个`);
    
    if (result.error_count > 0) {
      ElMessage.warning(`处理完成: 成功 ${result.success_count} 个，失败 ${result.error_count} 个`);
    } else {
      ElMessage.success(`所有文件处理完成！共处理 ${result.success_count} 个文件`);
    }

    // 更新文件状态
    files.value.forEach(file => {
      if (result.errors && result.errors[file.path]) {
        file.status = 'error';
        file.error = result.errors[file.path];
        addLog(`文件 ${file.name} 处理失败: ${file.error}`, 'error');
      } else {
        file.status = 'success';
      }
    });

  } catch (error: any) {
    console.error("处理失败:", error);
    ElMessage.error(`文件处理失败: ${error}`);
    addLog(`文件处理失败: ${error}`, 'error');
    files.value.forEach(file => {
      if (file.status === 'processing') {
        file.status = 'error';
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
  max-width: 1400px;
  margin: 0 auto;
  color: var(--text-color);
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
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
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
  margin-bottom: 20px;
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
}

.preset-tag.ghost {
  opacity: 0.5;
  background: var(--primary-color-light);
}

.preset-tag.drag {
  opacity: 0.8;
  transform: rotate(5deg);
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  transition: none !important;
}

.preset-tag-content {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.rules-badge {
  margin-left: 4px;
}
.rules-badge :deep(.el-badge__content) {
  background-color: var(--primary-color);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

/* 文本模式 */
.text-mode-container {
  margin-bottom: 20px;
}

.input-output-section .el-textarea__inner {
  font-family: monospace;
  background-color: var(--input-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

/* 文件模式样式 */
.file-mode-container {
  margin-bottom: 20px;
}

.full-height-card {
  height: 400px;
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
}

.drop-area.dragover {
  border-color: var(--primary-color);
  background-color: var(--container-bg);
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

.file-name, .file-path {
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

.output-settings-card :deep(.el-card__body) {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.setting-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.target-control {
  display: flex;
  gap: 10px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 8px;
  transition: all 0.3s ease;
}

.target-control.dragover {
  border-color: var(--primary-color);
  background-color: var(--container-bg);
}

.execute-btn {
  width: 100%;
  font-size: 16px;
  margin-top: auto;
}

/* 日志区域样式 */
.log-section .log-output {
  height: 150px;
  overflow-y: auto;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  padding: 10px;
  font-family: monospace;
  font-size: 14px;
  color: var(--text-color);
  line-height: 1.5;
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

.el-input, .el-textarea {
  --el-input-bg-color: var(--input-bg);
  --el-input-text-color: var(--text-color);
  --el-input-border-color: var(--border-color);
  --el-input-hover-border-color: var(--primary-color);
  --el-input-focus-border-color: var(--primary-color);
  --el-input-placeholder-color: var(--text-color-light);
}
</style>