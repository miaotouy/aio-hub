<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Search, BookOpen, ExternalLink, Settings } from "lucide-vue-next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { WebSearchItem } from "@/llm-apis/adapters/deepseek/tools";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { useWebDistilleryStore } from "../../stores/store";
import { fetchSearchResult, searchWeb } from "../../service";

const store = useWebDistilleryStore();
const { profiles, isLoaded } = useLlmProfiles();
const errorHandler = createModuleErrorHandler("web-distillery/search");
const query = ref("");
const count = ref(10);
const needContent = ref(false);
const results = ref<WebSearchItem[]>([]);
const selectedIndex = ref(0);
const selected = computed(() => results.value[selectedIndex.value]);
const loading = ref(false);
const reading = ref(false);
const hasSearched = ref(false);
const error = ref("");
const profile = computed(() =>
  profiles.value.find(
    (item) =>
      item.id === store.config.deepseek.profileId &&
      item.type === "deepseek" &&
      item.enabled
  )
);
let searchController: AbortController | undefined;
let readController: AbortController | undefined;

function sourceName(item: WebSearchItem) {
  return item.siteName || new URL(item.url).hostname;
}

async function runSearch() {
  if (loading.value) return;
  searchController = new AbortController();
  const controller = searchController;
  loading.value = true;
  error.value = "";
  try {
    const response = await searchWeb({
      query: query.value,
      count: count.value,
      needContent: needContent.value,
      signal: controller.signal,
    });
    results.value = response.results;
    selectedIndex.value = 0;
    hasSearched.value = true;
  } catch (cause) {
    if (controller.signal.aborted) return;
    error.value =
      cause instanceof Error ? cause.message : "搜索失败，请稍后重试";
    errorHandler.handle(cause, { showToUser: false });
  } finally {
    loading.value = false;
  }
}

async function readSelected() {
  const item = selected.value;
  if (!item || reading.value) return;
  reading.value = true;
  error.value = "";
  readController = new AbortController();
  const controller = readController;
  try {
    const page = await fetchSearchResult(item, controller.signal);
    store.setResult(page);
    store.setUrl(item.url);
    store.activeTab = "workbench";
  } catch (cause) {
    if (controller.signal.aborted) return;
    error.value = cause instanceof Error ? cause.message : "网页正文提取失败";
    errorHandler.handle(cause, { showToUser: false });
  } finally {
    reading.value = false;
  }
}

async function openSource() {
  if (!selected.value) return;
  try {
    await openUrl(selected.value.url);
  } catch (cause) {
    errorHandler.handle(cause, { userMessage: "打开来源失败" });
  }
}

onUnmounted(() => {
  searchController?.abort();
  readController?.abort();
});
</script>

