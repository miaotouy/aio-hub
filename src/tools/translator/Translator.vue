<template>
  <div class="translator-page">
    <div class="translator-shell">
      <header class="preset-bar">
        <div class="preset-tabs">
          <button
            v-for="preset in store.presets"
            :key="preset.id"
            type="button"
            class="preset-tab"
            :class="{ active: preset.id === store.activePresetId }"
            :disabled="store.isTranslating"
            @click="store.setActivePreset(preset.id)"
          >
            <component :is="getPresetIcon(preset.icon)" class="preset-icon" />
            <span>{{ preset.name }}</span>
          </button>
          <el-tooltip content="管理预设" placement="bottom">
            <button
              type="button"
              class="preset-manage-btn"
              :disabled="store.isTranslating"
              @click="presetManagerVisible = true"
            >
              <SlidersHorizontal class="preset-icon" />
            </button>
          </el-tooltip>
        </div>

        <div class="preset-meta">
          <span>{{ store.activeChannels.length }} 渠道</span>
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
import { onMounted, ref } from "vue";
import type { Component } from "vue";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Briefcase,
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
  Type,
} from "lucide-vue-next";
import InputPanel from "./components/InputPanel.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import TranslatorSettingsDialog from "./components/TranslatorSettingsDialog.vue";
import PresetManagerDialog from "./components/PresetManagerDialog.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import { useTranslatorStore } from "./composables/useTranslatorStore";
import { getLanguageLabel } from "./constants";
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

.preset-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.preset-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
}

.preset-tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  min-width: 0;
  border: var(--border-width) solid transparent;
  border-radius: 7px;
  padding: 0 12px;
  background: transparent;
  color: var(--text-color-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.preset-tab:hover:not(:disabled) {
  color: var(--text-color);
  background: var(--input-bg);
}

.preset-tab.active {
  color: var(--primary-color);
  background: var(--input-bg);
  border-color: color-mix(in srgb, var(--primary-color) 48%, transparent);
}

.preset-tab:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.preset-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.preset-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.settings-button {
  width: 30px;
  height: 30px;
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

.preset-manage-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  flex-shrink: 0;
}

.preset-manage-btn:hover:not(:disabled) {
  color: var(--primary-color);
  background: var(--input-bg);
  border-color: color-mix(
    in srgb,
    var(--primary-color) 36%,
    var(--border-color)
  );
}

.preset-manage-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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

@media (max-width: 860px) {
  .translator-page {
    overflow: auto;
  }

  .translator-shell {
    min-height: 100%;
    height: auto;
    overflow: visible;
  }

  .preset-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench {
    grid-template-columns: 1fr;
    overflow: visible;
  }
}
</style>

