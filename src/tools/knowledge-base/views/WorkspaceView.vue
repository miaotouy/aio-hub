<template>
  <main
    v-loading="store.loading"
    class="knowledge-workbench"
    data-testid="knowledge-workspace"
    aria-label="知识资料库"
  >
    <aside class="library-sidebar">
      <header class="sidebar-header">
        <div>
          <h1>知识资料库</h1>
          <span>{{ store.libraries.length }} 个资料库</span>
        </div>
        <el-tooltip content="新建资料库" placement="bottom">
          <el-button
            class="icon-button"
            :icon="Plus"
            circle
            data-testid="knowledge-create-library"
            aria-label="新建资料库"
            @click="creating = !creating"
          />
        </el-tooltip>
      </header>

      <div v-if="store.libraries.length > 6" class="library-filter">
        <el-input
          v-model="libraryFilter"
          clearable
          :prefix-icon="Search"
          data-testid="knowledge-library-filter"
          placeholder="筛选资料库"
        />
      </div>

      <nav class="library-list" aria-label="资料库列表">
        <button
          v-for="library in filteredLibraries"
          :key="library.id"
          type="button"
          class="library-row"
          data-testid="knowledge-library-row"
          :data-library-id="library.id"
          :class="{ active: library.id === store.activeLibraryId }"
          :aria-selected="library.id === store.activeLibraryId"
          @click="store.selectLibrary(library.id)"
        >
          <BookOpenText :size="18" />
          <span class="library-copy">
            <strong>{{ library.name }}</strong>
            <small class="library-description">{{
              library.description || "本地文档资料库"
            }}</small>
            <small
              >{{ library.sourceCount }} 来源 · {{ library.documentCount }} 文档
              · {{ library.chunkCount }} 分块</small
            >
            <small :class="{ 'has-failures': library.failedTaskCount > 0 }">
              摄取
              {{
                library.pendingTaskCount
                  ? `${library.pendingTaskCount} 处理中`
                  : "就绪"
              }}
              · 关键词
              {{ library.keywordIndexStatus === "ready" ? "就绪" : "不完整" }} ·
              语义 {{ semanticStatusLabel(library.semanticIndexStatus) }}
              <template v-if="library.failedTaskCount">
                · {{ library.failedTaskCount }} 失败</template
              >
            </small>
            <small>{{ formatDate(library.updatedAt) }}</small>
          </span>
          <ChevronRight :size="16" />
        </button>
        <div v-if="!filteredLibraries.length" class="sidebar-empty">
          <span>{{
            store.libraries.length ? "没有匹配项" : "暂无资料库"
          }}</span>
        </div>
      </nav>
    </aside>

    <section class="library-content">
      <div v-if="store.libraries.length" class="compact-library-toolbar">
        <el-select
          :model-value="store.activeLibraryId"
          aria-label="当前资料库"
          @change="store.selectLibrary"
        >
          <el-option
            v-for="library in store.libraries"
            :key="library.id"
            :label="library.name"
            :value="library.id"
          />
        </el-select>
        <el-tooltip content="新建资料库" placement="bottom">
          <el-button
            :icon="Plus"
            circle
            data-testid="knowledge-create-library-compact"
            aria-label="新建资料库"
            @click="creating = true"
          />
        </el-tooltip>
      </div>
      <template v-if="store.activeLibrary">
        <header class="content-header">
          <div class="library-heading">
            <div class="library-title">
              <h2>{{ store.activeLibrary.name }}</h2>
              <p>{{ store.activeLibrary.description || "本地文档资料库" }}</p>
            </div>
            <div class="index-summary" aria-label="索引状态">
              <span>{{ store.activeLibrary.documentCount }} 文档</span>
              <span>{{ store.activeLibrary.chunkCount }} 分块</span>
              <span :class="`status-${indexTone}`">{{
                vectorStatusLabel
              }}</span>
            </div>
          </div>
          <div class="header-actions">
            <el-button
              :icon="FileUp"
              :loading="importBusy"
              data-testid="knowledge-import"
              @click="importDocuments"
            >
              {{ importActionLabel }}
            </el-button>
            <el-popover placement="bottom-end" :width="380" trigger="click">
              <template #reference>
                <el-button :icon="CircleHelp">支持格式</el-button>
              </template>
              <div class="format-capabilities">
                <div
                  v-for="format in KNOWLEDGE_FORMAT_CAPABILITIES"
                  :key="format.id"
                  class="format-capability"
                >
                  <span :class="`format-state is-${format.validation}`">
                    {{ formatValidationLabel(format.validation) }}
                  </span>
                  <div>
                    <strong>{{ format.label }}</strong>
                    <small>{{ formatExtensions(format.extensions) }}</small>
                    <p>{{ format.description }}</p>
                  </div>
                </div>
              </div>
            </el-popover>
            <el-button :icon="Binary" @click="vectorDialogVisible = true">
              语义索引
            </el-button>
            <el-tooltip content="更多资料库操作" placement="bottom">
              <div>
                <el-dropdown trigger="click" @command="handleLibraryCommand">
                  <el-button
                    :icon="MoreHorizontal"
                    circle
                    aria-label="更多资料库操作"
                  />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rebuild" :icon="RefreshCw">
                        重建分块索引
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" :icon="Trash2" divided>
                        删除资料库
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
          </div>
        </header>

        <div class="mode-toolbar">
          <el-segmented
            v-model="workspaceMode"
            data-testid="knowledge-workspace-mode"
            :options="modeOptions"
          />
          <span class="mode-context">{{ modeContext }}</span>
        </div>

        <div v-if="importFailures.length" class="import-warning" role="status">
          <AlertTriangle :size="17" />
          <span>
            {{ importFailures.length }}
            个文件未导入。已保留成功项，可重新选择失败文件重试。
          </span>
          <el-popover placement="bottom" :width="440" trigger="click">
            <template #reference>
              <el-button text>查看明细</el-button>
            </template>
            <ul class="import-failure-list">
              <li
                v-for="failure in importFailures"
                :key="`${failure.sourcePath}:${failure.stage}`"
              >
                <div>
                  <strong>{{ failure.fileName }}</strong>
                  <span>{{ importStageLabel(failure.stage) }}</span>
                </div>
                <small :title="failure.sourcePath">{{
                  failure.sourcePath
                }}</small>
                <p>{{ failure.message }}</p>
              </li>
            </ul>
          </el-popover>
          <el-tooltip content="关闭导入提示" placement="bottom">
            <el-button
              :icon="X"
              text
              circle
              aria-label="关闭导入提示"
              @click="importFailures = []"
            />
          </el-tooltip>
        </div>

        <section v-if="workspaceMode === 'documents'" class="workspace-mode">
          <div class="document-toolbar">
            <el-input
              v-model="documentFilter"
              class="filter-input"
              clearable
              :prefix-icon="Search"
              placeholder="按标题、路径或标签筛选文档"
            />
            <span
              >{{ filteredDocuments.length }} /
              {{ store.documents.length }}</span
            >
          </div>

          <div class="master-detail">
            <section class="master-pane" aria-label="文档列表">
              <div v-if="store.documentsLoading" class="skeleton-list">
                <el-skeleton
                  v-for="index in 5"
                  :key="index"
                  :rows="2"
                  animated
                />
              </div>
              <div v-else-if="filteredDocuments.length" class="document-list">
                <button
                  v-for="document in filteredDocuments"
                  :key="document.id"
                  type="button"
                  class="document-row"
                  data-testid="knowledge-document-row"
                  :data-document-title="document.title"
                  :class="{ active: document.id === store.selectedDocumentId }"
                  :aria-selected="document.id === store.selectedDocumentId"
                  @click="openDocument(document.id)"
                >
                  <FileText :size="18" />
                  <div class="document-copy">
                    <strong>{{ document.title }}</strong>
                    <span
                      >{{ document.chunkCount }} 分块 /
                      {{ formatSize(document.size) }}</span
                    >
                    <small :title="document.sourcePath">{{
                      document.sourcePath
                    }}</small>
                    <small v-if="document.tags.length" class="document-tags">
                      {{ document.tags.map((tag) => `#${tag}`).join(" ") }}
                    </small>
                  </div>
                  <ChevronRight :size="16" />
                </button>
              </div>
              <div v-else-if="documentFilter" class="pane-empty">
                <FileText :size="30" />
                <strong>没有匹配文档</strong>
              </div>
              <DropZone
                v-else
                class="knowledge-empty-drop"
                clickable
                click-zone
                variant="border"
                file-only
                multiple
                silent
                allow-unknown-extensions
                :accept="KNOWLEDGE_DROP_ACCEPT"
                :disabled="importBusy"
                @drop="runImportPaths"
                @error="handleDropError"
              >
                <FileUp :size="30" />
                <strong>选择文件</strong>
                <span>{{ KNOWLEDGE_FORMAT_SUMMARY }}</span>
              </DropZone>
            </section>

            <section class="detail-pane" aria-label="文档详情">
              <template v-if="store.selectedDocument">
                <header class="detail-header">
                  <div>
                    <h3>{{ store.selectedDocument.title }}</h3>
                    <p :title="store.selectedDocument.sourcePath">
                      {{ store.selectedDocument.sourcePath }}
                    </p>
                  </div>
                  <div class="detail-actions">
                    <el-tooltip content="在资源管理器中显示" placement="left">
                      <el-button
                        :icon="FolderOpen"
                        text
                        circle
                        aria-label="打开来源位置"
                        @click="
                          openSourcePath(store.selectedDocument.sourcePath)
                        "
                      />
                    </el-tooltip>
                    <el-tooltip content="重建资料库索引" placement="left">
                      <el-button
                        :icon="RefreshCw"
                        text
                        circle
                        aria-label="重建资料库索引"
                        @click="rebuildLibrary"
                      />
                    </el-tooltip>
                    <el-tooltip content="删除文档" placement="left">
                      <el-button
                        class="danger-action"
                        :icon="Trash2"
                        text
                        circle
                        aria-label="删除文档"
                        @click="
                          deleteDocument(
                            store.selectedDocument.id,
                            store.selectedDocument.title
                          )
                        "
                      />
                    </el-tooltip>
                  </div>
                </header>
                <div class="document-meta">
                  <span>{{ store.selectedDocument.mimeType }}</span>
                  <span>{{ formatSize(store.selectedDocument.size) }}</span>
                  <span>版本 {{ store.selectedDocument.version }}</span>
                  <span
                    >向量 {{ store.selectedDocument.vectorizedChunkCount }}/{{
                      store.selectedDocument.chunkCount
                    }}</span
                  >
                  <span>{{
                    formatDate(store.selectedDocument.updatedAt)
                  }}</span>
                </div>
                <div class="document-tag-editor">
                  <Tags :size="16" />
                  <el-select
                    v-model="editingDocumentTags"
                    class="tag-select"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    :reserve-keyword="false"
                    placeholder="添加文档标签"
                    aria-label="文档标签"
                    @keydown.enter.stop
                  />
                  <el-button
                    :icon="Check"
                    :loading="savingDocumentTags"
                    :disabled="!documentTagsChanged"
                    @click="saveDocumentTags"
                  >
                    保存
                  </el-button>
                </div>
                <div class="document-diagnostics">
                  <span
                    >SHA-256
                    <code>{{
                      compactChecksum(store.selectedDocument.sourceChecksum)
                    }}</code></span
                  >
                  <span
                    >Parser
                    <code>{{
                      store.selectedDocument.parserVersion || "legacy"
                    }}</code></span
                  >
                  <span
                    >状态 <code>{{ store.selectedDocument.status }}</code></span
                  >
                </div>
                <div
                  v-if="store.selectedDocument.lastError"
                  class="document-error"
                  role="status"
                >
                  <AlertTriangle :size="16" />
                  <span>{{ store.selectedDocument.lastError }}</span>
                </div>
                <div
                  v-if="store.chunksLoading"
                  class="skeleton-list detail-skeleton"
                >
                  <el-skeleton
                    v-for="index in 4"
                    :key="index"
                    :rows="3"
                    animated
                  />
                </div>
                <div v-else class="chunk-list">
                  <article
                    v-for="chunk in store.chunks"
                    :key="chunk.id"
                    class="chunk-row"
                  >
                    <header>
                      <strong>{{
                        chunk.heading || `分块 ${chunk.chunkIndex + 1}`
                      }}</strong>
                      <code>#{{ chunk.chunkIndex + 1 }}</code>
                    </header>
                    <p>{{ chunk.content }}</p>
                  </article>
                </div>
              </template>
              <div v-else class="pane-empty detail-empty">
                <PanelRight :size="32" />
                <strong>选择文档查看分块</strong>
                <span>这里展示进入检索索引的实际文本。</span>
              </div>
            </section>
          </div>
        </section>

        <section v-else class="workspace-mode search-workspace">
          <form class="search-toolbar" @submit.prevent="runSearch">
            <el-input
              v-model="query"
              class="search-input"
              clearable
              data-testid="knowledge-search-input"
              placeholder="输入问题、术语或文档内容"
              :prefix-icon="Search"
            />
            <el-select
              v-model="searchLibraryIds"
              class="library-scope-select"
              multiple
              collapse-tags
              collapse-tags-tooltip
              aria-label="检索资料库范围"
              placeholder="选择资料库"
            >
              <el-option
                v-for="library in store.libraries"
                :key="library.id"
                :label="library.name"
                :value="library.id"
              />
            </el-select>
            <el-segmented
              v-model="searchRunMode"
              :options="searchRunModeOptions"
              aria-label="检索运行模式"
            />
            <el-select
              v-model="strategy"
              class="strategy-select"
              aria-label="检索策略"
            >
              <el-option label="自动" value="auto" />
              <el-option label="关键词" value="keyword" />
              <el-option
                label="混合"
                value="hybrid"
                :disabled="!semanticAvailable"
              />
              <el-option
                label="语义"
                value="semantic"
                :disabled="!semanticAvailable"
              />
            </el-select>
            <el-button
              type="primary"
              :icon="Search"
              :loading="store.searching"
              data-testid="knowledge-search-submit"
              native-type="submit"
            >
              检索
            </el-button>
          </form>
          <div v-if="!semanticAvailable" class="search-notice">
            当前可使用关键词检索。构建语义索引后可启用混合与语义策略。
          </div>
          <div
            v-if="store.searchTraces.length"
            class="search-traces"
            aria-label="检索策略执行明细"
          >
            <span
              v-for="trace in store.searchTraces"
              :key="`${trace.libraryIds.join(':')}:${trace.actualStrategy}`"
            >
              {{ traceLibraryNames(trace.libraryIds) }} ·
              {{ strategyLabel(trace.requestedStrategy) }} →
              {{ strategyLabel(trace.actualStrategy) }}
              <template v-if="trace.degradationReason">
                · {{ trace.degradationReason }}</template
              >
            </span>
          </div>
          <div
            v-if="comparisonRuns.length"
            class="comparison-runs"
            aria-label="检索策略对比"
          >
            <button
              v-for="run in comparisonRuns"
              :key="run.strategy"
              type="button"
              :class="{ active: strategy === run.strategy }"
              :aria-pressed="strategy === run.strategy"
              @click="selectComparisonRun(run)"
            >
              <strong>{{ strategyLabel(run.strategy) }}</strong>
              <span v-if="run.error">{{ run.error }}</span>
              <template v-else>
                <span>{{ run.results.length }} 结果</span>
                <span
                  >首项
                  {{
                    run.results[0] ? formatScore(run.results[0].score) : "-"
                  }}</span
                >
                <span>{{
                  [
                    ...new Set(
                      run.traces.map((trace) =>
                        strategyLabel(trace.actualStrategy)
                      )
                    ),
                  ].join(" + ")
                }}</span>
              </template>
            </button>
          </div>

          <div class="master-detail search-results-layout">
            <section class="master-pane" aria-label="检索结果">
              <div v-if="store.searching" class="skeleton-list">
                <el-skeleton
                  v-for="index in 5"
                  :key="index"
                  :rows="3"
                  animated
                />
              </div>
              <div v-else-if="store.results.length" class="result-list">
                <button
                  v-for="result in store.results"
                  :key="result.chunkId"
                  type="button"
                  class="result-row"
                  :class="{ active: result.chunkId === store.selectedResultId }"
                  :aria-selected="result.chunkId === store.selectedResultId"
                  @click="store.selectResult(result.chunkId)"
                >
                  <header>
                    <strong
                      >{{ result.libraryName }} · {{ result.title }}</strong
                    >
                    <span>{{ formatScore(result.score) }}</span>
                  </header>
                  <p>{{ result.content }}</p>
                  <footer>
                    <span>{{
                      result.heading || `分块 ${result.chunkIndex + 1}`
                    }}</span>
                    <span>{{ signalSummary(result) }}</span>
                  </footer>
                </button>
              </div>
              <div v-else class="pane-empty">
                <Search :size="30" />
                <strong>{{
                  hasSearched ? "没有找到相关内容" : "检索所选资料库"
                }}</strong>
                <span>{{
                  hasSearched
                    ? "尝试更短的关键词或切换策略。"
                    : "结果会保留来源、分块和命中信号。"
                }}</span>
              </div>
            </section>

            <section class="detail-pane" aria-label="检索结果详情">
              <template v-if="store.selectedResult">
                <header class="detail-header result-detail-header">
                  <div>
                    <h3>{{ store.selectedResult.title }}</h3>
                    <p :title="store.selectedResult.sourcePath">
                      {{ store.selectedResult.sourcePath }}
                    </p>
                  </div>
                  <el-button text :icon="FileText" @click="showResultDocument">
                    查看文档
                  </el-button>
                </header>
                <div class="signal-strip">
                  <span
                    v-for="signal in store.selectedResult.signals"
                    :key="signal.signalType"
                  >
                    {{ signalLabel(signal.signalType) }}
                    {{ formatScore(signal.score) }}
                  </span>
                </div>
                <article class="result-content">
                  <h4>
                    {{
                      store.selectedResult.heading ||
                      `分块 ${store.selectedResult.chunkIndex + 1}`
                    }}
                  </h4>
                  <p>{{ store.selectedResult.content }}</p>
                </article>
              </template>
              <div v-else class="pane-empty detail-empty">
                <PanelRight :size="32" />
                <strong>选择结果查看完整内容</strong>
                <span>命中信号和来源路径会在这里展开。</span>
              </div>
            </section>
          </div>
        </section>

        <DropZone
          v-if="store.documents.length"
          bare
          overlay
          hide-content
          show-overlay-on-drag
          file-only
          multiple
          silent
          allow-unknown-extensions
          :accept="KNOWLEDGE_DROP_ACCEPT"
          :drag-overlay-text="`松开以导入到「${store.activeLibrary.name}」`"
          :disabled="importBusy"
          @drop="runImportPaths"
          @error="handleDropError"
        />
      </template>

      <div v-else class="empty-workspace">
        <BookOpenText :size="40" />
        <h2>建立第一个资料库</h2>
        <p>资料库用于管理可追溯的文档、分块与检索索引。</p>
        <el-button
          type="primary"
          :icon="Plus"
          data-testid="knowledge-create-library-empty"
          @click="creating = true"
          >新建资料库</el-button
        >
      </div>
    </section>

    <BaseDialog
      v-model="creating"
      title="新建资料库"
      width="420px"
      max-width="calc(100vw - 24px)"
      close-on-backdrop-click
      show-close-button
      :loading="creatingLibrary"
      @close="cancelCreate"
    >
      <template #content>
        <form class="create-library-dialog" @submit.prevent="createLibrary">
          <el-input
            v-model="newLibraryName"
            data-testid="knowledge-library-name"
            placeholder="资料库名称"
            maxlength="64"
            autofocus
          />
          <el-input
            v-model="newLibraryDescription"
            type="textarea"
            :rows="3"
            maxlength="160"
            show-word-limit
            placeholder="用途说明，可选"
          />
          <div class="create-actions">
            <el-button @click="cancelCreate">取消</el-button>
            <el-button
              type="primary"
              :loading="creatingLibrary"
              data-testid="knowledge-create-library-submit"
              native-type="submit"
            >
              创建
            </el-button>
          </div>
        </form>
      </template>
    </BaseDialog>

    <KnowledgeVectorDialog
      v-if="store.activeLibrary"
      v-model="vectorDialogVisible"
      :library="store.activeLibrary"
      :status="store.indexStatus"
      @completed="handleVectorCompleted"
      @status-changed="store.refreshIndexStatus"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  Binary,
  BookOpenText,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  FileUp,
  FolderOpen,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DropZone from "@/components/common/DropZone.vue";
