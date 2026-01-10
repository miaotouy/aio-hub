<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { Search } from "lucide-vue-next";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { useModelMetadata } from "../composables/useModelMetadata";
import { useI18n } from "@/i18n";
import type { LlmProfile, LlmModelInfo } from "../types";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  show: boolean;
  modelValue?: string; // 格式: profileId:modelId
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "select", value: { value: string; profileId: string; modelId: string; label: string; model: LlmModelInfo }): void;
}>();

const router = useRouter();
const { tRaw } = useI18n();
const store = useLlmProfilesStore();
const { getModelIcon } = useModelMetadata();

const searchQuery = ref("");

// 内部控制显示状态，方便与父组件同步
const isVisible = computed({
  get: () => props.show,
  set: (val) => emit("update:show", val),
});

// 当弹窗打开时重置搜索
watch(() => props.show, (newVal) => {
  if (newVal) {
    searchQuery.value = "";
  }
});

// 格式化所有可用模型
const availableModels = computed(() => {
  const models: Array<{
    value: string; // profileId:modelId
    label: string;
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  store.enabledProfiles.forEach((profile) => {
    profile.models.forEach((model) => {
      models.push({
        value: `${profile.id}:${model.id}`,
        label: model.name,
        profile,
        model,
      });
    });
  });

  return models;
});

// 按 Profile 和模型内部 group 分组并支持搜索
const modelGroups = computed(() => {
  const profileGroups = new Map<
    string,
    {
      profile: LlmProfile;
      subGroups: Map<string, typeof availableModels.value>;
    }
  >();

  const query = searchQuery.value.toLowerCase().trim();

  availableModels.value.forEach((item) => {
    // 搜索匹配逻辑
    const matches =
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.model.id.toLowerCase().includes(query) ||
      item.profile.name.toLowerCase().includes(query) ||
      (item.model.group && item.model.group.toLowerCase().includes(query));

    if (matches) {
      const profileId = item.profile.id;
      if (!profileGroups.has(profileId)) {
        profileGroups.set(profileId, {
          profile: item.profile,
          subGroups: new Map(),
        });
      }

      const subGroupName = item.model.group || ""; // 空字符串表示未分组
      const profileData = profileGroups.get(profileId)!;
      if (!profileData.subGroups.has(subGroupName)) {
        profileData.subGroups.set(subGroupName, []);
      }
      profileData.subGroups.get(subGroupName)!.push(item);
    }
  });

  // 转换为嵌套数组结构
  return Array.from(profileGroups.values()).map((p) => ({
    profileName: `${p.profile.name} (${p.profile.type})`,
    profileId: p.profile.id,
    groups: Array.from(p.subGroups.entries()).map(([name, items]) => ({
      name,
      items,
    })),
  }));
});

const handleSelect = (item: (typeof availableModels.value)[0]) => {
  emit("select", {
    value: item.value,
    profileId: item.profile.id,
    modelId: item.model.id,
    label: item.label,
    model: item.model,
  });
  isVisible.value = false;
};
</script>

<template>
  <var-popup position="bottom" v-model:show="isVisible" round>
    <div class="model-select-popup">
      <div class="popup-header">
        <div class="popup-title">{{ tRaw("tools.llm-api.common.选择模型") }}</div>
        <div class="search-bar">
          <var-input
            v-model="searchQuery"
            :placeholder="t('common.搜索')"
            variant="standard"
            clearable
          >
            <template #prepend-icon>
              <Search :size="18" />
            </template>
          </var-input>
        </div>
      </div>

      <div class="popup-content">
        <div v-if="modelGroups.length === 0" class="empty-state">
          <p>{{ tRaw("tools.llm-api.common.未配置模型") }}</p>
          <var-button type="primary" size="small" @click="router.push('/tools/llm-api')">
            {{ tRaw("tools.llm-api.common.去配置") }}
          </var-button>
        </div>

        <div v-else class="group-list">
          <div
            v-for="profileGroup in modelGroups"
            :key="profileGroup.profileId"
            class="profile-group"
          >
            <div class="profile-header">{{ profileGroup.profileName }}</div>
            <div class="profile-content">
              <div
                v-for="subGroup in profileGroup.groups"
                :key="subGroup.name"
                class="model-sub-group"
              >
                <div v-if="subGroup.name" class="sub-group-header">
                  {{ subGroup.name }}
                </div>
                <div class="group-items">
                  <div
                    v-for="item in subGroup.items"
                    :key="item.value"
                    class="model-item"
                    :class="{ active: modelValue === item.value }"
                    v-ripple
                    @click="handleSelect(item)"
                  >
                    <DynamicIcon
                      :src="getModelIcon(item.model) || ''"
                      :alt="item.label"
                      class="item-icon"
                    />
                    <div class="item-info">
                      <div class="item-name">{{ item.label }}</div>
                      <div class="item-id">{{ item.model.id }}</div>
                    </div>
                    <var-radio
                      v-if="modelValue === item.value"
                      :model-value="true"
                      readonly
                      checked-value="true"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.model-select-popup {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.popup-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.popup-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-on-surface);
  text-align: center;
  margin-bottom: 12px;
}

.search-bar {
  padding: 0 4px;
}

.search-bar :deep(.var-input) {
  --input-placeholder-color: var(--color-on-surface-variant);
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 32px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-on-surface-variant);
}

.empty-state p {
  margin-bottom: 16px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 12px;
  padding-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.profile-group {
  margin-bottom: 24px;
}

.profile-group:last-child {
  margin-bottom: 0;
}

.model-sub-group {
  margin-bottom: 16px;
}

.model-sub-group:last-child {
  margin-bottom: 0;
}

.sub-group-header {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-on-surface-variant);
  margin-bottom: 8px;
  padding-left: 8px;
  opacity: 0.8;
  border-left: 2px solid var(--color-outline-variant);
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface-container);
  transition: all 0.2s;
}

.model-item:active {
  background: var(--color-surface-container-high);
}

.model-item.active {
  background: var(--color-primary-container);
  border: 1px solid var(--color-primary);
}

.item-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-on-surface);
  margin-bottom: 2px;
}

.item-id {
  font-size: 0.75rem;
  color: var(--color-on-surface-variant);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>