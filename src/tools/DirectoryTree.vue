<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="配置选项">
        <div class="config-section">
          <label>目标路径</label>
          <div class="path-input-group">
            <el-input 
              v-model="targetPath" 
              placeholder="输入或选择目录路径"
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
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderOpened, Histogram, CopyDocument, Download } from '@element-plus/icons-vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from 'lodash';
import InfoCard from '../components/common/InfoCard.vue';
import { loadConfig, saveConfig, type DirectoryTreeConfig } from './directory-tree/config';

// 配置状态
const targetPath = ref('');
const showFiles = ref(true);
const showHidden = ref(false);
const filterMode = ref<'none' | 'gitignore' | 'custom'>('none');
const customPattern = ref('');
const maxDepth = ref(5);

// 结果状态
const treeResult = ref('');
const isGenerating = ref(false);
const isLoadingConfig = ref(true);

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
  } catch (error) {
    console.error('加载配置失败:', error);
  } finally {
    isLoadingConfig.value = false;
  }
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
      version: '1.0.0'
    };
    await saveConfig(config);
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}, 500);

// 监听配置变化并自动保存
watch([customPattern, filterMode, targetPath, showFiles, showHidden, maxDepth], () => {
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
    const result: string = await invoke('generate_directory_tree', {
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value === 10 ? 0 : maxDepth.value, // 0 表示无限制
      ignorePatterns
    });

    treeResult.value = result;
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
</script>

<style scoped>
.directory-tree-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.config-panel {
  flex: 0 0 350px;
  min-width: 350px;
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
  margin-top: 8px;
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
</style>