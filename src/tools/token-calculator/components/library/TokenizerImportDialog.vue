<template>
  <BaseDialog
    v-model="visible"
    title="导入分词器"
    width="760px"
    max-height="82vh"
    :loading="isBusy"
    @close="reset"
  >
    <div class="import-dialog">
      <el-tabs v-model="sourceMode" class="source-tabs" @tab-change="resetScan">
        <el-tab-pane label="本地文件" name="files">
          <div class="source-panel">
            <div class="source-actions">
              <el-button :icon="Upload" type="primary" @click="chooseFiles">
                选择文件
              </el-button>
              <el-button :icon="FolderOpened" @click="chooseDirectory">
                选择目录
              </el-button>
            </div>
            <div class="source-hint">
              支持 tokenizer.json + tokenizer_config.json，或 Hugging Face fast
              tokenizer 目录。
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="远端 URL" name="remote">
          <div class="remote-fields">
            <el-input
              v-model="remoteTokenizerJsonUrl"
              placeholder="https://.../tokenizer.json"
              clearable
            />
            <el-input
              v-model="remoteTokenizerConfigUrl"
              placeholder="https://.../tokenizer_config.json（可选）"
              clearable
            />
            <el-button :icon="Search" type="primary" plain @click="scanRemote">
              识别 URL
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div v-if="scanResult" class="scan-panel">
        <div class="scan-summary">
          <div>
            <div class="scan-title">{{ formatLabel }}</div>
            <div class="scan-subtitle">
              {{ loadabilityLabel }} · 建议置信度：{{ confidenceLabel }}
            </div>
          </div>
          <el-tag
            :type="scanResult.loadability === 'direct' ? 'success' : 'warning'"
          >
            {{ scanResult.format }}
          </el-tag>
        </div>

        <div
          v-if="
            scanResult.detectedModelType || scanResult.detectedTokenizerClass
          "
          class="detected-row"
        >
          <span v-if="scanResult.detectedModelType">
            model: {{ scanResult.detectedModelType }}
          </span>
          <span v-if="scanResult.detectedTokenizerClass">
            class: {{ scanResult.detectedTokenizerClass }}
          </span>
        </div>

        <el-alert
          v-for="warning in scanResult.warnings"
          :key="warning"
          :title="warning"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="profile-form"
      >
        <div class="form-grid">
          <el-form-item label="显示名" prop="name">
            <el-input v-model="form.name" placeholder="例如 My GPT Tokenizer" />
          </el-form-item>
          <el-form-item label="Profile ID" prop="id">
            <el-input v-model="form.id" placeholder="user.my-tokenizer" />
          </el-form-item>
        </div>

        <el-form-item label="模型匹配正则">
          <el-input
            v-model="patternsText"
            type="textarea"
            :rows="3"
            placeholder="每行一个正则，例如：^my-model"
          />
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="置信度" prop="confidence">
            <el-select v-model="form.confidence">
              <el-option label="精确" value="exact" />
              <el-option label="近似" value="close" />
              <el-option label="估算" value="estimated" />
            </el-select>
          </el-form-item>
          <el-form-item label="版本">
            <el-input v-model="form.version" placeholder="1" />
          </el-form-item>
        </div>

        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canImport"
        :loading="isBusy"
        @click="submitImport"
      >
        导入并启用
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import type { FormInstance, FormRules } from "element-plus";
import { FolderOpened, Search, Upload } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useTokenizerRegistryStore } from "../../stores/tokenizerRegistryStore";
import { calculatorProxy } from "../../worker/calculator.proxy";
import {
  installLocalTokenizerProfile,
  installRemoteTokenizerProfile,
} from "../../services/tokenizerAssetService";
import {
  scanRemoteTokenizerUrls,
  scanTokenizerAssetPaths,
} from "../../services/tokenizerAssetScanner";
import type {
  TokenizerConfidence,
  TokenizerImportScanResult,
} from "../../types/tokenizer-profile";

const SAMPLE_VALIDATION_TEXT = "Hello 中文 🙂\n<|endoftext|>";

const visible = defineModel<boolean>({ default: false });

const registryStore = useTokenizerRegistryStore();
const errorHandler = createModuleErrorHandler("token-calculator/import-dialog");

const formRef = ref<FormInstance>();
const isBusy = ref(false);
const sourceMode = ref<"files" | "remote">("files");
const scanResult = ref<TokenizerImportScanResult | null>(null);
const patternsText = ref("");
const remoteTokenizerJsonUrl = ref("");
const remoteTokenizerConfigUrl = ref("");

const form = reactive({
  name: "",
  id: "",
  version: "1",
  description: "",
  confidence: "exact" as TokenizerConfidence,
});

const rules: FormRules = {
  name: [{ required: true, message: "请输入显示名", trigger: "blur" }],
  id: [
    { required: true, message: "请输入 Profile ID", trigger: "blur" },
    {
      pattern: /^user\.[a-z0-9][a-z0-9._-]*$/,
      message:
        "Profile ID 必须以 user. 开头，只能包含小写字母、数字、点、下划线和短横线",
      trigger: "blur",
    },
  ],
  confidence: [{ required: true, message: "请选择置信度", trigger: "change" }],
};

