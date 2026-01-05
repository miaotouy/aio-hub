<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ProfileSidebar from "../shared/ProfileSidebar.vue";
import ProfileEditor from "../shared/ProfileEditor.vue";
import ModelList from "./components/ModelList.vue";
import ModelFetcherDialog from "./components/ModelFetcherDialog.vue";
import ModelEditDialog from "./components/ModelEditDialog.vue";
import CreateProfileDialog from "./components/CreateProfileDialog.vue";
import CustomHeadersEditor from "./components/CustomHeadersEditor.vue";
import MultiKeyManagerDialog from "./components/MultiKeyManagerDialog.vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { providerTypes } from "@/config/llm-providers";
import type { LlmProfile, LlmModelInfo, ProviderType } from "@/types/llm-profiles";
import type { LlmPreset } from "@/config/llm-providers";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "@/utils/llm-api-url";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "@/config/preset-icons";
import { fetchModelsFromApi } from "@/llm-apis/model-fetcher";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

const errorHandler = createModuleErrorHandler("LlmServiceSettings");

const {
  profiles,
  saveProfile,
  deleteProfile,
  toggleProfileEnabled,
  generateId,
  createFromPreset,
  updateProfilesOrder,
} = useLlmProfiles();

// 使用统一的图标获取方法
const { getDisplayIconPath, getIconPath } = useModelMetadata();

// 防抖保存的计时器
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);

// 编辑表单
const editForm = ref<LlmProfile>({
  id: "",
  name: "",
  type: "openai",
  baseUrl: "",
  apiKeys: [],
  enabled: true,
  models: [],
});

// 模型编辑
const showModelDialog = ref(false);
const editingModel = ref<LlmModelInfo | null>(null);
const isEditingModel = ref(false);

// API Key 输入处理
const apiKeyInput = ref("");

// 预设图标选择对话框
const showPresetIconDialog = ref(false);

// 容器响应式布局
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isNarrow = computed(() => containerWidth.value > 0 && containerWidth.value < 950);
const formLabelPosition = computed(() => (isNarrow.value ? "top" : "left"));

// 渠道创建对话框
const showCreateProfileDialog = ref(false);

// 计算当前选中的配置
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) || null;
});

// 将逗号分隔的 API Key 字符串转换为数组
const updateApiKeys = () => {
  const keys = apiKeyInput.value
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  editForm.value.apiKeys = keys;
};

// 选择配置
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  const profile = profiles.value.find((p) => p.id === profileId);
  if (profile) {
    editForm.value = JSON.parse(JSON.stringify(profile));
    apiKeyInput.value = profile.apiKeys.join(", ");
  }
};

// 创建新配置 - 从空白开始
const createNewProfile = () => {
  editForm.value = {
    id: generateId(),
    name: "",
    type: "openai",
    baseUrl: "https://api.openai.com",
    apiKeys: [],
    enabled: true,
    models: [],
  };
  apiKeyInput.value = "";
  selectedProfileId.value = editForm.value.id;
};

// 从预设创建配置
const createFromPresetTemplate = (preset: LlmPreset) => {
  editForm.value = createFromPreset(preset);
  apiKeyInput.value = "";
  selectedProfileId.value = editForm.value.id;
};

// 显示创建选项
const handleAddClick = () => {
  showCreateProfileDialog.value = true;
};

// 保存配置（验证并保存）
const saveCurrentProfile = () => {
  if (!editForm.value.name.trim()) {
    customMessage.error("请输入渠道名称");
    return false;
  }
  if (!editForm.value.baseUrl.trim()) {
    customMessage.error("请输入 API 地址");
    return false;
  }

  saveProfile(editForm.value);
  return true;
};

// 防抖自动保存
const autoSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    if (saveCurrentProfile()) {
      // 静默保存，不显示成功提示
    }
  }, 1000); // 1秒防抖
};

// 监听表单变化，自动保存
watch(
  () => editForm.value,
  () => {
    // 只有在选中了配置时才自动保存
    if (selectedProfileId.value) {
      autoSave();
    }
  },
  { deep: true }
);