import KnowledgeVectorDialog from "../components/KnowledgeVectorDialog.vue";
import {
  KNOWLEDGE_DROP_ACCEPT,
  KNOWLEDGE_FORMAT_CAPABILITIES,
  KNOWLEDGE_FORMAT_SUMMARY,
  type KnowledgeFormatValidation,
} from "../core/formats";
import { importPaths, selectImportPaths } from "../services/importService";
import { processKnowledgeImportQueue } from "../services/ingestQueue";
import { searchKnowledgeDetailed } from "../services/service";
import { useKnowledgeStore } from "../stores/store";
import type {
  KnowledgeImportFailure,
  KnowledgeImportStage,
  KnowledgeResult,
  KnowledgeSearchTrace,
  KnowledgeSearchStrategy,
  KnowledgeSignalType,
} from "../types";

type WorkspaceMode = "documents" | "search";
type SearchRunMode = "single" | "compare";
interface ComparisonRun {
  strategy: KnowledgeSearchStrategy;
  results: KnowledgeResult[];
  traces: KnowledgeSearchTrace[];
  error?: string;
}

const store = useKnowledgeStore();
const errorHandler = createModuleErrorHandler("knowledge-base/view");
const creating = ref(false);
const creatingLibrary = ref(false);
const newLibraryName = ref("");
const newLibraryDescription = ref("");
const libraryFilter = ref("");
const documentFilter = ref("");
const editingDocumentTags = ref<string[]>([]);
const savingDocumentTags = ref(false);
const workspaceMode = ref<WorkspaceMode>("documents");
const query = ref("");
const strategy = ref<KnowledgeSearchStrategy>("auto");
const searchLibraryIds = ref<string[]>([]);
const searchRunMode = ref<SearchRunMode>("single");
const comparisonRuns = ref<ComparisonRun[]>([]);
const hasSearched = ref(false);
const vectorDialogVisible = ref(false);
const preparingImport = ref(false);
const parseProcessed = ref(0);
const parseTotal = ref(0);
const importFailures = ref<KnowledgeImportFailure[]>([]);

