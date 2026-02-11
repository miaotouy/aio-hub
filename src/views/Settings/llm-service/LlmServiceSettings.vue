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
import CustomEndpointsEditor from "./components/CustomEndpointsEditor.vue";
import MultiKeyManagerDialog from "./components/MultiKeyManagerDialog.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import { providerTypes } from "@/config/llm-providers";
import type { LlmProfile, LlmModelInfo, ProviderType } from "@/types/llm-profiles";
import type { LlmPreset } from "@/config/llm-presets";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "@/utils/llm-api-url";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { PRESET_ICONS } from "@/config/preset-icons";
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

const { sendRequest } = useLlmRequest();
const { updateKeyStatus, reportSuccess, reportFailure } = useLlmKeyManager();

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
  relaxIdCerts: false,
  http1Only: true,
  options: {},
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
const editorContainerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const { width: editorWidth } = useElementSize(editorContainerRef);

const isNarrow = computed(() => containerWidth.value > 0 && containerWidth.value < 850);
// 当右侧编辑器宽度小于 560px 时，也视为窄模式，切换 label 为 top
const isEditorNarrow = computed(() => editorWidth.value > 0 && editorWidth.value < 760);

const formLabelPosition = computed(() => (isNarrow.value || isEditorNarrow.value ? "top" : "left"));

// 渠道创建对话框
const showCreateProfileDialog = ref(false);

// 计算当前选中的配置
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) || null;
});

// 当前渠道特有的配置字段
const currentConfigFields = computed(() => {
  const typeInfo = getProviderTypeInfo(editForm.value.type);
  return typeInfo?.configFields || [];
});

// 监听 type 变化，初始化 options
watch(
  () => editForm.value.type,
  (newType) => {
    const typeInfo = getProviderTypeInfo(newType);
    if (typeInfo?.configFields) {
      if (!editForm.value.options) {
        editForm.value.options = {};
      }
      // 为缺失的字段设置默认值
      typeInfo.configFields.forEach((field) => {
        if (field.modelPath && editForm.value.options![field.modelPath] === undefined) {
          editForm.value.options![field.modelPath] = field.defaultValue;
        }
      });
    }
  }
);

// 将分隔的 API Key 字符串（支持逗号或换行）转换为数组
const updateApiKeys = () => {
  const keys = apiKeyInput.value
    .split(/[,，\n\r]+/) // 支持英文逗号、中文逗号、换行符
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  editForm.value.apiKeys = keys;
  // 更新输入框显示，统一用逗号分隔，方便用户查看
  apiKeyInput.value = keys.join(", ");
};

