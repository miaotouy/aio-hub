<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { FolderOpened, Document, Delete, FolderAdd, Rank } from "@element-plus/icons-vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import InfoCard from './common/InfoCard.vue';

// --- 类型定义 ---
interface FileItem {
  path: string;
  name: string;
  // isDirectory: boolean; // 暂时移除，后端处理
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

type DropTarget = 'source' | 'target';

// --- 响应式状态 ---
const sourcePathInput = ref(""); // 用于手动输入源文件路径
const sourceFiles = ref<FileItem[]>([]);
const targetDirectory = ref("");
const linkType = ref<'symlink' | 'link'>('symlink');
const isProcessing = ref(false);
const hoveredTarget = ref<DropTarget | null>(null);

// --- 模板引用 ---
const sourceDropArea = ref<HTMLElement | null>(null);
const targetDropArea = ref<HTMLElement | null>(null);

// --- Tauri 事件监听器 ---
let unlistenDrop: (() => void) | null = null;
// let unlistenCancel: (() => void) | null = null; // No longer needed

// HTML5 拖放事件处理
const handleDragOver = (e: DragEvent, target: DropTarget) => {
  e.preventDefault();
  e.stopPropagation();
  
  // 调试：打印拖放事件信息
  console.log(`📍 DragOver on ${target}`, {
    dataTransfer: e.dataTransfer,
    types: e.dataTransfer?.types,
    effectAllowed: e.dataTransfer?.effectAllowed,
    dropEffect: e.dataTransfer?.dropEffect
  });
  
  hoveredTarget.value = target;
  
  // 设置拖放效果
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // 检查是否真的离开了目标区域
  const related = e.relatedTarget as HTMLElement;
  const currentTarget = e.currentTarget as HTMLElement;
  if (!currentTarget.contains(related)) {
    hoveredTarget.value = null;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('💧 Drop event triggered', {
    currentTarget: hoveredTarget.value,
    dataTransfer: e.dataTransfer,
    files: e.dataTransfer?.files
  });
  
  hoveredTarget.value = null;
};

// --- 辅助函数 ---
const isPositionInRect = (position: { x: number, y: number }, rect: DOMRect) => {
  // Account for device pixel ratio/scaling on Windows/macOS
  const ratio = window.devicePixelRatio || 1;
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  );
};

onMounted(async () => {
  console.log('SymlinkMover: Setting up custom file drop listeners...');
  
  // 监听我们自定义的后端文件拖放事件
  unlistenDrop = await listen('custom-file-drop', (event: any) => {
    console.log('🎯 SymlinkMover: Custom file drop event received:', event);
    
    const { paths, position } = event.payload;
    console.log('Dropped paths:', paths, 'at position:', position);

    if (!paths || (Array.isArray(paths) && paths.length === 0)) {
      console.warn('No paths received in drop event');
      return;
    }
    
    const pathArray = Array.isArray(paths) ? paths : [paths];

    // 使用坐标判断目标区域
    const sourceRect = sourceDropArea.value?.getBoundingClientRect();
    const targetRect = targetDropArea.value?.getBoundingClientRect();

    // --- DEBUGGING ---
    console.log('Drop Check:', {
      dropPosition: position,
      sourceRect,
      targetRect,
      isOverTarget: targetRect ? isPositionInRect(position, targetRect) : 'no-rect',
      isOverSource: sourceRect ? isPositionInRect(position, sourceRect) : 'no-rect',
    });
    // --- END DEBUGGING ---

    if (targetRect && isPositionInRect(position, targetRect)) {
      console.log('Dropped on: target');
      if (pathArray.length > 1) {
        ElMessage.warning("目标目录只能选择一个文件夹，已自动选择第一个。");
      }
      targetDirectory.value = pathArray[0];
      ElMessage.success(`已设置目标目录: ${pathArray[0]}`);
    } else if (sourceRect && isPositionInRect(position, sourceRect)) {
      console.log('Dropped on: source');
      addSourceFiles(pathArray);
    } else {
      console.warn("Drop occurred outside of any known drop zone. Defaulting to source.", { sourceRect, targetRect, position });
      addSourceFiles(pathArray);
    }
  });

  // 我们不再需要监听Tauri的取消事件，因为后端会处理
  // unlistenCancel = await listen('tauri://file-drop-cancelled', () => {
  //   console.log('❌ SymlinkMover: File drop cancelled');
  //   hoveredTarget.value = null;
  // });
  
  console.log('✅ SymlinkMover: Custom file drop listener registered');
});

onUnmounted(() => {
  unlistenDrop?.();
  // unlistenCancel?.(); // No longer needed
});

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
    console.error("选择文件失败:", error);
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
    console.error("选择文件夹失败:", error);
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
    console.error("选择目录失败:", error);
    ElMessage.error("选择目录失败");
  }
};

