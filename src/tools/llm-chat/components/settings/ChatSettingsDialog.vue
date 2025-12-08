<template>
  <BaseDialog
    :model-value="props.visible"
    @update:model-value="(val: any) => emit('update:visible', val)"
    title="聊天设置"
    width="80vw"
    height="calc(100vh - 100px)"
    :close-on-backdrop-click="false"
    dialog-class="chat-settings-dialog"
    :destroy-on-close="false"
    @close="handleClosed"
  >
    <template #content>
      <div class="settings-container">
        <div class="settings-header">
          <el-autocomplete
            v-model="searchQuery"
            :fetch-suggestions="querySearch"
            placeholder="搜索设置项"
            clearable
            class="search-input"
            @select="handleSearchSelect"
            popper-class="settings-search-popper"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-autocomplete>
        </div>

        <!-- 快速导航标签页 -->
        <div class="settings-tabs">
          <el-tabs
            v-model="activeTab"
            type="card"
            @tab-click="handleTabClick"
            class="navigation-tabs"
          >
            <el-tab-pane
              v-for="section in settingsConfig"
              :key="section.title"
              :label="section.title"
              :name="section.title"
            >
              <template #label>
                <div class="tab-label">
                  <el-icon><component :is="section.icon" /></el-icon>
                  <span>{{ section.title }}</span>
                </div>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>
        <div class="settings-content" ref="scrollContainerRef">
          <el-form :model="localSettings" label-width="120px" label-position="left">
            <template v-for="(section, sectionIndex) in settingsConfig" :key="section.title">
              <div class="settings-section">
                <div class="section-title">
                  <el-icon><component :is="section.icon" /></el-icon>
                  <span>{{ section.title }}</span>
                </div>

                <template v-for="item in section.items" :key="item.id">
                  <el-form-item
                    v-if="!item.visible || item.visible(localSettings)"
                    :label="renderHint(item.label)"
                    :data-setting-id="item.id"
                    style="padding-left: 26px"
                  >
                    <!-- Block layout (default) -->
                    <template v-if="item.layout !== 'inline'">
                      <div class="setting-item-content">
                        <!-- Collapsible Component Template -->
                        <div
                          v-if="item.collapsible"
                          class="full-width"
                          style="width: 100%"
                        >
                          <el-collapse v-model="activeCollapseNames">
                            <el-collapse-item
                              :title="item.collapsible.title"
                              :name="item.collapsible.name"
                            >
                              <div :style="item.collapsible.style">
                                <component
                                  v-if="loadedComponents[item.collapsible.name]"
                                  :is="resolveComponent(item.component)"
                                  :model-value="
                                    get(localSettings, item.modelPath) ||
                                    item.collapsible.defaultValue
                                  "
                                  @update:model-value="
                                    (value: any) => set(localSettings, item.modelPath, value)
                                  "
                                  v-bind="item.props"
                                  :loading="
                                    item.collapsible.useLoading
                                      ? componentLoading[item.collapsible.name]
                                      : undefined
                                  "
                                />
                              </div>
                            </el-collapse-item>
                          </el-collapse>
                        </div>

                        <!-- Standard Component -->
                        <component
                          v-else-if="item.component !== 'SliderWithInput'"
                          :is="resolveComponent(item.component)"
                          :class="getComponentClass(item)"
                          :model-value="get(localSettings, item.modelPath)"
                          @update:model-value="
                            (value: any) => set(localSettings, item.modelPath, value)
                          "
                          v-bind="resolveProps(item)"
                        >
                          <!-- RadioGroup options -->
                          <template
                            v-if="item.component === 'ElRadioGroup' && resolveOptions(item)"
                          >
                            <el-radio
                              v-for="option in resolveOptions(item)"
                              :key="option.value.toString()"
                              :value="option.value"
                            >
                              {{ option.label }}
                            </el-radio>
                          </template>
                          <!-- Select options -->
                          <template v-if="item.component === 'ElSelect' && resolveOptions(item)">
                            <el-option
                              v-for="option in resolveOptions(item)"
                              :key="option.value.toString()"
                              :label="option.label"
                              :value="option.value"
                              :title="option.description"
                            >
                              <div class="select-option-with-tags">
                                <span>{{ option.label }}</span>
                                <div
                                  v-if="option.tags && option.tags.length > 0"
                                  class="tags-container"
                                >
                                  <el-tag
                                    v-for="tag in option.tags"
                                    :key="tag"
                                    size="small"
                                    :type="
                                      tag === '基础'
                                        ? 'success'
                                        : tag === '高级'
                                          ? 'warning'
                                          : 'info'
                                    "
                                    class="option-tag"
                                  >
                                    {{ tag }}
                                  </el-tag>
                                </div>
                              </div>
                            </el-option>
                          </template>
                        </component>
                        <!-- SliderWithInput Custom Composite Component -->
                        <div v-if="item.component === 'SliderWithInput'" class="slider-with-input">
                          <el-slider
                            :model-value="get(localSettings, item.modelPath)"
                            @update:model-value="
                              (value: any) => set(localSettings, item.modelPath, value)
                            "
                            v-bind="item.props"
                            class="slider-part"
                          />
                          <el-input-number
                            :model-value="get(localSettings, item.modelPath)"
                            @update:model-value="
                              (value: any) => set(localSettings, item.modelPath, value)
                            "
                            v-bind="item.props"
                            class="input-part"
                            :controls="true"
                          />
                        </div>
                        <div
                          v-if="item.slots?.append"
                          class="append-slot"
                          @click="handleComponentClick(item)"
                        >
                          <component :is="item.slots.append" />
                        </div>
                      </div>
                      <div v-if="item.hint" class="form-hint" v-html="renderHint(item.hint)"></div>
                      <!-- 渲染器详情显示 - 仅显示当前选中的 -->
                      <div
                        v-if="item.id === 'rendererVersion' && resolveOptions(item)"
                        class="form-hint"
                      >
                        {{
                          resolveOptions(item)?.find(
                            (opt: any) => opt.value === get(localSettings, item.modelPath)
                          )?.description
                        }}
                      </div>
                    </template>

                    <!-- Inline layout -->
                    <template v-else>
                      <div class="setting-item-content-inline">
                        <component
                          :is="resolveComponent(item.component)"
                          :class="getComponentClass(item)"
                          :model-value="get(localSettings, item.modelPath)"
                          @update:model-value="
                            (value: any) => set(localSettings, item.modelPath, value)
                          "
                          v-bind="resolveProps(item)"
                        />
                        <div
                          v-if="item.hint"
                          class="form-hint-inline"
                          v-html="renderHint(item.hint)"
                        ></div>
                      </div>
                    </template>
                  </el-form-item>
                </template>
              </div>
              <el-divider v-if="sectionIndex < settingsConfig.length - 1" />
            </template>
          </el-form>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="settings-footer-content">
        <el-button @click="handleReset">
          <el-icon><RefreshLeft /></el-icon>
          恢复默认
        </el-button>
        <div class="footer-actions">
          <span class="auto-save-indicator" :class="saveStatus">
            <template v-if="saveStatus === 'saving'">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>自动保存中...</span>
            </template>
            <template v-else-if="saveStatus === 'success' && lastSaveTime">
              <el-icon><SuccessFilled /></el-icon>
              <span>已于 {{ lastSaveTime }} 保存</span>
            </template>
            <template v-else-if="saveStatus === 'error'">
              <el-icon><CircleClose /></el-icon>
              <span>保存失败</span>
            </template>
          </span>
          <el-button @click="handleClose">关闭</el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import {
  ref,
  watch,
  nextTick,
  computed,
  shallowRef,
  type Component,
  onUnmounted,
  defineAsyncComponent,
} from "vue";
import {
  ElMessageBox,
  ElRadio,
  ElSwitch,
  ElSlider,
  ElInputNumber,
  ElInput,
  ElRadioGroup,
  ElTabs,
  ElTabPane,
  ElSelect,
  ElOption,
  ElTag,
  ElCollapse,
  ElCollapseItem,
} from "element-plus";
import { get, set, debounce } from "lodash-es";
import { RefreshLeft, Loading, Search, SuccessFilled, CircleClose } from "@element-plus/icons-vue";

