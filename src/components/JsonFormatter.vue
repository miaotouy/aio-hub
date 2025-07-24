<template>
  <div class="json-formatter-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>输入 JSON</span>
              <el-button text @click="pasteToJson">粘贴</el-button>
            </div>
          </template>
          <el-input
            v-model="rawJsonInput"
            type="textarea"
            :rows="15"
            placeholder="请输入 JSON 字符串..."
            @input="formatJson"
          />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>输出 JSON</span>
              <div class="actions">
                <el-button text @click="copyFormattedJson">复制</el-button>
                <el-radio-group v-model="formatOption" size="small" @change="formatJson">
                  <el-radio-button label="pretty">美化</el-radio-button>
                  <el-radio-button label="compact">压缩</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>
          <div v-if="jsonError" class="error-message">
            <el-icon><WarningFilled /></el-icon>
            {{ jsonError }}
          </div>
          <div class="json-pretty-output-wrapper">
            <VueJsonPretty
              v-if="parsedJsonData"
              :data="parsedJsonData"
              :showIcon="true"
              :showLine="true"
              :showSelectBox="false"
              :highlightSelectedNode="false"
              :showLength="true"
              :showDoubleQuotes="true"
              :editable="false"
            />
            <el-input
              v-else
              v-model="formattedJsonOutput"
              type="textarea"
              :rows="15"
              readonly
              placeholder="格式化后的 JSON 将显示在这里..."
              class="json-text-output"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import debounce from 'lodash/debounce';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';

const rawJsonInput = ref('');
const formattedJsonOutput = ref(''); // 仍然用于复制功能
const parsedJsonData = ref<any>(null); // 用于 VueJsonPretty 显示
const jsonError = ref('');
const formatOption = ref<'pretty' | 'compact'>('pretty');

const formatJson = debounce(() => {
  jsonError.value = '';
  if (!rawJsonInput.value) {
    formattedJsonOutput.value = '';
    parsedJsonData.value = null; // 清空数据
    return;
  }

  try {
    const parsed = JSON.parse(rawJsonInput.value);
    parsedJsonData.value = parsed; // 更新解析后的数据
    if (formatOption.value === 'pretty') {
      formattedJsonOutput.value = JSON.stringify(parsed, null, 2);
    } else {
      formattedJsonOutput.value = JSON.stringify(parsed);
    }
  } catch (e: any) {
    jsonError.value = `JSON 解析错误: ${e.message}`;
    parsedJsonData.value = null; // 清空数据
    formattedJsonOutput.value = '';
  }
}, 300);

const pasteToJson = async () => {
  try {
    rawJsonInput.value = await readText();
    formatJson(); // Paste and immediately format
    ElMessage.success('已从剪贴板粘贴 JSON！');
  } catch (error: any) {
    ElMessage.error(`粘贴失败: ${error.message}`);
  }
};

const copyFormattedJson = async () => {
  if (!formattedJsonOutput.value) {
    ElMessage.warning('没有可复制的格式化 JSON。');
    return;
  }
  try {
    await writeText(formattedJsonOutput.value);
    ElMessage.success('格式化后的 JSON 已复制到剪贴板！');
  } catch (error: any) {
    ElMessage.error(`复制失败: ${error.message}`);
  }
};
</script>

<style scoped>
.json-formatter-container {
  padding: 20px;
  max-width: 1200px;
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

/* 覆盖 VueJsonPretty 的样式 */
.json-pretty-output-wrapper {
  background-color: var(--input-bg); /* 与输入框背景色保持一致 */
}

/* VueJsonPretty 内部元素样式 */
.vjs-tree {
  color: var(--text-color) !important;
}

.vjs-key {
  color: var(--text-color) !important;
}

.vjs-value {
  color: var(--text-color-light) !important;
}

/* 针对特定类型的值调整颜色 */
.vjs-value__string {
  color: #c94e4e !important; /* 字符串颜色，可调整 */
}
.vjs-value__number {
  color: #3b8a3b !important; /* 数字颜色，可调整 */
}
.vjs-value__boolean {
  color: #925cff !important; /* 布尔值颜色，可调整 */
}
.vjs-value__null {
  color: #808080 !important; /* null 颜色，可调整 */
}

/* 确保 VueJsonPretty 的边框和填充与输入框类似 */
.json-pretty-output-wrapper {
  height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border-color); /* 使用主题边框色 */
  border-radius: var(--el-border-radius-base);
  padding: 10px;
  box-sizing: border-box;
  font-size: 14px;
}

.json-pretty-output-wrapper {
  height: 400px; /* 固定高度，可根据实际情况调整 */
  overflow-y: auto; /* 允许滚动 */
  border: 1px solid var(--el-border-color); /* 边框与输入框对齐 */
  border-radius: var(--el-border-radius-base); /* 圆角 */
  padding: 10px; /* 内边距 */
  box-sizing: border-box; /* 边框和内边距包含在高度内 */
  font-size: 14px; /* 字体大小 */
}

.json-text-output {
  height: 100%; /* 保证文本框占据整个高度 */
  display: flex;
  flex-direction: column;
}

.json-text-output .el-textarea__inner {
  flex-grow: 1; /* 让文本域内容区填充剩余空间 */
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.error-message {
  color: #f56c6c; /* ElMessage.error color */
  font-size: 14px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>