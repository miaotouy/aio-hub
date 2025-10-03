<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="配置选项" class="config-card">
        <div class="config-section">
          <label>目标路径</label>
          <div
            class="path-input-group drop-zone"
            :class="{ 'dragover': isDraggingOver }"
            @dragenter="handleDragEnter"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <el-input
              v-model="targetPath"
              placeholder="输入或选择目录路径（支持拖拽）"
              @keyup.enter="generateTree"
            />
            <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
          </div>
        </div>

        <div class="config-section">
          <label>显示选项</label>
          <div class="checkbox-group">
            <el-checkbox v-model="showFiles" label="显示文件" />
            <el-checkbox v-model="showHidden" label="显示隐藏文件" />
            <el-checkbox v-model="autoGenerateOnDrop" label="拖拽后自动生成" />
          </div>
        </div>

        <div class="config-section">
          <label>过滤规则</label>
          <el-select v-model="filterMode" placeholder="选择过滤模式">
            <el-option label="无过滤" value="none" />
            <el-option label="应用 .gitignore" value="gitignore" />
            <el-option label="自定义规则" value="custom" />
          </el-select>
          
          <el-input
            v-if="filterMode === 'custom'"
            v-model="customPattern"
            type="textarea"
            :rows="3"
            placeholder="每行一个规则，支持通配符&#10;例如: *.log&#10;node_modules/"
            class="custom-pattern-input"
          />
        </div>

        <div class="config-section">
          <label>深度限制</label>
          <el-slider 
            v-model="maxDepth" 
            :min="1" 
            :max="10" 
            :marks="{ 1: '1', 5: '5', 10: '10' }"
            show-stops
          />
          <div class="depth-info">当前深度: {{ maxDepth === 10 ? '无限制' : maxDepth }}</div>
        </div>

        <el-button 
          type="primary" 
          @click="generateTree" 
          :loading="isGenerating"
          :disabled="!targetPath"
          class="generate-btn"
        >
          <el-icon><Histogram /></el-icon>
          生成目录树
        </el-button>
      </InfoCard>

    </div>

    <!-- 右侧：结果显示 -->
    <div class="result-panel">
      <InfoCard title="目录结构" class="result-card">
        <template #headerExtra>
          <el-button-group v-if="treeResult">
            <el-tooltip v-if="statsInfo" placement="top">
              <template #content>
                <div class="stats-tooltip">
                  <div class="stats-row">
                    <span class="stats-label">总目录:</span>
                    <span class="stats-value">{{ statsInfo.total_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">总文件:</span>
                    <span class="stats-value">{{ statsInfo.total_files }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">过滤目录:</span>
                    <span class="stats-value">{{ statsInfo.filtered_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">过滤文件:</span>
                    <span class="stats-value">{{ statsInfo.filtered_files }}</span>
                  </div>
                  <div v-if="statsInfo.filter_count > 0" class="stats-row">
                    <span class="stats-label">过滤规则:</span>
                    <span class="stats-value">{{ statsInfo.filter_count }} 条</span>
                  </div>
                </div>
              </template>
              <el-button :icon="DataAnalysis" text circle />
            </el-tooltip>
            <el-tooltip content="复制到剪贴板" placement="top">
              <el-button :icon="CopyDocument" text circle @click="copyToClipboard" />
            </el-tooltip>
            <el-tooltip content="导出为文件" placement="top">
              <el-button :icon="Download" text circle @click="exportToFile" />
            </el-tooltip>
          </el-button-group>
        </template>

        <div v-if="!treeResult" class="empty-state">
          <el-empty description="选择目录并生成目录树" />
        </div>

        <el-scrollbar v-else class="tree-scrollbar">
          <pre class="tree-content">{{ treeResult }}</pre>
        </el-scrollbar>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderOpened, Histogram, CopyDocument, Download, DataAnalysis } from '@element-plus/icons-vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { debounce } from 'lodash';
import InfoCard from '../../components/common/InfoCard.vue';
import { loadConfig, saveConfig, type DirectoryTreeConfig } from './config';

// 配置状态
const targetPath = ref('');
const showFiles = ref(true);
const showHidden = ref(false);
const filterMode = ref<'none' | 'gitignore' | 'custom'>('none');
const customPattern = ref('');
const maxDepth = ref(5);
const autoGenerateOnDrop = ref(true);  // 拖拽后自动生成

// 结果状态
const treeResult = ref('');
const statsInfo = ref<{
  total_dirs: number;
  total_files: number;
  filtered_dirs: number;
  filtered_files: number;
  show_files: boolean;
  show_hidden: boolean;
  max_depth: string;
  filter_count: number;
} | null>(null);
const isGenerating = ref(false);
const isLoadingConfig = ref(true);

// 拖拽状态
const isDraggingOver = ref(false);

// 拖放监听器
let unlistenDrop: (() => void) | null = null;
let unlistenDragEnter: (() => void) | null = null;
let unlistenDragOver: (() => void) | null = null;
let unlistenDragLeave: (() => void) | null = null;

// 判断位置是否在元素内
const isPositionInRect = (position: { x: number, y: number }, rect: DOMRect) => {
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
  unlistenDragEnter = await listen('custom-drag-enter', (event: any) => {
    const { position } = event.payload;
    const dropZone = document.querySelector('.path-input-group') as HTMLElement;
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect();
      if (isPositionInRect(position, rect)) {
        isDraggingOver.value = true;
        console.log('拖动进入目标路径区域');
      }
    }
  });

  // 监听拖动移动事件
  unlistenDragOver = await listen('custom-drag-over', (event: any) => {
    const { position } = event.payload;
    const dropZone = document.querySelector('.path-input-group') as HTMLElement;
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect();
      const isInside = isPositionInRect(position, rect);
      if (isInside !== isDraggingOver.value) {
        isDraggingOver.value = isInside;
      }
    }
  });

  // 监听拖动离开事件
  unlistenDragLeave = await listen('custom-drag-leave', () => {
    isDraggingOver.value = false;
    console.log('拖动离开窗口');
  });

  // 监听文件放下事件
  unlistenDrop = await listen('custom-file-drop', async (event: any) => {
    const { paths, position } = event.payload;
    
    // 清除高亮状态
    isDraggingOver.value = false;
    
    if (!paths || paths.length === 0) {
      return;
    }
    
    const dropZone = document.querySelector('.path-input-group') as HTMLElement;
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect();
      if (isPositionInRect(position, rect)) {
        // 获取第一个路径
        const droppedPath = paths[0];
        
        // 检查是否为目录
        try {
          const isDir = await invoke<boolean>('is_directory', { path: droppedPath });
          if (isDir) {
            targetPath.value = droppedPath;
            ElMessage.success(`已设置目标路径: ${droppedPath}`);
            console.log(`已通过拖拽设置目标路径: ${droppedPath}`);
            
            // 根据配置决定是否自动生成目录树
            if (autoGenerateOnDrop.value) {
              setTimeout(() => {
                generateTree();
              }, 500);
            }
          } else {
            ElMessage.warning('请拖入目录而非文件');
          }
        } catch (error) {
          console.error('检查路径类型失败:', error);
          // 如果检查失败，仍然尝试设置路径
          targetPath.value = droppedPath;
          ElMessage.info(`已设置路径: ${droppedPath}`);
        }
      }
    }
  });
};

// 加载配置
onMounted(async () => {
  try {
    const config = await loadConfig();
    customPattern.value = config.customPatterns;
    filterMode.value = config.lastFilterMode;
    targetPath.value = config.lastTargetPath;
    showFiles.value = config.showFiles;
    showHidden.value = config.showHidden;
    maxDepth.value = config.maxDepth;
    autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true;  // 兼容旧配置
  } catch (error) {
    console.error('加载配置失败:', error);
  } finally {
    isLoadingConfig.value = false;
  }
  
  // 设置拖放监听器
  await setupFileDropListener();
});

// 清理监听器
onUnmounted(() => {
  unlistenDrop?.();
  unlistenDragEnter?.();
  unlistenDragOver?.();
  unlistenDragLeave?.();
});

// 防抖保存配置
const debouncedSaveConfig = debounce(async () => {
  if (isLoadingConfig.value) return; // 初始加载时不保存
  
  try {
    const config: DirectoryTreeConfig = {
      customPatterns: customPattern.value,
      lastFilterMode: filterMode.value,
      lastTargetPath: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value,
      autoGenerateOnDrop: autoGenerateOnDrop.value,
      version: '1.0.0'
    };
    await saveConfig(config);
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}, 500);

// 监听配置变化并自动保存
watch([customPattern, filterMode, targetPath, showFiles, showHidden, maxDepth, autoGenerateOnDrop], () => {
  debouncedSaveConfig();
});

// 选择目录
const selectDirectory = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: '选择要分析的目录'
    });
    if (typeof selected === 'string') {
      targetPath.value = selected;
    }
  } catch (error) {
    console.error('选择目录失败:', error);
    ElMessage.error('选择目录失败');
  }
};

