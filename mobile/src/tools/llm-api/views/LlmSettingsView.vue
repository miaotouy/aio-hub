<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { Plus, Layers, ChevronLeft } from "lucide-vue-next";
import { Snackbar } from "@varlet/ui";
import type { LlmProfile } from "../types";

// 导入子组件
import ProfileCard from "../components/ProfileCard.vue";
import PresetSelector from "../components/PresetSelector.vue";
import ProfileEditor from "../components/ProfileEditor.vue";

const router = useRouter();
const store = useLlmProfilesStore();
const isManagementMode = ref(false);
const multiSelectedIds = ref<Set<string>>(new Set());

const showEditPopup = ref(false);
const showPresetsPopup = ref(false);
const editingProfile = ref<LlmProfile | null>(null);

onMounted(() => {
  store.init();
});

const handleAddProfile = () => {
  showPresetsPopup.value = true;
};

const applyPreset = (preset: any) => {
  const newProfile: LlmProfile = {
    id: crypto.randomUUID(),
    name: preset.name,
    type: preset.type,
    baseUrl: preset.defaultBaseUrl,
    apiKeys: [""],
    enabled: true,
    models: preset.defaultModels ? JSON.parse(JSON.stringify(preset.defaultModels)) : [],
    icon: preset.logoUrl,
    customHeaders: {},
    customEndpoints: {},
  };
  editingProfile.value = newProfile;
  showPresetsPopup.value = false;
  showEditPopup.value = true;
};

const createCustomProfile = () => {
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
  editingProfile.value = newProfile;
  showPresetsPopup.value = false;
  showEditPopup.value = true;
};

const openEdit = (profile: LlmProfile) => {
  editingProfile.value = JSON.parse(JSON.stringify(profile));
  showEditPopup.value = true;
};

const handleSave = (profile: LlmProfile) => {
  const isNew = !store.profiles.some((p) => p.id === profile.id);
  if (isNew) {
    store.addProfile(profile);
  } else {
    store.updateProfile(profile.id, profile);
  }

  showEditPopup.value = false;
  Snackbar.success("配置已保存");
};

const handleDelete = (id: string) => {
  store.deleteProfile(id);
  showEditPopup.value = false;
  Snackbar.success("已删除");
};

const handleToggleEnabled = (profileId: string, enabled: boolean) => {
  store.updateProfile(profileId, { enabled });
  Snackbar.success(enabled ? "已启用" : "已禁用");
};

const handleToggleMultiSelect = (id: string) => {
  if (multiSelectedIds.value.has(id)) {
    multiSelectedIds.value.delete(id);
  } else {
    multiSelectedIds.value.add(id);
  }
};
</script>

<template>
  <div class="llm-settings-view">
    <var-app-bar title="LLM 渠道管理" fixed safe-area>
      <template #left>
        <var-button round text @click="router.back()">
          <ChevronLeft :size="24" />
        </var-button>
      </template>
      <template #right>
        <var-button round text @click="handleAddProfile">
          <Plus :size="24" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="view-content">
      <div v-if="store.profiles.length === 0" class="empty-state">
        <Layers :size="64" class="empty-icon" />
        <p>暂无渠道，请点击右上角添加</p>
      </div>

      <div v-else class="profile-list">
        <ProfileCard
          v-for="profile in store.profiles"
          :key="profile.id"
          :profile="profile"
          :is-selected="false"
          :is-management-mode="isManagementMode"
          :is-multi-selected="multiSelectedIds.has(profile.id)"
          @click="isManagementMode ? handleToggleMultiSelect(profile.id) : openEdit(profile)"
          @toggle-enabled="(val) => handleToggleEnabled(profile.id, val)"
          @toggle-multi-select="handleToggleMultiSelect(profile.id)"
        />
      </div>
    </div>

    <!-- 预设选择 -->
    <PresetSelector
      v-model:show="showPresetsPopup"
      @select="applyPreset"
      @create-custom="createCustomProfile"
    />

    <!-- 编辑/详情 -->
    <ProfileEditor
      v-model:show="showEditPopup"
      v-model:profile="editingProfile"
      @save="handleSave"
      @delete="handleDelete"
    />
  </div>
</template>

<style scoped>
.llm-settings-view {
  display: flex;
  flex-direction: column;
  /* 移动端避免使用 100vh，使用 flex 填充父容器 */
  height: 100%;
  background: var(--color-surface);
}

.view-content {
  flex: 1;
  overflow-y: auto;
  /* 因为 AppBar 是 fixed 的，需要 padding-top 来避开它 */
  /* 54px (AppBar) + 16px (间距) = 70px */
  padding: 70px 16px 80px;
}

.profile-list {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  height: 60vh;
  height: 60dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
}

.empty-icon {
  margin-bottom: 16px;
}
</style>