const modeOptions = [
  { label: "文档", value: "documents" },
  { label: "检索测试", value: "search" },
];
const searchRunModeOptions = [
  { label: "单次", value: "single" },
  { label: "对比", value: "compare" },
];
const importStageLabels: Record<KnowledgeImportStage, string> = {
  validation: "格式校验",
  read: "读取",
  parse: "解析",
  ingest: "写入",
};
const formatValidationLabels: Record<KnowledgeFormatValidation, string> = {
  verified: "已验证",
  experimental: "实验性",
  unsupported: "不支持",
};

const filteredLibraries = computed(() => {
  const filter = libraryFilter.value.trim().toLocaleLowerCase();
  if (!filter) return store.libraries;
  return store.libraries.filter((library) =>
    `${library.name} ${library.description || ""}`
      .toLocaleLowerCase()
      .includes(filter)
  );
});

const filteredDocuments = computed(() => {
  const filter = documentFilter.value.trim().toLocaleLowerCase();
  if (!filter) return store.documents;
  return store.documents.filter((document) =>
    `${document.title} ${document.sourcePath} ${document.tags.join(" ")}`
      .toLocaleLowerCase()
      .includes(filter)
  );
});

const documentTagsChanged = computed(() => {
  const current = store.selectedDocument?.tags ?? [];
  const normalized = normalizeTags(editingDocumentTags.value);
  return (
    normalized.length !== current.length ||
    normalized.some((tag, index) => tag !== current[index])
  );
});

