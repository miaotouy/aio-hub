// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Profile 编辑器核心逻辑
 * 负责 Profile 的选择、创建、删除、自动保存
 */
import { ref, computed, watch } from "vue";
import { normalizeDeepSeekProfile } from "@aiohub/llm-core";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useDraftAutoSave } from "@/composables/useDraftAutoSave";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { providerTypes } from "@/config/llm-providers";
import type { LlmProfile, ProviderType } from "@/types/llm-profiles";
import type { LlmPreset } from "@/config/llm-presets";
import { getAioDefaultHeaders } from "../config/customHeadersPresets";

export function useProfileEditor() {
  const {
    profiles,
    revision,
    refreshProfiles,
    saveProfile,
    deleteProfile,
    toggleProfileEnabled,
    generateId,
    createFromPreset,
    updateProfilesOrder,
  } = useLlmProfiles();

  // 当前选中的配置
  const selectedProfileId = ref<string | null>(null);

  // 编辑表单
  const session = useDraftAutoSave<LlmProfile, string | null>({
    save: saveProfile,
    normalize: normalizeDeepSeekProfile,
    validate: (value) => {
      if (!value.name.trim()) {
        customMessage.error("请输入渠道名称");
        return false;
      }
      if (value.type !== "virtual" && !value.baseUrl.trim()) {
        customMessage.error("请输入 API 地址");
        return false;
      }
      return true;
    },
    initial: {
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
    },
  });

  const editForm = session.draft;

  // API Key 输入处理
  const apiKeyInput = ref("");

  // 计算当前选中的配置
  const selectedProfile = computed(() => {
    if (!selectedProfileId.value) return null;
    return (
      profiles.value.find((p) => p.id === selectedProfileId.value) ||
      (editForm.value.id === selectedProfileId.value ? editForm.value : null)
    );
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
          if (
            field.modelPath &&
            editForm.value.options![field.modelPath] === undefined
          ) {
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

  const flushPendingSave = () => {
    void session.flush();
  };
  const selectProfile = (profileId: string) => {
    flushPendingSave();
    const profile = profiles.value.find((item) => item.id === profileId);
    selectedProfileId.value = profileId;
    if (profile) {
      session.open(profile, revision.value);
      apiKeyInput.value = editForm.value.apiKeys.join(", ");
    }
  };
  watch(revision, () => {
    const profile = profiles.value.find(
      (item) => item.id === selectedProfileId.value
    );
    if (profile) session.sync(profile, revision.value);
  });
  const refreshCurrentProfile = async () => {
    session.cancelPending();
    try {
      await refreshProfiles();
    } catch {
      return;
    }
    const profile = profiles.value.find(
      (item) => item.id === selectedProfileId.value
    );
    if (profile) session.open(profile, revision.value, false, true);
    else {
      session.discard();
      selectedProfileId.value = profiles.value[0]?.id || null;
      if (selectedProfileId.value) selectProfile(selectedProfileId.value);
      else apiKeyInput.value = "";
    }
  };

  // 创建新配置 - 从空白开始
  const createNewProfile = (virtual = false) => {
    flushPendingSave();
    const newName = `未命名渠道 ${profiles.value.length + 1}`;
    session.open(
      {
        id: generateId(),
        name: newName,
        type: virtual ? "virtual" : "openai",
        baseUrl: virtual ? "" : "https://api.openai.com",
        ...(virtual
          ? {
              virtualChannel: {
                mode: "failover" as const,
                members: [],
                maxAttempts: 3,
                totalTimeoutMs: 180000,
                attemptTimeoutMs: 60000,
              },
            }
          : {}),
        apiKeys: [],
        enabled: true,
        models: [],
        networkStrategy: "auto",
        relaxIdCerts: false,
        http1Only: true,
        options: {},
        customHeaders: getAioDefaultHeaders(),
      },
      revision.value,
      true
    );
    apiKeyInput.value = "";
    selectedProfileId.value = editForm.value.id;

    // 立即保存一次，确保新创建的 Profile 出现在列表中
    saveCurrentProfile();
  };

  // 从预设创建配置
  const createFromPresetTemplate = (preset: LlmPreset) => {
    flushPendingSave();
    session.open(createFromPreset(preset), revision.value, true);
    apiKeyInput.value = "";
    selectedProfileId.value = editForm.value.id;
    saveCurrentProfile();
  };

  const saveCurrentProfile = () => session.flush();

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
          lockScroll: false,
        }
      );
      const id = selectedProfile.value.id;
      session.cancelPending();
      await deleteProfile(id);
      session.discard();
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
    if (editForm.value.id === profile.id) {
      editForm.value.enabled = !editForm.value.enabled;
      void session.flush();
    } else void toggleProfileEnabled(profile.id).catch(() => {});
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
    generateId,
    saveCurrentProfile,
    refreshCurrentProfile,
    saveError: session.lastError,
    saveConflict: session.hasConflict,
    isSaving: session.isSaving,
    isDirty: session.isDirty,
    handleDelete,
    handleToggle,
    resetBaseUrl,
  };
}
