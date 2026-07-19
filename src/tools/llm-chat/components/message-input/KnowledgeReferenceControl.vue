<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BookOpenCheck, Search } from "lucide-vue-next";
import { useLlmChatUiState } from "../../composables/ui/useLlmChatUiState";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useChatInputManager } from "../../composables/input/useChatInputManager";
import { normalizeAgentKnowledgeAccess } from "@/tools/knowledge-base/access";
import { listKnowledgeForAgent } from "@/tools/knowledge-base/application";
import { createKnowledgeReference } from "@/tools/knowledge-base/reference";
import type { KnowledgeLibrarySummary } from "@/tools/knowledge-base/types";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const props = defineProps<{ disabled?: boolean; isDetached?: boolean }>();

const errorHandler = createModuleErrorHandler("KnowledgeReferenceControl");
const { currentAgentId } = useLlmChatUiState();
const agentStore = useAgentStore();
const inputManager = useChatInputManager();
const visible = ref(false);
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
const canOpen = computed(
  () => !props.disabled && Boolean(currentAgent.value && access.value.enabled)
);
const tooltipText = computed(() => {
  if (!currentAgent.value) return "请先选择 Agent";
  if (!access.value.enabled) return "当前 Agent 未启用 Knowledge 资料访问";
  return "引用 Knowledge 资料库";
});

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

async function loadLibraries(): Promise<void> {
  const agent = currentAgent.value;
  if (!agent || !access.value.enabled) {
    libraries.value = [];
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    libraries.value = await listKnowledgeForAgent({
      agentId: agent.id,
      access: access.value,
    });
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "资料库加载失败";
    errorHandler.handle(error as Error, {
      userMessage: loadError.value,
      showToUser: false,
    });
  } finally {
    loading.value = false;
  }
}

function toggleLibrary(library: KnowledgeLibrarySummary): void {
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
  inputManager.setKnowledgeReference(createKnowledgeReference(nextLibraries, mode.value));
}

function setMode(nextMode: "search" | "research"): void {
  if (nextMode === "research" && !access.value.allowResearch) return;
  const selected = allLibraries.value.filter((item) => selectedIds.value.has(item.id));
  if (!selected.length) return;
  inputManager.setKnowledgeReference(createKnowledgeReference(selected, nextMode));
}

watch(visible, (isVisible) => {
  if (isVisible) void loadLibraries();
});
watch(currentAgentId, () => {
  libraries.value = [];
  loadError.value = "";
  if (visible.value) void loadLibraries();
});
</script>

<template>
  <el-tooltip :content="tooltipText" placement="top" :show-after="500">
    <div class="knowledge-control-wrapper">
      <el-popover
        v-model:visible="visible"
        placement="bottom-start"
        :width="340"
        trigger="click"
        :disabled="!canOpen"
        :popper-class="[
          'knowledge-reference-popover',
          { 'detached-popover': props.isDetached },
        ]"
      >
        <template #reference>
          <button
            class="knowledge-button"
            :class="{ active: selectedIds.size > 0 || visible }"
            :disabled="!canOpen"
            data-testid="chat-knowledge-reference-button"
            aria-label="选择 Knowledge 资料库"
            type="button"
          >
            <BookOpenCheck :size="16" />
            <span v-if="selectedIds.size" class="selection-count">
              {{ selectedIds.size }}
            </span>
          </button>
        </template>

        <div
          class="knowledge-selector"
          data-testid="chat-knowledge-reference-selector"
          aria-label="Knowledge 资料库选择器"
        >
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
              :class="{ active: mode === 'search' }"
              @click="setMode('search')"
            >
              快速查询
            </button>
            <button
              type="button"
              :class="{ active: mode === 'research' }"
              :disabled="!access.allowResearch"
              :title="access.allowResearch ? '多轮整理证据' : '当前 Agent 未获研究权限'"
              @click="setMode('research')"
            >
              研究任务
            </button>
          </div>

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
              :class="{
                selected: selectedIds.has(library.id),
                unavailable: !isSelectable(library),
              }"
              :disabled="!isSelectable(library) && !selectedIds.has(library.id)"
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
                  {{ library.documentCount }} 个来源 · {{ statusText(library) }}
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
        </div>
      </el-popover>
    </div>
  </el-tooltip>
</template>

<style scoped>
.knowledge-control-wrapper {
  display: flex;
}

.knowledge-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.knowledge-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--text-color-primary);
}

.knowledge-button.active {
  color: var(--primary-color);
}

.knowledge-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.selection-count {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  font-size: 9px;
  line-height: 12px;
}

.knowledge-selector {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.selector-search {
  display: flex;
  height: 34px;
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
  letter-spacing: 0;
}

.selector-list {
  display: flex;
  max-height: 300px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: 6px;
  background: var(--input-bg);
}

.mode-switch button {
  min-height: 28px;
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
  padding: 18px 8px;
  text-align: center;
}

.selector-empty.is-error {
  color: var(--error-color);
}
</style>