import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import ChatRegexEditor from "@/tools/llm-chat/components/common/ChatRegexEditor.vue";
import { customMessage } from "@/utils/customMessage";
import {
  useChatSettings,
  type ChatSettings,
  DEFAULT_SETTINGS,
} from "../../composables/useChatSettings";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { settingsConfig } from "./settingsConfig";
import type { SettingComponent, SettingItem } from "./settings-types";

const MarkdownStyleEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue")
);

const logger = createModuleLogger("ChatSettingsDialog");
const errorHandler = createModuleErrorHandler("ChatSettingsDialog");
const bus = useWindowSyncBus();

interface Props {
  visible: boolean;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { settings, loadSettings, updateSettings, resetSettings, isLoaded } = useChatSettings();

const localSettings = ref<ChatSettings>(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));

const isLoadingSettings = ref(false);
const saveStatus = ref<"idle" | "saving" | "success" | "error">("idle");
const lastSaveTime = ref("");

// --- 懒加载状态管理 ---
const activeCollapseNames = ref<string[]>([]);
// 通用懒加载状态
const loadedComponents = ref<Record<string, boolean>>({});
const componentLoading = ref<Record<string, boolean>>({});

// 从 settingsConfig 中提取所有的 collapsible 配置
const allCollapsibleConfigs = computed(() => {
  const configs: Record<
    string,
    {
      title: string;
      name: string;
      style?: any;
      defaultValue?: any;
      useLoading?: boolean;
    }
  > = {};

  settingsConfig.forEach((section) => {
    section.items.forEach((item) => {
      if (item.collapsible) {
        configs[item.collapsible.name] = item.collapsible;
      }
    });
  });
  return configs;
});

