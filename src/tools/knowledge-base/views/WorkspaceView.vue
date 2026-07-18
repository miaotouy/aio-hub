<template>
  <main
    v-loading="store.loading"
    class="knowledge-workbench"
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
            aria-label="新建资料库"
            @click="creating = !creating"
          />
        </el-tooltip>
      </header>

      <form
        v-if="creating"
        class="create-library"
        @submit.prevent="createLibrary"
      >
        <el-input
          v-model="newLibraryName"
          placeholder="资料库名称"
          maxlength="64"
          autofocus
        />
        <el-input
          v-model="newLibraryDescription"
          type="textarea"
          :rows="2"
          maxlength="160"
          show-word-limit
          placeholder="用途说明，可选"
        />
        <div class="create-actions">
          <el-button size="small" @click="cancelCreate">取消</el-button>
          <el-button
            type="primary"
            size="small"
            :loading="creatingLibrary"
            native-type="submit"
          >
            创建
          </el-button>
        </div>
      </form>

      <div v-if="store.libraries.length > 6" class="library-filter">
        <el-input
          v-model="libraryFilter"
          clearable
          :prefix-icon="Search"
          placeholder="筛选资料库"
        />
      </div>

      <nav class="library-list" aria-label="资料库列表">
        <button
          v-for="library in filteredLibraries"
          :key="library.id"
          type="button"
          class="library-row"
          :class="{ active: library.id === store.activeLibraryId }"
          @click="store.selectLibrary(library.id)"
        >
          <BookOpenText :size="18" />
          <span class="library-copy">
            <strong>{{ library.name }}</strong>
            <small
              >{{ library.documentCount }} 文档 /
              {{ library.chunkCount }} 分块</small
            >
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
        </header>

        <div class="mode-toolbar">
          <el-segmented v-model="workspaceMode" :options="modeOptions" />
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
                <small :title="failure.sourcePath">{{ failure.sourcePath }}</small>
                <p>{{ failure.message }}</p>
              </li>
            </ul>
          </el-popover>
          <el-button
            :icon="X"
            text
            circle
            aria-label="关闭提示"
            @click="importFailures = []"
          />
        </div>

        <section v-if="workspaceMode === 'documents'" class="workspace-mode">
          <div class="document-toolbar">
            <el-input
              v-model="documentFilter"
              class="filter-input"
              clearable
              :prefix-icon="Search"
              placeholder="按标题或路径筛选文档"
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
                <article
                  v-for="document in filteredDocuments"
                  :key="document.id"
                  class="document-row"
                  :class="{ active: document.id === store.selectedDocumentId }"
                  role="button"
                  tabindex="0"
                  @click="openDocument(document.id)"
                  @keydown.enter="openDocument(document.id)"
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
                  </div>
                  <ChevronRight :size="16" />
                </article>
              </div>
              <div v-else-if="documentFilter" class="pane-empty">
                <FileText :size="30" />
                <strong>没有匹配文档</strong>
              </div>
              <DropZone
                v-else
                class="knowledge-empty-drop"
                clickable
                variant="border"
                file-only
                multiple
                silent
                allow-unknown-extensions
                :accept="KNOWLEDGE_DROP_ACCEPT"
                :disabled="importBusy"
                @click="importDocuments"
                @drop="runImportPaths"
                @error="handleDropError"
              >
                <FileUp :size="30" />
                <strong>导入文档</strong>
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
                </header>
                <div class="document-meta">
                  <span>{{ store.selectedDocument.mimeType }}</span>
                  <span>{{ formatSize(store.selectedDocument.size) }}</span>
                  <span>{{
                    formatDate(store.selectedDocument.updatedAt)
                  }}</span>
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
              placeholder="输入问题、术语或文档内容"
              :prefix-icon="Search"
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
              native-type="submit"
            >
              检索
            </el-button>
          </form>
          <div v-if="!semanticAvailable" class="search-notice">
            当前可使用关键词检索。构建语义索引后可启用混合与语义策略。
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
                <article
                  v-for="result in store.results"
                  :key="result.chunkId"
                  class="result-row"
                  :class="{ active: result.chunkId === store.selectedResultId }"
                  role="button"
                  tabindex="0"
                  @click="store.selectResult(result.chunkId)"
                  @keydown.enter="store.selectResult(result.chunkId)"
                >
                  <header>
                    <strong>{{ result.title }}</strong>
                    <span>{{ formatScore(result.score) }}</span>
                  </header>
                  <p>{{ result.content }}</p>
                  <footer>
                    <span>{{
                      result.heading || `分块 ${result.chunkIndex + 1}`
                    }}</span>
                    <span>{{ signalSummary(result) }}</span>
                  </footer>
                </article>
              </div>
              <div v-else class="pane-empty">
                <Search :size="30" />
                <strong>{{
                  hasSearched ? "没有找到相关内容" : "检索当前资料库"
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
          :disabled="importBusy"
          @drop="runImportPaths"
          @error="handleDropError"
        />
      </template>

      <div v-else class="empty-workspace">
        <BookOpenText :size="40" />
        <h2>建立第一个资料库</h2>
        <p>资料库用于管理可追溯的文档、分块与检索索引。</p>
        <el-button type="primary" :icon="Plus" @click="creating = true"
          >新建资料库</el-button
        >
      </div>
    </section>

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
import {
  AlertTriangle,
  Binary,
  BookOpenText,
  ChevronRight,
  CircleHelp,
  FileText,
  FileUp,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import DropZone from "@/components/common/DropZone.vue";
import KnowledgeVectorDialog from "../components/KnowledgeVectorDialog.vue";
import {
  KNOWLEDGE_DROP_ACCEPT,
  KNOWLEDGE_FORMAT_CAPABILITIES,
  KNOWLEDGE_FORMAT_SUMMARY,
  type KnowledgeFormatValidation,
} from "../formats";
import { importPaths, selectImportPaths } from "../importService";
import { processKnowledgeImportQueue } from "../ingestQueue";
import { useKnowledgeStore } from "../store";
import type {
  KnowledgeImportFailure,
  KnowledgeImportStage,
  KnowledgeResult,
  KnowledgeSearchStrategy,
  KnowledgeSignalType,
} from "../types";

type WorkspaceMode = "documents" | "search";

const store = useKnowledgeStore();
const errorHandler = createModuleErrorHandler("knowledge-base/view");
const creating = ref(false);
const creatingLibrary = ref(false);
const newLibraryName = ref("");
const newLibraryDescription = ref("");
const libraryFilter = ref("");
const documentFilter = ref("");
const workspaceMode = ref<WorkspaceMode>("documents");
const query = ref("");
const strategy = ref<KnowledgeSearchStrategy>("auto");
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
    `${document.title} ${document.sourcePath}`
      .toLocaleLowerCase()
      .includes(filter)
  );
});

const semanticAvailable = computed(
  () => (store.indexStatus?.vectorizedChunks ?? 0) > 0
);
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

onMounted(() => store.initialize());

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

function formatValidationLabel(
  validation: KnowledgeFormatValidation
): string {
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
  hasSearched.value = true;
  await store.search(query.value, strategy.value);
}

async function showResultDocument() {
  const result = store.selectedResult;
  if (!result) return;
  workspaceMode.value = "documents";
  await openDocument(result.documentId);
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

.create-library {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
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
  min-height: 58px;
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
  min-height: 76px;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  grid-template-columns: minmax(180px, 1fr) 112px auto;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  gap: 8px;
  padding: 13px 16px 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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

@media (max-width: 980px) {
  .knowledge-workbench {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .header-actions :deep(.el-button span) {
    display: none;
  }

  .master-detail {
    grid-template-columns: minmax(260px, 0.46fr) minmax(300px, 0.54fr);
  }
}

@media (max-width: 760px) {
  .knowledge-workbench {
    grid-template-columns: 190px minmax(0, 1fr);
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

  .master-pane {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }
}
</style>
