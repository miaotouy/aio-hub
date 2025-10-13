<template>
  <div class="text-diff-container">
    <!-- 工具栏 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <!-- 语言选择 -->
        <div class="toolbar-group">
          <el-select v-model="language" placeholder="选择语言" size="small" style="width: 150px;">
            <el-option label="纯文本" value="plaintext" />
            <el-option label="JavaScript" value="javascript" />
            <el-option label="TypeScript" value="typescript" />
            <el-option label="JSON" value="json" />
            <el-option label="HTML" value="html" />
            <el-option label="CSS" value="css" />
            <el-option label="Python" value="python" />
            <el-option label="Java" value="java" />
            <el-option label="C++" value="cpp" />
            <el-option label="Markdown" value="markdown" />
          </el-select>
        </div>

        <!-- 布局切换 -->
        <div class="toolbar-group">
          <el-radio-group v-model="renderSideBySide" size="small">
            <el-radio-button :value="true">并排</el-radio-button>
            <el-radio-button :value="false">内联</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 比对选项 -->
        <div class="toolbar-group">
          <el-checkbox v-model="ignoreWhitespace" size="small">忽略行尾空白</el-checkbox>
          <el-checkbox v-model="renderOverviewRuler" size="small">只看变更</el-checkbox>
          <el-checkbox v-model="wordWrap" size="small">自动换行</el-checkbox>
          <div class="checkbox-with-tip">
            <el-checkbox v-model="ignoreCaseInDiffComputing" size="small">
              忽略大小写
            </el-checkbox>
            <el-tooltip content="实验性功能：仅影响导航计数，不改变可视差异" placement="top">
              <el-icon class="experimental-icon" :size="16" color="var(--el-color-info)">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </div>

        <!-- 差异导航 -->
        <div class="toolbar-group">
          <el-button-group size="small">
            <el-button :disabled="!canNavigate" @click="goToPreviousDiff">
              <el-icon><ArrowUp /></el-icon>
              上一处
            </el-button>
            <el-button :disabled="!canNavigate" @click="goToNextDiff">
              下一处
              <el-icon><ArrowDown /></el-icon>
            </el-button>
          </el-button-group>
          <span v-if="totalDiffs > 0" class="diff-counter">
            {{ currentDiffIndex + 1 }} / {{ totalDiffs }}
          </span>
          <span v-else class="diff-counter">无差异</span>
        </div>

        <!-- 操作按钮 -->
        <div class="toolbar-group">
          <el-button size="small" @click="clearAll">清空</el-button>
          <el-button size="small" @click="swapTexts">交换</el-button>
        </div>
      </div>
    </el-card>

    <!-- Diff 编辑器 - 一体化输入和对比 -->
    <el-card shadow="never" class="diff-editor-card">
      <vue-monaco-diff-editor
        v-model:original="textA"
        v-model:modified="textB"
        :language="language"
        :options="editorOptions"
        class="diff-editor"
        theme="vs-dark"
        @editor-mounted="handleEditorMounted"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, shallowRef } from 'vue';
import { VueMonacoDiffEditor } from '@guolao/vue-monaco-editor';
import { ArrowUp, ArrowDown, QuestionFilled } from '@element-plus/icons-vue';
import { createModuleLogger } from '@utils/logger';
import type { editor } from 'monaco-editor';

const logger = createModuleLogger('TextDiff');

// 文本内容
const textA = ref('');
const textB = ref('');
const language = ref<string>('plaintext');

// 布局与比对选项
const renderSideBySide = ref(true); // 并排/内联
const ignoreWhitespace = ref(true); // 忽略行尾空白
const renderOverviewRuler = ref(false); // 只看变更
const wordWrap = ref(false); // 自动换行
const ignoreCaseInDiffComputing = ref(false); // 忽略大小写（实验）

// 差异导航状态
const currentDiffIndex = ref(0);
const totalDiffs = ref(0);
const diffEditor = shallowRef<editor.IStandaloneDiffEditor | null>(null);
const diffNavigator = shallowRef<any>(null);