// --- 核心操作 ---
const executeMoveAndLink = async () => {
  if (sourceFiles.value.length === 0) {
    ElMessage.warning("请先添加要处理的文件");
    return;
  }
  if (!targetDirectory.value) {
    ElMessage.warning("请选择目标目录");
    return;
  }

  isProcessing.value = true;
  sourceFiles.value.forEach(file => file.status = 'processing');

  try {
    const sourcePaths = sourceFiles.value.map(file => file.path);
    const result: string = await invoke('move_and_link', {
      sourcePaths,
      targetDir: targetDirectory.value,
      linkType: linkType.value
    });

    ElMessage.success(result || "文件处理完成");
    // 假设后端会返回详细的成功/失败信息，这里简单处理
    sourceFiles.value.forEach(file => file.status = 'success');

  } catch (error: any) {
    console.error("处理失败:", error);
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
        <template #header-extra>
                  <el-button :icon="Delete" text circle @click="clearFiles" :disabled="sourceFiles.length === 0" />
                </template>
                <div class="source-controls">
                  <el-input v-model="sourcePathInput" placeholder="输入或拖拽文件/文件夹路径" @keyup.enter="addSourcePathFromInput" />
                  <el-tooltip content="选择文件" placement="top">
                    <el-button @click="selectSourceFiles" :icon="Document" circle />
                  </el-tooltip>
                  <el-tooltip content="选择文件夹" placement="top">
                    <el-button @click="selectSourceFolders" :icon="FolderOpened" circle />
                  </el-tooltip>
                  <el-button @click="addSourcePathFromInput" type="primary">添加</el-button>
                </div>
                <div
                  ref="sourceDropArea"
                  class="drop-area"
          data-drop-target="source"
          :class="{ 'dragover': hoveredTarget === 'source' }"
          @dragover="handleDragOver($event, 'source')"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
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
        </div>
      </InfoCard>
    </div>

    <!-- 右侧列: 操作设置 -->
    <div class="column settings-column">
      <InfoCard title="操作设置" class="settings-card">
        <div class="setting-group">
          <label>目标目录</label>
          <div
            ref="targetDropArea"
            class="target-control"
            data-drop-target="target"
            :class="{ 'dragover': hoveredTarget === 'target' }"
            @dragover="handleDragOver($event, 'target')"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <el-input v-model="targetDirectory" placeholder="输入、拖拽或点击选择目标目录" />
            <el-button @click="selectTargetDirectory" :icon="FolderOpened">选择</el-button>
          </div>
        </div>
        <div class="setting-group">
          <label>链接类型</label>
          <el-radio-group v-model="linkType">
            <el-radio-button value="symlink">符号链接</el-radio-button>
            <el-radio-button value="link">硬链接</el-radio-button>
          </el-radio-group>
        </div>
      </InfoCard>
      <el-button
        type="primary"
        @click="executeMoveAndLink"
        :loading="isProcessing"
        :disabled="isProcessing || sourceFiles.length === 0 || !targetDirectory"
        class="execute-btn"
        size="large"
      >
        <el-icon><Rank /></el-icon>
        {{ isProcessing ? '处理中...' : '开始搬家' }}
      </el-button>
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

.drop-area {
  height: 100%;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
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

.settings-card {
  background-color: transparent;
  border: none;
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
}
</style>