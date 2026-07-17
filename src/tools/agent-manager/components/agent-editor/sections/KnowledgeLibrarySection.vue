<template>
  <div class="agent-section knowledge-domain" data-setting-id="knowledge">
    <div class="section-header">
      <div>
        <div class="section-title">资料库 (Knowledge)</div>
        <div class="section-subtitle">
          {{ knowledgeMacro }} · {{ knowledgeListMacro }}
        </div>
      </div>
      <el-switch v-model="editForm.knowledgeConfig.enabled" />
    </div>

    <template v-if="editForm.knowledgeConfig.enabled">
      <div class="domain-settings">
        <el-form-item label="默认策略">
          <el-select v-model="editForm.knowledgeSettings.defaultStrategy">
            <el-option label="自动" value="auto" />
            <el-option label="关键词" value="keyword" />
            <el-option label="语义" value="semantic" />
            <el-option label="混合" value="hybrid" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认上限">
          <el-input-number
            v-model="editForm.knowledgeSettings.defaultLimit"
            :min="1"
            :max="50"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="来源引用">
          <el-switch v-model="editForm.knowledgeSettings.defaultCitation" />
        </el-form-item>
        <el-form-item label="保底注入">
          <el-switch
            v-model="editForm.knowledgeConfig.autoInjectIfMacroMissing"
          />
        </el-form-item>
      </div>

      <div class="binding-box">
        <header class="binding-header">
          <div>
            <strong>已关联资料库</strong>
            <el-tag size="small" type="info">
              {{ editForm.knowledgeConfig.bindings.length }}
            </el-tag>
          </div>
          <el-popover
            v-model:visible="showSelector"
            placement="bottom-end"
            :width="320"
            trigger="click"
          >
            <template #reference>
              <el-button type="primary" link :icon="Plus">添加资料库</el-button>
            </template>
            <div class="library-options">
              <button
                v-for="library in availableLibraries"
                :key="library.id"
                type="button"
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

        <div v-if="bindings.length" class="binding-list">
          <article v-for="binding in bindings" :key="binding.libraryId">
            <div class="binding-identity">
              <BookOpenText :size="18" />
              <div>
                <strong>{{ binding.libraryName }}</strong>
                <code>{{ binding.libraryId }}</code>
              </div>
            </div>
            <el-select
              v-model="binding.strategy"
              size="small"
              aria-label="检索策略"
            >
              <el-option label="跟随默认" :value="undefined" />
              <el-option label="自动" value="auto" />
              <el-option label="关键词" value="keyword" />
              <el-option label="语义" value="semantic" />
              <el-option label="混合" value="hybrid" />
            </el-select>
            <el-input-number
              v-model="binding.limit"
              size="small"
              :min="1"
              :max="50"
              placeholder="默认"
              controls-position="right"
              aria-label="召回上限"
            />
            <el-switch v-model="binding.enabled" aria-label="启用资料库" />
            <el-tooltip content="移除绑定" placement="left">
              <el-button
                :icon="Trash2"
                text
                circle
                aria-label="移除绑定"
                @click="removeLibrary(binding.libraryId)"
              />
            </el-tooltip>
          </article>
        </div>
        <el-empty v-else description="尚未关联资料库" :image-size="52" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { BookOpenText, Plus, Trash2 } from "lucide-vue-next";
import { useKnowledgeStore } from "@/tools/knowledge-base/store";
import type { KnowledgeBinding } from "@/tools/agent-manager/types/agent";
import type { KnowledgeLibrary } from "@/tools/knowledge-base/types";

const editForm = inject<any>("agent-edit-form");
const store = useKnowledgeStore();
const showSelector = ref(false);
const knowledgeMacro = "{{knowledge}}";
const knowledgeListMacro = "{{knowledge_list}}";

if (!editForm.knowledgeConfig) {
  editForm.knowledgeConfig = {
    enabled: false,
    bindings: [],
    groups: [],
    autoInjectIfMacroMissing: true,
    autoInjectPosition: "context_head",
  };
}
if (!editForm.knowledgeSettings) {
  editForm.knowledgeSettings = {
    defaultStrategy: "auto",
    defaultLimit: 8,
    defaultMinScore: 0,
    maxRecallChars: 0,
    defaultCitation: true,
    emptyText: "（未检索到相关资料）",
  };
}

const bindings = computed<KnowledgeBinding[]>(
  () => editForm.knowledgeConfig.bindings
);
const availableLibraries = computed(() => {
  const existing = new Set(bindings.value.map((binding) => binding.libraryId));
  return store.libraries.filter((library) => !existing.has(library.id));
});

function addLibrary(library: KnowledgeLibrary) {
  bindings.value.push({
    libraryId: library.id,
    libraryName: library.name,
    enabled: true,
    strategy: "auto",
    citation: true,
  });
  showSelector.value = false;
}

function removeLibrary(libraryId: string) {
  const index = bindings.value.findIndex(
    (binding) => binding.libraryId === libraryId
  );
  if (index >= 0) bindings.value.splice(index, 1);
}

onMounted(() => {
  if (!store.libraries.length) void store.initialize();
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
  grid-template-columns: repeat(4, minmax(120px, 1fr));
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
  grid-template-columns: minmax(180px, 1fr) 128px 112px 40px 32px;
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
    grid-template-columns: minmax(160px, 1fr) 120px 40px 32px;
  }

  .binding-list :deep(.el-input-number) {
    display: none;
  }
}
</style>
