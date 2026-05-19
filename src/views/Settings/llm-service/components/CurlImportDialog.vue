<script setup lang="ts">
import { ref, computed, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { parseCurlCommand, type ParsedCurlResult } from "@/utils/parseCurlCommand";
import { providerTypes } from "@/config/llm-providers";
import type { ProviderType } from "@/types/llm-profiles";
import { ClipboardPaste, Check, AlertCircle, Terminal } from "lucide-vue-next";

interface Props {
  visible: boolean;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "import", result: ParsedCurlResult): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const curlInput = ref("");
const parseResult = ref<ParsedCurlResult | null>(null);
const parseError = ref("");

// 实时解析
watch(curlInput, (val) => {
  if (!val.trim()) {
    parseResult.value = null;
    parseError.value = "";
    return;
  }

  const result = parseCurlCommand(val);
  if (result) {
    parseResult.value = result;
    parseError.value = "";
  } else {
    parseResult.value = null;
    parseError.value = "无法解析，请确认粘贴的是有效的 curl 命令";
  }
});

// 获取渠道类型显示名称
const providerTypeName = computed(() => {
  if (!parseResult.value) return "";
  const info = providerTypes.find((p: { type: ProviderType }) => p.type === parseResult.value!.providerType);
  return info?.name || parseResult.value.providerType;
});

// 掩码 API Key
const maskedApiKey = computed(() => {
  if (!parseResult.value?.apiKey) return null;
  const key = parseResult.value.apiKey;
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
});

// 确认导入
const handleImport = () => {
  if (parseResult.value) {
    emit("import", parseResult.value);
    emit("update:visible", false);
    curlInput.value = "";
  }
};

// 从剪贴板粘贴
const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      curlInput.value = text;
    }
  } catch {
    // 剪贴板权限被拒绝，用户手动粘贴即可
  }
};

// 关闭时清理
watch(
  () => curlInput.value,
  () => {},
  { flush: "post" },
);
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    title="从 curl 命令导入"
    width="640px"
    height="auto"
  >
    <template #content>
      <div class="curl-import-container">
        <!-- 说明 -->
        <p class="import-desc">粘贴从 API 平台复制的 curl 命令，自动解析出渠道配置信息。</p>

        <!-- 输入区域 -->
        <div class="input-section">
          <div class="input-header">
            <span class="input-label">
              <Terminal :size="14" />
              curl 命令
            </span>
            <el-button size="small" text @click="pasteFromClipboard">
              <ClipboardPaste :size="14" />
              <span style="margin-left: 4px">粘贴</span>
            </el-button>
          </div>
          <el-input
            v-model="curlInput"
            type="textarea"
            :rows="6"
            placeholder='curl -X POST "https://api.example.com/v1/chat/completions" \
  -H "Authorization: Bearer sk-xxx" \
  -d &apos;{"model": "gpt-4o", ...}&apos;'
            resize="vertical"
            class="curl-textarea"
          />
        </div>

        <!-- 解析错误 -->
        <div v-if="parseError" class="parse-error">
          <AlertCircle :size="14" />
          <span>{{ parseError }}</span>
        </div>

        <!-- 解析结果预览 -->
        <div v-if="parseResult" class="parse-result">
          <div class="result-header">
            <Check :size="14" class="success-icon" />
            <span>解析成功</span>
          </div>

          <div class="result-grid">
            <div class="result-item">
              <span class="result-label">渠道名称</span>
              <span class="result-value">{{ parseResult.suggestedName }}</span>
            </div>
            <div class="result-item">
              <span class="result-label">渠道类型</span>
              <span class="result-value">{{ providerTypeName }}</span>
            </div>
            <div class="result-item">
              <span class="result-label">API 地址</span>
              <span class="result-value mono">{{ parseResult.baseUrl }}</span>
            </div>
            <div class="result-item" v-if="maskedApiKey">
              <span class="result-label">API Key</span>
              <span class="result-value mono">{{ maskedApiKey }}</span>
            </div>
            <div class="result-item" v-else-if="parseResult.apiKeyIsPlaceholder">
              <span class="result-label">API Key</span>
              <span class="result-value placeholder">需要手动填写</span>
            </div>
            <div class="result-item" v-if="parseResult.model">
              <span class="result-label">模型</span>
              <span class="result-value mono">{{ parseResult.model }}</span>
            </div>
            <div class="result-item" v-if="parseResult.chatEndpoint">
              <span class="result-label">自定义端点</span>
              <span class="result-value mono">{{ parseResult.chatEndpoint }}</span>
            </div>
            <div class="result-item" v-if="parseResult.customHeaders">
              <span class="result-label">自定义头</span>
              <span class="result-value mono">{{ Object.keys(parseResult.customHeaders).join(", ") }}</span>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-bar">
          <el-button @click="emit('update:visible', false)">取消</el-button>
          <el-button type="primary" :disabled="!parseResult" @click="handleImport"> 确认导入 </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.curl-import-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.import-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.curl-textarea :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.parse-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(var(--el-color-danger-rgb, 245, 108, 108), 0.1);
  color: var(--el-color-danger);
  font-size: 13px;
}

.parse-result {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--card-bg);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-success);
}

.success-icon {
  color: var(--el-color-success);
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.result-label {
  flex-shrink: 0;
  width: 80px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.result-value {
  font-size: 13px;
  color: var(--text-color);
  word-break: break-all;
}

.result-value.mono {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 12px;
}

.result-value.placeholder {
  color: var(--el-color-warning);
  font-style: italic;
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: var(--border-width) solid var(--border-color);
}
</style>
