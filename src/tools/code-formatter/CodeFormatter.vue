<template>
  <div class="code-formatter-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12" class="column-wrapper">
        <InfoCard class="full-height-card">
          <template #header>
            <div class="card-header">
              <span>输入代码</span>
              <el-select v-model="language" placeholder="选择语言" size="small" style="width: 160px" filterable>
                <el-option-group label="前端语言">
                  <el-option label="JavaScript" value="javascript"></el-option>
                  <el-option label="TypeScript" value="typescript"></el-option>
                  <el-option label="JSON" value="json"></el-option>
                  <el-option label="HTML" value="html"></el-option>
                  <el-option label="CSS" value="css"></el-option>
                </el-option-group>
                <el-option-group label="后端语言">
                  <el-option label="PHP" value="php"></el-option>
                </el-option-group>
                <el-option-group label="配置/数据">
                  <el-option label="XML" value="xml"></el-option>
                  <el-option label="YAML" value="yaml"></el-option>
                </el-option-group>
                <el-option-group label="标记语言">
                  <el-option label="Markdown" value="markdown"></el-option>
                </el-option-group>
              </el-select>
            </div>
          </template>
          <div class="textarea-wrapper">
            <el-input v-model="rawCodeInput" type="textarea" class="full-height-textarea" placeholder="请输入代码..."
              @input="formatCode" />
          </div>
        </InfoCard>
      </el-col>
      <el-col :span="12" class="column-wrapper">
        <InfoCard class="full-height-card">
          <template #header>
            <div class="card-header">
              <span>输出代码</span>
              <div class="header-actions">
                <el-button text @click="copyFormattedCode">复制</el-button>
                <el-button text type="success" @click="sendToChat">发送到聊天</el-button>
              </div>
            </div>
          </template>
          <div class="textarea-wrapper">
            <el-input v-model="formattedCodeOutput" type="textarea" class="full-height-textarea" readonly
              placeholder="格式化后的代码将显示在这里..." />
          </div>
          <div v-if="formatError" class="error-message">
            <el-icon>
              <WarningFilled />
            </el-icon>
            {{ formatError }}
          </div>
        </InfoCard>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import InfoCard from '@/components/common/InfoCard.vue';
import { customMessage } from '@/utils/customMessage';
import { WarningFilled } from '@element-plus/icons-vue';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import debounce from 'lodash/debounce';
import { serviceRegistry } from '@/services/registry';
import type CodeFormatterService from './codeFormatter.registry';
import type { SupportedLanguage } from './codeFormatter.registry';
import { useSendToChat } from '@/composables/useSendToChat';

// 获取服务实例
const codeFormatterService = serviceRegistry.getService<CodeFormatterService>('code-formatter');

// 获取发送到聊天功能
const { sendCodeToChat } = useSendToChat();

// UI 状态
const rawCodeInput = ref('');
const formattedCodeOutput = ref('');
const formatError = ref('');
const language = ref<SupportedLanguage>('javascript');

// 格式化代码（调用服务）
const formatCodeInternal = async () => {
  formatError.value = '';
  if (!rawCodeInput.value) {
    formattedCodeOutput.value = '';
    return;
  }

  const result = await codeFormatterService.formatCode(
    rawCodeInput.value,
    language.value
  );

  if (result.success) {
    formattedCodeOutput.value = result.formatted;
    if (result.warning) {
      formatError.value = result.warning;
    }
  } else {
    formatError.value = result.error || '格式化失败';
    formattedCodeOutput.value = result.formatted; // 显示原始代码
  }
};

const formatCode = debounce(formatCodeInternal, 500);

// 复制格式化后的代码
const copyFormattedCode = async () => {
  if (!formattedCodeOutput.value) {
    customMessage.warning('没有可复制的格式化代码');
    return;
  }
  try {
    await writeText(formattedCodeOutput.value);
    customMessage.success('格式化后的代码已复制到剪贴板！');
  } catch (error: any) {
    customMessage.error(`复制失败: ${error.message}`);
  }
};

// 发送到聊天
const sendToChat = () => {
  sendCodeToChat(formattedCodeOutput.value, language.value, {
    successMessage: `已将格式化的 ${language.value} 代码发送到聊天`,
  });
};

// 监听语言和输入变化
watch(language, formatCode, { immediate: true });
watch(rawCodeInput, formatCode);
</script>

<style scoped>
.code-formatter-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  color: var(--text-color);
  overflow: hidden;
}

.input-output-section {
  flex: 1;
  height: 100%;
  display: flex;
  margin: 0 -10px;
}

.column-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 10px;
}
.full-height-card {
  height: 100%;
}

.full-height-card :deep(.el-card__header) {
  flex-shrink: 0;
  padding: 16px;
}

.full-height-card :deep(.el-card__body) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.textarea-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.full-height-textarea {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.full-height-textarea :deep(.el-textarea__inner) {
  height: 100% !important;
  resize: none;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.error-message {
  color: #f56c6c;
  font-size: 14px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
</style>
