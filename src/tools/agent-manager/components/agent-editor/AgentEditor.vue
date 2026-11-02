<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import {
  ref,
  computed,
  provide,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch,
  defineAsyncComponent,
} from "vue";
import { Search as SearchIcon } from "@element-plus/icons-vue";
import { useElementSize } from "@vueuse/core";
import { agentEditTabs } from "./agentEditConfig";
import BasicInfoSection from "./sections/BasicInfoSection.vue";
import PersonalitySection from "./sections/PersonalitySection.vue";
import ModelConfigSection from "./sections/ModelConfigSection.vue";
import { useAgentModelContext } from "../../composables/useAgentModelContext";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { parameterConfigs } from "@/tools/llm-chat/config/parameter-config";
import {
  isEditorParameterVisible,
  isSafetySettingsVisible,
} from "../parameters/parameterEditorConfig";
import CapabilitiesSection from "./sections/CapabilitiesSection.vue";
import RecallSection from "./sections/RecallSection.vue";
import KnowledgeLibrarySection from "./sections/KnowledgeLibrarySection.vue";
import ToolCallingSection from "./sections/ToolCallingSection.vue";
import EnvironmentSection from "./sections/EnvironmentSection.vue";
import OutputDisplaySection from "./sections/OutputDisplaySection.vue";
import SessionVariableSection from "./sections/SessionVariableSection.vue";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import AgentAssetsDialog from "../assets/AgentAssetsDialog.vue";

const EditUserProfileDialog = defineAsyncComponent(
  () =>
    import("@/tools/user-profile-manager/components/user-profile/EditUserProfileDialog.vue")
);
const WorldbookManagerDialog = defineAsyncComponent(
  () =>
    import("@/tools/st-worldbook-manager/components/WorldbookManagerDialog.vue")
);

interface Props {
  modelValue: any; // editForm 数据
  agent?: any; // 原始智能体实例
  mode: "create" | "edit";
  activeTab?: string;
  initialTab?: string;
  initialSection?: string;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
});

const emit = defineEmits(["update:modelValue", "save", "update:activeTab"]);

// Stores
const userProfileStore = useUserProfileStore();

// --- 响应式布局 ---
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

// 断点定义
const isSidebarCollapsed = computed(() => containerWidth.value < 900);
const isMobileMode = computed(() => containerWidth.value < 640);

const formLabelPosition = computed(() => (isMobileMode.value ? "top" : "left"));
const formLabelWidth = computed(() => {
  if (isMobileMode.value) return "auto";
  if (isSidebarCollapsed.value) return "100px";
  return "120px";
});

// --- 状态管理 ---
const internalActiveTab = ref(props.activeTab ?? "basic");
const activeTab = computed({
  get: () => props.activeTab ?? internalActiveTab.value,
  set: (val) => {
    internalActiveTab.value = val;
    emit("update:activeTab", val);
  },
});

const searchQuery = ref("");
const highlightedItemId = ref("");
const parameterSection = ref<InstanceType<typeof ModelConfigSection> | null>(
  null
);
const { currentModel, currentProviderType } = useAgentModelContext(
  () => props.modelValue
);
const { getSupportedParameters } = useLlmProfiles();
const editorContext = computed(() => ({
  parameters: props.modelValue.parameters ?? {},
  supportedParameters: currentProviderType.value
    ? getSupportedParameters(currentProviderType.value)
    : { temperature: true, maxTokens: true },
  providerType: currentProviderType.value,
  modelId: props.modelValue.modelId,
  capabilities: currentModel.value?.capabilities,
}));

// 弹窗状态
const userProfileDialogVisible = ref(false);
const worldbookManagerVisible = ref(false);
const assetsDialogVisible = ref(false);
const virtualTimeEnabled = computed({
  get: () => !!props.modelValue.virtualTimeConfig,
  set: (enabled) => {
    if (enabled) {
      if (!props.modelValue.virtualTimeConfig) {
        props.modelValue.virtualTimeConfig = {
          virtualBaseTime: new Date().toISOString(),
          realBaseTime: new Date().toISOString(),
          timeScale: 1.0,
        };
      }
    } else {
      props.modelValue.virtualTimeConfig = null;
    }
  },
});

