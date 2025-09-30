<template>
  <div class="regex-applier-container">
    <!-- 模式切换 -->
    <el-card shadow="never" class="box-card mode-switch-section">
      <div class="mode-switch-header">
        <span class="mode-label">处理模式</span>
        <el-radio-group v-model="processingMode" size="large">
          <el-radio-button value="text">文本模式</el-radio-button>
          <el-radio-button value="file">文件模式</el-radio-button>
        </el-radio-group>
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
              :rows="10"
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
              :rows="10"
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
              :disabled="isProcessing || files.length === 0 || !outputDirectory"
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

    <!-- 正则规则区域（两种模式共用） -->
    <el-card shadow="never" class="box-card regex-rules-section">
      <template #header>
        <div class="card-header">
          <span>正则规则 ({{ rules.length }})</span>
          <div>
            <el-button type="primary" @click="addRule()">添加规则</el-button>
            <el-button @click="importRules">导入规则</el-button>
            <el-button @click="exportRules">导出规则</el-button>
            <el-tooltip v-if="processingMode === 'text'" content="将剪贴板内容作为输入，应用规则后复制结果回剪贴板" placement="top">
              <el-button type="success" @click="oneClickProcess">一键处理剪贴板</el-button>
            </el-tooltip>
          </div>
        </div>
      </template>
      <div class="rules-list-wrapper">
        <div v-if="rules.length === 0" class="empty-rules">
          <el-empty description="暂无正则规则，点击'添加规则'按钮创建"></el-empty>
        </div>
        <VueDraggableNext
          v-else
          class="rules-list"
          v-model="rules"
          item-key="id"
          handle=".rule-item-handle"
        >
          <template #item="{ element: rule, index }">
            <el-row :gutter="10" class="rule-item">
              <el-col :span="1" class="rule-item-handle">
                <el-icon><Rank /></el-icon>
              </el-col>
              <el-col :span="2">
                <el-checkbox v-model="rule.enabled" size="large"></el-checkbox>
              </el-col>
              <el-col :span="9">
                <el-input v-model="rule.regex" placeholder="正则表达式"></el-input>
              </el-col>
              <el-col :span="8">
                <el-input v-model="rule.replacement" placeholder="替换内容"></el-input>
              </el-col>
              <el-col :span="4">
                <el-button type="danger" :icon="Delete" circle @click="removeRule(index)"></el-button>
              </el-col>
            </el-row>
          </template>
        </VueDraggableNext>
      </div>
    </el-card>

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
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Rank, Document, FolderOpened, FolderAdd } from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { create, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open as openFile, save as saveFile } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import debounce from 'lodash/debounce';
import { VueDraggableNext } from 'vue-draggable-next';
import InfoCard from './common/InfoCard.vue';

interface RegexRule {
  id: string;
  enabled: boolean;
  regex: string;
  replacement: string;
}

interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'warn' | 'error';
}

type ProcessingMode = 'text' | 'file';
type DropTarget = 'files' | 'output';

// ===== 状态定义 =====
const processingMode = ref<ProcessingMode>('text');

// 文本模式状态
const sourceText = ref('');
const resultText = ref('');

// 文件模式状态
const filePathInput = ref('');
const files = ref<FileItem[]>([]);
const outputDirectory = ref('');
const isProcessing = ref(false);
const hoveredTarget = ref<DropTarget | null>(null);

// 共用状态
const rules = ref<RegexRule[]>([]);
const logs = ref<LogEntry[]>([]);

// 模板引用
const fileDropArea = ref<HTMLElement | null>(null);
const outputDropArea = ref<HTMLElement | null>(null);

// ===== 日志和配置 =====
const addLog = (message: string, type: LogEntry['type'] = 'info') => {
  const time = new Date().toLocaleTimeString();
  logs.value.push({ time, message, type });
};

const configFileName = 'regex_rules_config.json';
const appDataDirPath = ref('');

onMounted(async () => {
  appDataDirPath.value = await appDataDir();
  await create(appDataDirPath.value);
  loadRules();
  setupFileDropListener();
});

const getConfigFile = () => {
  return join(appDataDirPath.value, configFileName);
};

const loadRules = async () => {
  try {
    const filePath = await getConfigFile();
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      const loadedRules = JSON.parse(content);
      rules.value = loadedRules.map((rule: any) => ({
        ...rule,
        id: rule.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }));
      addLog(`成功加载 ${rules.value.length} 条正则规则。`, 'info');
    } else {
      addLog('未找到正则规则配置文件，已创建空白规则。', 'info');
      addRule(true);
    }
  } catch (error: any) {
    ElMessage.error(`加载规则失败: ${error.message}`);
    addLog(`加载规则失败: ${error.message}`, 'error');
    addRule(true);
  }
};

const saveRules = async () => {
  try {
    const filePath = await getConfigFile();
    await writeTextFile(filePath, JSON.stringify(rules.value, null, 2));
    addLog('正则规则已自动保存。', 'info');
  } catch (error: any) {
    ElMessage.error(`保存规则失败: ${error.message}`);
    addLog(`保存规则失败: ${error.message}`, 'error');
  }
};

watch(rules, debounce(saveRules, 500), { deep: true });

// ===== 规则管理 =====
const addRule = (isInitial = false) => {
  const newRule: RegexRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    enabled: true,
    regex: '',
    replacement: ''
  };
  rules.value.push(newRule);
  if (!isInitial) {
    addLog('添加了一条新的空白规则。');
  }
};

