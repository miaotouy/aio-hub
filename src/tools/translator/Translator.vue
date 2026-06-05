<template>
  <div class="translator-page">
    <div class="translator-shell">
      <header class="toolbar">
        <!-- 左：预设下拉 -->
        <el-dropdown
          trigger="click"
          placement="bottom-start"
          :disabled="store.isTranslating"
          @command="handlePresetCommand"
        >
          <div>
            <button
              type="button"
              class="preset-trigger"
              :disabled="store.isTranslating"
            >
              <component
                :is="getPresetIcon(store.activePreset?.icon)"
                class="preset-icon"
              />
              <span class="preset-name">{{
                store.activePreset?.name || "未选择"
              }}</span>
              <span class="preset-channel-count">
                · {{ store.activeChannels.length }} 渠道
              </span>
              <ChevronDown class="caret" />
            </button>
          </div>
          <template #dropdown>
            <el-dropdown-menu class="translator-preset-menu">
              <el-dropdown-item
                v-for="preset in store.presets"
                :key="preset.id"
                :command="preset.id"
                :class="{
                  'preset-item-active': preset.id === store.activePresetId,
                }"
              >
                <component :is="getPresetIcon(preset.icon)" class="dd-icon" />
                <span class="dd-name">{{ preset.name }}</span>
                <span class="dd-meta">{{ preset.channels.length }} 渠道</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="__manage__">
                <SlidersHorizontal class="dd-icon" />
                <span class="dd-name">管理预设…</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 中：源语言 ↔ 目标语言 -->
        <div class="lang-row">
          <LanguageSelect
            v-model="store.sourceLang"
            :custom-languages="store.settings.customLanguages"
            :disabled="store.isTranslating"
            :include-auto="true"
            placeholder="源语言"
            @add-custom="store.addCustomLanguage"
          />
          <el-button
            class="icon-button swap"
            :icon="ArrowLeftRight"
            :disabled="store.sourceLang === 'auto' || store.isTranslating"
            @click="store.swapLanguages"
          />
          <LanguageSelect
            v-model="store.targetLang"
            :custom-languages="store.settings.customLanguages"
            :disabled="store.isTranslating"
            :include-auto="false"
            placeholder="目标语言"
            @add-custom="store.addCustomLanguage"
          />
        </div>

        <!-- 右：翻译/停止 + 设置 -->
        <div class="action-row">
          <el-tooltip content="Ctrl + Enter" placement="bottom">
            <div class="translate-action-wrapper">
              <el-button
                v-if="store.isTranslating"
                type="danger"
                class="translate-action"
                :icon="Square"
                @click="store.abortAll"
              >
                停止
              </el-button>
              <el-button
                v-else
                type="primary"
                class="translate-action"
                :icon="Languages"
                :disabled="!canTranslate"
                @click="store.translate"
              >
                {{ store.splitTranslationActive ? "分片翻译" : "翻译" }}
              </el-button>
            </div>
          </el-tooltip>
          <el-tooltip content="翻译设置" placement="bottom">
            <el-button
              class="settings-button"
              :icon="Settings"
              :disabled="store.isTranslating"
              @click="settingsVisible = true"
            />
          </el-tooltip>
        </div>
      </header>

      <main class="workbench">
        <InputPanel />
        <ResultsPanel />
      </main>

      <aside v-if="store.history.length > 0" class="history-strip">
        <button
          v-for="entry in store.history.slice(0, 8)"
          :key="entry.id"
          type="button"
          class="history-item"
          :title="entry.sourceText"
          @click="store.loadHistoryEntry(entry.id)"
        >
          <span class="history-lang">
            <span class="lang-code">{{
              shortLangLabel(entry.sourceLang)
            }}</span>
            <ArrowRight class="lang-arrow" />
            <span class="lang-code">{{
              shortLangLabel(entry.targetLang)
            }}</span>
          </span>
          <span class="history-text">{{ entry.sourceText }}</span>
          <span class="history-count">{{ entry.results.length }}</span>
        </button>
        <button
          type="button"
          class="history-more"
          @click="historyDrawerVisible = true"
        >
          <Clock class="history-more-icon" />
          <span>全部 {{ store.history.length }}</span>
        </button>
      </aside>

      <TranslatorSettingsDialog v-model="settingsVisible" />
      <PresetManagerDialog v-model="presetManagerVisible" />
      <HistoryDrawer v-model="historyDrawerVisible" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Component } from "vue";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Bot,
  Briefcase,
  ChevronDown,
  Clock,
  Code2,
  FileText,
  Globe,
  GraduationCap,
  Languages,
  Mail,
  MessageSquare,
  Newspaper,
  Notebook,
  Pen,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Type,
} from "lucide-vue-next";
import InputPanel from "./components/InputPanel.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import TranslatorSettingsDialog from "./components/TranslatorSettingsDialog.vue";
import PresetManagerDialog from "./components/PresetManagerDialog.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import LanguageSelect from "./components/LanguageSelect.vue";
import { useTranslatorStore } from "./composables/useTranslatorStore";
import { getLanguageLabel } from "./core/languages";
import type { TranslatorLanguageCode } from "./types";