// 删除配置
const handleDelete = async () => {
  if (!selectedProfile.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除渠道 "${selectedProfile.value.name}" 吗？此操作不可撤销。`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    deleteProfile(selectedProfile.value.id);
    selectedProfileId.value = profiles.value[0]?.id || null;
    if (selectedProfileId.value) {
      selectProfile(selectedProfileId.value);
    }
    customMessage.success("删除成功");
  } catch {
    // 用户取消
  }
};

// 切换启用状态
const handleToggle = (profile: LlmProfile) => {
  toggleProfileEnabled(profile.id);
};

// 获取提供商类型信息
const getProviderTypeInfo = (type: ProviderType) => {
  return providerTypes.find((p) => p.type === type);
};

// 模型管理
const addModel = () => {
  editingModel.value = null;
  isEditingModel.value = false;
  showModelDialog.value = true;
};

const editModel = (index: number) => {
  editingModel.value = editForm.value.models[index];
  isEditingModel.value = true;
  showModelDialog.value = true;
};

const handleSaveModel = (model: LlmModelInfo) => {
  if (isEditingModel.value && editingModel.value) {
    // 编辑模式：找到原模型并替换
    const index = editForm.value.models.findIndex((m) => m.id === editingModel.value!.id);
    if (index !== -1) {
      editForm.value.models[index] = model;
    }
  } else {
    // 新增模式
    editForm.value.models.push(model);
  }
};

const deleteModel = (index: number) => {
  editForm.value.models.splice(index, 1);
};

const deleteModelGroup = (indices: number[]) => {
  // 从大到小排序索引，避免 splice 时的索引错乱
  const sortedIndices = indices.sort((a, b) => b - a);
  sortedIndices.forEach((index) => {
    editForm.value.models.splice(index, 1);
  });
  customMessage.success(`成功删除分组下的 ${indices.length} 个模型`);
};

const clearAllModels = () => {
  editForm.value.models = [];
  customMessage.success("已清空所有模型");
};

const showModelFetcherDialog = ref(false);
const fetchedModels = ref<LlmModelInfo[]>([]);
const isFetchingModels = ref(false);

// 从 API 获取模型列表
const fetchModels = async () => {
  if (!selectedProfile.value) {
    customMessage.error("请先选择一个配置");
    return;
  }

  isFetchingModels.value = true;

  try {
    const models = await fetchModelsFromApi(selectedProfile.value);

    if (models.length === 0) {
      customMessage.warning("未获取到任何模型");
      return;
    }

    fetchedModels.value = models;
    showModelFetcherDialog.value = true;
  } catch (error: any) {
    errorHandler.error(error, "获取模型列表失败");
  } finally {
    isFetchingModels.value = false;
  }
};

// 添加从弹窗选择的模型
const handleAddModels = (modelsToAdd: LlmModelInfo[]) => {
  const newModels = modelsToAdd.filter((m) => !editForm.value.models.some((em) => em.id === m.id));
  editForm.value.models.push(...newModels);
  customMessage.success(`成功添加 ${newModels.length} 个模型`);
};

// API 端点预览
const apiEndpointPreview = computed(() => {
  if (!editForm.value.baseUrl) {
    return "";
  }
  return generateLlmApiEndpointPreview(editForm.value.baseUrl, editForm.value.type);
});

// 端点提示文本
const endpointHintText = computed(() => {
  return getLlmEndpointHint(editForm.value.type);
});

const getProviderIcon = (profile: LlmProfile) => {
  if (profile.icon) {
    return getDisplayIconPath(profile.icon);
  }
  // 使用空字符串作为 modelId，provider 作为匹配条件
  const iconPath = getIconPath("", profile.type);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

const selectPresetIcon = (icon: any) => {
  const iconPath = `${PRESET_ICONS_DIR}/${icon.path}`;
  if (editForm.value) {
    editForm.value.icon = iconPath;
  }
  showPresetIconDialog.value = false;
};

// 打开供应商图标选择器
const openProviderIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 自定义请求头弹窗
const showCustomHeadersDialog = ref(false);

// 多密钥管理弹窗
const showMultiKeyManager = ref(false);
const openMultiKeyManager = () => {
  showMultiKeyManager.value = true;
};

// 重置 API 地址到默认值
const resetBaseUrl = () => {
  const defaultUrl = getProviderTypeInfo(editForm.value.type)?.defaultBaseUrl;
  if (defaultUrl) {
    editForm.value.baseUrl = defaultUrl;
    customMessage.success("已重置为默认地址");
  }
};
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
      <ProfileEditor
        v-if="selectedProfile"
        :title="selectedProfile.name"
        :show-save="false"
        @delete="handleDelete"
      >
        <template #header-actions>
          <el-image
            v-if="editForm.icon"
            :src="getDisplayIconPath(editForm.icon)"
            class="profile-editor-icon"
            fit="contain"
          />
        </template>
        <el-form
          :model="editForm"
          :label-width="isNarrow ? 'auto' : '100px'"
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
                <el-divider direction="vertical" />
                <el-button link type="primary" size="small" @click="showCustomHeadersDialog = true">
                  自定义请求头
                  <span
                    v-if="editForm.customHeaders && Object.keys(editForm.customHeaders).length > 0"
                  >
                    ({{ Object.keys(editForm.customHeaders).length }})
                  </span>
                </el-button>
              </div>
            </div>
            <div v-else class="form-hint">
              <span>默认: {{ getProviderTypeInfo(editForm.type)?.defaultBaseUrl }}</span>
              <el-divider direction="vertical" />
              <el-button link type="primary" size="small" @click="showCustomHeadersDialog = true">
                自定义请求头
                <span
                  v-if="editForm.customHeaders && Object.keys(editForm.customHeaders).length > 0"
                >
                  ({{ Object.keys(editForm.customHeaders).length }})
                </span>
              </el-button>
            </div>
          </el-form-item>

          <el-form-item label="API Key">
            <el-input
              v-model="apiKeyInput"
              type="password"
              placeholder="可选,某些服务可能不需要。多个密钥用逗号分隔"
              show-password
              @blur="updateApiKeys"
            />
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
                @add="addModel"
                @edit="editModel"
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
          :get-icon-path="(path: string) => `${PRESET_ICONS_DIR}/${path}`"
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
      :existing-models="editForm.models"
      @add-models="handleAddModels"
    />

    <!-- 自定义请求头配置弹窗 -->
    <CustomHeadersEditor
      v-model:visible="showCustomHeadersDialog"
      v-model="editForm.customHeaders"
    />

    <!-- 多密钥管理弹窗 -->
    <MultiKeyManagerDialog
      v-if="selectedProfile"
      v-model="showMultiKeyManager"
      :profile="selectedProfile"
      @update:profile="saveProfile"
    />
  </div>
</template>

<style scoped>
.llm-settings-page {
  flex: 1;
  display: flex;
  padding: 0;
  box-sizing: border-box;
  min-height: 0;
}

.settings-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
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
  max-height: 320px;
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