<template>
  <section class="search-workbench" aria-label="网页搜索工作区">
    <form class="search-toolbar" @submit.prevent="runSearch">
      <el-input
        v-model="query"
        aria-label="搜索词"
        placeholder="搜索网页，支持 site:、lang:、after:"
        :disabled="loading"
        clearable
      />
      <el-input-number
        v-model="count"
        aria-label="结果数量"
        :min="1"
        :max="50"
        :precision="0"
        :disabled="loading"
        controls-position="right"
      />
      <el-checkbox v-model="needContent" :disabled="loading"
        >附带正文</el-checkbox
      >
      <el-button
        type="primary"
        :icon="Search"
        native-type="submit"
        :loading="loading"
        :disabled="!isLoaded || !profile || !query.trim()"
        >搜索</el-button
      >
      <el-button v-if="loading" @click="searchController?.abort()"
        >取消</el-button
      >
    </form>
    <div class="connection-bar">
      <span>{{
        profile ? `DeepSeek · ${profile.name}` : "请先选择 DeepSeek 渠道"
      }}</span>
      <span class="billing-note">搜索与抓取按调用次数计费</span>
      <el-button text :icon="Settings" @click="store.activeTab = 'settings'"
        >配置渠道</el-button
      >
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="search-panels">
      <aside class="results-panel" aria-label="搜索结果">
        <header class="panel-heading">
          搜索结果 <span v-if="hasSearched">{{ results.length }} 条</span>
        </header>
        <div v-if="loading" class="inline-state" role="status">
          正在搜索网页…
        </div>
        <div v-else-if="!results.length" class="inline-state">
          {{
            hasSearched
              ? "没有找到匹配网页，可以调整关键词或搜索条件。"
              : "输入关键词后，来源列表会显示在这里。"
          }}
        </div>
        <button
          v-for="(item, index) in results"
          :key="item.url + index"
          class="result-item"
          :class="{ selected: selectedIndex === index }"
          :aria-pressed="selectedIndex === index"
          @click="selectedIndex = index"
        >
          <strong>{{ item.title || item.url }}</strong>
          <span class="result-origin"
            >{{ sourceName(item)
            }}<template v-if="item.date">
              · {{ new Date(item.date).toLocaleDateString() }}</template
            ></span
          >
          <span class="result-snippet">{{ item.snippet || item.summary }}</span>
        </button>
      </aside>
      <main class="reading-panel" aria-label="来源预览">
        <header class="preview-toolbar">
          <span class="preview-title">{{ selected?.title || "来源预览" }}</span>
          <el-button
            :icon="ExternalLink"
            :disabled="!selected"
            @click="openSource"
            >打开来源</el-button
          >
          <el-button
            type="primary"
            :icon="BookOpen"
            :disabled="!selected || loading"
            :loading="reading"
            @click="readSelected"
            >{{ selected?.content ? "查看正文" : "提取正文" }}</el-button
          >
        </header>
        <div v-if="selected" class="preview-body">
          <div class="source-url">{{ selected.url }}</div>
          <RichTextRenderer
            :content="selected.content || selected.summary || selected.snippet"
            :version="RendererVersion.V1_MARKDOWN_IT"
            :enable-enter-animation="false"
          />
        </div>
        <div v-else class="inline-state">
          选择左侧来源，阅读摘要或提取完整正文。
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.search-workbench {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  background: var(--container-bg);
}
.search-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
}
.search-toolbar > .el-input {
  flex: 1;
  min-width: 240px;
}
.search-toolbar > .el-input-number {
  width: 100px;
}
.connection-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 16px;
  font-size: 12px;
  color: var(--text-color-light);
  flex-wrap: wrap;
}
.billing-note {
  margin-left: auto;
}
.search-panels {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(250px, 34%) minmax(0, 1fr);
  border-top: var(--border-width) solid var(--border-color);
}
.results-panel {
  min-height: 0;
  overflow: auto;
  border-right: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}
.panel-heading {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 13px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.result-item {
  width: 100%;
  text-align: left;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-color);
  background: transparent;
  border: 0;
  border-bottom: var(--border-width) solid var(--border-color);
  cursor: pointer;
  font: inherit;
}
.result-item:hover,
.result-item.selected {
  background: var(--el-color-primary-light-9);
}
.result-item.selected {
  box-shadow: inset 3px 0 var(--el-color-primary);
}
.result-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.result-item strong {
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.result-origin,
.result-snippet {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-light);
  overflow-wrap: anywhere;
}
.result-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.reading-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
}
.preview-title {
  flex: 1;
  min-width: 100px;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.preview-body {
  padding: 20px 24px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.source-url {
  font-size: 12px;
  margin-bottom: 16px;
  color: var(--text-color-light);
  overflow-wrap: anywhere;
}
.inline-state {
  padding: 24px 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-color-light);
}
@media (max-width: 800px) {
  .search-panels {
    grid-template-columns: minmax(200px, 40%) minmax(0, 1fr);
  }
  .billing-note {
    margin-left: 0;
  }
}
</style>
