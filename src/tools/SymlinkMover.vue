<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { FolderOpened, Document, Delete, FolderAdd, Rank, InfoFilled } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import InfoCard from '../components/common/InfoCard.vue';
import DropZone from '../components/common/DropZone.vue';
import { createModuleLogger } from '@utils/logger';

// 日志记录器
const logger = createModuleLogger('SymlinkMover');

// --- 类型定义 ---
interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

// --- 响应式状态 ---
const sourcePathInput = ref(""); // 用于手动输入源文件路径
const sourceFiles = ref<FileItem[]>([]);
const targetDirectory = ref("");
const linkType = ref<'symlink' | 'link'>('symlink');
const operationMode = ref<'move' | 'link-only'>('move'); // 新增：操作模式
const isProcessing = ref(false);

// --- 拖放处理 ---
const handleSourceDrop = (paths: string[]) => {
  addSourceFiles(paths);
};

const handleTargetDrop = (paths: string[]) => {
  if (paths.length > 0) {
    targetDirectory.value = paths[0];
    ElMessage.success(`已设置目标目录: ${paths[0]}`);
  }
};

// --- 文件处理方法 ---
const addSourcePathFromInput = () => {
  if (!sourcePathInput.value) {
    ElMessage.warning("请输入文件或文件夹路径");
    return;
  }
  addSourceFiles([sourcePathInput.value]);
  sourcePathInput.value = ""; // 添加后清空输入框
};

const addSourceFiles = (paths: string[]) => {
  const newFiles: FileItem[] = paths.map(path => {
    const name = path.split(/[/\\]/).pop() || path;
    return { path, name, status: 'pending' };
  });

  // 避免重复添加
  const uniqueNewFiles = newFiles.filter(nf => !sourceFiles.value.some(sf => sf.path === nf.path));
  if (uniqueNewFiles.length > 0) {
    sourceFiles.value.push(...uniqueNewFiles);
    ElMessage.success(`已添加 ${uniqueNewFiles.length} 个文件/文件夹`);
  }
};

const removeFile = (index: number) => {
  sourceFiles.value.splice(index, 1);
};

const clearFiles = () => {
  if (sourceFiles.value.length === 0) return;
  ElMessageBox.confirm('确定要清空所有待处理文件吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    sourceFiles.value = [];
    ElMessage.success('文件列表已清空');
  }).catch(() => { /* 用户取消操作 */ });
};

// --- 文件/目录选择 ---
const selectSourceFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      title: "选择要搬家的文件"
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addSourceFiles(selected);
    } else if (typeof selected === 'string') {
      addSourceFiles([selected]);
    }
  } catch (error) {
    logger.error('选择文件失败', error, { operation: 'selectFiles' });
    ElMessage.error("选择文件失败");
  }
};

const selectSourceFolders = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: true,
      title: "选择要搬家的文件夹"
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addSourceFiles(selected);
    } else if (typeof selected === 'string') {
      addSourceFiles([selected]);
    }
  } catch (error) {
    logger.error('选择文件夹失败', error, { operation: 'selectFolders' });
    ElMessage.error("选择文件夹失败");
  }
};

const selectTargetDirectory = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择目标目录"
    });
    if (typeof selected === 'string') {
      targetDirectory.value = selected;
    }
  } catch (error) {
    logger.error('选择目标目录失败', error, { operation: 'selectTargetDirectory' });
    ElMessage.error("选择目录失败");
  }
};

