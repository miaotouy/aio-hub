<script setup lang="ts">
import { ref, computed } from "vue";
import { useElementSize } from "@vueuse/core";
import ProfileSidebar from "../shared/ProfileSidebar.vue";
import ProfileEditor from "../shared/ProfileEditor.vue";
import ModelList from "./components/ModelList.vue";
import ModelFetcherDialog from "./components/ModelFetcherDialog.vue";
import ModelEditDialog from "./components/ModelEditDialog.vue";
import CreateProfileDialog from "./components/CreateProfileDialog.vue";
import CustomHeadersEditor from "./components/CustomHeadersEditor.vue";
import CustomEndpointsEditor from "./components/CustomEndpointsEditor.vue";
import MultiKeyManagerDialog from "./components/MultiKeyManagerDialog.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { providerTypes } from "@/config/llm-providers";
import { PRESET_ICONS } from "@/config/preset-icons";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "@/utils/llm-api-url";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useProfileEditor } from "./composables/useProfileEditor";
import { useModelEditor } from "./composables/useModelEditor";
import { useConnectionTest } from "./composables/useConnectionTest";
import type { LlmProfile } from "@/types/llm-profiles";

// ─── Composables ───
const {
  profiles,
  selectedProfileId,
  selectedProfile,
  editForm,
  apiKeyInput,
  currentConfigFields,
  updateProfilesOrder,
  saveProfile,
  getProviderTypeInfo,
  updateApiKeys,
  selectProfile,
  createNewProfile,
  createFromPresetTemplate,
  handleDelete,
  handleToggle,
  resetBaseUrl,
} = useProfileEditor();

const {
  showModelDialog,
  editingModel,
  isEditingModel,
  showModelFetcherDialog,
  fetchedModels,
  fetchedRawResponse,
  isFetchingModels,
  addModel,
  editModel,
  handleSaveModel,
  deleteModel,
  deleteModelGroup,
  clearAllModels,
  fetchModels,
  handleAddModels,
} = useModelEditor(editForm, selectedProfile);

const {
  isTestingConnection,
  modelTestLoading,
  keyTestLoading,
  testConnection,
  handleTestModel,
  handleTestKey,
} = useConnectionTest(editForm, selectedProfile);

// ─── 图标 ───
const { getDisplayIconPath, getIconPath } = useModelMetadata();