const semanticAvailable = computed(() => {
  if (!searchLibraryIds.value.length) {
    return (store.indexStatus?.vectorizedChunks ?? 0) > 0;
  }
  return searchLibraryIds.value.every((libraryId) =>
    store.libraries.some(
      (library) =>
        library.id === libraryId && library.semanticIndexStatus !== "notBuilt"
    )
  );
});
const indexTone = computed(() => {
  if (!store.indexStatus?.embeddingModelId) return "keyword";
  return store.indexStatus.pendingChunks > 0 ? "partial" : "ready";
});
const vectorStatusLabel = computed(() => {
  const status = store.indexStatus;
  if (!status?.embeddingModelId) return "关键词索引可用";
  if (status.pendingChunks > 0) {
    return `向量 ${status.vectorizedChunks}/${status.totalChunks}`;
  }
  return `语义索引就绪 / ${status.dimension} 维`;
});
const modeContext = computed(() =>
  workspaceMode.value === "documents"
    ? "管理来源与实际分块"
    : "验证召回结果与命中依据"
);
const importBusy = computed(() => preparingImport.value || store.importing);
const importActionLabel = computed(() => {
  if (preparingImport.value)
    return `解析 ${parseProcessed.value}/${parseTotal.value}`;
  if (store.importing)
    return `写入 ${store.importProcessed}/${store.importTotal}`;
  return "导入文档";
});