// 生成目录树
const generateTree = async () => {
  if (!targetPath.value) {
    ElMessage.warning('请先选择目录');
    return;
  }

  isGenerating.value = true;
  try {
    // 准备过滤规则
    let ignorePatterns: string[] = [];
    
    if (filterMode.value === 'gitignore') {
      // 传递特殊标记，让后端递归收集所有 .gitignore 文件
      ignorePatterns = ['__USE_GITIGNORE__'];
    } else if (filterMode.value === 'custom') {
      ignorePatterns = customPattern.value
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line);
    }

    // 调用 Rust 后端生成目录树
    const result: { tree: string; stats: any } = await invoke('generate_directory_tree', {
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value === 10 ? 0 : maxDepth.value, // 0 表示无限制
      ignorePatterns
    });

    treeResult.value = result.tree;
    statsInfo.value = result.stats;
    
    // 在控制台输出统计信息和配置
    console.log('📊 目录树统计信息:', {
      总目录: result.stats.total_dirs,
      总文件: result.stats.total_files,
      过滤目录: result.stats.filtered_dirs,
      过滤文件: result.stats.filtered_files,
      过滤规则数: result.stats.filter_count,
      显示文件: result.stats.show_files,
      显示隐藏: result.stats.show_hidden,
      最大深度: result.stats.max_depth
    });
    
    console.log('⚙️ 使用的配置:', {
      目标路径: targetPath.value,
      显示文件: showFiles.value,
      显示隐藏: showHidden.value,
      过滤模式: filterMode.value,
      最大深度: maxDepth.value === 10 ? '无限制' : maxDepth.value,
      过滤规则: filterMode.value === 'custom'
        ? customPattern.value.split('\n').filter((l: string) => l.trim()).length + ' 条'
        : filterMode.value === 'gitignore' ? '使用 .gitignore' : '无'
    });
    
    ElMessage.success('目录树生成成功');
  } catch (error: any) {
    console.error('生成目录树失败:', error);
    ElMessage.error(`生成失败: ${error}`);
    treeResult.value = `错误: ${error}`;
  } finally {
    isGenerating.value = false;
  }
};