const getProviderIcon = (profile: LlmProfile) => {
  if (profile.icon) {
    return getDisplayIconPath(profile.icon);
  }
  const iconPath = getIconPath("", profile.type);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

const showPresetIconDialog = ref(false);

const selectPresetIcon = (icon: any) => {
  editForm.value.icon = icon.path;
  showPresetIconDialog.value = false;
};

const openProviderIconSelector = () => {
  showPresetIconDialog.value = true;
};

// ─── 响应式布局 ───
const containerRef = ref<HTMLElement | null>(null);
const editorContainerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const { width: editorWidth } = useElementSize(editorContainerRef);

const isNarrow = computed(() => containerWidth.value > 0 && containerWidth.value < 850);
const isEditorNarrow = computed(() => editorWidth.value > 0 && editorWidth.value < 760);
const formLabelPosition = computed(() => (isNarrow.value || isEditorNarrow.value ? "top" : "left"));

// ─── 对话框状态 ───
const showCreateProfileDialog = ref(false);
const showCustomHeadersDialog = ref(false);
const showCustomEndpointsDialog = ref(false);
const showMultiKeyManager = ref(false);

const handleAddClick = () => {
  showCreateProfileDialog.value = true;
};

const openMultiKeyManager = () => {
  showMultiKeyManager.value = true;
};

// ─── API 端点预览 ───
const apiEndpointPreview = computed(() => {
  if (!editForm.value.baseUrl) return "";
  return generateLlmApiEndpointPreview(editForm.value.baseUrl, editForm.value.type);
});

const endpointHintText = computed(() => getLlmEndpointHint(editForm.value.type));

// ─── 网络设置 ───
const networkCollapseActive = ref<string[]>([]);

const networkSettingSummary = computed(() => {
  const parts: string[] = [];
  const strategy = editForm.value.networkStrategy || "auto";
  const strategyMap: Record<string, string> = {
    auto: "自动",
    proxy: "后端代理",
    native: "原生请求",
  };
  parts.push(strategyMap[strategy] || strategy);

  if (strategy !== "native") {
    if (editForm.value.relaxIdCerts) parts.push("放宽证书");
    if (editForm.value.http1Only) parts.push("HTTP/1.1");
  }

  const headersCount = editForm.value.customHeaders
    ? Object.keys(editForm.value.customHeaders).length
    : 0;
  if (headersCount > 0) parts.push(`${headersCount} 个请求头`);

  const endpointsCount = editForm.value.customEndpoints
    ? Object.keys(editForm.value.customEndpoints).length
    : 0;
  if (endpointsCount > 0) parts.push(`${endpointsCount} 个自定义端点`);

  return parts.join(" · ");
});
</script>

<template>
  <div class="llm-settings-page" :class="{ 'is-narrow': isNarrow }" ref="containerRef">
    <div class="settings-layout">
      <!-- 左侧：渠道列表 -->
      <ProfileSidebar
        title="LLM 服务"
        :profiles="profiles"
        :selected-id="selectedProfileId"
        @select="selectProfile"
        @add="handleAddClick"
        @toggle="handleToggle"
        @update:profiles="updateProfilesOrder"
      >
        <template #item="{ profile }">
          <DynamicIcon
            :src="getProviderIcon(profile) || ''"
            class="profile-icon"
            :alt="profile.name"
          />
          <div class="profile-info">
            <div class="profile-name">{{ profile.name }}</div>
            <div class="profile-type">{{ getProviderTypeInfo(profile.type)?.name }}</div>
            <div class="profile-models">{{ profile.models.length }} 个模型</div>
          </div>
        </template>
      </ProfileSidebar>

      <!-- 右侧：配置编辑 -->
      <div class="editor-container" ref="editorContainerRef">
        <ProfileEditor
          v-if="selectedProfile"
          :title="selectedProfile.name"
          :show-save="false"
          @delete="handleDelete"
        >
          <template #header-actions>
            <DynamicIcon
              :src="getProviderIcon(editForm) || ''"
              class="profile-editor-icon"
              :alt="editForm.name"
            />
          </template>
          <el-form
            :model="editForm"
            :label-width="formLabelPosition === 'top' ? 'auto' : '100px'"
            :label-position="formLabelPosition"
          >
            <el-form-item label="渠道名称">
              <el-input
                v-model="editForm.name"
                placeholder="例如: 我的 OpenAI"
                maxlength="50"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="API 格式">
              <el-select v-model="editForm.type" style="width: 100%">
                <el-option
                  v-for="provider in providerTypes"
                  :key="provider.type"
                  :label="provider.name"
                  :value="provider.type"
                >
                  <div>
                    <div>{{ provider.name }}</div>
                    <div style="font-size: 12px; color: var(--el-text-color-secondary)">
                      {{ provider.description }}
                    </div>
                  </div>
                </el-option>
              </el-select>
              <div class="form-hint">API 请求格式类型（兼容该格式的所有服务商均可使用）</div>
            </el-form-item>

            <el-form-item label="供应商图标">
              <el-input v-model="editForm.icon" placeholder="自定义图标路径或URL，或选择预设">
                <template #append>
                  <el-button @click="openProviderIconSelector">选择预设</el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="API 地址">
              <el-input v-model="editForm.baseUrl" placeholder="https://api.openai.com">
                <template #append>
                  <el-popconfirm
                    title="确定要重置为默认 API 地址吗？"
                    confirm-button-text="确定"
                    cancel-button-text="取消"
                    @confirm="resetBaseUrl"
                  >
                    <template #reference>
                      <el-button>重置</el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-input>
              <div v-if="apiEndpointPreview" class="api-preview-container">
                <div class="api-preview-url">{{ apiEndpointPreview }}</div>
                <div class="api-preview-hint">
                  {{ endpointHintText }}
                </div>
              </div>
              <div v-else>
                <div class="form-hint">
                  <span>默认: {{ getProviderTypeInfo(editForm.type)?.defaultBaseUrl }}</span>
                </div>
              </div>
            </el-form-item>

            <!-- 动态渠道特有配置 -->
            <template v-if="currentConfigFields.length > 0">
              <el-divider border-style="dashed">渠道特有配置</el-divider>
              <SettingListRenderer
                :items="currentConfigFields"
                :settings="editForm.options || {}"
                @update:settings="(val) => (editForm.options = val)"
              />
              <el-divider border-style="dashed" />
            </template>

            <!-- 网络设置折叠区域 -->
            <el-collapse v-model="networkCollapseActive" class="network-collapse">
              <el-collapse-item name="network">
                <template #title>
                  <div class="network-collapse-title">
                    <span class="network-collapse-label">网络设置</span>
                    <span class="network-collapse-summary">{{ networkSettingSummary }}</span>
                  </div>
                </template>

                <el-form-item label="网络方案">
                  <el-radio-group v-model="editForm.networkStrategy">
                    <el-radio-button value="auto">自动选择</el-radio-button>
                    <el-radio-button value="proxy">后端代理</el-radio-button>
                    <el-radio-button value="native">原生请求</el-radio-button>
                  </el-radio-group>
                  <div class="form-hint">
                    <span v-if="editForm.networkStrategy === 'auto'">
                      默认方案。自动根据请求内容（如是否包含本地文件）决定是否通过 Rust 后端转发。
                    </span>
                    <span v-else-if="editForm.networkStrategy === 'proxy'">
                      强制通过后端 Rust 代理。支持放宽证书校验、强制 HTTP/1.1 等底层配置，可绕过
                      CORS。
                    </span>
                    <span v-else-if="editForm.networkStrategy === 'native'">
                      强制使用前端原生请求。性能较好，但不支持底层网络微调，且受限于浏览器安全策略。
                    </span>
                  </div>
                </el-form-item>

                <el-form-item label="代理行为" v-if="editForm.networkStrategy !== 'native'">
                  <div style="display: flex; gap: 20px">
                    <el-checkbox v-model="editForm.relaxIdCerts" label="放宽证书校验" />
                    <el-checkbox v-model="editForm.http1Only" label="强制 HTTP/1.1" />
                  </div>
                  <div class="form-hint">
                    放宽证书校验允许自签名证书；强制 HTTP/1.1 可提高与某些自建服务的兼容性。
                  </div>
                </el-form-item>

                <el-form-item label="自定义请求头">
                  <el-button
                    type="primary"
                    plain
                    size="small"
                    @click="showCustomHeadersDialog = true"
                  >
                    编辑请求头
                    <span
                      v-if="
                        editForm.customHeaders && Object.keys(editForm.customHeaders).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customHeaders).length }})
                    </span>
                  </el-button>
                  <div class="form-hint">为该渠道的所有请求附加自定义 HTTP 请求头。</div>
                </el-form-item>

                <el-form-item label="高级端点">
                  <el-button
                    type="primary"
                    plain
                    size="small"
                    @click="showCustomEndpointsDialog = true"
                  >
                    编辑端点
                    <span
                      v-if="
                        editForm.customEndpoints && Object.keys(editForm.customEndpoints).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customEndpoints).length }})
                    </span>
                  </el-button>
                  <div class="form-hint">自定义特定操作（如聊天、嵌入）的 API 端点路径。</div>
                </el-form-item>
              </el-collapse-item>
            </el-collapse>

            <el-form-item label="API Key">
              <div style="display: flex; gap: 8px; width: 100%">
                <el-input
                  v-model="apiKeyInput"
                  type="password"
                  placeholder="可选,某些服务可能不需要。多个密钥用逗号分隔"
                  show-password
                  style="flex: 1"
                  @blur="updateApiKeys"
                />
                <el-button
                  type="primary"
                  plain
                  :loading="isTestingConnection"
                  @click="testConnection"
                >
                  测试连接
                </el-button>
              </div>
              <div v-if="editForm.apiKeys.length > 0" class="form-hint multi-key-hint">
                <span>已配置 {{ editForm.apiKeys.length }} 个密钥</span>
                <el-button link type="primary" size="small" @click="openMultiKeyManager">
                  管理密钥状态
                </el-button>
              </div>
            </el-form-item>

            <el-divider />

            <el-form-item label="模型配置">
              <div class="model-list-container">
                <ModelList
                  :models="editForm.models"
                  :expand-state="editForm.modelGroupsExpandState || {}"
                  :loading="isFetchingModels"
                  :test-loading="modelTestLoading"
                  @add="addModel"
                  @edit="editModel"
                  @test="handleTestModel"
                  @delete="deleteModel"
                  @delete-group="deleteModelGroup"
                  @clear="clearAllModels"
                  @fetch="fetchModels"
                  @update:expand-state="(state: any) => (editForm.modelGroupsExpandState = state)"
                />
              </div>
            </el-form-item>
          </el-form>
        </ProfileEditor>

        <!-- 空状态 -->
        <div v-else class="empty-state">
          <p>请选择或创建一个 LLM 服务配置</p>
        </div>
      </div>
    </div>

    <!-- 渠道创建对话框 -->
    <CreateProfileDialog
      v-model:visible="showCreateProfileDialog"
      @create-from-preset="createFromPresetTemplate"
      @create-from-blank="createNewProfile"
    />

    <!-- 模型编辑对话框 -->
    <ModelEditDialog
      v-model:visible="showModelDialog"
      :model="editingModel"
      :is-editing="isEditingModel"
      @save="handleSaveModel"
    />

    <!-- 预设图标选择对话框 -->
    <BaseDialog v-model="showPresetIconDialog" title="选择预设图标" width="80%">
      <template #content>
        <IconPresetSelector
          :icons="PRESET_ICONS"
          :get-icon-path="(path: string) => path"
          show-search
          show-categories
          @select="selectPresetIcon"
        />
      </template>
    </BaseDialog>

    <!-- 模型获取对话框 -->
    <ModelFetcherDialog
      v-if="showModelFetcherDialog"
      v-model:visible="showModelFetcherDialog"
      :models="fetchedModels"
      :raw-response="fetchedRawResponse"
      :existing-models="editForm.models"
      @add-models="handleAddModels"
    />

    <!-- 自定义请求头配置弹窗 -->
    <CustomHeadersEditor
      v-model:visible="showCustomHeadersDialog"
      v-model="editForm.customHeaders"
    />

    <!-- 高级端点配置弹窗 -->
    <CustomEndpointsEditor
      v-model:visible="showCustomEndpointsDialog"
      v-model="editForm.customEndpoints"
    />

    <!-- 多密钥管理弹窗 -->
    <MultiKeyManagerDialog
      v-if="selectedProfile"
      v-model="showMultiKeyManager"
      :profile="selectedProfile"
      :test-loading="keyTestLoading"
      @update:profile="saveProfile"
      @test-key="handleTestKey"
    />
  </div>
