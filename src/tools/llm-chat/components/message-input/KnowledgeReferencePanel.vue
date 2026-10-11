<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { Search } from "lucide-vue-next";
import MessageInputPanelLayout from "./MessageInputPanelLayout.vue";
import { useLlmChatUiState } from "../../composables/ui/useLlmChatUiState";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useChatInputManager } from "../../composables/input/useChatInputManager";
import { normalizeAgentKnowledgeAccess } from "@/tools/knowledge-base/services/access";
import { listKnowledgeForAgent } from "@/tools/knowledge-base/services/application";
import { createKnowledgeReference } from "@/tools/knowledge-base/services/reference";
import type { KnowledgeLibrarySummary } from "@/tools/knowledge-base/types";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const props = defineProps<{ disabled?: boolean }>();

const errorHandler = createModuleErrorHandler("KnowledgeReferencePanel");
const { currentAgentId } = useLlmChatUiState();
const agentStore = useAgentStore();
const inputManager = useChatInputManager();
const loading = ref(false);
const searchText = ref("");
const libraries = ref<KnowledgeLibrarySummary[]>([]);
const loadError = ref("");

const currentAgent = computed(() =>
  currentAgentId.value ? agentStore.getAgentById(currentAgentId.value) : null
);
const access = computed(() =>
  normalizeAgentKnowledgeAccess(currentAgent.value?.knowledgeAccess)
);
const selectedIds = computed(
  () => new Set(inputManager.knowledgeReference.value?.libraryIds || [])
);
const mode = computed(
  () => inputManager.knowledgeReference.value?.mode || "search"
);
function toggleGlobal(val: boolean) {
  if (!currentAgent.value || props.disabled) return;
  if (!currentAgent.value.knowledgeAccess) {
    currentAgent.value.knowledgeAccess = {
      enabled: val,
      allowedLibraryIds: [],
      allowSearchAll: false,
      allowDocumentRead: false,
      allowResearch: false,
    };
  } else {
    currentAgent.value.knowledgeAccess.enabled = val;
  }
  agentStore.persistAgent(currentAgent.value);
}

const allLibraries = computed(() => {
  const byId = new Map(libraries.value.map((item) => [item.id, item]));
  for (const snapshot of inputManager.knowledgeReference.value?.libraries ||
    []) {
    if (!byId.has(snapshot.id)) {
      byId.set(snapshot.id, {
        id: snapshot.id,
        name: snapshot.name,
        documentCount: 0,
        availability: snapshot.availability,
        supportsKeywordSearch: false,
        supportsSemanticSearch: false,
        indexStatus: { keyword: "unavailable", semantic: "unavailable" },
      });
    }
  }
  return Array.from(byId.values());
});

const filteredLibraries = computed(() => {
  const keyword = searchText.value.trim().toLocaleLowerCase();
  if (!keyword) return allLibraries.value;
  return allLibraries.value.filter(
    (library) =>
      library.name.toLocaleLowerCase().includes(keyword) ||
      library.id.toLocaleLowerCase().includes(keyword)
  );
});

function statusText(library: KnowledgeLibrarySummary): string {
  if (library.availability === "deleted") return "已删除";
  if (library.availability === "unavailable") return "不可用";
  if (
    library.indexStatus.keyword !== "ready" &&
    library.indexStatus.semantic !== "ready"
  ) {
    return "索引未就绪";
  }
  const modes = [
    library.indexStatus.keyword === "ready" ? "关键词" : "",
    library.indexStatus.semantic === "ready" ? "语义" : "",
  ].filter(Boolean);
  return modes.join(" + ");
}

function isSelectable(library: KnowledgeLibrarySummary): boolean {
  return (
    library.availability === "available" &&
    (library.indexStatus.keyword === "ready" ||
      library.indexStatus.semantic === "ready")
  );
}

