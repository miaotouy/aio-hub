<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpened, Refresh } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { AssetManagerDocumentConversionConfig } from "../config";

type DocumentConverterProvider =
  | "auto"
  | "libreOffice"
  | "microsoftWord"
  | "abiWord"
  | "textutil";

interface ConverterCheckResult {
  available: boolean;
  version?: string;
  message?: string;
}

interface ConverterCandidate extends ConverterCheckResult {
  provider: DocumentConverterProvider;
  label: string;
  path?: string;
  requiresPath: boolean;
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
const providerOptions: Array<{
  value: DocumentConverterProvider;
  label: string;
  description: string;
  requiresPath: boolean;
}> = [
  {
    value: "auto",
    label: "自动选择",
    description: "按可用性选择本机转换依赖",
    requiresPath: false,
  },
  {
    value: "libreOffice",
    label: "LibreOffice",
    description: "跨平台，适合批量转换",
    requiresPath: true,
  },
  {
    value: "microsoftWord",
    label: "Microsoft Word",
    description: "Windows 上调用 Word COM 自动化",
    requiresPath: false,
  },
  {
    value: "abiWord",
    label: "AbiWord",
    description: "轻量转换后端，需要本机安装",
    requiresPath: true,
  },
  {
    value: "textutil",
    label: "macOS textutil",
    description: "macOS 系统命令",
    requiresPath: false,
  },
];

const localSettings = ref<AssetManagerDocumentConversionConfig>(
  normalizeSettings(props.settings)
);
const isChecking = ref(false);
const isDetecting = ref(false);
const checkResult = ref<ConverterCheckResult | null>(null);
const detectedCandidates = ref<ConverterCandidate[]>([]);

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

const pathProvider = computed<"libreOffice" | "abiWord" | null>(() => {
  if (localSettings.value.preferredProvider === "libreOffice") {
    return "libreOffice";
  }
  if (localSettings.value.preferredProvider === "abiWord") {
    return "abiWord";
  }
  return null;
});

const executablePath = computed({
  get: () => {
    if (pathProvider.value === "libreOffice") {
      return localSettings.value.libreOfficePath;
    }
    if (pathProvider.value === "abiWord") {
      return localSettings.value.abiWordPath;
    }
    return "";
  },
  set: (value: string) => {
    if (pathProvider.value === "libreOffice") {
      localSettings.value.libreOfficePath = value;
    } else if (pathProvider.value === "abiWord") {
      localSettings.value.abiWordPath = value;
    }
  },
});

const executableLabel = computed(() => {
  if (pathProvider.value === "abiWord") return "AbiWord 路径";
  return "LibreOffice 路径";
});

const executablePlaceholder = computed(() => {
  if (pathProvider.value === "abiWord") {
    return "例如 C:\\Program Files\\AbiWord\\bin\\AbiWord.exe";
  }
  return "例如 C:\\Program Files\\LibreOffice\\program\\soffice.com";
});

watch(
  () => props.settings,
  (settings) => {
    localSettings.value = normalizeSettings(settings);
    checkResult.value = null;
  },
  { deep: true }
);

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      handleDetect();
    }
  }
);

function normalizeSettings(
  settings: AssetManagerDocumentConversionConfig
): AssetManagerDocumentConversionConfig {
  return {
    autoConvertLegacyDoc: settings.autoConvertLegacyDoc ?? true,
    preferredProvider: settings.preferredProvider ?? "auto",
    libreOfficePath: settings.libreOfficePath ?? "",
    abiWordPath: settings.abiWordPath ?? "",
    timeoutSeconds: settings.timeoutSeconds ?? 120,
    isolatedProfile: settings.isolatedProfile ?? true,
  };
}

function providerLabel(provider: DocumentConverterProvider) {
  return (
    providerOptions.find((option) => option.value === provider)?.label ??
    provider
  );
}

function applyDetectedCandidate(candidate: ConverterCandidate) {
  if (candidate.provider === "libreOffice" && candidate.path) {
    localSettings.value.libreOfficePath = candidate.path;
  } else if (candidate.provider === "abiWord" && candidate.path) {
    localSettings.value.abiWordPath = candidate.path;
  }
}