watch(activeCollapseNames, (newNames) => {
  newNames.forEach((name) => {
    // 查找配置
    const config = allCollapsibleConfigs.value[name];
    if (config && !loadedComponents.value[name]) {
      if (config.useLoading) {
        componentLoading.value[name] = true;
        setTimeout(() => {
          componentLoading.value[name] = false;
        }, 500);
      }
      loadedComponents.value[name] = true;
    }
  });
});

const loadLocalSettings = async () => {
  isLoadingSettings.value = true;
  try {
    if (!isLoaded.value) {
      await loadSettings();
    }
    localSettings.value = JSON.parse(JSON.stringify(settings.value));

    // 重置状态
    activeCollapseNames.value = [];
    loadedComponents.value = {};
    componentLoading.value = {};

    logger.info("加载本地设置", { settings: localSettings.value });
  } finally {
    await nextTick();
    isLoadingSettings.value = false;
  }
};

watch(
  () => localSettings.value.shortcuts.send,
  (sendKey) => {
    localSettings.value.shortcuts.newLine = sendKey === "ctrl+enter" ? "enter" : "shift+enter";
  }
);

const autoSave = debounce(async () => {
  if (isLoadingSettings.value) return;
  try {
    saveStatus.value = "saving";

    if (bus.windowType === "detached-component") {
      await bus.requestAction("update-chat-settings", {
        updates: localSettings.value,
      });
    } else {
      await updateSettings(localSettings.value);
    }

    logger.info("设置已自动保存");
    saveStatus.value = "success";
    lastSaveTime.value = new Date().toLocaleTimeString();
  } catch (error) {
    errorHandler.error(error as Error, "自动保存设置失败");
    saveStatus.value = "error";
  }
}, 500);

watch(
  localSettings,
  () => {
    if (isLoadingSettings.value) return;
    // 当用户编辑时，如果之前有保存成功或失败的状态，则清除，以表示“未保存的更改”
    if (saveStatus.value === "success" || saveStatus.value === "error") {
      saveStatus.value = "idle";
    }
    autoSave();
  },
  { deep: true }
);

const handleClose = () => {
  autoSave.flush();
  emit("update:visible", false);
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要恢复默认设置吗？", "确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    if (bus.windowType === "detached-component") {
      await bus.requestAction("update-chat-settings", {
        updates: DEFAULT_SETTINGS,
      });
    } else {
      await resetSettings();
    }

    await loadLocalSettings();
    customMessage.success("已恢复默认设置");
  } catch {
    // 用户取消
  }
};

const handleResetPrompt = () => {
  set(localSettings.value, "topicNaming.prompt", DEFAULT_SETTINGS.topicNaming.prompt);
  customMessage.success("已重置为默认提示词");
};

const handleResetTranslationPrompt = () => {
  set(localSettings.value, "translation.prompt", DEFAULT_SETTINGS.translation.prompt);
  customMessage.success("已重置翻译提示词为默认值");
};

const handleClosed = () => {
  saveStatus.value = "idle";
};

// --- 配置驱动渲染 ---
const componentMap: Record<string, Component> = {
  ElSwitch,
  ElSlider,
  ElRadioGroup,
  ElInputNumber,
  ElInput,
  ElTabs,
  ElTabPane,
  LlmModelSelector,
  ElSelect,
  MarkdownStyleEditor,
  ChatRegexEditor,
};

const resolveComponent = (componentName: SettingComponent | Component) => {
  if (typeof componentName === "string") {
    return componentMap[componentName] || componentName;
  }
  return shallowRef(componentName);
};

const resolveProps = (item: SettingItem) => {
  if (typeof item.props === "function") {
    return item.props(localSettings.value);
  }
  return item.props || {};
};