// 监听配置的变化，特别是 apiKeys，以同步输入框
watch(
  () => editForm.value.apiKeys,
  (newKeys) => {
    if (!newKeys) return;
    const currentInputKeys = apiKeyInput.value
      .split(/[,，\n\r]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    // 如果数组内容不一致，则同步到输入框
    if (JSON.stringify(newKeys) !== JSON.stringify(currentInputKeys)) {
      apiKeyInput.value = newKeys.join(", ");
    }
  },
  { deep: true }
);
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
    networkStrategy: "auto",
    relaxIdCerts: false,
    http1Only: true,
    options: {},
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
const fetchedRawResponse = ref<any>(null);
const isFetchingModels = ref(false);

const isTestingConnection = ref(false);
const modelTestLoading = ref<Record<string, boolean>>({});
const keyTestLoading = ref<Record<string, boolean>>({});

/**
 * 构造测试请求参数
 * 根据模型能力识别“特种模型”
 */
const buildTestOptions = (profileId: string, model: LlmModelInfo, apiKey?: string) => {
  const options: any = {
    profileId,
    modelId: model.id,
    apiKey,
    maxTokens: 10,
    stream: false,
  };

  const caps = model.capabilities || {};

  if (caps.embedding) {
    options.embeddingInput = "hi";
  } else if (caps.rerank) {
    options.rerankQuery = "hi";
    options.rerankDocuments = ["hello", "world"];
  } else {
    // 默认作为对话模型测试
    options.messages = [{ role: "user", content: "hi" }];
  }

  return options;
};

// 渠道连接测试 (验证 API Key 和 Base URL)
const testConnection = async () => {
  if (!selectedProfile.value) return;

  isTestingConnection.value = true;
  const startTime = performance.now();
  try {
    const { models } = await fetchModelsFromApi(editForm.value);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    if (models.length > 0) {
      customMessage.success(`连接成功！已检测到 ${models.length} 个模型 (耗时: ${duration}s)`);
    } else {
      customMessage.warning(`连接成功，但未返回任何模型 (耗时: ${duration}s)`);
    }
  } catch (error: any) {
    // errorHandler 已在 fetchModelsFromApi 中 handle
  } finally {
    isTestingConnection.value = false;
  }
};

// 模型可用性测试
const handleTestModel = async (model: LlmModelInfo) => {
  if (!selectedProfile.value) return;

  modelTestLoading.value[model.id] = true;
  const startTime = performance.now();
  try {
    const testOptions = buildTestOptions(selectedProfile.value.id, model);
    const response = await sendRequest(testOptions);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    customMessage.success({
      message: `模型响应正常 (耗时: ${duration}s): "${response.content.substring(0, 100)}${
        response.content.length > 100 ? "..." : ""
      }"`,
      duration: 5000,
    });
  } catch (error: any) {
    // errorHandler 已处理
  } finally {
    modelTestLoading.value[model.id] = false;
  }
};

// 多 Key 管理中的特定 Key 测试
const handleTestKey = async ({ key, modelId }: { key: string; modelId: string }) => {
  if (!selectedProfile.value) return;

  const model = selectedProfile.value.models.find((m) => m.id === modelId);
  if (!model) {
    customMessage.error("未找到测试模型");
    return;
  }

  keyTestLoading.value[key] = true;
  const startTime = performance.now();
  try {
    const testOptions = buildTestOptions(selectedProfile.value.id, model, key);
    const response = await sendRequest(testOptions);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    // 如果成功，显式更新 Key 状态
    updateKeyStatus(selectedProfile.value.id, key, {
      isBroken: false,
      isEnabled: true,
      lastUsedTime: Date.now(),
    });
    reportSuccess(selectedProfile.value.id, key);

    customMessage.success(
      `Key 验证成功 (耗时: ${duration}s): ${response.content.substring(0, 50)}...`
    );
  } catch (error: any) {
    // 失败则标记为损坏
    updateKeyStatus(selectedProfile.value.id, key, {
      isBroken: true,
      lastErrorMessage: error.message || "测试请求失败",
    });
    reportFailure(selectedProfile.value.id, key, error);
  } finally {
    keyTestLoading.value[key] = false;
  }
};

// 从 API 获取模型列表
const fetchModels = async () => {
  if (!selectedProfile.value) {
    customMessage.error("请先选择一个配置");
    return;
  }

  isFetchingModels.value = true;

  try {
    const { models, rawResponse } = await fetchModelsFromApi(selectedProfile.value);

    if (models.length === 0) {
      customMessage.warning("未获取到任何模型");
      return;
    }

    fetchedModels.value = models;
    fetchedRawResponse.value = rawResponse;
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
  const iconPath = icon.path;
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

// 高级端点配置弹窗
const showCustomEndpointsDialog = ref(false);

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
                <div class="api-extra-actions">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="showCustomHeadersDialog = true"
                  >
                    自定义请求头
                    <span
                      v-if="
                        editForm.customHeaders && Object.keys(editForm.customHeaders).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customHeaders).length }})
                    </span>
                  </el-button>
                  <el-divider direction="vertical" />
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="showCustomEndpointsDialog = true"
                  >
                    高级端点
                    <span
                      v-if="
                        editForm.customEndpoints && Object.keys(editForm.customEndpoints).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customEndpoints).length }})
                    </span>
                  </el-button>
                </div>
              </div>
              <div v-else>
                <div class="form-hint">
                  <span>默认: {{ getProviderTypeInfo(editForm.type)?.defaultBaseUrl }}</span>
                </div>
                <div class="api-extra-actions">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="showCustomHeadersDialog = true"
                  >
                    自定义请求头
                    <span
                      v-if="
                        editForm.customHeaders && Object.keys(editForm.customHeaders).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customHeaders).length }})
                    </span>
                  </el-button>
                  <el-divider direction="vertical" />
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="showCustomEndpointsDialog = true"
                  >
                    高级端点
                    <span
                      v-if="
                        editForm.customEndpoints && Object.keys(editForm.customEndpoints).length > 0
                      "
                    >
                      ({{ Object.keys(editForm.customEndpoints).length }})
                    </span>
                  </el-button>
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
                  强制通过后端 Rust 代理。支持放宽证书校验、强制 HTTP/1.1 等底层配置，可绕过 CORS。
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

.api-extra-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
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
