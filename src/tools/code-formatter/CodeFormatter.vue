<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="code-formatter-container">
    <div v-if="systemLanguage" class="engine-settings">
      <div class="engine-controls">
        <span>{{
          systemLanguage === "rust" ? "rustfmt" : "clang-format"
        }}</span>
        <el-input
          v-model="formatterPathDraft"
          class="formatter-path"
          aria-label="格式化器路径"
          placeholder="自动查找，也可填写可执行文件的绝对路径"
          clearable
          :disabled="!settingsReady"
          @change="applyFormatterPath"
        />
        <el-select
          v-if="systemLanguage === 'rust'"
          v-model="settings.rustEdition"
          aria-label="Rust edition"
          class="rust-edition"
          :disabled="!settingsReady"
          @change="saveSettings"
        >
          <el-option
            v-for="edition in ['2015', '2018', '2021', '2024']"
            :key="edition"
            :label="'Edition ' + edition"
            :value="edition"
          />
        </el-select>
        <el-button
          :loading="checkingEngine"
          :disabled="!settingsReady"
          @click="refreshEngine"
          >重新检测</el-button
        >
      </div>
      <div
        class="engine-status"
        :class="{ 'engine-error': engineStatus && !engineStatus.available }"
        role="status"
      >
        {{
          checkingEngine
            ? "正在检测格式化器…"
            : engineStatus?.available
              ? engineVersion
              : engineStatus?.error
        }}
      </div>
    </div>
    <el-row :gutter="20" class="input-output-section">
      <el-col :span="12" class="column-wrapper">
        <InfoCard class="full-height-card">
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
                </el-option-group>
                <el-option-group label="后端语言">
                  <el-option label="PHP" value="php"></el-option>
                </el-option-group>
                <el-option-group label="系统语言">
                  <el-option label="Rust" value="rust" />
                  <el-option label="C" value="c" />
                  <el-option label="C++" value="cpp" />
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
            <el-input
              v-model="rawCodeInput"
              type="textarea"
              class="full-height-textarea"
              placeholder="请输入代码..."
            />
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
                <el-button text type="success" @click="sendToChat"
                  >发送到聊天</el-button
                >
              </div>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import InfoCard from "@/components/common/InfoCard.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { WarningFilled } from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useSendToChat } from "@/composables/useSendToChat";
import { formatterCore } from "./logic/formatter";
import type { FormatterStatus, SupportedLanguage } from "./types";
import { formatterConfig, type FormatterConfig } from "./config";

// 获取服务实例
const errorHandler = createModuleErrorHandler("CodeFormatter");

// 获取发送到聊天功能
const { sendCodeToChat } = useSendToChat();

// UI 状态
const rawCodeInput = ref("");
const formattedCodeOutput = ref("");
const formatError = ref("");
const language = ref<SupportedLanguage>("javascript");

const settings = ref<FormatterConfig>({
  version: "1.0.0",
  rustfmtPath: "",
  clangFormatPath: "",
  rustEdition: "2024",
});
const settingsReady = ref(false);
const formatterPathDraft = ref("");
const engineStatus = ref<FormatterStatus | null>(null);
const engineVersion = computed(() => {
  const version = engineStatus.value?.version?.match(
    /\b(?:rustfmt|clang-format)(?: version)?\s+([\w.+-]+)/
  )?.[1];
  return version ? engineStatus.value?.engine + " " + version : "格式化器可用";
});
const checkingEngine = ref(false);
const retry = ref(0);
const systemLanguage = computed(() =>
  language.value === "rust" ||
  language.value === "c" ||
  language.value === "cpp"
    ? language.value
    : null
);
const activePath = computed(() =>
  systemLanguage.value === "rust"
    ? settings.value.rustfmtPath
    : settings.value.clangFormatPath
);
let engineRequestId = 0;
let disposed = false;

onMounted(async () => {
  const loaded = await formatterConfig.load();
  if (disposed) return;
  settings.value = loaded;
  settingsReady.value = true;
});
onBeforeUnmount(() => {
  disposed = true;
  ++engineRequestId;
  ++formatRequestId;
});

function saveSettings() {
  formatterConfig.saveDebounced({ ...settings.value }, () => {
    customMessage.error("格式化器设置保存失败，请重试");
  });
}
function applyFormatterPath() {
  const key =
    systemLanguage.value === "rust" ? "rustfmtPath" : "clangFormatPath";
  settings.value[key] = formatterPathDraft.value.trim();
  saveSettings();
}
async function refreshEngine() {
  const requestId = ++engineRequestId;
  const selectedLanguage = systemLanguage.value;
  engineStatus.value = null;
  checkingEngine.value = false;
  if (!selectedLanguage || !settingsReady.value) return;
  checkingEngine.value = true;
  const status = await formatterCore.getFormatterStatus(
    selectedLanguage,
    activePath.value
  );
  if (requestId !== engineRequestId) return;
  engineStatus.value = status;
  checkingEngine.value = false;
  retry.value++;
}
watch(
  [systemLanguage, activePath, settingsReady],
  () => {
    formatterPathDraft.value = activePath.value;
    void refreshEngine();
  },
  { immediate: true }
);

// 输入变化时立即使旧请求失效，避免较慢的原生任务覆盖新内容。
let formatRequestId = 0;
const formatCode = useDebounceFn(
  async (
    requestId: number,
    code: string,
    selectedLanguage: SupportedLanguage
  ) => {
    if (requestId !== formatRequestId) return;
    const result = await formatterCore.formatCode(
      code,
      selectedLanguage,
      ["rust", "c", "cpp"].includes(selectedLanguage)
        ? {
            formatterPath: activePath.value,
            rustEdition: settings.value.rustEdition,
          }
        : {}
    );
    if (requestId !== formatRequestId) return;

    formattedCodeOutput.value = result.formatted;
    formatError.value = result.success
      ? result.warning || ""
      : result.error || "格式化失败";
  },
  500
);

// 复制格式化后的代码
const copyFormattedCode = async () => {
  if (!formattedCodeOutput.value) {
    customMessage.warning("没有可复制的格式化代码");
    return;
  }
  try {
    await writeText(formattedCodeOutput.value);
    customMessage.success("格式化后的代码已复制到剪贴板！");
  } catch (error: any) {
    errorHandler.error(error, "复制失败");
  }
};

// 发送到聊天
const sendToChat = () => {
  sendCodeToChat(formattedCodeOutput.value, language.value, {
    successMessage: `已将格式化的 ${language.value} 代码发送到聊天`,
  });
};

// 监听语言和输入变化
watch(
  [rawCodeInput, language, activePath, () => settings.value.rustEdition, retry],
  ([code, selectedLanguage]) => {
    const requestId = ++formatRequestId;
    formatError.value = "";
    if (!code) {
      formattedCodeOutput.value = "";
      return;
    }
    void formatCode(requestId, code, selectedLanguage);
  },
  { immediate: true }
);
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
  color: var(--el-color-danger);
  font-size: 14px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.engine-settings {
  flex-shrink: 0;
  margin-bottom: 14px;
}
.engine-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.formatter-path {
  flex: 1;
  min-width: 220px;
}
.rust-edition {
  width: 150px;
}
.engine-status {
  color: var(--text-color-light);
  font-size: 13px;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.engine-error {
  color: var(--el-color-danger);
}
</style>