const removeRule = (index: number) => {
  if (rules.value.length === 1) {
    ElMessageBox.confirm('这是最后一条规则，确定要清空内容吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    .then(() => {
      rules.value[index] = {
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        enabled: true,
        regex: '',
        replacement: ''
      };
      addLog('最后一条规则已清空。');
    })
    .catch(() => {});
  } else {
    rules.value.splice(index, 1);
    addLog(`移除了第 ${index + 1} 条规则。`);
  }
};

const importRules = async () => {
  try {
    const filePath = await openFile({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      const content = await readTextFile(filePath as string);
      const importedRules: Partial<RegexRule>[] = JSON.parse(content);

      const existingRulesMap = new Map(rules.value.map(r => [`${r.regex}::${r.replacement}`, r]));
      let addedCount = 0;
      importedRules.forEach((newRule) => {
        const key = `${newRule.regex}::${newRule.replacement}`;
        if (!existingRulesMap.has(key)) {
          rules.value.push({
            id: newRule.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            enabled: newRule.enabled ?? true,
            regex: newRule.regex || '',
            replacement: newRule.replacement || ''
          });
          existingRulesMap.set(key, newRule as RegexRule);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        ElMessage.success(`成功导入 ${addedCount} 条新规则。`);
        addLog(`成功导入 ${addedCount} 条新规则。`, 'info');
      } else {
        ElMessage.info('没有新的规则需要导入。');
        addLog('没有新的规则需要导入。', 'info');
      }
    } else {
      addLog('导入规则操作已取消。', 'info');
    }
  } catch (error: any) {
    ElMessage.error(`导入规则失败: ${error.message}`);
    addLog(`导入规则失败: ${error.message}`, 'error');
  }
};

const exportRules = async () => {
  try {
    const filePath = await saveFile({
      defaultPath: `regex_rules_${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(rules.value, null, 2));
      ElMessage.success('规则已成功导出！');
      addLog('规则已成功导出。', 'info');
    } else {
      addLog('导出规则操作已取消。', 'info');
    }
  } catch (error: any) {
    ElMessage.error(`导出规则失败: ${error.message}`);
    addLog(`导出规则失败: ${error.message}`, 'error');
  }
};

// ===== 文本模式处理 =====
const debouncedProcessText = debounce(() => {
  processText();
}, 300);

watch(sourceText, debouncedProcessText);
watch(rules, debouncedProcessText, { deep: true });

const processText = () => {
  if (!sourceText.value) {
    resultText.value = '';
    return;
  }

  let processed = sourceText.value;
  let appliedRulesCount = 0;

  rules.value.forEach((rule, index) => {
    if (rule.enabled) {
      try {
        const regex = new RegExp(rule.regex, 'g');
        const originalProcessed = processed;
        processed = processed.replace(regex, rule.replacement);
        if (originalProcessed !== processed) {
          addLog(`应用规则 ${index + 1}: /${rule.regex}/ -> "${rule.replacement}"`);
          appliedRulesCount++;
        }
      } catch (e: any) {
        addLog(`规则 ${index + 1} 错误: 无效的正则表达式 "${rule.regex}" - ${e.message}`, 'error');
        ElMessage.error(`规则 ${index + 1} 错误: ${e.message}`);
      }
    }
  });

  resultText.value = processed;
  if (sourceText.value) {
    addLog(`文本处理完成。共应用了 ${appliedRulesCount} 条规则。`);
  }
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
    console.log('Dropped paths:', paths, 'at position:', position);

    if (!paths || (Array.isArray(paths) && paths.length === 0)) {
      console.warn('No paths received in drop event');
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

  const enabledRules = rules.value.filter(r => r.enabled);
  if (enabledRules.length === 0) {
    ElMessage.warning("请至少启用一条正则规则");
    return;
  }

  isProcessing.value = true;
  files.value.forEach(file => file.status = 'processing');

  try {
    const filePaths = files.value.map(file => file.path);
    const rulesForBackend = enabledRules.map(r => ({
      regex: r.regex,
      replacement: r.replacement
    }));

    addLog(`开始处理 ${filePaths.length} 个文件...`);
    
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

.mode-switch-section {
  margin-bottom: 20px;
}

.mode-switch-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 0;
}

.mode-label {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.el-input, .el-textarea {
  --el-input-bg-color: var(--input-bg);
  --el-input-text-color: var(--text-color);
  --el-input-border-color: var(--border-color);
  --el-input-hover-border-color: var(--primary-color);
  --el-input-focus-border-color: var(--primary-color);
  --el-input-placeholder-color: var(--text-color-light);
}

.el-textarea__inner {
  background-color: var(--input-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

.input-output-section .el-textarea__inner {
  font-family: monospace;
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

/* 规则列表样式 */
.rules-list-wrapper {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 10px;
}

.rule-item-handle {
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-rules {
  text-align: center;
  color: var(--text-color-light);
  padding: 40px 0;
}

.rule-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  padding: 5px;
  border-radius: 4px;
  background-color: var(--container-bg);
  border: 1px solid var(--border-color-light);
}

.rule-item:last-child {
  margin-bottom: 0;
}

.rule-item .el-col {
  display: flex;
  align-items: center;
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
</style>