onMounted(async () => {
  await store.initialize();
  if (!searchLibraryIds.value.length && store.activeLibraryId) {
    searchLibraryIds.value = [store.activeLibraryId];
  }
});

watch(
  () => store.activeLibraryId,
  () => {
    query.value = "";
    documentFilter.value = "";
    hasSearched.value = false;
    importFailures.value = [];
    if (!semanticAvailable.value && strategy.value !== "keyword") {
      strategy.value = "auto";
    }
  }
);

watch(
  () => store.selectedDocument,
  (document) => {
    editingDocumentTags.value = [...(document?.tags ?? [])];
  },
  { immediate: true }
);

watch(semanticAvailable, (available) => {
  if (
    !available &&
    (strategy.value === "semantic" || strategy.value === "hybrid")
  ) {
    strategy.value = "auto";
  }
});

function cancelCreate() {
  creating.value = false;
  newLibraryName.value = "";
  newLibraryDescription.value = "";
}

async function createLibrary() {
  const name = newLibraryName.value.trim();
  if (!name) {
    customMessage.warning("请输入资料库名称");
    return;
  }
  creatingLibrary.value = true;
  try {
    await store.createLibrary(
      name,
      newLibraryDescription.value.trim() || undefined
    );
    cancelCreate();
    customMessage.success("资料库已创建");
  } catch (error) {
    errorHandler.error(error, "创建资料库失败");
  } finally {
    creatingLibrary.value = false;
  }
}