const resolveOptions = (item: SettingItem) => {
  if (typeof item.options === "function") {
    return item.options(localSettings.value);
  }
  return item.options;
};

const renderHint = (hint: string) => {
  return hint.replace(/\{\{ (.*?) \}\}/g, (_, expression) => {
    try {
      // eslint-disable-next-line no-new-func
      return new Function("localSettings", `return ${expression}`)(localSettings.value);
    } catch (e) {
      return `{{ ${expression} }}`; // Return original on error
    }
  });
};

const getComponentClass = (item: SettingItem) => {
  const classes: string[] = [];
  const props = resolveProps(item);
  if (
    item.component === "ElSlider" ||
    (item.component === "ElInput" && props?.type === "textarea") ||
    item.component === "SliderWithInput"
  ) {
    classes.push("full-width");
  }
  return classes;
};

const actionRegistry: Record<string, () => void> = {
  resetTopicNamingPrompt: handleResetPrompt,
  resetTranslationPrompt: handleResetTranslationPrompt,
};

const handleComponentClick = (item: SettingItem) => {
  if (item.action && actionRegistry[item.action]) {
    actionRegistry[item.action]();
  }
};

// --- 搜索功能 ---
const scrollContainerRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");

// --- 标签页导航功能 ---
const activeTab = ref("");
let isClickingTab = false;

const handleTabClick = (tab: any) => {
  if (!scrollContainerRef.value) return;

  const sectionTitle = tab.props.name;

  const allSections = scrollContainerRef.value.querySelectorAll(".settings-section");
  let targetSection: HTMLElement | null = null;

  for (const section of allSections) {
    const titleElement = section.querySelector(".section-title span");
    if (titleElement && titleElement.textContent === sectionTitle) {
      targetSection = section as HTMLElement;
      break;
    }
  }

  if (targetSection) {
    isClickingTab = true;
    targetSection.scrollIntoView({ behavior: "smooth", block: "start" });

    targetSection.classList.add("section-highlight");
    setTimeout(() => {
      targetSection.classList.remove("section-highlight");
    }, 1500);

    // 等待滚动结束后再恢复滚动监听
    setTimeout(() => {
      isClickingTab = false;
    }, 1000); // 1s 的延迟应该足够平滑滚动完成
  }
};

interface SearchIndexItem {
  id: string;
  label: string;
  keywords: string;
  value: string;
}

const searchIndex = computed<SearchIndexItem[]>(() =>
  settingsConfig.flatMap((section) =>
    section.items
      .filter((item) => !item.visible || item.visible(localSettings.value))
      .map((item) => ({
        id: item.id.toString(),
        label: item.label,
        keywords: item.keywords,
        value: renderHint(`${section.title} > ${item.label}`),
      }))
  )
);

const querySearch = (queryString: string, cb: (results: SearchIndexItem[]) => void) => {
  const results = queryString
    ? searchIndex.value.filter((item) => {
        const query = queryString.toLowerCase().trim();
        if (!query) return false;
        return (
          item.label.toLowerCase().includes(query) ||
          item.keywords.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query)
        );
      })
    : [];
  cb(results);
};

const handleSearchSelect = (item: Record<string, any>) => {
  if (!scrollContainerRef.value) return;

  const targetElement = scrollContainerRef.value.querySelector(
    `[data-setting-id="${item.id}"]`
  ) as HTMLElement;

  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

    targetElement.classList.add("highlight");
    setTimeout(() => {
      targetElement.classList.remove("highlight");
    }, 1500);
  }

  nextTick(() => {
    searchQuery.value = "";
  });
};

// --- 滚动监听功能 ---
let scrollObserver: IntersectionObserver | null = null;

const removeScrollListener = () => {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
};

const addScrollListener = () => {
  if (!scrollContainerRef.value) return;

  removeScrollListener();

  const sections = scrollContainerRef.value.querySelectorAll(".settings-section");
  const sectionElements = Array.from(sections) as HTMLElement[];

  const options = {
    root: scrollContainerRef.value,
    rootMargin: "-30% 0px -60% 0px",
    threshold: 0,
  };

  scrollObserver = new IntersectionObserver((entries) => {
    if (isClickingTab) return;
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const sectionElement = entry.target as HTMLElement;
        const titleElement = sectionElement.querySelector(".section-title span");
        if (titleElement && titleElement.textContent) {
          activeTab.value = titleElement.textContent;
        }
      }
    });
  }, options);

  sectionElements.forEach((section) => {
    scrollObserver!.observe(section);
  });
};

