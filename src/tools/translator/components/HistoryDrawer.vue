<template>
  <BaseDialog
    v-model="dialogVisible"
    title="翻译历史"
    width="880px"
    height="80vh"
    close-on-backdrop-click
    show-close-button
  >
    <div class="history-drawer">
      <!-- 工具条 -->
      <div class="toolbar">
        <el-input
          v-model="search"
          class="search-input"
          placeholder="搜索原文 / 译文"
          clearable
          :prefix-icon="Search"
        />
        <el-select
          v-model="filterPreset"
          class="filter-select"
          placeholder="全部预设"
          teleported
        >
          <el-option label="全部预设" value="" />
          <el-option
            v-for="preset in store.presets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          />
        </el-select>
        <span class="count-badge">
          {{ filteredCount }} / {{ store.history.length }}
        </span>
        <el-button
          type="danger"
          plain
          :icon="Trash2"
          :disabled="store.history.length === 0"
          @click="handleClearAll"
        >
          清空全部
        </el-button>
      </div>

      <!-- 列表 -->
      <div v-if="store.history.length === 0" class="empty-state">
        <Clock class="empty-icon" />
        <p>还没有翻译记录</p>
      </div>
      <div v-else-if="groupedHistory.length === 0" class="empty-state">
        <SearchX class="empty-icon" />
        <p>没有匹配的记录</p>
      </div>
      <div v-else class="history-groups">
        <section
          v-for="group in groupedHistory"
          :key="group.label"
          class="history-group"
        >
          <header class="group-header">{{ group.label }}</header>
          <div class="group-items">
            <article
              v-for="entry in group.items"
              :key="entry.id"
              class="history-entry"
            >
              <header class="entry-header">
                <div class="entry-meta">
                  <component
                    :is="getPresetIcon(getPresetById(entry.presetId)?.icon)"
                    class="entry-icon"
                  />
                  <span class="entry-time">
                    {{ formatTime(entry.timestamp) }}
                  </span>
                  <span class="entry-tag">
                    {{ getLanguageLabel(entry.sourceLang) }}
                    →
                    {{ getLanguageLabel(entry.targetLang) }}
                  </span>
                  <span class="entry-tag muted">
                    {{ getPresetById(entry.presetId)?.name || "未知预设" }}
                  </span>
                  <span class="entry-tag muted">
                    {{ entry.results.length }} 渠道
                  </span>
                </div>
                <div class="entry-actions">
                  <el-tooltip content="加载到输入区" placement="top">
                    <el-button
                      class="icon-button"
                      :icon="ArrowLeft"
                      @click="handleLoad(entry.id)"
                    />
                  </el-tooltip>
                  <el-tooltip content="重新翻译" placement="top">
                    <el-button
                      class="icon-button"
                      :icon="RotateCw"
                      :disabled="store.isTranslating"
                      @click="handleRetranslate(entry.id)"
                    />
                  </el-tooltip>
                  <el-tooltip content="删除此条" placement="top">
                    <el-button
                      class="icon-button danger"
                      :icon="Trash2"
                      @click="handleDelete(entry.id)"
                    />
                  </el-tooltip>
                </div>
              </header>

              <div class="entry-body">
                <div class="entry-source">
                  <span class="body-label">原文</span>
                  <p class="entry-text">{{ entry.sourceText }}</p>
                </div>
                <div v-if="firstCompletedResult(entry)" class="entry-target">
                  <span class="body-label">
                    译文 · {{ firstCompletedResult(entry)?.channelName }}
                  </span>
                  <p class="entry-text">
                    {{ firstCompletedResult(entry)?.content }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <span class="footer-tip"> 历史最多保留 30 条 · 仅本地存储 </span>
      <el-button type="primary" @click="dialogVisible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Component } from "vue";
import { ElMessageBox } from "element-plus";
import {
  ArrowLeft,
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
  RotateCw,
  ScrollText,
  Search,
  SearchX,
  Sparkles,
  Trash2,
  Type,
} from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { useTranslatorStore } from "../composables/useTranslatorStore";
import { TRANSLATOR_LANGUAGES } from "../constants";
import type {
  TranslationHistoryEntry,
  TranslationResult,
  TranslatorLanguageCode,
} from "../types";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useTranslatorStore();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const search = ref("");
const filterPreset = ref("");

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      // 打开时不清空过滤，但首次打开时不带条件
      // 保留用户上次的搜索词体验更连贯，所以不重置
    }
  }
);