async function importDocuments() {
  try {
    const paths = await selectImportPaths();
    if (paths.length) await runImportPaths(paths);
  } catch (error) {
    errorHandler.error(error, "选择知识资料失败");
  }
}

async function runImportPaths(paths: string[]) {
  if (importBusy.value) return;
  if (!store.activeLibraryId) {
    customMessage.warning("请先选择资料库");
    return;
  }
  try {
    preparingImport.value = true;
    parseProcessed.value = 0;
    parseTotal.value = paths.length;
    const result = await importPaths(paths, {
      processPaths: (queuedPaths) =>
        processKnowledgeImportQueue(store.activeLibraryId!, queuedPaths, {
          onProgress(processed, total) {
            parseProcessed.value = processed;
            parseTotal.value = total;
          },
        }),
      onProgress(progress) {
        preparingImport.value = true;
        if (progress.phase === "parse") {
          parseProcessed.value = progress.processed;
          parseTotal.value = progress.total;
        }
      },
    });
    await store.refreshLibraries(store.activeLibraryId);
    importFailures.value = result.failures;
    if (result.imported) {
      customMessage.success(`已导入 ${result.imported} 个文档`);
    }
    if (result.skippedDuplicates) {
      customMessage.info(`已跳过 ${result.skippedDuplicates} 个重复路径`);
    }
    if (importFailures.value.length) {
      customMessage.warning(`${importFailures.value.length} 个文件未能导入`);
    }
    for (const warning of result.warnings ?? []) {
      customMessage.warning(warning);
    }
  } catch (error) {
    errorHandler.error(error, "导入知识资料失败");
  } finally {
    preparingImport.value = false;
  }
}

function handleDropError(message: string) {
  customMessage.warning(message);
}

function importStageLabel(stage: KnowledgeImportStage): string {
  return importStageLabels[stage];
}

function formatValidationLabel(validation: KnowledgeFormatValidation): string {
  return formatValidationLabels[validation];
}

function formatExtensions(extensions: readonly string[]): string {
  return extensions.map((extension) => `.${extension}`).join("、");
}

async function openDocument(documentId: string) {
  try {
    await store.selectDocument(documentId);
  } catch (error) {
    errorHandler.error(error, "读取文档分块失败");
  }
}

function handleLibraryCommand(command: string | number | object) {
  if (command === "rebuild") void rebuildLibrary();
  if (command === "delete") void deleteLibrary();
}

async function deleteLibrary() {
  if (!store.activeLibrary) return;
  try {
    await ElMessageBox.confirm(
      `确定删除资料库「${store.activeLibrary.name}」及其全部文档？`,
      "删除资料库",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        lockScroll: false,
      }
    );
    await store.deleteActiveLibrary();
    customMessage.success("资料库已删除");
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    errorHandler.error(error, "删除资料库失败");
  }
}

async function deleteDocument(documentId: string, title: string) {
  try {
    await ElMessageBox.confirm(`确定删除文档「${title}」？`, "删除文档", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      lockScroll: false,
    });
    await store.deleteDocument(documentId);
    customMessage.success("文档已删除");
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    errorHandler.error(error, "删除文档失败");
  }
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function saveDocumentTags() {
  const document = store.selectedDocument;
  if (!document) return;
  savingDocumentTags.value = true;
  try {
    const updated = await store.updateDocumentTags(
      document.id,
      normalizeTags(editingDocumentTags.value)
    );
    editingDocumentTags.value = [...(updated?.tags ?? [])];
    customMessage.success("文档标签已保存");
  } catch (error) {
    errorHandler.error(error, "保存文档标签失败");
  } finally {
    savingDocumentTags.value = false;
  }
}

async function rebuildLibrary() {
  try {
    await ElMessageBox.confirm(
      "重建会重新切分全部文档，并清除现有语义向量。完成后可再次构建语义索引。",
      "重建分块索引",
      {
        type: "warning",
        confirmButtonText: "开始重建",
        cancelButtonText: "取消",
        lockScroll: false,
      }
    );
    const count = await store.rebuild();
    customMessage.success(`已重建 ${count} 个文档`);
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    errorHandler.error(error, "重建资料库失败");
  }
}

