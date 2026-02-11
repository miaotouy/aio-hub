/**
 * Profile 编辑器核心逻辑
 * 负责 Profile 的选择、创建、删除、自动保存
 */
import { ref, computed, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { providerTypes } from "@/config/llm-providers";
import type { LlmProfile, ProviderType } from "@/types/llm-profiles";
import type { LlmPreset } from "@/config/llm-presets";

export function useProfileEditor() {
  const {
    profiles,
    saveProfile,
    deleteProfile,
    toggleProfileEnabled,
    generateId,
    createFromPreset,
    updateProfilesOrder,
  } = useLlmProfiles();

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

  // API Key 输入处理
  const apiKeyInput = ref("");

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

  // 获取提供商类型信息
  const getProviderTypeInfo = (type: ProviderType) => {
    return providerTypes.find((p) => p.type === type);
  };

  // 监听 type 变化，初始化 options
  watch(
    () => editForm.value.type,
    (newType) => {
      const typeInfo = getProviderTypeInfo(newType);
      if (typeInfo?.configFields) {
        if (!editForm.value.options) {
          editForm.value.options = {};
        }
        typeInfo.configFields.forEach((field) => {
          if (field.modelPath && editForm.value.options![field.modelPath] === undefined) {
            editForm.value.options![field.modelPath] = field.defaultValue;
          }
        });
      }
    }
  );

  // 将分隔的 API Key 字符串转换为数组
  const updateApiKeys = () => {
    const keys = apiKeyInput.value
      .split(/[,，\n\r]+/)
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
    editForm.value.apiKeys = keys;
    apiKeyInput.value = keys.join(", ");
  };

  // 监听 apiKeys 变化，同步输入框
  watch(
    () => editForm.value.apiKeys,
    (newKeys) => {
      if (!newKeys) return;
      const currentInputKeys = apiKeyInput.value
        .split(/[,，\n\r]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

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
      saveCurrentProfile();
    }, 1000);
  };

  // 监听表单变化，自动保存
  watch(
    () => editForm.value,
    () => {
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

  // 重置 API 地址到默认值
  const resetBaseUrl = () => {
    const defaultUrl = getProviderTypeInfo(editForm.value.type)?.defaultBaseUrl;
    if (defaultUrl) {
      editForm.value.baseUrl = defaultUrl;
      customMessage.success("已重置为默认地址");
    }
  };

  return {
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
    saveCurrentProfile,
    handleDelete,
    handleToggle,
    resetBaseUrl,
  };
}