</template>

<style scoped>
.llm-settings-page {
  flex: 1;
  display: flex;
  padding: 0;
  box-sizing: border-box;
}

.settings-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.editor-container {
  flex: 1;
  min-width: 0;
  max-height: 90vh;
}

.settings-layout :deep(.profile-sidebar) {
  max-height: 90vh;
}

.is-narrow .settings-layout {
  grid-template-columns: 1fr;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 0 12px 20px 12px;
  gap: 12px;
}

.is-narrow :deep(.profile-sidebar) {
  height: auto;
  max-height: 360px;
  min-height: 200px;
  border-bottom: 1px solid var(--border-color);
}

.is-narrow :deep(.profile-editor) {
  border: none;
  background: transparent;
}

.is-narrow .empty-state {
  min-height: 200px;
}

.profile-editor-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  margin-right: 12px;
}

.empty-state {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  flex: 1;
}

/* 列表项样式 */
.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.profile-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-type {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.profile-models {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.profile-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
  margin-left: -6px;
  margin-right: 8px;
}

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* API 端点预览容器 */
.api-preview-container {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

/* API 端点 URL 预览 */
.api-preview-url {
  font-size: 12px;
  color: var(--text-color);
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  word-break: break-all;
  line-height: 1.5;
  margin-bottom: 6px;
}

/* API 端点提示文本 */
.api-preview-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
  opacity: 0.7;
  line-height: 1.4;
}

/* 网络设置折叠面板 */
.network-collapse {
  width: 100%;
  margin: 4px 0 16px;
  box-sizing: border-box;
  --el-collapse-border-color: var(--border-color);
  --el-collapse-header-height: 40px;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-header-font-size: 13px;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-content-font-size: 13px;
}

.network-collapse :deep(.el-collapse-item__header) {
  padding: 0 12px;
  transition: background-color 0.3s;
}

.network-collapse :deep(.el-collapse-item__header:hover) {
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.network-collapse :deep(.el-collapse-item__content) {
  padding: 12px 12px 4px;
}

.network-collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.network-collapse-label {
  font-weight: 500;
  flex-shrink: 0;
  box-sizing: border-box;
}

.network-collapse-summary {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}

.model-list-container {
  width: 100%;
}

/* 自定义请求头区域 */
.custom-headers-section {
  width: 100%;
}

.header-count {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.multi-key-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