const effectiveUserProfile = computed(() => {
  return userProfileStore.getEffectiveProfile(props.modelValue.userProfileId);
});

provide("agent-edit-form", props.modelValue);
provide("agent-instance", props.agent);
provide("mode", props.mode);
provide("active-tab", activeTab);
provide("user-profile-dialog-visible", userProfileDialogVisible);
provide("worldbook-manager-visible", worldbookManagerVisible);
provide("assets-dialog-visible", assetsDialogVisible);
provide("virtual-time-enabled", virtualTimeEnabled);

// --- 搜索功能 ---
const searchIndex = computed(() => {
  return agentEditTabs.flatMap((tab) =>
    tab.items
      .filter((item) => {
        if (item.parameterKey)
          return isEditorParameterVisible(
            item.parameterKey,
            editorContext.value
          );
        if (item.id === "parameters.safetySettings")
          return isSafetySettingsVisible(editorContext.value);
        if (
          item.id === "parameters.advanced" ||
          item.id === "parameters.special"
        ) {
          const group = item.id.split(".")[1];
          return parameterConfigs.some(
            (config) =>
              config.group === group &&
              isEditorParameterVisible(config.key, editorContext.value)
          );
        }
        return true;
      })
      .map((item) => ({
        ...item,
        tabId: tab.id,
        tabLabel: tab.label,
        value: `${tab.label} > ${item.label}`,
      }))
  );
});

const querySearch = (queryString: string, cb: any) => {
  const results = queryString
    ? searchIndex.value.filter((item) => {
        const query = queryString.toLowerCase();
        return (
          item.label.toLowerCase().includes(query) ||
          item.keywords.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.tabLabel.toLowerCase().includes(query)
        );
      })
    : [];
  cb(results);
};

let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let highlightedElement: HTMLElement | undefined;
const clearHighlight = () => {
  clearTimeout(highlightTimer);
  highlightedElement?.classList.remove("setting-highlight");
  highlightedElement = undefined;
  highlightedItemId.value = "";
};
onBeforeUnmount(clearHighlight);

const locateSetting = async (settingId: string) => {
  await nextTick();
  const targetId = settingId.startsWith("parameters.")
    ? ((await parameterSection.value?.revealSetting(settingId)) ?? settingId)
    : settingId;
  const target = Array.from(
    containerRef.value?.querySelectorAll<HTMLElement>("[data-setting-id]") || []
  ).find((element) => element.dataset.settingId === targetId);
  if (!target) return;
  clearHighlight();
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightedItemId.value = targetId;
  highlightedElement = target;
  target.classList.add("setting-highlight");
  highlightTimer = setTimeout(clearHighlight, 2000);
};

const handleSearchSelect = (item: { tabId: string; id: string }) => {
  activeTab.value = item.tabId;
  void locateSetting(item.id);
  searchQuery.value = "";
};

// 兼容此前从角色设定定位模型的入口。
const applyInitialLocation = () => {
  if (props.initialSection === "model") {
    activeTab.value = "model";
  } else if (props.initialTab) {
    activeTab.value = props.initialTab;
  }
  if (props.initialSection) void locateSetting(props.initialSection);
};
onMounted(applyInitialLocation);
watch(() => [props.initialTab, props.initialSection], applyInitialLocation);

defineExpose({
  userProfileDialogVisible,
  worldbookManagerVisible,
  assetsDialogVisible,
});
</script>