const store = useTranslatorStore();
const settingsVisible = ref(false);
const presetManagerVisible = ref(false);
const historyDrawerVisible = ref(false);

const presetIconMap: Record<string, Component> = {
  Languages,
  BookOpen,
  Code2,
  FileText,
  Globe,
  MessageSquare,
  Briefcase,
  GraduationCap,
  Newspaper,
  Mail,
  Bot,
  Sparkles,
  Type,
  Notebook,
  Pen,
  ScrollText,
};

function getPresetIcon(icon?: string) {
  return presetIconMap[icon || "Languages"] || Languages;
}

const canTranslate = computed(
  () =>
    store.inputText.trim().length > 0 &&
    store.hasConfiguredChannels &&
    !store.isTranslating
);

function handlePresetCommand(command: string) {
  if (command === "__manage__") {
    presetManagerVisible.value = true;
    return;
  }
  store.setActivePreset(command);
}

/**
 * 历史条目语言徽标用的精简 label：
 * - auto → "自动"
 * - 内置/自定义语言 → 取 label 的前 2 个字符
 */
function shortLangLabel(code: TranslatorLanguageCode) {
  if (code === "auto") return "自动";
  const full = getLanguageLabel(code, store.settings.customLanguages);
  return full.slice(0, 2);
}

onMounted(() => {
  store.initialize();
});
</script>

<style scoped>
.translator-page {
  width: 100%;
  height: 100%;
  padding: 6px;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg-color);
}

.translator-shell {
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

/* ===== 顶部一行工具栏：预设 · 语言 · 翻译/设置 ===== */
.toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

/* 预设下拉触发器 */
.preset-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  max-width: 260px;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.preset-trigger:hover:not(:disabled) {
  color: var(--primary-color);
  border-color: color-mix(
    in srgb,
    var(--primary-color) 48%,
    var(--border-color)
  );
}

.preset-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.preset-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.preset-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-channel-count {
  color: var(--text-color-secondary);
  font-weight: 500;
  font-size: 12px;
  flex-shrink: 0;
}

.caret {
  width: 14px;
  height: 14px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
  margin-left: 2px;
}

/* 语言行：源语言 ↔ 目标语言 */
.lang-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 32px minmax(120px, 1fr);
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 560px;
  margin: 0 auto;
}

.lang-row :deep(.el-select) {
  width: 100%;
}

.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  flex-shrink: 0;
}

.icon-button.swap {
  margin: 0 auto;
}

/* 右侧操作区 */
.action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.translate-action-wrapper {
  display: inline-flex;
}

.translate-action {
  height: 34px;
  min-width: 92px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
}

.translate-action :deep(.el-icon) {
  font-size: 15px;
}

.settings-button {
  width: 34px;
  height: 34px;
  padding: 0;
}

.workbench {
  display: grid;
  grid-template-columns: minmax(320px, 36%) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.history-strip {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding: 9px 12px;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.history-item {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  height: 30px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  padding: 0 10px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.history-lang {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}

.lang-code {
  font-feature-settings: "tnum";
}

.lang-arrow {
  width: 10px;
  height: 10px;
  opacity: 0.85;
}

.history-item:hover {
  color: var(--text-color);
  border-color: color-mix(
    in srgb,
    var(--primary-color) 36%,
    var(--border-color)
  );
}

.history-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.history-count {
  flex-shrink: 0;
  color: var(--primary-color);
  font-weight: 700;
}

.history-more {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: var(--card-bg);
  color: var(--text-color);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: border-color 0.15s ease;
}

.history-more:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.history-more-icon {
  width: 14px;
  height: 14px;
}

/* 窄屏 */
@media (max-width: 720px) {
  .translator-shell {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "preset action"
      "lang   lang";
    row-gap: 8px;
  }

  .preset-trigger {
    grid-area: preset;
    max-width: 100%;
  }

  .lang-row {
    grid-area: lang;
    max-width: 100%;
  }

  .action-row {
    grid-area: action;
  }

  .translate-action {
    min-width: 0;
    width: 36px;
    padding: 0;
  }

  .translate-action :deep(span) {
    display: none;
  }
}

@media (max-width: 860px) {
  .translator-page {
    overflow: auto;
  }

  .translator-shell {
    min-height: 100%;
    height: auto;
    overflow: visible;
  }

  .workbench {
    grid-template-columns: 1fr;
    overflow: visible;
  }
}
</style>

<style>
/* 预设下拉菜单：突出激活项 */
.translator-preset-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  font-size: 13px;
}

.translator-preset-menu .dd-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.translator-preset-menu .dd-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.translator-preset-menu .dd-meta {
  flex-shrink: 0;
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 500;
}

.translator-preset-menu .preset-item-active {
  color: var(--primary-color);
  font-weight: 700;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
</style>
