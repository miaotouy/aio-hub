<template>
  <BaseDialog
    :model-value="props.visible"
    @update:model-value="(val: any) => emit('update:visible', val)"
    title="聊天设置"
    :width="dialogWidth"
    height="calc(100vh - 100px)"
    :close-on-backdrop-click="false"
    dialog-class="chat-settings-dialog"
    :destroy-on-close="false"
    @close="handleClosed"
  >
    <template #content>
      <div class="settings-container" ref="settingsContainerRef">
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
              v-for="section in mergedSettingsConfig"
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
          <el-form
            :model="localSettings"
            :label-width="formLabelWidth"
            :label-position="formLabelPosition"
          >
            <template v-for="(section, sectionIndex) in mergedSettingsConfig" :key="section.title">
              <div class="settings-section">
                <div class="section-title">
                  <el-icon><component :is="section.icon" /></el-icon>
                  <span>{{ section.title }}</span>
                </div>

                <SettingListRenderer
                  :items="section.items"
                  :settings="localSettings"
                  v-model:active-groups="activeGroupCollapses"
                  :highlighted-item-id="highlightedItemId"
                  @update:settings="handleSettingsUpdate"
                  @action="handleAction"
                />
              </div>
              <el-divider v-if="sectionIndex < mergedSettingsConfig.length - 1" />
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
import { ref, watch, nextTick, computed, onUnmounted } from "vue";
import {
  ElMessageBox,
  ElTabs,
  ElTabPane,
  ElForm,
  ElDivider,
  ElAutocomplete,
  ElButton,
  ElIcon,
} from "element-plus";
import { set, debounce } from "lodash-es";
import { RefreshLeft, Loading, Search, SuccessFilled, CircleClose } from "@element-plus/icons-vue";
import { useElementSize, useWindowSize } from "@vueuse/core";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import BaseDialog from "@/components/common/BaseDialog.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { customMessage } from "@/utils/customMessage";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { type ChatSettings, DEFAULT_SETTINGS } from "../../types/settings";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { settingsConfig } from "./settingsConfig";
import { getPluginSettingsSections } from "../../composables/settings/usePluginSettings";
import type { SettingsSection } from "./settings-types";

const logger = createModuleLogger("ChatSettingsDialog");
const errorHandler = createModuleErrorHandler("ChatSettingsDialog");
const bus = useWindowSyncBus();
// 合并静态配置与插件配置
const mergedSettingsConfig = computed<SettingsSection[]>(() => {
  const staticConfig = settingsConfig;
  const pluginSections = getPluginSettingsSections().value;
  return [...staticConfig, ...pluginSections] as SettingsSection[];
});

// --- 响应式布局 ---
const settingsContainerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(settingsContainerRef);
const { width: windowWidth } = useWindowSize();

const dialogWidth = computed(() => {
  if (windowWidth.value < 860) {
    return "98vw";
  } else if (windowWidth.value < 1400) {
    return "80vw";
  } else {
    return "1200px"; // 大屏固定最大宽度，避免太宽
  }
});

const isCompact = computed(() => containerWidth.value < 600);
const isWide = computed(() => containerWidth.value > 1000);

const formLabelPosition = computed(() => (isCompact.value ? "top" : "left"));
const formLabelWidth = computed(() => {
  if (isCompact.value) return "auto";
  return isWide.value ? "200px" : "140px";
});

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
const activeGroupCollapses = ref<string[]>([]);
const saveStatus = ref<"idle" | "saving" | "success" | "error">("idle");
const lastSaveTime = ref("");
const highlightedItemId = ref("");

const loadLocalSettings = async () => {
  isLoadingSettings.value = true;
  try {
    if (!isLoaded.value) {
      await loadSettings();
    }
    localSettings.value = JSON.parse(JSON.stringify(settings.value));
    logger.info("加载本地设置", { settings: localSettings.value });
  } finally {
    await nextTick();
    isLoadingSettings.value = false;
  }
};

const handleSettingsUpdate = (newSettings: ChatSettings) => {
  localSettings.value = newSettings;
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

// --- Action Handlers ---
const handleSelectFFmpegPath = async () => {
  try {
    const selected = await open({
      multiple: false,
      title: "选择 FFmpeg 可执行文件",
      filters: [
        {
          name: "FFmpeg Executable",
          extensions: ["exe", "bin", "*"], // Windows exe, others
        },
      ],
    });

    if (selected && typeof selected === "string") {
      // 验证路径
      const isValid = await invoke("check_ffmpeg_availability", {
        path: selected,
      });
      if (isValid) {
        set(localSettings.value, "transcription.ffmpegPath", selected);
        customMessage.success("FFmpeg 路径设置成功");
      } else {
        customMessage.error("无效的 FFmpeg 可执行文件，请检查路径");
      }
    }
  } catch (error) {
    errorHandler.error(error as Error, "选择 FFmpeg 路径失败");
  }
};

const actionRegistry: Record<string, () => void> = {
  selectFFmpegPath: handleSelectFFmpegPath,
};

const handleAction = (actionName: string) => {
  if (actionRegistry[actionName]) {
    actionRegistry[actionName]();
  }
};

const handleClosed = () => {
  saveStatus.value = "idle";
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

    setTimeout(() => {
      isClickingTab = false;
    }, 1000);
  }
};

interface SearchIndexItem {
  id: string;
  label: string;
  keywords: string;
  value: string;
}

const renderHint = (hint: string) => {
  return hint.replace(/\{\{ (.*?) \}\}/g, (_, expression) => {
    try {
      // eslint-disable-next-line no-new-func
      return new Function("localSettings", `return ${expression}`)(localSettings.value);
    } catch (e) {
      return `{{ ${expression} }}`;
    }
  });
};

const searchIndex = computed<SearchIndexItem[]>(() =>
  mergedSettingsConfig.value.flatMap((section) =>
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

    // 触发高亮
    highlightedItemId.value = item.id;
    setTimeout(() => {
      highlightedItemId.value = "";
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
      if (mergedSettingsConfig.value.length > 0) {
        activeTab.value = mergedSettingsConfig.value[0].title;
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

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

:deep(.el-slider) {
  margin-right: 12px;
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

  .settings-section {
    margin-bottom: 20px;
  }
}

@media (max-height: 768px) {
  .section-title {
    font-size: 15px;
    margin-bottom: 12px;
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
