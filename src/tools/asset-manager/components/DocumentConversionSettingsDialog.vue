<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpened } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { AssetManagerDocumentConversionConfig } from "../config";

interface ConverterCheckResult {
  available: boolean;
  version?: string;
  message?: string;
}

const props = defineProps<{
  modelValue: boolean;
  settings: AssetManagerDocumentConversionConfig;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:settings": [value: AssetManagerDocumentConversionConfig];
}>();

const errorHandler = createModuleErrorHandler(
  "AssetManager/DocumentConversionSettingsDialog"
);
const localSettings = ref<AssetManagerDocumentConversionConfig>({
  ...props.settings,
});
const isChecking = ref(false);
const isDetecting = ref(false);
const checkResult = ref<ConverterCheckResult | null>(null);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const checkAlertType = computed(() => {
  if (!checkResult.value) return "info";
  return checkResult.value.available ? "success" : "warning";
});

const checkAlertTitle = computed(() => {
  if (!checkResult.value) return "尚未验证转换程序";
  if (checkResult.value.available) {
    return checkResult.value.version || "转换程序可用";
  }
  return checkResult.value.message || "转换程序不可用";
});

watch(
  () => props.settings,
  (settings) => {
    localSettings.value = { ...settings };
    checkResult.value = null;
  },
  { deep: true }
);

watch(
  () => props.modelValue,
  (visible) => {
    if (visible && !localSettings.value.libreOfficePath.trim()) {
      handleDetect();
    }
  }
);

async function handleDetect() {
  try {
    isDetecting.value = true;
    const detected = await invoke<string | null>("detect_libreoffice_path");
    if (detected && !localSettings.value.libreOfficePath.trim()) {
      localSettings.value.libreOfficePath = detected;
      checkResult.value = null;
      customMessage.success(`已自动检测到 LibreOffice: ${detected}`);
    }
  } catch (error) {
    // 嗅探失败不需要提示用户，静默处理
    errorHandler.handle(error, {
      userMessage: "自动检测 LibreOffice 失败",
      showToUser: false,
    });
  } finally {
    isDetecting.value = false;
  }
}

async function handleSelectExecutable() {
  try {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: "选择 LibreOffice soffice 可执行文件",
    });
    if (selected) {
      localSettings.value.libreOfficePath = selected as string;
      checkResult.value = null;
    }
  } catch (error) {
    errorHandler.error(error, "选择文档转换程序失败");
  }
}

async function handleCheck() {
  try {
    isChecking.value = true;
    const result = await invoke<ConverterCheckResult>(
      "check_asset_manager_document_converter",
      { path: localSettings.value.libreOfficePath }
    );
    checkResult.value = result;
    if (result.available) {
      customMessage.success("文档转换程序验证通过");
    } else {
      customMessage.warning(result.message || "文档转换程序验证失败");
    }
  } catch (error) {
    errorHandler.error(error, "验证文档转换程序失败");
  } finally {
    isChecking.value = false;
  }
}

function handleSave() {
  emit("update:settings", { ...localSettings.value });
  visible.value = false;
  customMessage.success("文档转换设置已保存");
}
</script>

<template>
  <BaseDialog
    v-model="visible"
    title="文档转换设置"
    width="620px"
    height="auto"
    content-class="document-conversion-dialog-content"
  >
    <div class="document-conversion-settings">
      <div class="setting-item">
        <div class="setting-label">自动转换旧版 DOC</div>
        <el-switch v-model="localSettings.autoConvertLegacyDoc" />
      </div>

      <div class="setting-item">
        <div class="setting-label">LibreOffice 路径</div>
        <div class="path-row">
          <el-input
            v-model="localSettings.libreOfficePath"
            placeholder="例如 C:\\Program Files\\LibreOffice\\program\\soffice.com"
            clearable
            :loading="isDetecting"
          />
          <el-button :icon="FolderOpened" @click="handleSelectExecutable">
            选择
          </el-button>
          <el-button :loading="isDetecting" @click="handleDetect">
            检测
          </el-button>
          <el-button
            type="primary"
            plain
            :icon="Check"
            :loading="isChecking"
            @click="handleCheck"
          >
            验证
          </el-button>
        </div>
        <el-alert
          class="check-result"
          :title="checkAlertTitle"
          :type="checkAlertType"
          :closable="false"
          show-icon
        />
      </div>

      <div class="setting-grid">
        <div class="setting-item">
          <div class="setting-label">转换超时</div>
          <el-input-number
            v-model="localSettings.timeoutSeconds"
            :min="10"
            :max="1800"
            :step="10"
            controls-position="right"
          />
        </div>

        <div class="setting-item">
          <div class="setting-label">隔离转换环境</div>
          <el-switch v-model="localSettings.isolatedProfile" />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.document-conversion-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
}

.path-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto auto;
  gap: 8px;
}

.check-result {
  margin-top: 4px;
}

.setting-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .path-row,
  .setting-grid {
    grid-template-columns: 1fr;
  }
}
</style>