const PRESET_ICON_MAP: Record<string, Component> = {
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
  return PRESET_ICON_MAP[icon || "Languages"] || Languages;
}

function getPresetById(id: string) {
  return store.presets.find((preset) => preset.id === id);
}

function getLanguageLabel(code: TranslatorLanguageCode) {
  return (
    TRANSLATOR_LANGUAGES.find((lang) => lang.value === code)?.label || code
  );
}

function firstCompletedResult(
  entry: TranslationHistoryEntry
): TranslationResult | undefined {
  return (
    entry.results.find(
      (result) => result.status === "completed" && result.content
    ) || entry.results.find((result) => result.content)
  );
}

const filteredEntries = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return store.history.filter((entry) => {
    if (filterPreset.value && entry.presetId !== filterPreset.value) {
      return false;
    }
    if (!keyword) return true;
    if (entry.sourceText.toLowerCase().includes(keyword)) return true;
    return entry.results.some((result) =>
      result.content?.toLowerCase().includes(keyword)
    );
  });
});

const filteredCount = computed(() => filteredEntries.value.length);

interface HistoryGroup {
  label: string;
  items: TranslationHistoryEntry[];
}

const groupedHistory = computed<HistoryGroup[]>(() => {
  const groups = new Map<string, TranslationHistoryEntry[]>();
  for (const entry of filteredEntries.value) {
    const label = getGroupLabel(entry.timestamp);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
});

function getGroupLabel(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "今天";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "昨天";

  const diff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return "本周";
  if (diff < 30) return "本月";
  return "更早";
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function handleLoad(entryId: string) {
  store.loadHistoryEntry(entryId);
  customMessage.success("已加载到输入区");
  dialogVisible.value = false;
}

async function handleRetranslate(entryId: string) {
  store.loadHistoryEntry(entryId);
  dialogVisible.value = false;
  // 让 dialog 关闭动画走完再发起翻译，避免视觉抖动
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await store.translate();
}

function handleDelete(entryId: string) {
  store.deleteHistoryEntry(entryId);
}

async function handleClearAll() {
  try {
    await ElMessageBox.confirm(
      "确定要清空全部翻译历史吗？此操作无法撤销。",
      "清空历史",
      {
        confirmButtonText: "清空",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.clearHistory();
    customMessage.success("翻译历史已清空");
  } catch {
    /* user cancelled */
  }
}
</script>

<style scoped>
.history-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 14px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px auto auto;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.count-badge {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 0 10px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-secondary);
}

.empty-icon {
  width: 42px;
  height: 42px;
  opacity: 0.65;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.history-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 2px;
}

.history-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 0 4px;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: var(--container-bg);
  text-transform: uppercase;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 9px;
  background: var(--input-bg);
  transition: border-color 0.15s ease;
}

.history-entry:hover {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 36%,
    var(--border-color)
  );
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
}

.entry-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.entry-time {
  color: var(--text-color);
  font-size: 12px;
  font-weight: 600;
}

.entry-tag {
  padding: 2px 7px;
  border-radius: 9px;
  background: var(--card-bg);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  border: var(--border-width) solid var(--border-color);
}

.entry-tag.muted {
  opacity: 0.85;
}

.entry-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.icon-button {
  width: 28px;
  height: 28px;
  padding: 0;
}

.icon-button.danger {
  color: var(--el-color-danger);
}

.entry-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.entry-source,
.entry-target {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.body-label {
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
}

.entry-text {
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  line-clamp: 4;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  white-space: pre-wrap;
}

.footer-tip {
  flex: 1;
  color: var(--text-color-secondary);
  font-size: 12px;
  text-align: left;
}

@media (max-width: 720px) {
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .entry-body {
    grid-template-columns: 1fr;
  }
}
</style>
