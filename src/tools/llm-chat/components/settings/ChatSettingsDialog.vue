<template>
  <BaseDialog
    :visible="props.visible"
    @update:visible="(val) => emit('update:visible', val)"
    title="聊天设置"
    width="80vw"
    :close-on-backdrop-click="false"
    @close="handleClosed"
  >
    <template #content>
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
                >
                  <!-- Block layout (default) -->
                  <template v-if="item.layout !== 'inline'">
                    <div class="setting-item-content">
                      <!-- Standard Component -->
                      <component
                        v-if="item.component !== 'SliderWithInput'"
                        :is="resolveComponent(item.component)"
                        :class="getComponentClass(item)"
                        :model-value="get(localSettings, item.modelPath)"
                        @update:model-value="
                          (value: any) => set(localSettings, item.modelPath, value)
                        "
                        v-bind="item.props"
                      >
                        <!-- RadioGroup options -->
                        <template v-if="item.component === 'ElRadioGroup' && item.options">
                          <el-radio
                            v-for="option in item.options"
                            :key="option.value.toString()"
                            :value="option.value"
                          >
                            {{ option.label }}
                          </el-radio>
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
                        @click="handleComponentClick(item.id as string)"
                      >
                        <component :is="item.slots.append" />
                      </div>
                    </div>
                    <div v-if="item.hint" class="form-hint" v-html="renderHint(item.hint)"></div>
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
                        v-bind="item.props"
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
import { ref, watch, nextTick, computed, shallowRef, type Component } from "vue";
import { useDebounceFn } from "@vueuse/core";
import {
  ElMessageBox,
  ElRadio,
  ElSwitch,
  ElSlider,
  ElInputNumber,
  ElInput,
  ElRadioGroup,
} from "element-plus";
import { get, set } from "lodash-es";
import { RefreshLeft, Loading, Search, SuccessFilled, CircleClose } from "@element-plus/icons-vue";

import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { customMessage } from "@/utils/customMessage";
import {
  useChatSettings,
  type ChatSettings,
  DEFAULT_SETTINGS,
} from "../../composables/useChatSettings";
import { createModuleLogger } from "@utils/logger";
import { settingsConfig } from "./settingsConfig";
import type { SettingComponent, SettingItem } from "./settings-types";

const logger = createModuleLogger("ChatSettingsDialog");

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

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      saveStatus.value = "idle";
      await loadLocalSettings();
    }
  },
  { immediate: true }
);

watch(
  () => localSettings.value.shortcuts.send,
  (sendKey) => {
    localSettings.value.shortcuts.newLine = sendKey === "ctrl+enter" ? "enter" : "shift+enter";
  }
);

const autoSave = useDebounceFn(async () => {
  if (isLoadingSettings.value) return;
  try {
    saveStatus.value = "saving";
    await updateSettings(localSettings.value);
    logger.info("设置已自动保存");
    saveStatus.value = "success";
    lastSaveTime.value = new Date().toLocaleTimeString();
  } catch (error) {
    logger.error("自动保存设置失败", error as Error);
    customMessage.error("自动保存设置失败");
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
  // HACK: 类型系统未能正确推断出 flush 方法，使用 any 绕过检查
  (autoSave as any).flush();
  emit("update:visible", false);
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要恢复默认设置吗？", "确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    await resetSettings();
    await loadLocalSettings();
    customMessage.success("已恢复默认设置");
  } catch {
    // User cancelled
  }
};

const handleResetPrompt = () => {
  set(localSettings.value, "topicNaming.prompt", DEFAULT_SETTINGS.topicNaming.prompt);
  customMessage.success("已重置为默认提示词");
};

const handleClosed = () => {
  saveStatus.value = "idle";
};

// --- Config-driven rendering ---
const componentMap: Record<string, Component> = {
  ElSwitch,
  ElSlider,
  ElRadioGroup,
  ElInputNumber,
  ElInput,
  LlmModelSelector,
};

const resolveComponent = (componentName: SettingComponent | Component) => {
  if (typeof componentName === "string") {
    return componentMap[componentName] || componentName;
  }
  return shallowRef(componentName);
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
  if (
    item.component === "ElSlider" ||
    (item.component === "ElInput" && item.props?.type === "textarea") ||
    item.component === "SliderWithInput"
  ) {
    classes.push("full-width");
  }
  return classes;
};

const handleComponentClick = (itemId: string) => {
  if (itemId === "prompt") {
    handleResetPrompt();
  }
};

// --- Search functionality ---
const scrollContainerRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");

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
</script>

<style scoped>
.settings-header {
  padding: 0 8px 16px;
}

.search-input {
  width: 100%;
}

.settings-content {
  max-height: calc(70vh - 60px);
  overflow-y: auto;
  padding-right: 8px;
  scroll-behavior: smooth;
}

:deep(.el-form-item.highlight) {
  background-color: var(--el-color-primary-light-9);
  border-radius: 4px;
  transition: background-color 0.3s ease-in-out;
  padding: 4px 8px;
  margin: -4px -8px 20px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
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
</style>
