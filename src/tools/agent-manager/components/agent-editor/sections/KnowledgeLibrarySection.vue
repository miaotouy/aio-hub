<template>
  <div class="agent-section knowledge-domain" data-setting-id="knowledge">
    <div class="section-header">
      <div>
        <div class="section-title">资料库 (Knowledge)</div>
        <div class="section-subtitle">
          {{ knowledgeListMacro }} 只在预设放置位置列出授权目录
        </div>
      </div>
      <el-switch
        v-model="editForm.knowledgeAccess.enabled"
        data-testid="agent-knowledge-enabled"
        aria-label="启用 Knowledge 资料访问权限"
      />
    </div>

    <template v-if="editForm.knowledgeAccess.enabled">
      <div class="domain-settings">
        <el-form-item label="允许省略资料库范围">
          <el-switch
            v-model="editForm.knowledgeAccess.allowSearchAll"
            data-testid="agent-knowledge-search-all"
            aria-label="允许全库搜索"
          />
        </el-form-item>
        <el-form-item label="允许继续读取文档">
          <el-switch
            v-model="editForm.knowledgeAccess.allowDocumentRead"
            data-testid="agent-knowledge-document-read"
            aria-label="允许继续读取文档"
          />
        </el-form-item>
        <el-form-item label="允许高成本研究任务">
          <el-switch
            v-model="editForm.knowledgeAccess.allowResearch"
            data-testid="agent-knowledge-research"
            aria-label="允许研究任务"
          />
        </el-form-item>
      </div>

      <div class="binding-box">
        <header class="binding-header">
          <div>
            <strong>已授权资料库</strong>
            <el-tag size="small" type="info">
              {{ allowedLibraryIds.length }}
            </el-tag>
          </div>
          <el-popover
            v-model:visible="showSelector"
            placement="bottom-end"
            :width="320"
            trigger="click"
          >
            <template #reference>
              <el-button
                type="primary"
                link
                :icon="Plus"
                data-testid="agent-knowledge-add-library"
                aria-label="添加资料库授权"
              >添加资料库</el-button>
            </template>
            <div class="library-options">
              <el-input
                v-model="librarySearch"
                :prefix-icon="Search"
                placeholder="搜索资料库"
                clearable
                size="small"
              />
              <button
                v-for="library in availableLibraries"
                :key="library.id"
                type="button"
                data-testid="agent-knowledge-library-option"
                :data-library-id="library.id"
                @click="addLibrary(library)"
              >
                <span>{{ library.name }}</span>
                <small>{{ library.documentCount }} 文档</small>
              </button>
              <el-empty
                v-if="availableLibraries.length === 0"
                description="没有可添加的资料库"
                :image-size="44"
              />
            </div>
          </el-popover>
        </header>

        <div v-if="authorizedLibraries.length" class="binding-list">
          <article
            v-for="library in authorizedLibraries"
            :key="library.id"
            data-testid="agent-knowledge-authorized-library"
            :data-library-id="library.id"
          >
            <div class="binding-identity">
              <BookOpenText :size="18" />
              <div>
                <strong>{{ library.name }}</strong>
                <code>{{ library.id }}</code>
              </div>
            </div>
            <el-tag
              size="small"
              :type="
                library.availability === 'available' ? 'success' : 'danger'
              "
            >
              {{
                library.availability === "available"
                  ? `${library.documentCount} 个来源`
                  : library.availability === "deleted"
                    ? "已删除"
                    : "暂时不可用"
              }}
            </el-tag>
            <el-tooltip content="撤销授权" placement="left">
              <div>
                <el-button
                  :icon="Trash2"
                  text
                  circle
                  aria-label="撤销资料库授权"
                  @click="removeLibrary(library.id)"
                />
              </div>
            </el-tooltip>
          </article>
        </div>
        <el-empty v-else description="尚未授权资料库" :image-size="52" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { BookOpenText, Plus, Search, Trash2 } from "lucide-vue-next";
import {
  DEFAULT_AGENT_KNOWLEDGE_ACCESS,
  normalizeAgentKnowledgeAccess,
  resolveAuthorizedKnowledgeLibraries,
} from "@/tools/knowledge-base/services/access";
import { useKnowledgeStore } from "@/tools/knowledge-base/stores/store";
import type { KnowledgeLibrary } from "@/tools/knowledge-base/types";

const editForm = inject<any>("agent-edit-form");
const store = useKnowledgeStore();
const showSelector = ref(false);
const librarySearch = ref("");
const knowledgeListMacro = "{{knowledge_list}}";

editForm.knowledgeAccess = normalizeAgentKnowledgeAccess(
  editForm.knowledgeAccess ?? DEFAULT_AGENT_KNOWLEDGE_ACCESS
);

const allowedLibraryIds = computed<string[]>(
  () => editForm.knowledgeAccess.allowedLibraryIds
);
const authorizedLibraries = computed(() => {
  return resolveAuthorizedKnowledgeLibraries(
    editForm.knowledgeAccess,
    store.libraries,
    { unavailable: Boolean(store.initializationError) }
  );
});
const availableLibraries = computed(() => {
  const existing = new Set(allowedLibraryIds.value);
  const query = librarySearch.value.trim().toLowerCase();
  return store.libraries.filter(
    (library) =>
      !existing.has(library.id) &&
      (!query ||
        library.name.toLowerCase().includes(query) ||
        library.id.toLowerCase().includes(query))
  );
});

function addLibrary(library: KnowledgeLibrary) {
  allowedLibraryIds.value.push(library.id);
  librarySearch.value = "";
  showSelector.value = false;
}

function removeLibrary(libraryId: string) {
  const index = allowedLibraryIds.value.indexOf(libraryId);
  if (index >= 0) allowedLibraryIds.value.splice(index, 1);
}

onMounted(() => {
  if (!store.libraries.length) {
    void store.initialize();
  }
});
</script>

<style scoped>
.knowledge-domain {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--el-border-color-light);
}

.section-header,
.binding-header,
.binding-header > div,
.binding-identity {
  display: flex;
  align-items: center;
}

.section-header,
.binding-header {
  justify-content: space-between;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
}

.section-subtitle {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
  font-size: 12px;
}

.domain-settings {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.domain-settings :deep(.el-form-item) {
  margin-bottom: 0;
}

.binding-box {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}

.binding-header {
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--input-bg);
}

.binding-header > div {
  gap: 8px;
}

.binding-list article {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto 32px;
  min-height: 64px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.binding-list article:last-child {
  border-bottom: 0;
}

.binding-identity {
  min-width: 0;
  gap: 9px;
}

.binding-identity > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.binding-identity strong,
.binding-identity code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-identity strong {
  font-size: 13px;
}

.binding-identity code {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.library-options {
  max-height: 260px;
  overflow: auto;
}

.library-options button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.library-options button:hover {
  background: var(--el-fill-color-light);
}

.library-options small {
  color: var(--el-text-color-secondary);
}

@media (max-width: 1000px) {
  .domain-settings {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }

  .binding-list article {
    grid-template-columns: minmax(160px, 1fr) auto 32px;
  }
}
</style>