let loadVersion = 0;
onBeforeUnmount(() => {
  loadVersion++;
});
async function loadLibraries(): Promise<void> {
  const version = ++loadVersion;
  const agent = currentAgent.value;
  libraries.value = [];
  loadError.value = "";
  loading.value = false;
  if (!agent || !access.value.enabled) return;
  loading.value = true;
  try {
    const result = await listKnowledgeForAgent({
      agentId: agent.id,
      access: access.value,
    });
    if (version === loadVersion) libraries.value = result;
  } catch (error) {
    if (version !== loadVersion) return;
    loadError.value = error instanceof Error ? error.message : "资料库加载失败";
    errorHandler.handle(error as Error, {
      userMessage: loadError.value,
      showToUser: false,
    });
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function toggleLibrary(library: KnowledgeLibrarySummary): void {
  if (props.disabled || !currentAgent.value || !access.value.enabled) return;
  const selected = selectedIds.value.has(library.id);
  if (!selected && !isSelectable(library)) return;
  const nextIds = new Set(selectedIds.value);
  if (selected) nextIds.delete(library.id);
  else nextIds.add(library.id);
  if (!nextIds.size) {
    inputManager.setKnowledgeReference(null);
    return;
  }
  const nextLibraries = allLibraries.value.filter((item) =>
    nextIds.has(item.id)
  );
  inputManager.setKnowledgeReference(
    createKnowledgeReference(nextLibraries, mode.value)
  );
}

function setMode(nextMode: "search" | "research"): void {
  if (props.disabled || !currentAgent.value || !access.value.enabled) return;
  if (nextMode === "research" && !access.value.allowResearch) return;
  const selected = allLibraries.value.filter((item) =>
    selectedIds.value.has(item.id)
  );
  if (!selected.length) return;
  inputManager.setKnowledgeReference(
    createKnowledgeReference(selected, nextMode)
  );
}

watch(
  [currentAgentId, access],
  () => {
    void loadLibraries();
  },
  { immediate: true }
);
</script>

<template>
  <MessageInputPanelLayout
    class="knowledge-selector"
    data-testid="chat-knowledge-reference-selector"
    aria-label="Knowledge 资料库选择器"
  >
    <template #controls>
      <div class="knowledge-controls">
        <div class="knowledge-access">
          <span>启用知识库</span>
          <el-switch
            :model-value="access.enabled"
            :disabled="props.disabled || !currentAgent"
            aria-label="启用知识库访问"
            @update:model-value="toggleGlobal"
            size="small"
          />
        </div>

        <template v-if="access.enabled">
          <div class="selector-search">
            <Search :size="15" aria-hidden="true" />
            <input
              v-model="searchText"
              type="search"
              data-testid="chat-knowledge-library-filter"
              placeholder="搜索已授权资料库"
              aria-label="搜索已授权资料库"
            />
          </div>

          <div class="mode-switch" role="group" aria-label="Knowledge 查询模式">
            <button
              type="button"
              data-testid="chat-knowledge-mode-search"
              :class="{ active: mode === 'search' }"
              :disabled="props.disabled"
              @click="setMode('search')"
            >
              快速查询
            </button>
            <button
              type="button"
              data-testid="chat-knowledge-mode-research"
              :class="{ active: mode === 'research' }"
              :disabled="props.disabled || !access.allowResearch"
              :title="
                access.allowResearch
                  ? '多轮整理证据'
                  : '当前 Agent 未获研究权限'
              "
              @click="setMode('research')"
            >
              研究任务
            </button>
          </div>
        </template>
      </div>
    </template>
    <template v-if="access.enabled">
      <div class="selector-list" role="listbox" aria-multiselectable="true">
        <div v-if="loading" class="selector-empty">正在加载...</div>
        <div v-else-if="loadError" class="selector-empty is-error">
          {{ loadError }}
        </div>
        <button
          v-for="library in filteredLibraries"
          v-else
          :key="library.id"
          class="library-option"
          data-testid="chat-knowledge-library-option"
          :data-library-id="library.id"
          :class="{
            selected: selectedIds.has(library.id),
            unavailable: !isSelectable(library),
          }"
          :disabled="
            props.disabled ||
            (!isSelectable(library) && !selectedIds.has(library.id))
          "
          role="option"
          :aria-selected="selectedIds.has(library.id)"
          type="button"
          @click="toggleLibrary(library)"
          @keydown.enter.prevent="toggleLibrary(library)"
          @keydown.space.prevent="toggleLibrary(library)"
        >
          <span class="option-check" aria-hidden="true">
            {{ selectedIds.has(library.id) ? "✓" : "" }}
          </span>
          <span class="option-copy">
            <span class="option-name" :title="library.name">
              {{ library.name }}
            </span>
            <span class="option-meta">
              {{ library.documentCount }} 个来源 ·
              {{ statusText(library) }}
            </span>
          </span>
        </button>
        <div
          v-if="!loading && !loadError && filteredLibraries.length === 0"
          class="selector-empty"
        >
          没有匹配的资料库
        </div>
      </div>
    </template>
    <div v-else class="empty-hint">
      <el-empty :image-size="40" description="当前 Agent 未启用知识库访问">
        <el-button
          type="primary"
          size="small"
          :disabled="props.disabled || !currentAgent"
          @click="toggleGlobal(true)"
        >
          立即启用
        </el-button>
      </el-empty>
    </div>
  </MessageInputPanelLayout>
</template>

<style scoped>
.knowledge-access {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.empty-hint {
  padding: 12px 0;
}

.knowledge-controls {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  align-items: center;
  gap: 8px 12px;
}

.selector-search {
  display: flex;
  flex: 1 1 180px;
  min-width: min(100%, 160px);
  height: 28px;
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
}

.selector-search:focus-within {
  border-color: var(--primary-color);
}

.selector-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-color-primary);
  font: inherit;
  font-size: 12px;
  letter-spacing: 0;
}

.selector-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  align-items: start;
  gap: 4px 12px;
}

.mode-switch {
  display: flex;
  flex: none;
  max-width: 100%;
  box-sizing: border-box;
  gap: 4px;
  padding: 3px;
  border-radius: 6px;
  background: var(--input-bg);
}

.mode-switch button {
  min-height: 24px;
  padding: 0 10px;
  white-space: nowrap;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.mode-switch button.active {
  background: var(--card-bg);
  color: var(--text-color-primary);
  box-shadow: var(--box-shadow-sm);
}

.mode-switch button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.library-option {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-primary);
  text-align: left;
  cursor: pointer;
}

.library-option:hover:not(:disabled),
.library-option.selected {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.library-option.unavailable {
  color: var(--text-color-secondary);
}

.library-option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.option-check {
  display: grid;
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  place-items: center;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  color: white;
  font-size: 11px;
}

.library-option.selected .option-check {
  border-color: var(--primary-color);
  background: var(--primary-color);
}

.option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.option-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-meta,
.selector-empty {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.selector-empty {
  grid-column: 1 / -1;
  padding: 18px 8px;
  text-align: center;
}

.selector-empty.is-error {
  color: var(--error-color);
}
</style>
