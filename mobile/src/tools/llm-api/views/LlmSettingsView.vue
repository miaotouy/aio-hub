<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { fetchModelsFromApi } from "../core/model-fetcher";
import { providerTypes } from "../config/llm-providers";
import {
  Plus, Settings2, RefreshCw, Globe, Key, Box,
  ChevronRight, Trash2, Layers, ExternalLink,
  Sparkles
} from "lucide-vue-next";
import { Snackbar, Dialog } from "@varlet/ui";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import { PRESET_ICONS } from "../config/preset-icons";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "../utils/url";
import type { LlmProfile } from "../types";

// 导入子组件
import ProfileCard from "../components/ProfileCard.vue";
import CustomHeadersEditor from "../components/CustomHeadersEditor.vue";
import CustomEndpointsEditor from "../components/CustomEndpointsEditor.vue";

const store = useLlmProfilesStore();
const showEditPopup = ref(false);
const editingProfile = ref<LlmProfile | null>(null);
const isFetchingModels = ref(false);

// 高级配置弹窗
const showHeadersPopup = ref(false);
const showEndpointsPopup = ref(false);
const showIconSelectorPopup = ref(false);

onMounted(() => {
  store.init();
});

const handleAddProfile = () => {
  const newProfile: LlmProfile = {
    id: crypto.randomUUID(),
    name: "新渠道",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeys: [""],
    enabled: true,
    models: [],
    customHeaders: {},
    customEndpoints: {},
  };
  editingProfile.value = JSON.parse(JSON.stringify(newProfile));
  showEditPopup.value = true;
};

const openEdit = (profile: LlmProfile) => {
  editingProfile.value = JSON.parse(JSON.stringify(profile));
  showEditPopup.value = true;
};

const saveEdit = () => {
  if (editingProfile.value) {
    if (!editingProfile.value.name.trim()) {
      Snackbar.warning("请输入渠道名称");
      return;
    }
    store.updateProfile(editingProfile.value.id, editingProfile.value);
    showEditPopup.value = false;
    Snackbar.success("配置已保存");
  }
};

const handleDelete = async () => {
  if (!editingProfile.value) return;
  const confirm = await Dialog({
    title: "确认删除",
    message: `确定要删除渠道 "${editingProfile.value.name}" 吗？`,
    confirmButtonText: "确定",
    cancelButtonText: "取消",
  });
  
  if (confirm === "confirm") {
    store.deleteProfile(editingProfile.value.id);
    showEditPopup.value = false;
    Snackbar.success("已删除");
  }
};

const handleFetchModels = async () => {
  if (!editingProfile.value) return;
  isFetchingModels.value = true;
  try {
    const models = await fetchModelsFromApi(editingProfile.value);
    editingProfile.value.models = models;
    Snackbar.success(`成功获取 ${models.length} 个模型`);
  } catch (err: any) {
    Snackbar.error(`获取失败: ${err.message}`);
  } finally {
    isFetchingModels.value = false;
  }
};

const apiEndpointPreview = computed(() => {
  if (!editingProfile.value?.baseUrl) return "";
  return generateLlmApiEndpointPreview(editingProfile.value.baseUrl, editingProfile.value.type);
});

const endpointHint = computed(() => {
  if (!editingProfile.value) return "";
  return getLlmEndpointHint(editingProfile.value.type);
});

const apiKeyString = computed({
  get: () => editingProfile.value?.apiKeys.join(", ") || "",
  set: (val: string) => {
    if (editingProfile.value) {
      editingProfile.value.apiKeys = val.split(",").map(k => k.trim()).filter(Boolean);
    }
  }
});

const handleIconSelect = (icon: any) => {
  if (editingProfile.value) {
    editingProfile.value.icon = icon.path;
    showIconSelectorPopup.value = false;
    Snackbar.success("已选择图标");
  }
};
</script>

