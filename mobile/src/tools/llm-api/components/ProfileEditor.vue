<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Settings2,
  RefreshCw,
  Globe,
  Key,
  Box,
  ChevronRight,
  Trash2,
  ExternalLink,
  Sparkles,
} from "lucide-vue-next";
import { Snackbar, Dialog } from "@varlet/ui";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { providerTypes } from "../config/llm-providers";
import { fetchModelsFromApi } from "../core/model-fetcher";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "../utils/url";
import type { LlmProfile } from "../types";

// 导入子组件
import CustomHeadersEditor from "./CustomHeadersEditor.vue";
import CustomEndpointsEditor from "./CustomEndpointsEditor.vue";
import IconSelector from "./IconSelector.vue";

const props = defineProps<{
  show: boolean;
  profile: LlmProfile | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "update:profile", value: LlmProfile | null): void;
  (e: "save", profile: LlmProfile): void;
  (e: "delete", id: string): void;
}>();

const isFetchingModels = ref(false);
const showHeadersPopup = ref(false);
const showEndpointsPopup = ref(false);
const showIconSelectorPopup = ref(false);

const localProfile = computed({
  get: () => props.profile,
  set: (val) => emit("update:profile", val),
});

const saveEdit = () => {
  if (localProfile.value) {
    if (!localProfile.value.name.trim()) {
      Snackbar.warning("请输入渠道名称");
      return;
    }
    emit("save", localProfile.value);
  }
};

const handleDelete = async () => {
  if (!localProfile.value) return;
  const confirm = await Dialog({
    title: "确认删除",
    message: `确定要删除渠道 "${localProfile.value.name}" 吗？`,
    confirmButtonText: "确定",
    cancelButtonText: "取消",
  });

  if (confirm === "confirm") {
    emit("delete", localProfile.value.id);
  }
};

const handleFetchModels = async () => {
  if (!localProfile.value) return;
  isFetchingModels.value = true;
  try {
    const models = await fetchModelsFromApi(localProfile.value);
    localProfile.value.models = models;
    Snackbar.success(`成功获取 ${models.length} 个模型`);
  } catch (err: any) {
    Snackbar.error(`获取失败: ${err.message}`);
  } finally {
    isFetchingModels.value = false;
  }
};

const apiEndpointPreview = computed(() => {
  if (!localProfile.value?.baseUrl) return "";
  return generateLlmApiEndpointPreview(localProfile.value.baseUrl, localProfile.value.type);
});

const endpointHint = computed(() => {
  if (!localProfile.value) return "";
  return getLlmEndpointHint(localProfile.value.type);
});

const apiKeyString = computed({
  get: () => localProfile.value?.apiKeys.join(", ") || "",
  set: (val: string) => {
    if (localProfile.value) {
      localProfile.value.apiKeys = val
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }
  },
});

