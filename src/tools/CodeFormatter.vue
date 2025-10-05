<template>
  <div class="code-formatter-container">
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12" class="column-wrapper">
        <el-card shadow="never" class="full-height-card">
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
            <el-input v-model="formattedCodeOutput" type="textarea" class="full-height-textarea" readonly
              placeholder="格式化后的代码将显示在这里..." />
          </div>
          <div v-if="formatError" class="error-message">
            <el-icon>
              <WarningFilled />
            </el-icon>
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

// prettier standalone 版本（浏览器兼容）
import * as prettier from "prettier/standalone";
import * as parserBabel from "prettier/plugins/babel";
import * as parserHtml from "prettier/plugins/html";
import * as parserCss from "prettier/plugins/postcss";
import * as parserMarkdown from "prettier/plugins/markdown";
import * as parserTypeScript from "prettier/plugins/typescript";
import * as parserEstree from "prettier/plugins/estree";

// prettier community plugins
// 注意：部分插件可能不支持浏览器环境，需要动态导入或使用替代方案
// PHP 和 XML 插件改为动态导入，避免模块格式冲突
let prettierPluginPhp: any = null;
let prettierPluginXml: any = null;

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
        plugins.push(parserBabel, parserEstree, parserTypeScript);
        parser = language.value === "typescript" ? "typescript" : "babel";
        break;
      case "json":
        plugins.push(parserBabel, parserEstree);
        parser = "json";
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
        // Svelte 插件可能不支持浏览器环境
        formatError.value = "Svelte 格式化暂不支持（插件不兼容浏览器环境）";
        formattedCodeOutput.value = rawCodeInput.value;
        return;

      // 后端语言
      case "php":
        // 动态导入 PHP 插件
        if (!prettierPluginPhp) {
          try {
            prettierPluginPhp = await import("@prettier/plugin-php/standalone");
          } catch (e) {
            formatError.value = "PHP 格式化插件加载失败";
            formattedCodeOutput.value = rawCodeInput.value;
            return;
          }
        }
        plugins.push(prettierPluginPhp);
        parser = "php";
        break;
      case "java":
        // Java 插件暂不支持浏览器环境
        formatError.value = "Java 格式化暂不支持（插件不兼容浏览器环境）";
        formattedCodeOutput.value = rawCodeInput.value;
        return;

      // 配置/数据语言
      case "xml":
        // 动态导入 XML 插件，避免模块格式冲突
        if (!prettierPluginXml) {
          try {
            prettierPluginXml = await import("@prettier/plugin-xml");
          } catch (e) {
            formatError.value = "XML 格式化插件加载失败（模块格式不兼容）";
            formattedCodeOutput.value = rawCodeInput.value;
            return;
          }
        }
        plugins.push(prettierPluginXml);
        parser = "xml";
        additionalOptions.xmlWhitespaceSensitivity = "ignore";
        break;
      case "yaml":
        plugins.push(parserBabel, parserEstree);
        parser = "yaml";
        break;
      case "toml":
      case "properties":
      case "sql":
        // 这些插件可能不支持浏览器环境
        formatError.value = `${language.value.toUpperCase()} 格式化暂不支持（插件不兼容浏览器环境）`;
        formattedCodeOutput.value = rawCodeInput.value;
        return;

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