// 复制到剪贴板
const copyToClipboard = async () => {
  try {
    await writeText(treeResult.value);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    console.error('复制失败:', error);
    ElMessage.error('复制到剪贴板失败');
  }
};

// 导出为文件
const exportToFile = async () => {
  try {
    const savePath = await openDialog({
      defaultPath: 'directory-tree.txt',
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown Files', extensions: ['md'] }
      ],
      title: '保存目录树'
    });

    if (typeof savePath === 'string') {
      await writeTextFile(savePath, treeResult.value);
      ElMessage.success('文件保存成功');
    }
  } catch (error) {
    console.error('保存文件失败:', error);
    ElMessage.error('保存文件失败');
  }
};

// 前端拖放事件处理 - 用于视觉反馈
const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isDraggingOver.value = true;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // 保持高亮状态
  if (!isDraggingOver.value) {
    isDraggingOver.value = true;
  }
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
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
    isDraggingOver.value = false;
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // 清除高亮状态
  isDraggingOver.value = false;
  // 实际的文件处理由 Tauri 后端的 custom-file-drop 事件处理
};
</script>

<style scoped>
.directory-tree-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  --primary-color-rgb: 64, 158, 255; /* 默认蓝色的 RGB 值 */
}

.config-panel {
  flex: 0 0 350px;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  flex-shrink: 0;
}

.result-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.result-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-section {
  margin-bottom: 20px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.path-input-group {
  display: flex;
  gap: 10px;
  position: relative;
  transition: all 0.3s ease;
  border: 2px dashed transparent;
  border-radius: 8px;
  padding: 8px;
  margin: -8px;
}

/* 拖拽悬停效果 */
.path-input-group.drop-zone.dragover {
  border-color: var(--primary-color);
  background-color: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 15px rgba(64, 158, 255, 0.3);
  transform: scale(1.02);
}

.path-input-group.drop-zone.dragover::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 8px;
  background: linear-gradient(45deg, transparent, rgba(64, 158, 255, 0.2), transparent);
  animation: shimmer 2s infinite;
  pointer-events: none;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.path-input-group.drop-zone.dragover :deep(.el-input__wrapper) {
  background-color: rgba(64, 158, 255, 0.08);
  border-color: var(--primary-color);
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-pattern-input {
  margin-top: 10px;
}

.depth-info {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-color-light);
}

.generate-btn {
  width: 100%;
  margin-top: 10px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-scrollbar {
  flex: 1;
  min-height: 0;
}

.tree-content {
  margin: 0;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--container-bg);
  border-radius: 4px;
  white-space: pre;
  overflow-x: auto;
}

.stats-tooltip {
  padding: 4px 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
  font-size: 13px;
}

.stats-label {
  font-weight: 500;
}

.stats-value {
  font-weight: 600;
  font-family: 'Consolas', 'Monaco', monospace;
}
</style>