// 编辑器配置（计算属性）
const editorOptions = computed(() => ({
  readOnly: false,
  renderSideBySide: renderSideBySide.value,
  automaticLayout: true,
  fontSize: 14,
  lineNumbers: 'on' as const,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: (wordWrap.value ? 'on' : 'off') as 'on' | 'off',
  folding: true,
  renderWhitespace: 'selection' as const,
  diffWordWrap: (wordWrap.value ? 'on' : 'off') as 'on' | 'off',
  // 忽略空白差异
  ignoreTrimWhitespace: ignoreWhitespace.value,
  // 只看变更相关选项
  renderOverviewRuler: !renderOverviewRuler.value,
  renderIndicators: !renderOverviewRuler.value,
  // 差异算法优化
  diffAlgorithm: 'advanced' as const,
}));

// 是否可以导航
const canNavigate = computed(() => totalDiffs.value > 0);

// 编辑器挂载处理
const handleEditorMounted = (editorInstance: any) => {
  diffEditor.value = editorInstance.getDiffEditor();
  
  // 创建差异导航器
  if (diffEditor.value && (window as any).monaco) {
    const monaco = (window as any).monaco;
    diffNavigator.value = monaco.editor.createDiffNavigator(diffEditor.value, {
      followsCaret: true,
      ignoreCharChanges: true,
    });
  }

  // 初始化差异计数
  updateDiffCount();
  
  logger.info('差异编辑器已挂载');
};

// 更新差异计数
const updateDiffCount = () => {
  if (!diffEditor.value) {
    totalDiffs.value = 0;
    currentDiffIndex.value = 0;
    return;
  }

  try {
    const lineChanges = diffEditor.value.getLineChanges() || [];
    totalDiffs.value = lineChanges.length;
    currentDiffIndex.value = 0;
    
    logger.debug(`差异计数更新: ${totalDiffs.value} 处`);
  } catch (error) {
    logger.error('更新差异计数失败', error);
    totalDiffs.value = 0;
  }
};

// 上一处差异
const goToPreviousDiff = () => {
  if (!diffNavigator.value || !canNavigate.value) return;
  
  try {
    diffNavigator.value.previous();
    if (currentDiffIndex.value > 0) {
      currentDiffIndex.value--;
    } else {
      currentDiffIndex.value = totalDiffs.value - 1;
    }
    logger.debug(`导航到上一处差异: ${currentDiffIndex.value + 1}/${totalDiffs.value}`);
  } catch (error) {
    logger.error('导航到上一处差异失败', error);
  }
};

// 下一处差异
const goToNextDiff = () => {
  if (!diffNavigator.value || !canNavigate.value) return;
  
  try {
    diffNavigator.value.next();
    if (currentDiffIndex.value < totalDiffs.value - 1) {
      currentDiffIndex.value++;
    } else {
      currentDiffIndex.value = 0;
    }
    logger.debug(`导航到下一处差异: ${currentDiffIndex.value + 1}/${totalDiffs.value}`);
  } catch (error) {
    logger.error('导航到下一处差异失败', error);
  }
};

// 清空所有文本
const clearAll = () => {
  textA.value = '';
  textB.value = '';
  logger.info('已清空所有文本');
};

// 交换左右文本
const swapTexts = () => {
  const temp = textA.value;
  textA.value = textB.value;
  textB.value = temp;
  logger.info('已交换左右文本');
};

// 监听文本变化，更新差异计数
watch([textA, textB], () => {
  nextTick(() => {
    updateDiffCount();
  });
}, { flush: 'post' });

// 监听比对选项变化，重新计算差异
watch([ignoreWhitespace, ignoreCaseInDiffComputing], () => {
  nextTick(() => {
    updateDiffCount();
  });
});
</script>

<style scoped>
.text-diff-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  gap: 20px;
  overflow: hidden;
}

.toolbar-card {
  flex-shrink: 0;
}

.toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.experimental-icon {
  cursor: help;
  vertical-align: middle;
}

.diff-counter {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  margin-left: 8px;
}

.diff-editor-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.diff-editor-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.diff-editor {
  flex: 1;
  min-height: 400px;
  height: 100%;
}
</style>