const canImport = computed(
  () =>
    scanResult.value?.loadability === "direct" && Boolean(form.name && form.id)
);

const formatLabel = computed(() => {
  if (!scanResult.value) return "";
  switch (scanResult.value.format) {
    case "hf-tokenizer-json":
      return "Hugging Face fast tokenizer";
    case "hf-directory":
      return "Hugging Face tokenizer 目录";
    case "legacy-bpe":
      return "GPT-2 / RoBERTa BPE";
    case "wordpiece-vocab":
      return "WordPiece vocab";
    case "tiktoken-bpe":
      return "tiktoken BPE";
    case "sentencepiece-model":
      return "SentencePiece";
    case "tekken-json":
      return "Mistral Tekken";
    case "gguf-metadata":
      return "GGUF metadata";
    default:
      return "未知资产";
  }
});

const loadabilityLabel = computed(() => {
  switch (scanResult.value?.loadability) {
    case "direct":
      return "可直接导入";
    case "convertible":
      return "已识别，待转换器支持";
    case "unsupported":
      return "当前版本暂不支持";
    default:
      return "";
  }
});

const confidenceLabel = computed(() => {
  switch (scanResult.value?.suggestedConfidence) {
    case "exact":
      return "精确";
    case "close":
      return "近似";
    case "estimated":
      return "估算";
    default:
      return "";
  }
});

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function applyScanDefaults(result: TokenizerImportScanResult) {
  scanResult.value = result;
  form.confidence = result.suggestedConfidence;
  if (!form.name) {
    const source =
      result.rootPath || result.files.tokenizerJsonUrl || "tokenizer";
    const last = source.split(/[\\/]/).filter(Boolean).pop() || "tokenizer";
    form.name = last.replace(/\.[^.]+$/, "");
  }
  if (!form.id) {
    const slug = slugifyName(form.name) || "tokenizer";
    form.id = `user.${slug}`;
  }
}

async function chooseFiles() {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Tokenizer Assets",
          extensions: ["json", "txt", "model", "vocab", "tiktoken", "gguf"],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    isBusy.value = true;
    applyScanDefaults(await scanTokenizerAssetPaths(paths));
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "识别分词器文件失败",
    });
  } finally {
    isBusy.value = false;
  }
}

async function chooseDirectory() {
  try {
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (!selected || Array.isArray(selected)) return;
    isBusy.value = true;
    applyScanDefaults(await scanTokenizerAssetPaths([selected]));
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "识别分词器目录失败",
    });
  } finally {
    isBusy.value = false;
  }
}

function scanRemote() {
  const jsonUrl = remoteTokenizerJsonUrl.value.trim();
  const configUrl = remoteTokenizerConfigUrl.value.trim();
  if (!jsonUrl) {
    customMessage.warning("请输入 tokenizer.json URL");
    return;
  }
  try {
    applyScanDefaults(scanRemoteTokenizerUrls(jsonUrl, configUrl || undefined));
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "识别远端 URL 失败",
    });
  }
}

async function submitImport() {
  if (!scanResult.value) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const duplicate = registryStore.allProfiles.some((p) => p.id === form.id);
  if (duplicate) {
    customMessage.warning("Profile ID 已存在，请换一个 ID");
    return;
  }

  try {
    isBusy.value = true;
    const input = {
      id: form.id,
      name: form.name,
      version: form.version,
      description: form.description,
      modelPatterns: patternsText.value.split(/\r?\n/),
      confidence: form.confidence,
    };
    const profile =
      scanResult.value.sourceKind === "remote"
        ? await installRemoteTokenizerProfile(scanResult.value, input)
        : await installLocalTokenizerProfile(scanResult.value, input);

    await registryStore.installProfile(profile);
    await calculatorProxy.calculateTokensByTokenizer(
      SAMPLE_VALIDATION_TEXT,
      profile.id
    );
    customMessage.success("分词器已导入并启用");
    visible.value = false;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "导入分词器失败",
    });
  } finally {
    isBusy.value = false;
  }
}

function resetScan() {
  scanResult.value = null;
}

function reset() {
  scanResult.value = null;
  patternsText.value = "";
  remoteTokenizerJsonUrl.value = "";
  remoteTokenizerConfigUrl.value = "";
  form.name = "";
  form.id = "";
  form.version = "1";
  form.description = "";
  form.confidence = "exact";
}

watch(
  () => form.name,
  (name, oldName) => {
    if (!form.id || form.id === `user.${slugifyName(oldName || "")}`) {
      const slug = slugifyName(name);
      form.id = slug ? `user.${slug}` : "";
    }
  }
);
</script>

<style scoped>
.import-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.source-tabs {
  flex-shrink: 0;
}

.source-panel,
.remote-fields,
.scan-panel,
.profile-form {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
}

.source-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.source-actions,
.remote-fields {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remote-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
}

.source-hint,
.scan-subtitle,
.detected-row {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.scan-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scan-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.scan-title {
  font-weight: 600;
  color: var(--text-color);
}

.detected-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-family: "Consolas", monospace;
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 760px) {
  .source-panel,
  .source-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .remote-fields,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
