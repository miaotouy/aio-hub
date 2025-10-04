<template>
  <div class="code-formatter-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12" class="column-wrapper">
        <el-card shadow="never" class="full-height-card">
          <template #header>
            <div class="card-header">
              <span>输入代码</span>
              <el-select
                v-model="language"
                placeholder="选择语言"
                size="small"
                style="width: 160px"
                filterable
              >
                <el-option-group label="前端语言">
                  <el-option label="JavaScript" value="javascript"></el-option>
                  <el-option label="TypeScript" value="typescript"></el-option>
                  <el-option label="JSON" value="json"></el-option>
                  <el-option label="HTML" value="html"></el-option>
                  <el-option label="CSS" value="css"></el-option>
                  <el-option label="Svelte" value="svelte"></el-option>
                </el-option-group>
                <el-option-group label="后端语言">
                  <el-option label="PHP" value="php"></el-option>
                  <el-option label="Java" value="java"></el-option>
                </el-option-group>
                <el-option-group label="配置/数据">
                  <el-option label="XML" value="xml"></el-option>
                  <el-option label="YAML" value="yaml"></el-option>
                  <el-option label="TOML" value="toml"></el-option>
                  <el-option label="Properties" value="properties"></el-option>
                </el-option-group>
                <el-option-group label="查询语言">
                  <el-option label="SQL" value="sql"></el-option>
                </el-option-group>
                <el-option-group label="标记语言">
                  <el-option label="Markdown" value="markdown"></el-option>
                </el-option-group>
              </el-select>
            </div>
          </template>
          <div class="textarea-wrapper">
            <el-input
              v-model="rawCodeInput"
              type="textarea"
              class="full-height-textarea"
              placeholder="请输入代码..."
              @input="formatCode"
            />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12" class="column-wrapper">
        <el-card shadow="never" class="full-height-card">
          <template #header>
            <div class="card-header">
              <span>输出代码</span>
              <el-button text @click="copyFormattedCode">复制</el-button>
            </div>
          </template>
          <div class="textarea-wrapper">
            <el-input
              v-model="formattedCodeOutput"
              type="textarea"
              class="full-height-textarea"
              readonly
              placeholder="格式化后的代码将显示在这里..."
            />
          </div>
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

// prettier core and built-in plugins
import prettier from "prettier";
import parserBabel from "prettier/parser-babel";
import parserHtml from "prettier/parser-html";
import parserCss from "prettier/parser-postcss";
import parserMarkdown from "prettier/parser-markdown";
import parserTypeScript from "prettier/parser-typescript";

// prettier community plugins (浏览器兼容)
import * as prettierPluginPhp from "@prettier/plugin-php";
import * as prettierPluginXml from "@prettier/plugin-xml";
import * as prettierPluginJava from "prettier-plugin-java";
import * as prettierPluginSql from "prettier-plugin-sql";
import * as prettierPluginToml from "prettier-plugin-toml";
import * as prettierPluginSvelte from "prettier-plugin-svelte";
import * as prettierPluginProperties from "prettier-plugin-properties";

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
    let additionalOptions: any = {};

    switch (language.value) {
      // 前端语言
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
      case "svelte":
        plugins.push(prettierPluginSvelte, parserTypeScript, parserHtml, parserCss);
        parser = "svelte";
        break;

      // 后端语言
      case "php":
        plugins.push(prettierPluginPhp);
        parser = "php";
        break;
      case "java":
        plugins.push(prettierPluginJava);
        parser = "java";
        break;

      // 配置/数据语言
      case "xml":
        plugins.push(prettierPluginXml);
        parser = "xml";
        additionalOptions.xmlWhitespaceSensitivity = "ignore";
        break;
      case "yaml":
        plugins.push(parserBabel); // YAML 使用 babel parser
        parser = "yaml";
        break;
      case "toml":
        plugins.push(prettierPluginToml);
        parser = "toml";
        break;
      case "properties":
        plugins.push(prettierPluginProperties);
        parser = "properties";
        break;

      // 查询语言
      case "sql":
        plugins.push(prettierPluginSql);
        parser = "sql";
        additionalOptions.language = "sql";
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
      ...additionalOptions,
    });
  } catch (e: any) {
    formatError.value = `格式化错误: ${e.message}`;
    formattedCodeOutput.value = rawCodeInput.value;
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
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  color: var(--text-color);
}

.full-height-card :deep(.el-card__header) {
  flex-shrink: 0;
  padding: 16px;
}

.full-height-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
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
  background-color: var(--input-bg) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
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

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
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