<template>
  <div class="llm-settings-view">
    <var-app-bar title="LLM 渠道管理" fixed safe-area>
      <template #right>
        <var-button round text @click="handleAddProfile">
          <Plus :size="24" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="main-content">
      <div v-if="store.profiles.length === 0" class="empty-state">
        <Layers :size="64" class="empty-icon" />
        <p>暂无渠道，请点击右上角添加</p>
      </div>

      <div v-else class="profile-list">
        <ProfileCard
          v-for="profile in store.profiles"
          :key="profile.id"
          :profile="profile"
          :is-selected="store.selectedProfileId === profile.id"
          @click="openEdit(profile)"
          @select="store.selectProfile(profile.id)"
        />
      </div>
    </div>

    <!-- 详情/编辑 弹窗 (全屏) -->
    <var-popup
      v-model:show="showEditPopup"
      position="right"
      style="width: 100%; height: 100%"
    >
      <div class="editor-popup">
        <var-app-bar title="编辑渠道" safe-area>
          <template #left>
            <var-button round text @click="showEditPopup = false">
              <span class="close-icon">×</span>
            </var-button>
          </template>
          <template #right>
            <var-button text @click="saveEdit">保存</var-button>
          </template>
        </var-app-bar>

        <div class="editor-content" v-if="editingProfile">
          <!-- 基础信息 -->
          <div class="section-header">基础信息</div>
          <div class="config-card">
            <!-- 头像选择区域 -->
            <div class="avatar-select-section">
              <div class="avatar-preview-large" v-ripple @click="showIconSelectorPopup = true">
                <DynamicIcon :src="editingProfile.icon || ''" :alt="editingProfile.name" />
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
              v-model="editingProfile.name"
              label="渠道名称"
              placeholder="例如: 我的 OpenAI"
              variant="outlined"
              class="form-item"
            />
            <var-select
              v-model="editingProfile.type"
              label="提供商类型"
              variant="outlined"
              class="form-item"
            >
              <var-option v-for="t in providerTypes" :key="t.type" :label="t.name" :value="t.type" />
            </var-select>
            <var-input
              v-model="editingProfile.icon"
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
              v-model="editingProfile.baseUrl"
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
                  已配置 {{ Object.keys(editingProfile.customHeaders || {}).length }} 个
                </template>
                <template #extra><ChevronRight :size="18" /></template>
              </var-cell>

              <var-cell ripple class="custom-cell" @click="showEndpointsPopup = true">
                <template #icon><ExternalLink :size="18" class="field-icon" /></template>
                高级端点配置
                <template #description>
                  针对不同功能的路径微调
                </template>
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
            <div v-if="editingProfile.models.length === 0" class="empty-models">
              暂无模型，请点击自动获取
            </div>
            <div v-else class="model-scroll-list">
              <var-cell
                v-for="m in editingProfile.models"
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
    </var-popup>

    <!-- 子编辑器 -->
    <CustomHeadersEditor
      v-if="editingProfile && editingProfile.customHeaders"
      v-model:show="showHeadersPopup"
      v-model:headers="editingProfile.customHeaders"
    />

    <CustomEndpointsEditor
      v-if="editingProfile && editingProfile.customEndpoints"
      v-model:show="showEndpointsPopup"
      v-model:endpoints="editingProfile.customEndpoints"
    />

    <!-- 图标选择弹窗 -->
    <var-popup
      v-model:show="showIconSelectorPopup"
      position="bottom"
      style="height: 80%; border-radius: 20px 20px 0 0"
    >
      <div class="icon-selector-container">
        <div class="popup-header">
          <span class="popup-title">选择预设图标</span>
          <var-button round text @click="showIconSelectorPopup = false">
            <span class="close-icon">×</span>
          </var-button>
        </div>
        <div class="popup-body">
          <IconPresetSelector
            :icons="PRESET_ICONS"
            :get-icon-path="(path: string) => path"
            show-search
            show-categories
            @select="handleIconSelect"
          />
        </div>
      </div>
    </var-popup>
  </div>
</template>

<style scoped>
.llm-settings-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-surface);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--app-bar-height) + 16px) 16px 80px;
}

.empty-state {
  height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
}

.empty-icon {
  margin-bottom: 16px;
}

.profile-list {
  display: flex;
  flex-direction: column;
}

/* 编辑器弹窗样式 */
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

/* 图标选择弹窗样式 */
.icon-selector-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-outline-variant);
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
}

.popup-body {
  flex: 1;
  overflow: hidden;
}
</style>
