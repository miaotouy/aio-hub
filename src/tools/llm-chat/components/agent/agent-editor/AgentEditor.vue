<script setup lang="ts">
import { ref, computed, provide, nextTick, watch, defineAsyncComponent } from "vue";
import { Search as SearchIcon } from "@element-plus/icons-vue";
import { useElementSize } from "@vueuse/core";
import { agentEditTabs } from "./agentEditConfig";
import BasicInfoSection from "./sections/BasicInfoSection.vue";
import PersonalitySection from "./sections/PersonalitySection.vue";
import CapabilitiesSection from "./sections/CapabilitiesSection.vue";
import OutputDisplaySection from "./sections/OutputDisplaySection.vue";
import { useUserProfileStore } from "../../../userProfileStore";
import AgentAssetsDialog from "../AgentAssetsDialog.vue";

const EditUserProfileDialog = defineAsyncComponent(
  () => import("../../user-profile/EditUserProfileDialog.vue")
);
const WorldbookManagerDialog = defineAsyncComponent(
  () => import("../../worldbook/WorldbookManagerDialog.vue")
);

interface Props {
  modelValue: any; // editForm 数据
  agent?: any; // 原始智能体实例
  mode: "create" | "edit";
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
});

const emit = defineEmits(["update:modelValue", "save"]);

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
const activeTab = ref("basic");
const searchQuery = ref("");
const highlightedItemId = ref("");

// 弹窗状态
const userProfileDialogVisible = ref(false);
const worldbookManagerVisible = ref(false);
const assetsDialogVisible = ref(false);
const virtualTimeEnabled = ref(!!props.modelValue.virtualTimeConfig);

const effectiveUserProfile = computed(() => {
  if (props.modelValue.userProfileId) {
    return userProfileStore.getProfileById(props.modelValue.userProfileId) || null;
  }
  return userProfileStore.globalProfile;
});

watch(virtualTimeEnabled, (enabled) => {
  if (enabled) {
    if (!props.modelValue.virtualTimeConfig) {
      props.modelValue.virtualTimeConfig = {
        virtualBaseTime: new Date().toISOString(),
        realBaseTime: new Date().toISOString(),
        timeScale: 1.0,
      };
    }
  } else {
    props.modelValue.virtualTimeConfig = undefined;
  }
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
    tab.items.map((item) => ({
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
          item.label.toLowerCase().includes(query) || item.keywords.toLowerCase().includes(query)
        );
      })
    : [];
  cb(results);
};

const handleSearchSelect = (item: any) => {
  activeTab.value = item.tabId;

  nextTick(() => {
    const target = document.querySelector(`[data-setting-id="${item.id}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightedItemId.value = item.id;
      target.classList.add("setting-highlight");
      setTimeout(() => {
        highlightedItemId.value = "";
        target.classList.remove("setting-highlight");
      }, 2000);
    }
  });
  searchQuery.value = "";
};

defineExpose({
  userProfileDialogVisible,
  worldbookManagerVisible,
  assetsDialogVisible,
});
</script>

<template>
  <div
    class="agent-editor"
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
          placeholder="搜索配置项 (如: 模型, 资产, 思考块...)"
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
          <CapabilitiesSection v-show="activeTab === 'capabilities'" />
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
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
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
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
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