// --- 核心操作 ---
const executeMoveAndLink = async () => {
  if (sourceFiles.value.length === 0) {
    ElMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!targetDirectory.value && operationMode.value === 'move') {
    ElMessage.warning("请选择目标目录");
    return;
  }

  isProcessing.value = true;
  sourceFiles.value.forEach(file => file.status = 'processing');

  try {
    const sourcePaths = sourceFiles.value.map(file => file.path);
    
    if (operationMode.value === 'move') {
      // 搬家模式：移动文件并创建链接
      const result: string = await invoke('move_and_link', {
        sourcePaths,
        targetDir: targetDirectory.value,
        linkType: linkType.value
      });

      // 检查结果是否包含错误信息
      if (result.includes("个错误")) {
        ElMessage.error(result);
        // 解析错误信息，更新文件状态
        sourceFiles.value.forEach(file => {
          if (file.status === 'processing') {
            file.status = 'error';
            file.error = '处理失败，请查看错误详情';
          }
        });
      } else {
        ElMessage.success(result || "文件处理完成");
        sourceFiles.value.forEach(file => file.status = 'success');
      }
    } else {
      // 仅创建链接模式：只在目标位置创建链接
      const result: string = await invoke('create_links_only', {
        sourcePaths,
        targetDir: targetDirectory.value,
        linkType: linkType.value
      });

      // 检查结果是否包含错误信息
      if (result.includes("个错误")) {
        ElMessage.error(result);
        sourceFiles.value.forEach(file => {
          if (file.status === 'processing') {
            file.status = 'error';
            file.error = '处理失败，请查看错误详情';
          }
        });
      } else {
        ElMessage.success(result || "链接创建完成");
        sourceFiles.value.forEach(file => file.status = 'success');
      }
    }

  } catch (error: any) {
    logger.error('文件处理失败', error, {
      operation: operationMode.value,
      sourcePaths: sourceFiles.value.map(f => f.path),
      targetDirectory: targetDirectory.value,
      linkType: linkType.value
    });
    ElMessage.error(`文件处理失败: ${error}`);
    sourceFiles.value.forEach(file => {
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

<template>
  <div class="symlink-mover-container">
    <!-- 左侧列: 待处理文件 -->
    <div class="column">
      <InfoCard title="待处理文件" class="full-height-card">
        <template #headerExtra>
          <el-button :icon="Delete" text circle @click="clearFiles" :disabled="sourceFiles.length === 0" />
        </template>
        <div class="source-controls">
          <el-input v-model="sourcePathInput" placeholder="输入文件/文件夹路径" @keyup.enter="addSourcePathFromInput" />
          <el-tooltip content="选择文件" placement="top">
            <el-button @click="selectSourceFiles" :icon="Document" circle />
          </el-tooltip>
          <el-tooltip content="选择文件夹" placement="top">
            <el-button @click="selectSourceFolders" :icon="FolderOpened" circle />
          </el-tooltip>
          <el-button @click="addSourcePathFromInput" type="primary">添加</el-button>
        </div>
        <DropZone
          drop-id="symlink-source"
          placeholder="将要搬家的文件或文件夹拖拽至此"
          :icon="FolderAdd"
          :multiple="true"
          @drop="handleSourceDrop"
        >
          <el-scrollbar class="file-list-scrollbar">
            <div v-if="sourceFiles.length === 0" class="empty-state">
              <el-icon><FolderAdd /></el-icon>
              <p>将要搬家的文件或文件夹拖拽至此</p>
            </div>
            <div v-else class="file-list">
              <div v-for="(file, index) in sourceFiles" :key="file.path" class="file-item">
                <el-icon class="file-icon"><Document /></el-icon>
                <div class="file-details">
                  <div class="file-name" :title="file.name">{{ file.name }}</div>
                  <div class="file-path" :title="file.path">{{ file.path }}</div>
                </div>
                <el-button @click="removeFile(index)" :icon="Delete" text circle size="small" class="remove-btn" />
              </div>
            </div>
          </el-scrollbar>
        </DropZone>
      </InfoCard>
    </div>

    <!-- 右侧列: 操作设置 -->
    <div class="column settings-column">
      <InfoCard title="操作设置" class="settings-card full-height-card">
        <div class="setting-group">
          <label>操作模式</label>
          <el-radio-group v-model="operationMode" class="operation-mode-group">
            <el-radio-button value="move">
              <el-icon><Rank /></el-icon>
              搬家模式
            </el-radio-button>
            <el-radio-button value="link-only">
              <el-icon><FolderAdd /></el-icon>
              仅创建链接
            </el-radio-button>
          </el-radio-group>
          <div class="mode-description">
            {{ operationMode === 'move' ? '将文件移动到目标目录，并在原位置创建链接' : '在目标目录创建链接，保持原文件不动' }}
          </div>
        </div>
        <div class="setting-group">
          <label>目标目录</label>
          <DropZone
            drop-id="symlink-target"
            variant="input"
            :directory-only="true"
            :multiple="false"
            hide-content
            @drop="handleTargetDrop"
          >
            <div class="target-control">
              <el-input v-model="targetDirectory" :placeholder="operationMode === 'move' ? '输入、拖拽或点击选择目标目录' : '输入、拖拽或点击选择链接目录'" />
              <el-button @click="selectTargetDirectory" :icon="FolderOpened">选择</el-button>
            </div>
          </DropZone>
        </div>
        <div class="setting-group">
          <label>链接类型</label>
          <el-radio-group v-model="linkType">
            <el-radio-button value="symlink">符号链接</el-radio-button>
            <el-radio-button value="link" :disabled="operationMode === 'link-only'">硬链接</el-radio-button>
          </el-radio-group>
          <div v-if="operationMode === 'link-only' && linkType === 'link'" class="warning-text">
            <el-icon><InfoFilled /></el-icon>
            仅创建链接模式下不支持硬链接
          </div>
        </div>
        <div class="setting-group execute-group">
          <el-button
            type="primary"
            @click="executeMoveAndLink"
            :loading="isProcessing"
            :disabled="isProcessing || sourceFiles.length === 0 || !targetDirectory"
            class="execute-btn"
            size="large"
          >
            <el-icon><Rank /></el-icon>
            {{ isProcessing ? '处理中...' : (operationMode === 'move' ? '开始搬家' : '创建链接') }}
          </el-button>
        </div>
      </InfoCard>
    </div>
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

.full-height-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.source-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
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

.remove-btn {
  margin-left: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.settings-card :deep(.el-card__body) {
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
}

.execute-group {
  margin-top: auto;
}

.execute-btn {
  width: 100%;
  font-size: 16px;
}

.operation-mode-group {
  width: 100%;
}

.operation-mode-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 10px 15px;
}

.mode-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.warning-text {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.warning-text .el-icon {
  font-size: 14px;
}
</style>