const handleIconSelect = (icon: any) => {
  if (localProfile.value) {
    localProfile.value.icon = icon.path;
    showIconSelectorPopup.value = false;
    Snackbar.success("已选择图标");
  }
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="editor-popup">
      <var-app-bar title="编辑渠道" safe-area>
        <template #left>
          <var-button round text @click="emit('update:show', false)">
            <span class="close-icon">×</span>
          </var-button>
        </template>
        <template #right>
          <var-button text @click="saveEdit">保存</var-button>
        </template>
      </var-app-bar>

      <div class="editor-content" v-if="localProfile">
        <!-- 基础信息 -->
        <div class="section-header">基础信息</div>
        <div class="config-card">
          <!-- 头像选择区域 -->
          <div class="avatar-select-section">
            <div class="avatar-preview-large" v-ripple @click="showIconSelectorPopup = true">
              <DynamicIcon :src="localProfile.icon || ''" :alt="localProfile.name" />
              <div class="edit-badge">
                <Sparkles :size="14" />
              </div>
            </div>
            <div class="avatar-info">
              <div class="avatar-label">渠道图标</div>
              <div class="avatar-hint">点击图标选择预设</div>
            </div>
          </div>

          <var-input
            v-model="localProfile.name"
            label="渠道名称"
            placeholder="例如: 我的 OpenAI"
            variant="outlined"
            class="form-item"
          />
          <var-select
            v-model="localProfile.type"
            label="提供商类型"
            variant="outlined"
            class="form-item"
          >
            <var-option
              v-for="t in providerTypes"
              :key="t.type"
              :label="t.name"
              :value="t.type"
            />
          </var-select>
          <var-input
            v-model="localProfile.icon"
            label="图标路径/URL"
            placeholder="图标文件名(如 openai.svg)或URL"
            variant="outlined"
            class="form-item"
          >
            <template #append-icon>
              <var-button round text size="small" @click="showIconSelectorPopup = true">
                <Sparkles :size="18" />
              </var-button>
            </template>
          </var-input>
        </div>

        <!-- 连接配置 -->
        <div class="section-header">连接配置</div>
        <div class="config-card">
          <var-input
            v-model="localProfile.baseUrl"
            label="API 基础地址"
            placeholder="https://api.openai.com/v1"
            variant="outlined"
            class="form-item"
          >
            <template #prepend-icon><Globe :size="18" class="field-icon" /></template>
          </var-input>

          <div v-if="apiEndpointPreview" class="url-preview">
            <div class="preview-text">预览: {{ apiEndpointPreview }}</div>
            <div class="preview-hint">{{ endpointHint }}</div>
          </div>

          <var-input
            v-model="apiKeyString"
            label="API Key"
            type="password"
            placeholder="sk-... (多个用逗号分隔)"
            variant="outlined"
            class="form-item"
          >
            <template #prepend-icon><Key :size="18" class="field-icon" /></template>
          </var-input>

          <div class="cell-group">
            <var-cell ripple class="custom-cell" @click="showHeadersPopup = true">
              <template #icon><Settings2 :size="18" class="field-icon" /></template>
              自定义请求头
              <template #description>
                已配置 {{ Object.keys(localProfile.customHeaders || {}).length }} 个
              </template>
              <template #extra><ChevronRight :size="18" /></template>
            </var-cell>

            <var-cell ripple class="custom-cell" @click="showEndpointsPopup = true">
              <template #icon><ExternalLink :size="18" class="field-icon" /></template>
              高级端点配置
              <template #description> 针对不同功能的路径微调 </template>
              <template #extra><ChevronRight :size="18" /></template>
            </var-cell>
          </div>
        </div>

        <!-- 模型管理 -->
        <div class="section-header-row">
          <span class="section-header no-margin">模型管理</span>
          <var-button
            size="mini"
            type="primary"
            plain
            :loading="isFetchingModels"
            @click="handleFetchModels"
          >
            <RefreshCw :size="14" /> 自动获取
          </var-button>
        </div>
        <div class="config-card no-padding overflow-hidden">
          <div v-if="localProfile.models.length === 0" class="empty-models">
            暂无模型，请点击自动获取
          </div>
          <div v-else class="model-scroll-list">
            <var-cell
              v-for="m in localProfile.models"
              :key="m.id"
              :title="m.name"
              :description="m.id"
              border
            >
              <template #icon>
                <Box :size="16" class="field-icon opacity-50" />
              </template>
            </var-cell>
          </div>
        </div>

        <!-- 危险操作 -->
        <div class="danger-zone">
          <var-button block type="danger" outline @click="handleDelete">
            <Trash2 :size="18" /> 删除此渠道
          </var-button>
        </div>
      </div>
    </div>

    <!-- 子编辑器 -->
    <CustomHeadersEditor
      v-if="localProfile && localProfile.customHeaders"
      v-model:show="showHeadersPopup"
      v-model:headers="localProfile.customHeaders"
    />

    <CustomEndpointsEditor
      v-if="localProfile && localProfile.customEndpoints"
      v-model:show="showEndpointsPopup"
      v-model:endpoints="localProfile.customEndpoints"
    />

    <!-- 图标选择 -->
    <IconSelector
      v-model:show="showIconSelectorPopup"
      @select="handleIconSelect"
    />
  </var-popup>
</template>

<style scoped>
.editor-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.close-icon {
  font-size: 28px;
  line-height: 1;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.section-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.section-header.no-margin {
  margin-bottom: 0;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.config-card {
  background: var(--color-surface-container);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 32px;
}

.config-card.no-padding {
  padding: 0;
}

.config-card.overflow-hidden {
  overflow: hidden;
}

.form-item {
  margin-bottom: 20px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.avatar-select-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  padding: 4px;
}

.avatar-preview-large {
  position: relative;
  width: 80px;
  height: 80px;
  background: var(--color-surface-container-high);
  border-radius: 20px;
  padding: 16px;
  border: 1px solid var(--color-outline-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.edit-badge {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 28px;
  height: 28px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-surface-container);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.avatar-info {
  flex: 1;
}

.avatar-label {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.avatar-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.field-icon {
  margin-right: 8px;
}

.url-preview {
  margin-top: -12px;
  margin-bottom: 20px;
  padding: 0 4px;
}

.preview-text {
  font-size: 10px;
  opacity: 0.5;
  font-family: monospace;
  word-break: break-all;
  line-height: 1.4;
}

.preview-hint {
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 4px;
}

.cell-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-cell {
  border-radius: 12px;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-low);
}

.empty-models {
  padding: 48px 24px;
  text-align: center;
  opacity: 0.4;
  font-size: 14px;
  border: 1px dashed var(--color-outline-variant);
  border-radius: 20px;
}

.model-scroll-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-outline-variant);
  border-radius: 20px;
}

.danger-zone {
  margin-top: 16px;
  padding-bottom: 48px;
}
</style>