<template>
  <div
    class="agent-editor"
    data-testid="agent-editor"
    :class="{
      'sidebar-collapsed': isSidebarCollapsed,
      'mobile-mode': isMobileMode,
    }"
    ref="containerRef"
  >
    <div class="editor-header">
      <div class="header-left">
        <slot name="header-prefix"></slot>
        <el-autocomplete
          v-model="searchQuery"
          :fetch-suggestions="querySearch"
          placeholder="搜索配置项 (如: 模型, 版本, 资产, 思考块...)"
          clearable
          class="search-input"
          @select="handleSearchSelect"
        >
          <template #prefix>
            <el-icon><SearchIcon /></el-icon>
          </template>
        </el-autocomplete>
      </div>
      <div class="header-actions">
        <slot name="header-actions"></slot>
      </div>
    </div>

    <div class="editor-main">
      <div class="editor-sidebar">
        <div
          v-for="tab in agentEditTabs"
          :key="tab.id"
          class="sidebar-item"
          data-testid="agent-editor-tab"
          :data-tab-id="tab.id"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <el-tooltip
            :content="tab.label"
            placement="right"
            :disabled="!isSidebarCollapsed"
            :offset="16"
          >
            <el-icon><component :is="tab.icon" /></el-icon>
          </el-tooltip>
          <span v-if="!isSidebarCollapsed">{{ tab.label }}</span>
        </div>
      </div>

      <div class="editor-content">
        <el-form
          :model="modelValue"
          :label-width="formLabelWidth"
          :label-position="formLabelPosition"
          @submit.prevent
        >
          <BasicInfoSection v-show="activeTab === 'basic'" />
          <PersonalitySection v-show="activeTab === 'personality'" />
          <ModelConfigSection
            v-if="activeTab === 'model' || activeTab === 'context'"
            ref="parameterSection"
            :page="activeTab === 'context' ? 'context' : 'model'"
          />
          <CapabilitiesSection v-show="activeTab === 'capabilities'" />
          <SessionVariableSection v-show="activeTab === 'variables'" />
          <RecallSection v-if="activeTab === 'recall'" />
          <KnowledgeLibrarySection v-if="activeTab === 'knowledge'" />
          <ToolCallingSection v-show="activeTab === 'tool-calling'" />
          <EnvironmentSection
            v-show="activeTab === 'environment-enhancement'"
          />
          <OutputDisplaySection v-show="activeTab === 'output'" />
        </el-form>
      </div>
    </div>

    <!-- 弹窗集成 -->
    <EditUserProfileDialog
      :visible="userProfileDialogVisible"
      :profile="effectiveUserProfile"
      @update:visible="userProfileDialogVisible = $event"
    />

    <WorldbookManagerDialog v-model:visible="worldbookManagerVisible" />

    <AgentAssetsDialog
      v-if="mode === 'edit' && agent?.id"
      v-model="assetsDialogVisible"
      v-model:assets="modelValue.assets"
      v-model:asset-groups="modelValue.assetGroups"
      :agent-id="agent.id"
      :agent-name="modelValue.displayName || modelValue.name"
      @physical-change="$emit('save', { silent: true })"
    />
  </div>
</template>

<style scoped>
.agent-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--el-bg-color);
}

.editor-header {
  padding: 12px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.search-input {
  max-width: 400px;
  flex: 1;
}

.editor-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 侧边栏导航 */
.editor-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-collapsed .editor-sidebar {
  width: 56px;
  align-items: center;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.sidebar-item:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.sidebar-item.active {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary),
    transparent 90%
  );
  color: var(--el-color-primary);
  font-weight: 500;
}

.sidebar-item .el-icon {
  font-size: 18px;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  min-height: 0;
}

.mobile-mode .editor-content {
  padding: 16px;
}

.sidebar-collapsed .editor-content {
  padding: 24px 20px;
}

/* 高亮效果 */
:deep([data-setting-id]) {
  transition: all 0.5s;
  scroll-margin-top: 20px;
}

:deep(.setting-highlight) {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary),
    transparent 90%
  );
  outline: 2px solid var(--el-color-primary);
  border-radius: 4px;
}

/* 兼容原有样式 */
:deep(.form-hint) {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

:deep(.form-hint-with-action) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