onUnmounted(() => {
  autoSave.cancel();
  removeScrollListener();
});

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      saveStatus.value = "idle";
      await loadLocalSettings();
      if (settingsConfig.length > 0) {
        activeTab.value = settingsConfig[0].title;
      }
      nextTick(() => {
        addScrollListener();
      });
    } else {
      removeScrollListener();
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.select-option-with-tags {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.tags-container {
  display: flex;
  gap: 4px;
}

/* 主容器使用 flex 布局 */
.settings-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* 防止 flex 子元素溢出 */
  padding-left: 12px;
  padding-right: 12px;
}

.settings-header {
  margin-bottom: 16px;
  flex-shrink: 0; /* 固定高度，不收缩 */
}

.search-input {
  width: 100%;
}

.settings-tabs {
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0; /* 固定高度，不收缩 */
}

.settings-content {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto;
  padding-right: 24px;
  scroll-behavior: smooth;
  min-height: 0; /* 确保滚动条正常工作 */
}

:deep(.el-form-item.highlight) {
  background-color: var(--el-color-primary-light-9);
  border-radius: 4px;
  transition: background-color 0.3s ease-in-out;
  /* 垂直方向的 padding 和 margin 互相抵消，避免布局抖动 */
  padding: 4px 8px;
  margin: -4px -8px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-top: 16px;
  margin-bottom: 16px;
}

.section-title .el-icon {
  color: var(--primary-color);
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  padding-left: 8px;
  line-height: 1.4;
}

.form-hint-inline {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin-left: 12px;
}

.settings-footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.auto-save-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-color-secondary);
  transition: color 0.3s ease;
  min-width: 160px;
  justify-content: flex-start;
}

.auto-save-indicator.success {
  color: var(--el-color-success);
}

.auto-save-indicator.error {
  color: var(--el-color-error);
}

.auto-save-indicator .el-icon {
  font-size: 14px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

:deep(.el-slider) {
  margin-right: 12px;
}

.slider-with-input {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.slider-with-input .slider-part {
  flex: 1;
  margin-right: 0;
}

.slider-with-input .input-part {
  width: 140px;
}

.slider-with-input .input-part :deep(input) {
  text-align: center;
}

.setting-item-content {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: flex-start;
}

.setting-item-content-inline {
  display: flex;
  align-items: center;
}

.setting-item-content > :deep(.full-width) {
  flex: 1;
}

.append-slot {
  flex-shrink: 0;
  margin-top: 2px;
}

:global(.settings-search-popper) {
  width: 60vw !important;
  max-width: 800px;
}

/* 导航标签样式 */
.navigation-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
  border-bottom: none;
}

.navigation-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.navigation-tabs :deep(.el-tabs__item) {
  padding: 8px 16px;
  height: auto;
  line-height: 1.5;
}

.navigation-tabs :deep(.el-tabs__item:hover) {
  color: var(--el-color-primary);
}

.navigation-tabs :deep(.el-tabs__item.is-active) {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary-light-5) 30%, transparent);
  border-radius: 4px 4px 0 0;
}

/* 标签标题样式 */
.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.tab-label .el-icon {
  font-size: 16px;
}

/* Section 高亮动画 */
.settings-section.section-highlight {
  animation: highlightSection 1.5s ease-out;
}
@keyframes highlightSection {
  0% {
    background-color: transparent;
    outline: 0px solid transparent;
  }
  30% {
    background-color: var(--el-color-primary-light-7);
    border-radius: 8px;
    /* 使用 outline 代替 padding/margin 来避免布局抖动 */
    outline: 8px solid var(--el-color-primary-light-7);
    outline-offset: -8px;
  }
  100% {
    background-color: transparent;
    border-radius: 8px;
    outline: 0px solid transparent;
    outline-offset: 0px;
  }
}

/* 为较小屏幕优化 */
@media (max-height: 900px) {
  :global(.chat-settings-dialog) {
    /* 在小屏幕上提供更多空间 */
    --el-dialog-padding-primary: 12px;
  }

  .settings-header {
    padding: 0 8px 12px;
  }

  .settings-tabs {
    padding: 0 8px 12px;
  }

  :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  .settings-section {
    margin-bottom: 20px;
  }
}

@media (max-height: 768px) {
  .section-title {
    font-size: 15px;
    margin-bottom: 12px;
  }

  :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  .form-hint {
    margin-top: 2px;
  }
}

/* 确保对话框内容不溢出 */
:global(.chat-settings-dialog .el-dialog__body) {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
