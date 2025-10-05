<template>
  <div class="text-diff-container">
    <el-row :gutter="20" class="input-section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>源文本 (左)</span></template>
          <el-input
            v-model="textA"
            type="textarea"
            :rows="15"
            placeholder="请输入源文本..."
          />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>目标文本 (右)</span></template>
          <el-input
            v-model="textB"
            type="textarea"
            :rows="15"
            placeholder="请输入目标文本..."
          />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="output-section">
      <template #header>
        <div class="output-header">
          <span>差异对比</span>
          <div class="output-controls">
            <el-radio-group v-model="diffMode" size="small" style="margin-right: 10px;">
              <el-radio-button label="text">文本对比</el-radio-button>
              <el-radio-button label="json" :disabled="!isJsonA || !isJsonB">JSON对比</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="outputFormat" size="small" v-show="diffMode === 'text'">
              <el-radio-button label="side-by-side">并排视图</el-radio-button>
              <el-radio-button label="line-by-line">行内视图</el-radio-button>
            </el-radio-group>
            <el-button v-if="diffMode === 'json' && isJsonA && isJsonB" @click="mergeJson" type="primary" size="small" style="margin-left: 10px;">合并 JSON (优先右侧)</el-button>
          </div>
        </div>
      </template>
      <div v-if="diffHtml" v-html="diffHtml" class="diff-view" :class="{ 'json-diff-view': diffMode === 'json' }"></div>
      <el-empty v-else description="暂无差异"></el-empty>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { createPatch } from 'diff';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import debounce from 'lodash/debounce';
import * as jsondiffpatch from 'jsondiffpatch';
import { ElMessage, ElMessageBox } from 'element-plus';

const textA = ref('');
const textB = ref('');
const diffHtml = ref('');
const outputFormat = ref<'side-by-side' | 'line-by-line'>('side-by-side');
const diffMode = ref<'text' | 'json'>('text'); // 新增：差异模式

const isJsonA = computed(() => {
  try {
    JSON.parse(textA.value);
    return true;
  } catch (e) {
    return false;
  }
});

const isJsonB = computed(() => {
  try {
    JSON.parse(textB.value);
    return true;
  } catch (e) {
    return false;
  }
});

const generateDiff = debounce(() => {
  diffHtml.value = ''; // Clear previous diff

  if (!textA.value && !textB.value) {
    return;
  }

  if (diffMode.value === 'json' && isJsonA.value && isJsonB.value) {
    try {
      const objA = JSON.parse(textA.value);
      const objB = JSON.parse(textB.value);
      const instance = jsondiffpatch.create();
      const delta = instance.diff(objA, objB);
      
      if (delta) {
        // 简单的 JSON 差异显示，使用格式化的 JSON 字符串
        diffHtml.value = `<pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto;">${JSON.stringify(delta, null, 2)}</pre>`;
      } else {
        diffHtml.value = '<div style="color: green; text-align: center; padding: 20px;">JSON 对象完全相同</div>';
      }
    } catch (e: any) {
      diffHtml.value = `<div style="color: red;">JSON 解析或对比错误: ${e.message}</div>`;
      console.error('JSON diff error:', e);
    }
  } else {
    // Fallback to text diff if not JSON mode or invalid JSON
    const diffPatch = createPatch('file.txt', textA.value, textB.value);
    diffHtml.value = html(diffPatch, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: outputFormat.value,
    });
  }
}, 300);

const mergeJson = () => {
  if (!isJsonA.value || !isJsonB.value) {
    ElMessage.error('请确保两个输入都是有效的 JSON！');
    return;
  }
  try {
    const objA = JSON.parse(textA.value);
    const objB = JSON.parse(textB.value);
    const instance = jsondiffpatch.create();
    const delta = instance.diff(objA, objB);

    if (delta) {
      // 优先右侧合并：将 delta 应用到左侧，冲突时保留右侧的值
      const merged = instance.patch(objA, delta); // 这会应用所有差异，包括增加、删除、修改。
      // 对于冲突，jsondiffpatch的patch默认行为是直接应用delta，不会有“优先哪个”的选择
      // 如果需要更复杂的合并策略，需要实现自定义的合并逻辑
      ElMessageBox.alert(
        `<pre>${JSON.stringify(merged, null, 2)}</pre>`,
        '合并结果 (优先右侧)',
        {
          dangerouslyUseHTMLString: true,
          confirmButtonText: '确定',
          callback: () => {
            textA.value = JSON.stringify(merged, null, 2); // 将合并结果放回左侧
            ElMessage.success('合并结果已填充到源文本！');
          }
        }
      );
    } else {
      ElMessage.info('两个 JSON 对象完全相同，无需合并。');
    }
  } catch (e: any) {
    ElMessage.error(`合并失败: ${e.message}`);
    console.error('JSON merge error:', e);
  }
};

watch([textA, textB, outputFormat, diffMode], generateDiff, { immediate: true });
</script>

<style scoped>
.text-diff-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  color: var(--text-color); /* 确保容器内文本颜色正确 */
}

/* 覆盖 ElCard 样式 */
.el-card {
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  color: var(--text-color);
}

/* 覆盖 ElInput 和 ElTextarea 的样式 */
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

.input-section {
  margin-bottom: 20px;
}

.output-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-color); /* 确保头部文本颜色正确 */
}

.diff-view {
  border: 1px solid var(--border-color); /* 使用主题边框色 */
  border-radius: 4px;
  padding: 10px;
}

/* 覆盖 diff2html 样式 */
/* 使用 ::v-deep 或 :deep() 来穿透 scoped style */
/* 为了兼容性，这里使用不带 v-deep 的方式，但请注意这会影响全局 */
/* 更好的做法是在 App.vue 中引入全局样式覆盖或使用 SCSS/Less 等预处理器 */

/* diff2html 的背景色和文本颜色 */
.d2h-wrapper {
  background-color: var(--card-bg);
  color: var(--text-color);
}

.d2h-file-header {
  background-color: var(--container-bg);
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
}

.d2h-code-wrapper {
  background-color: var(--input-bg); /* 代码区域背景 */
}

.d2h-files-diff {
  border: none; /* 移除外层边框，由 .diff-view 提供 */
}

.d2h-code-line {
  color: var(--text-color);
}

.d2h-code-line.d2h-info {
  background-color: var(--container-bg);
  color: var(--text-color-light);
}

.d2h-code-line.d2h-cntx {
  background-color: var(--input-bg);
  color: var(--text-color);
}

.d2h-code-line.d2h-ins {
  background-color: #e6ffed; /* 绿色背景，可根据主题调整 */
  color: #24292e; /* 深色文本 */
}
.dark-theme .d2h-code-line.d2h-ins {
  background-color: #28a74533; /* 暗色模式下的绿色，透明度 */
  color: var(--text-color);
}

.d2h-code-line.d2h-del {
  background-color: #ffeef0; /* 红色背景，可根据主题调整 */
  color: #24292e; /* 深色文本 */
}
.dark-theme .d2h-code-line.d2h-del {
  background-color: #d73a4933; /* 暗色模式下的红色，透明度 */
  color: var(--text-color);
}

/* json diff 的 pre 标签样式 */
.diff-view pre {
  background: var(--input-bg) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color);
}

</style>