async function runSearch() {
  if (!query.value.trim()) {
    customMessage.warning("请输入检索内容");
    return;
  }
  if (!searchLibraryIds.value.length) {
    customMessage.warning("请至少选择一个资料库");
    return;
  }
  hasSearched.value = true;
  comparisonRuns.value = [];
  if (searchRunMode.value === "single") {
    await store.search(query.value, strategy.value, 12, searchLibraryIds.value);
    return;
  }
  const strategies: KnowledgeSearchStrategy[] = semanticAvailable.value
    ? ["keyword", "auto", "hybrid", "semantic"]
    : ["keyword", "auto"];
  store.searching = true;
  try {
    comparisonRuns.value = await Promise.all(
      strategies.map(async (candidate): Promise<ComparisonRun> => {
        try {
          const execution = await searchKnowledgeDetailed({
            query: query.value.trim(),
            libraryIds: searchLibraryIds.value,
            strategy: candidate,
            limit: 12,
            minScore: 0,
          });
          return { strategy: candidate, ...execution };
        } catch (error) {
          return {
            strategy: candidate,
            results: [],
            traces: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );
    const preferred = comparisonRuns.value.find(
      (run) => run.strategy === "auto"
    )!;
    selectComparisonRun(preferred);
  } finally {
    store.searching = false;
  }
}

function selectComparisonRun(run: ComparisonRun) {
  strategy.value = run.strategy;
  store.results = run.results;
  store.searchTraces = run.traces;
  store.selectedResultId = run.results[0]?.chunkId || null;
}

async function showResultDocument() {
  const result = store.selectedResult;
  if (!result) return;
  if (store.activeLibraryId !== result.libraryId) {
    await store.selectLibrary(result.libraryId);
  }
  workspaceMode.value = "documents";
  await openDocument(result.documentId);
}

async function openSourcePath(sourcePath: string) {
  try {
    await revealItemInDir(sourcePath);
  } catch (error) {
    errorHandler.error(error, "打开来源位置失败");
  }
}

function compactChecksum(checksum: string) {
  return checksum ? `${checksum.slice(0, 12)}…${checksum.slice(-8)}` : "-";
}

function semanticStatusLabel(status: "ready" | "partial" | "notBuilt") {
  if (status === "ready") return "就绪";
  if (status === "partial") return "不完整";
  return "未建立";
}

function strategyLabel(value: KnowledgeSearchStrategy) {
  return { auto: "自动", keyword: "关键词", semantic: "语义", hybrid: "混合" }[
    value
  ];
}

function traceLibraryNames(libraryIds: string[]) {
  return libraryIds
    .map(
      (libraryId) =>
        store.libraries.find((library) => library.id === libraryId)?.name ||
        libraryId
    )
    .join("、");
}

async function handleVectorCompleted() {
  await store.refreshLibraries(store.activeLibraryId || undefined);
}

function signalLabel(signalType: KnowledgeSignalType) {
  const labels: Record<KnowledgeSignalType, string> = {
    "knowledge-bm25": "关键词",
    "knowledge-vector": "向量",
    "knowledge-graph": "相邻扩展",
  };
  return labels[signalType];
}

function signalSummary(result: KnowledgeResult) {
  return result.signals
    .map((signal) => signalLabel(signal.signalType))
    .join(" + ");
}

function formatScore(score: number) {
  return Number.isFinite(score) ? score.toFixed(3) : "0.000";
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString();
}
</script>

<style scoped>
.knowledge-workbench {
  display: grid;
  grid-template-columns: minmax(224px, 272px) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--el-text-color-primary);
  background: var(--card-bg);
}

.library-sidebar {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--sidebar-bg);
}

.compact-library-toolbar {
  display: none;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.compact-library-toolbar :deep(.el-select) {
  min-width: 0;
  flex: 1;
}

.sidebar-header,
.content-header,
.detail-header,
.mode-toolbar,
.document-toolbar,
.import-warning,
.result-row header,
.result-row footer,
.chunk-row header,
.document-meta,
.document-tag-editor,
.signal-strip {
  display: flex;
  align-items: center;
}

.sidebar-header,
.content-header,
.detail-header,
.result-row header,
.result-row footer,
.chunk-row header {
  justify-content: space-between;
}

.sidebar-header {
  min-height: 68px;
  padding: 12px 14px 12px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.sidebar-header h1,
.content-header h2,
.detail-header h3,
.empty-workspace h2,
.result-content h4 {
  margin: 0;
  letter-spacing: 0;
}

.sidebar-header h1 {
  font-size: 17px;
  line-height: 24px;
}

.sidebar-header span,
.mode-context,
.document-toolbar > span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.create-library-dialog {
  display: grid;
  gap: 12px;
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.library-filter {
  padding: 8px 10px 0;
}

.library-list {
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.library-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 16px;
  width: 100%;
  min-height: 88px;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.library-row:hover,
.document-row:hover,
.result-row:hover {
  background: var(--el-fill-color-light);
}

.library-row.active,
.document-row.active,
.result-row.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.library-copy,
.document-copy,
.library-title,
.library-heading,
.detail-header > div {
  min-width: 0;
}

.library-copy,
.document-copy {
  display: flex;
  flex-direction: column;
}

.library-copy strong,
.document-copy strong,
.library-copy small,
.document-copy span,
.document-copy small,
.detail-header p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-copy strong,
.document-copy strong {
  font-size: 14px;
  line-height: 20px;
}

.library-copy small,
.document-copy span,
.document-copy small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.document-tags {
  color: var(--el-color-primary) !important;
}

.library-row:focus-visible,
.document-row:focus-visible,
.result-row:focus-visible,
.comparison-runs button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.library-description {
  color: var(--el-text-color-regular) !important;
}

.has-failures {
  color: var(--el-color-danger) !important;
}

.sidebar-empty,
.pane-empty,
.empty-workspace {
  display: grid;
  place-items: center;
  align-content: center;
  color: var(--el-text-color-secondary);
}

.sidebar-empty {
  min-height: 96px;
  font-size: 12px;
}

.library-content {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.content-header {
  min-height: 76px;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.library-heading {
  display: grid;
  gap: 7px;
}

.library-title h2 {
  overflow: hidden;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-title p,
.detail-header p {
  margin: 2px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.index-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.status-keyword {
  color: var(--el-text-color-regular);
}

.status-partial {
  color: var(--el-color-warning);
}

.status-ready {
  color: var(--el-color-success);
}

.header-actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.danger-action:hover {
  color: var(--el-color-danger);
}

.mode-toolbar {
  min-height: 48px;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--input-bg);
}

.import-warning {
  gap: 8px;
  min-height: 40px;
  padding: 6px 14px 6px 18px;
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  background: var(--el-color-warning-light-9);
}

.import-warning span {
  flex: 1;
}

.format-capabilities {
  display: grid;
  gap: 10px;
  max-height: min(520px, 70vh);
  overflow: auto;
}

.format-capability {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}

.format-capability > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.format-capability strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.format-capability small,
.format-capability p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.format-state {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 11px;
}

.format-state.is-verified {
  color: var(--el-color-success-dark-2);
  background: var(--el-color-success-light-9);
}

.format-state.is-experimental {
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}

.format-state.is-unsupported {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.import-failure-list {
  display: grid;
  gap: 10px;
  max-height: min(420px, 60vh);
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.import-failure-list li {
  display: grid;
  gap: 3px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.import-failure-list li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.import-failure-list li > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.import-failure-list strong {
  min-width: 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-failure-list span,
.import-failure-list small,
.import-failure-list p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.workspace-mode {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.document-toolbar {
  min-height: 48px;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.filter-input {
  width: min(420px, 100%);
}

.master-detail {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(300px, 0.42fr) minmax(360px, 0.58fr);
}

.master-pane,
.detail-pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.master-pane {
  border-right: 1px solid var(--el-border-color-light);
}

.document-list,
.result-list,
.chunk-list {
  min-height: 100%;
}

.document-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 16px;
  width: 100%;
  min-height: 76px;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 18px;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.detail-header {
  min-height: 64px;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-header h3 {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-meta,
.document-diagnostics,
.signal-strip {
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 38px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background: var(--input-bg);
}

.document-tag-editor {
  gap: 10px;
  min-height: 48px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--input-bg);
}

.tag-select {
  min-width: 0;
  flex: 1;
}

.chunk-row {
  padding: 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.chunk-row header {
  gap: 12px;
}

.chunk-row strong,
.result-content h4 {
  font-size: 13px;
}

.chunk-row code {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.chunk-row p,
.result-content p {
  margin: 8px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pane-empty {
  min-height: 100%;
  gap: 9px;
  padding: 28px;
  text-align: center;
}

.pane-empty strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.pane-empty span {
  max-width: 320px;
  font-size: 12px;
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  flex: none;
  gap: 2px;
}

.document-diagnostics {
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 36px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.document-diagnostics code {
  color: var(--el-text-color-regular);
}

.document-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  color: var(--el-color-danger);
  font-size: 12px;
  background: var(--el-color-danger-light-9);
}

.knowledge-empty-drop {
  display: grid;
  min-height: 100%;
  align-content: center;
  justify-items: center;
  gap: 9px;
  padding: 28px;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
  text-align: center;
  cursor: pointer;
}

.knowledge-empty-drop:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.knowledge-empty-drop strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.knowledge-empty-drop span {
  max-width: 280px;
  font-size: 12px;
  line-height: 1.6;
}

.skeleton-list {
  display: grid;
  gap: 20px;
  padding: 18px;
}

.search-toolbar {
  display: grid;
  grid-template-columns:
    minmax(180px, 1fr) minmax(150px, 220px)
    auto 112px auto;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.library-scope-select {
  width: 100%;
}

.search-traces {
  display: grid;
  gap: 4px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  background: var(--input-bg);
}

.comparison-runs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--border-color);
}

.comparison-runs button {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 9px 12px;
  border: 0;
  color: var(--el-text-color-secondary);
  text-align: left;
  background: var(--input-bg);
  cursor: pointer;
}

.comparison-runs button:hover,
.comparison-runs button.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.comparison-runs strong,
.comparison-runs span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comparison-runs strong {
  font-size: 12px;
}

.comparison-runs span {
  font-size: 11px;
}

.strategy-select {
  width: 112px;
}

.search-notice {
  padding: 7px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background: var(--el-color-info-light-9);
}

.result-row {
  display: grid;
  width: 100%;
  gap: 8px;
  padding: 13px 16px 14px 18px;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.result-row header,
.result-row footer {
  min-width: 0;
  gap: 12px;
}

.result-row header strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row header span,
.result-row footer {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.result-row p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.result-detail-header :deep(.el-button) {
  flex: none;
}

.result-content {
  padding: 18px;
}

.empty-workspace {
  flex: 1;
  gap: 10px;
  padding: 24px;
}

.empty-workspace h2 {
  color: var(--el-text-color-primary);
  font-size: 18px;
}

.empty-workspace p {
  max-width: 360px;
  margin: 0 0 4px;
  font-size: 13px;
  text-align: center;
}

@container knowledge-shell (max-width: 980px) {
  .knowledge-workbench {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .master-detail {
    grid-template-columns: minmax(260px, 0.46fr) minmax(300px, 0.54fr);
  }

  .search-toolbar {
    grid-template-columns: minmax(180px, 1fr) minmax(150px, 220px) auto;
  }

  .search-toolbar > :deep(.el-button) {
    grid-column: -2 / -1;
  }
}

@container knowledge-shell (max-width: 760px) {
  .knowledge-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .library-sidebar {
    display: none;
  }

  .compact-library-toolbar {
    display: flex;
  }

  .content-header {
    align-items: flex-start;
  }

  .mode-context,
  .index-summary {
    display: none;
  }

  .master-detail {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(200px, 0.45fr) minmax(240px, 0.55fr);
  }

  .comparison-runs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .master-pane {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }
}

@container knowledge-shell (max-width: 520px) {
  .content-header {
    min-height: auto;
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .header-actions :deep(.el-button) {
    width: 100%;
    margin: 0;
  }

  .search-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }

  .search-toolbar > :deep(.el-button) {
    grid-column: auto;
  }

  .strategy-select {
    width: 100%;
  }
}
</style>
