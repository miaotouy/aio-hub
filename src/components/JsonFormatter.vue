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
          <el-input
            v-model="formattedJsonOutput"
            type="textarea"
            :rows="15"
            readonly
            placeholder="格式化后的 JSON 将显示在这里..."
          />
          <div v-if="jsonError" class="error-message">
            <el-icon><WarningFilled /></el-icon>
            {{ jsonError }}
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

const rawJsonInput = ref('');
const formattedJsonOutput = ref('');
const jsonError = ref('');
const formatOption = ref<'pretty' | 'compact'>('pretty');

const formatJson = debounce(() => {
  jsonError.value = '';
  if (!rawJsonInput.value) {
    formattedJsonOutput.value = '';
    return;
  }

  try {
    const parsed = JSON.parse(rawJsonInput.value);
    if (formatOption.value === 'pretty') {
      formattedJsonOutput.value = JSON.stringify(parsed, null, 2);
    } else {
      formattedJsonOutput.value = JSON.stringify(parsed);
    }
  } catch (e: any) {
    jsonError.value = `JSON 解析错误: ${e.message}`;
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