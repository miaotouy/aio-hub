<template>
  <div class="code-formatter-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>输入代码</span>
              <el-select
                v-model="language"
                placeholder="选择语言"
                size="small"
                style="width: 120px"
              >
                <el-option label="JavaScript" value="javascript"></el-option>
                <el-option label="TypeScript" value="typescript"></el-option>
                <el-option label="JSON" value="json"></el-option>
                <el-option label="HTML" value="html"></el-option>
                <el-option label="CSS" value="css"></el-option>
                <el-option label="Markdown" value="markdown"></el-option>
                <!-- 更多语言选项 -->
              </el-select>
            </div>
          </template>
          <el-input
            v-model="rawCodeInput"
            type="textarea"
            :rows="15"
            placeholder="请输入代码..."
            @input="formatCode"
          />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>输出代码</span>
              <el-button text @click="copyFormattedCode">复制</el-button>
            </div>
          </template>
          <el-input
            v-model="formattedCodeOutput"
            type="textarea"
            :rows="15"
            readonly
            placeholder="格式化后的代码将显示在这里..."
          />
          <div v-if="formatError" class="error-message">
            <el-icon><WarningFilled /></el-icon>
            {{ formatError }}
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { WarningFilled } from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import debounce from "lodash/debounce";

// prettier core and plugins
import prettier from "prettier";
import parserBabel from "prettier/parser-babel";
import parserHtml from "prettier/parser-html";
import parserCss from "prettier/parser-postcss"; // for css, less, scss
import parserMarkdown from "prettier/parser-markdown";
import parserTypeScript from "prettier/parser-typescript"; // for ts

const rawCodeInput = ref("");
const formattedCodeOutput = ref("");
const formatError = ref("");
const language = ref("javascript"); // 默认语言

const formatCode = debounce(async () => {
  formatError.value = "";
  if (!rawCodeInput.value) {
    formattedCodeOutput.value = "";
    return;
  }

  try {
    let plugins: any[] = [];
    let parser: string;

    switch (language.value) {
      case "javascript":
      case "typescript":
      case "json":
        plugins.push(parserBabel, parserTypeScript);
        parser = language.value === "json" ? "json" : "babel";
        break;
      case "html":
        plugins.push(parserHtml);
        parser = "html";
        break;
      case "css":
        plugins.push(parserCss);
        parser = "css";
        break;
      case "markdown":
        plugins.push(parserMarkdown);
        parser = "markdown";
        break;
      default:
        formatError.value = `不支持的语言: ${language.value}`;
        formattedCodeOutput.value = rawCodeInput.value;
        return;
    }

    formattedCodeOutput.value = await prettier.format(rawCodeInput.value, {
      parser: parser,
      plugins: plugins,
      singleQuote: true,
      trailingComma: "es5",
    });
  } catch (e: any) {
    formatError.value = `格式化错误: ${e.message}`;
    formattedCodeOutput.value = rawCodeInput.value; // 显示原始输入以便调试
  }
}, 500);

const copyFormattedCode = async () => {
  if (!formattedCodeOutput.value) {
    ElMessage.warning("没有可复制的格式化代码。");
    return;
  }
  try {
    await writeText(formattedCodeOutput.value);
    ElMessage.success("格式化后的代码已复制到剪贴板！");
  } catch (error: any) {
    ElMessage.error(`复制失败: ${error.message}`);
  }
};

watch(language, formatCode, { immediate: true });
watch(rawCodeInput, formatCode);
</script>

<style scoped>
.code-formatter-container {
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

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
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
