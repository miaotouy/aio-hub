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
import { computed, nextTick, ref, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import {
  mediaGeneratorSettingsConfig,
  DEFAULT_MEDIA_GENERATOR_SETTINGS,
} from "../config";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import AgentIntegrationSettings from "./AgentIntegrationSettings.vue";
import type { AgentIntegrationConfig, MediaGeneratorSettings } from "../types";
import type { SettingItem } from "@/types/settings-renderer";
import { Bot, RotateCcw, Search } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const store = useMediaGenStore();
const logger = createModuleLogger("media-generator/settings");
const scrollContainerRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");
const searchPopoverVisible = ref(false);
const activeSectionTitle = ref(mediaGeneratorSettingsConfig[0]?.title || "");
const highlightedItemId = ref("");
const activeGroupCollapses = ref<string[]>([]);
const activeCollapse = ref([
  ...mediaGeneratorSettingsConfig.map((s) => s.title),
  "Agent 集成",
]);

const normalizeText = (text?: string) => (text || "").toLowerCase().trim();

const stripTemplate = (text: string) =>
  text.replace(/\{\{\s*(.*?)\s*\}\}/g, "$1");

const visibleItems = (items: SettingItem<MediaGeneratorSettings>[]) =>
  items.filter((item) => !item.visible || item.visible(store.settings));

const itemMatchesSearch = (
  item: SettingItem<MediaGeneratorSettings>,
  sectionTitle: string,
  query: string
) => {
  const searchableText = [
    sectionTitle,
    stripTemplate(item.label),
    item.hint,
    item.keywords,
    item.modelPath,
    item.id,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
};

const normalizedSearchQuery = computed(() => normalizeText(searchQuery.value));

const agentSearchText =
  "agent 集成 integration 模型 model 黑名单 blacklist 白名单 whitelist 快速 fast profile 优先级";

const displayedNavigationSections = computed(() => [
  ...mediaGeneratorSettingsConfig.map((section) => ({
    title: section.title,
    icon: section.icon,
  })),
  {
    title: "Agent 集成",
    icon: Bot,
  },
]);

interface SearchResultItem {
  id: string;
  label: string;
  sectionTitle: string;
  hint?: string;
  groupName?: string;
  isSectionOnly?: boolean;
}

const searchResults = computed<SearchResultItem[]>(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return [];

  const settingsResults: SearchResultItem[] =
    mediaGeneratorSettingsConfig.flatMap((section) => {
      const sectionMatches = normalizeText(section.title).includes(query);

      return visibleItems(section.items)
        .filter(
          (item) =>
            sectionMatches || itemMatchesSearch(item, section.title, query)
        )
        .map((item) => ({
          id: item.id,
          label: stripTemplate(item.label),
          sectionTitle: section.title,
          hint: item.hint,
          groupName: item.groupCollapsible?.name,
        }));
    });

  if (agentSearchText.toLowerCase().includes(query)) {
    settingsResults.push({
      id: "__agentIntegration",
      label: "Agent 集成",
      sectionTitle: "Agent 集成",
      hint: "配置媒体生成工具对 Agent 的可见模型、优先级和参数说明",
      isSectionOnly: true,
    });
  }

  return settingsResults;
});

const searchResultCount = computed(() => searchResults.value.length);

const addUnique = (target: string[], values: string[]) => [
  ...new Set([...target, ...values]),
];

const findSectionElement = (sectionTitle: string) => {
  if (!scrollContainerRef.value) return null;
  const sections = scrollContainerRef.value.querySelectorAll<HTMLElement>(
    "[data-settings-section-title]"
  );
  return (
    Array.from(sections).find(
      (section) => section.dataset.settingsSectionTitle === sectionTitle
    ) || null
  );
};

const flashSection = (sectionTitle: string) => {
  const section = findSectionElement(sectionTitle);
  if (!section) return;
  section.classList.add("section-highlight");
  window.setTimeout(() => {
    section.classList.remove("section-highlight");
  }, 1200);
};

const scrollToSection = async (sectionTitle: string) => {
  activeCollapse.value = addUnique(activeCollapse.value, [sectionTitle]);
  activeSectionTitle.value = sectionTitle;
  await nextTick();

  const section = findSectionElement(sectionTitle);
  if (!section) return;

  section.scrollIntoView({ behavior: "smooth", block: "start" });
  flashSection(sectionTitle);
};

const findSettingElement = (settingId: string) => {
  if (!scrollContainerRef.value) return null;
  const settingElements =
    scrollContainerRef.value.querySelectorAll<HTMLElement>("[data-setting-id]");
  return (
    Array.from(settingElements).find(
      (element) => element.dataset.settingId === settingId
    ) || null
  );
};

const scrollToSearchResult = async (result: SearchResultItem) => {
  activeCollapse.value = addUnique(activeCollapse.value, [result.sectionTitle]);
  activeSectionTitle.value = result.sectionTitle;

  if (result.groupName) {
    activeGroupCollapses.value = addUnique(activeGroupCollapses.value, [
      result.groupName,
    ]);
  }

  await nextTick();

  if (result.isSectionOnly) {
    const section = findSectionElement(result.sectionTitle);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    flashSection(result.sectionTitle);
  } else {
    const settingElement = findSettingElement(result.id);
    settingElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightedItemId.value = result.id;
    window.setTimeout(() => {
      highlightedItemId.value = "";
    }, 1500);
  }

  searchPopoverVisible.value = false;
};

const updateActiveSectionFromScroll = () => {
  if (!scrollContainerRef.value) return;

  const containerTop = scrollContainerRef.value.getBoundingClientRect().top;
  const sections = Array.from(
    scrollContainerRef.value.querySelectorAll<HTMLElement>(
      "[data-settings-section-title]"
    )
  );

  let closestSectionTitle = "";
  let closestDistance = Number.POSITIVE_INFINITY;

  sections.forEach((section) => {
    const distance = Math.abs(
      section.getBoundingClientRect().top - containerTop - 24
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSectionTitle = section.dataset.settingsSectionTitle || "";
    }
  });

  if (closestSectionTitle) activeSectionTitle.value = closestSectionTitle;
};

const handleUpdate = (newSettings: any) => {
  store.settings = newSettings;
};

const handleAgentConfigUpdate = (agentConfig: AgentIntegrationConfig) => {
  store.settings = {
    ...store.settings,
    agentConfig,
  };
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要将所有生成设置重置为默认值吗？此操作不可撤销。",
      "重置确认",
      {
        confirmButtonText: "确定重置",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.settings = JSON.parse(
      JSON.stringify(DEFAULT_MEDIA_GENERATOR_SETTINGS)
    );
    customMessage.success("设置已重置为默认值");
    logger.info("用户重置了全局设置");
  } catch {
    // 用户取消
  }
};

watch(
  normalizedSearchQuery,
  async (query) => {
    if (!query) {
      highlightedItemId.value = "";
      searchPopoverVisible.value = false;
      await nextTick();
      updateActiveSectionFromScroll();
      return;
    }

    await nextTick();
    searchPopoverVisible.value = true;
  },
  { flush: "post" }
);
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="media-settings"
    @scroll="updateActiveSectionFromScroll"
  >
    <div class="settings-shell">
      <aside v-if="displayedNavigationSections.length > 0" class="settings-nav">
        <div class="nav-title">章节</div>
        <button
          v-for="section in displayedNavigationSections"
          :key="section.title"
          type="button"
          class="nav-item"
          :class="{ active: activeSectionTitle === section.title }"
          @click="scrollToSection(section.title)"
        >
          <el-icon><component :is="section.icon" /></el-icon>
          <span class="nav-label">{{ section.title }}</span>
        </button>
      </aside>

      <el-form
        :model="store.settings"
        label-position="top"
        class="settings-form"
      >
        <div class="settings-header">
          <div class="header-info">
            <h3 class="header-title">媒体生成配置</h3>
            <p class="header-desc">
              配置媒体生成器的默认行为、并发任务及通知偏好
            </p>
          </div>
          <el-button
            :icon="RotateCcw"
            @click="handleReset"
            plain
            type="danger"
            size="small"
          >
            一键重置
          </el-button>
        </div>

        <el-popover
          v-model:visible="searchPopoverVisible"
          placement="bottom-start"
          trigger="click"
          width="520"
          popper-class="media-settings-search-popper"
        >
          <template #reference>
            <div class="settings-search">
              <el-input
                v-model="searchQuery"
                :prefix-icon="Search"
                clearable
                placeholder="搜索设置项、关键词或说明"
                @focus="searchPopoverVisible = Boolean(normalizedSearchQuery)"
              />
              <span v-if="normalizedSearchQuery" class="search-count">
                {{ searchResultCount }} 个匹配
              </span>
            </div>
          </template>

          <div class="search-results-popover">
            <template v-if="searchResults.length > 0">
              <button
                v-for="result in searchResults"
                :key="result.id"
                type="button"
                class="search-result-item"
                @click="scrollToSearchResult(result)"
              >
                <span class="result-main">
                  <span class="result-label">{{ result.label }}</span>
                  <span class="result-section">{{ result.sectionTitle }}</span>
                </span>
                <span v-if="result.hint" class="result-hint">
                  {{ result.hint }}
                </span>
              </button>
            </template>
            <div v-else class="search-empty">没有找到匹配的设置项</div>
          </div>
        </el-popover>

        <el-collapse v-model="activeCollapse">
          <el-collapse-item
            v-for="section in mediaGeneratorSettingsConfig"
            :key="section.title"
            :name="section.title"
            class="settings-section"
            :data-settings-section-title="section.title"
          >
            <template #title>
              <div class="collapse-title">
                <el-icon><component :is="section.icon" /></el-icon>
                <span>{{ section.title }}</span>
              </div>
            </template>
            <div class="section-content">
              <SettingListRenderer
                :items="section.items"
                :settings="store.settings"
                v-model:active-groups="activeGroupCollapses"
                :highlighted-item-id="highlightedItemId"
                @update:settings="handleUpdate"
              />
            </div>
          </el-collapse-item>

          <el-collapse-item
            name="Agent 集成"
            class="settings-section"
            data-settings-section-title="Agent 集成"
          >
            <template #title>
              <div class="collapse-title">
                <el-icon><Bot /></el-icon>
                <span>Agent 集成</span>
              </div>
            </template>
            <div class="section-content">
              <AgentIntegrationSettings
                :config="store.settings.agentConfig"
                @update="handleAgentConfigUpdate"
              />
            </div>
          </el-collapse-item>
        </el-collapse>

        <div class="settings-footer">
          <div class="placeholder-text">
            更多生成预设和全局参数配置正在开发中...
          </div>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.media-settings {
  height: 100%;
  overflow-y: auto;
  background-color: transparent;
  box-sizing: border-box;
}

.settings-shell {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 48px;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  box-sizing: border-box;
}

.settings-nav {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.nav-title {
  padding: 0 8px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.nav-item {
  appearance: none;
  border: none;
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.nav-item:hover,
.nav-item.active {
  color: var(--el-color-primary);
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 10%,
    transparent
  );
}

.nav-item .el-icon {
  flex: 0 0 auto;
}

.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.settings-form {
  max-width: 800px;
  width: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  margin-bottom: 8px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
}

.settings-search :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
}

.search-count {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:global(.media-settings-search-popper) {
  max-width: min(520px, calc(100vw - 48px));
}

.search-results-popover {
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-result-item {
  appearance: none;
  border: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  text-align: left;
}

.search-result-item:hover {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 10%,
    transparent
  );
}

.result-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.result-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.result-section {
  flex: 0 0 auto;
  color: var(--el-color-primary);
  font-size: 12px;
}

.result-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.search-empty {
  padding: 18px 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}

.section-content {
  padding: 12px 8px;
}

.settings-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed var(--border-color);
  display: flex;
  justify-content: center;
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
  font-size: 12px;
  opacity: 0.6;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-collapse) {
  border: none;
}

:deep(.el-collapse-item__header) {
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: transparent;
}

:deep(.el-collapse-item__wrap) {
  background-color: transparent;
  border-bottom: none;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

.settings-section.section-highlight {
  animation: highlightSection 1.2s ease-out;
}

@keyframes highlightSection {
  0% {
    background-color: transparent;
    outline: 0 solid transparent;
  }
  28% {
    background-color: color-mix(
      in srgb,
      var(--el-color-primary) 12%,
      transparent
    );
    outline: 6px solid
      color-mix(in srgb, var(--el-color-primary) 18%, transparent);
    outline-offset: -6px;
  }
  100% {
    background-color: transparent;
    outline: 0 solid transparent;
  }
}

@media (max-width: 960px) {
  .settings-shell {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 16px;
  }

  .settings-nav {
    position: static;
    max-height: none;
    flex-direction: row;
    overflow-x: auto;
  }

  .nav-title {
    display: none;
  }

  .nav-item {
    width: auto;
    flex: 0 0 auto;
  }
}
</style>