async function handleDetect() {
  try {
    isDetecting.value = true;
    const candidates = await invoke<ConverterCandidate[]>(
      "detect_asset_manager_document_converters"
    );
    detectedCandidates.value = candidates;

    candidates
      .filter((candidate) => candidate.available)
      .forEach((candidate) => {
        applyDetectedCandidate(candidate);
      });

    const preferredCandidate = candidates.find(
      (candidate) =>
        candidate.provider === localSettings.value.preferredProvider &&
        candidate.available
    );
    const firstAvailable =
      preferredCandidate ?? candidates.find((item) => item.available);
    checkResult.value = firstAvailable
      ? {
          available: true,
          version: firstAvailable.version ?? `${firstAvailable.label} 可用`,
        }
      : {
          available: false,
          message: "未检测到可用的文档转换依赖",
        };

    if (firstAvailable) {
      customMessage.success(`已检测到 ${firstAvailable.label}`);
    } else {
      customMessage.warning("未检测到可用的文档转换依赖");
    }
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "自动检测文档转换依赖失败",
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
      title: `选择 ${providerLabel(localSettings.value.preferredProvider)} 可执行文件`,
    });
    if (selected) {
      executablePath.value = selected as string;
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
      {
        provider: localSettings.value.preferredProvider,
        path: executablePath.value,
      }
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
  emit("update:settings", normalizeSettings(localSettings.value));
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
        <div class="setting-label">自动转换旧版 DOC/PPT</div>
        <el-switch v-model="localSettings.autoConvertLegacyDoc" />
      </div>

      <div class="setting-item">
        <div class="setting-label">转换后端</div>
        <el-select
          v-model="localSettings.preferredProvider"
          class="provider-select"
          @change="checkResult = null"
        >
          <el-option
            v-for="option in providerOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          >
            <div class="provider-option">
              <span>{{ option.label }}</span>
              <small>{{ option.description }}</small>
            </div>
          </el-option>
        </el-select>
      </div>

      <div v-if="pathProvider" class="setting-item">
        <div class="setting-label">{{ executableLabel }}</div>
        <div class="path-row">
          <el-input
            v-model="executablePath"
            :placeholder="executablePlaceholder"
            clearable
            :loading="isDetecting"
          />
          <el-button :icon="FolderOpened" @click="handleSelectExecutable">
            选择
          </el-button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">依赖状态</div>
        <div class="check-row">
          <el-alert
            class="check-result"
            :title="checkAlertTitle"
            :type="checkAlertType"
            :closable="false"
            show-icon
          />
          <el-button
            :icon="Refresh"
            :loading="isDetecting"
            @click="handleDetect"
          >
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
        <div v-if="detectedCandidates.length > 0" class="candidate-list">
          <div
            v-for="candidate in detectedCandidates"
            :key="candidate.provider"
            class="candidate-item"
          >
            <span>{{ candidate.label }}</span>
            <el-tag
              :type="candidate.available ? 'success' : 'info'"
              size="small"
              effect="plain"
            >
              {{ candidate.available ? "可用" : "未检测到" }}
            </el-tag>
            <small v-if="candidate.available">
              {{
                candidate.version ||
                candidate.path ||
                providerLabel(candidate.provider)
              }}
            </small>
            <small v-else>{{ candidate.message }}</small>
          </div>
        </div>
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
          <el-switch
            v-model="localSettings.isolatedProfile"
            :disabled="
              !['auto', 'libreOffice'].includes(localSettings.preferredProvider)
            "
          />
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

.provider-select {
  width: 100%;
}

.provider-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.provider-option small {
  color: var(--el-text-color-secondary);
}

.path-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 8px;
}

.check-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.check-result {
  min-width: 0;
}

.candidate-list {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
}

.candidate-item {
  display: grid;
  grid-template-columns: 130px auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: var(--text-color);
  font-size: 13px;
}

.candidate-item small {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .path-row,
  .check-row,
  .setting-grid {
    grid-template-columns: 1fr;
  }

  .candidate-item {
    grid-template-columns: 1fr auto;
  }

  .candidate-item small {
    grid-column: 1 / -1;
  }
}
</style>
