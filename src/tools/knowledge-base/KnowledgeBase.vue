<template>
  <main class="knowledge-workbench" aria-label="知识资料库">
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
        <el-button
          type="primary"
          :icon="Check"
          circle
          aria-label="确认新建"
          :loading="creatingLibrary"
          native-type="submit"
        />
      </form>

      <nav class="library-list" aria-label="资料库列表">
        <button
          v-for="library in store.libraries"
          :key="library.id"
          type="button"
          class="library-row"
          :class="{ active: library.id === store.activeLibraryId }"
          @click="store.selectLibrary(library.id)"
        >
          <BookOpenText :size="18" />
          <span class="library-copy">
            <strong>{{ library.name }}</strong>
            <small>
              {{ library.documentCount }} 文档 · {{ library.chunkCount }} 分块
            </small>
          </span>
          <ChevronRight :size="16" />
        </button>
      </nav>
    </aside>

    <section class="library-content">
      <template v-if="store.activeLibrary">
        <header class="content-header">
          <div class="library-title">
            <h2>{{ store.activeLibrary.name }}</h2>
            <p v-if="store.activeLibrary.description">
              {{ store.activeLibrary.description }}
            </p>
          </div>
          <div class="header-actions">
            <el-tooltip content="导入文档" placement="bottom">
              <el-button
                :icon="FileUp"
                circle
                aria-label="导入文档"
                :loading="store.importing"
                @click="importDocuments"
              />
            </el-tooltip>
            <el-tooltip content="重建索引" placement="bottom">
              <el-button
                :icon="RefreshCw"
                circle
                aria-label="重建索引"
                @click="rebuildLibrary"
              />
            </el-tooltip>
            <el-tooltip content="删除资料库" placement="bottom">
              <el-button
                class="danger-action"
                :icon="Trash2"
                circle
                aria-label="删除资料库"
                @click="deleteLibrary"
              />
            </el-tooltip>
          </div>
        </header>

        <div class="search-toolbar">
          <el-input
            v-model="query"
            class="search-input"
            clearable
            placeholder="检索当前资料库"
            :prefix-icon="Search"
            @keyup.enter="runSearch"
          />
          <el-select
            v-model="strategy"
            class="strategy-select"
            aria-label="检索策略"
          >
            <el-option label="自动" value="auto" />
            <el-option label="关键词" value="keyword" />
          </el-select>
          <el-button
            type="primary"
            :icon="Search"
            :loading="store.searching"
            @click="runSearch"
          >
            检索
          </el-button>
        </div>

        <div class="workspace-columns">
          <section class="document-pane" aria-label="文档列表">
            <header class="pane-header">
              <h3>文档</h3>
              <span>{{ store.documents.length }}</span>
            </header>
            <div v-if="store.documents.length" class="document-list">
              <article
                v-for="document in store.documents"
                :key="document.id"
                class="document-row"
              >
                <FileText :size="18" />
                <div class="document-copy">
                  <strong>{{ document.title }}</strong>
                  <span
                    >{{ document.chunkCount }} 分块 ·
                    {{ formatSize(document.size) }}</span
                  >
                  <small :title="document.sourcePath">{{
                    document.sourcePath
                  }}</small>
                </div>
                <el-tooltip content="删除文档" placement="left">
                  <el-button
                    class="row-action"
                    :icon="Trash2"
                    text
                    circle
                    aria-label="删除文档"
                    @click="deleteDocument(document.id, document.title)"
                  />
                </el-tooltip>
              </article>
            </div>
            <el-empty v-else description="暂无文档" :image-size="72" />
          </section>

          <section class="result-pane" aria-label="检索结果">
            <header class="pane-header">
              <h3>检索结果</h3>
              <span>{{ store.results.length }}</span>
            </header>
            <div v-if="store.results.length" class="result-list">
              <article
                v-for="result in store.results"
                :key="result.chunkId"
                class="result-row"
              >
                <header>
                  <div>
                    <strong>{{ result.title }}</strong>
                    <span v-if="result.heading"> / {{ result.heading }}</span>
                  </div>
                  <code>#{{ result.chunkIndex + 1 }}</code>
                </header>
                <p>{{ result.content }}</p>
                <footer>
                  <span :title="result.sourcePath">
                    <FolderOpen :size="14" />
                    {{ result.sourcePath }}
                  </span>
                  <span>{{ result.score.toFixed(3) }}</span>
                </footer>
              </article>
            </div>
            <el-empty v-else description="暂无检索结果" :image-size="72" />
          </section>
        </div>
      </template>

      <div v-else class="empty-workspace">
        <BookOpenText :size="40" />
        <h2>新建资料库</h2>
        <el-button type="primary" :icon="Plus" @click="creating = true">
          新建资料库
        </el-button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessageBox } from "element-plus";
import {
  BookOpenText,
  Check,
  ChevronRight,
  FileText,
  FileUp,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { parseKnowledgeFile } from "./fileParser";
import { useKnowledgeStore } from "./store";
import type { KnowledgeSearchStrategy } from "./types";

const store = useKnowledgeStore();
const errorHandler = createModuleErrorHandler("knowledge-base/view");
const creating = ref(false);
const creatingLibrary = ref(false);
const newLibraryName = ref("");
const query = ref("");
const strategy = ref<KnowledgeSearchStrategy>("auto");

onMounted(() => store.initialize());

async function createLibrary() {
  const name = newLibraryName.value.trim();
  if (!name) return;
  creatingLibrary.value = true;
  try {
    await store.createLibrary(name);
    newLibraryName.value = "";
    creating.value = false;
    customMessage.success("资料库已创建");
  } catch (error) {
    errorHandler.error(error, "创建资料库失败");
  } finally {
    creatingLibrary.value = false;
  }
}

async function importDocuments() {
  try {
    const selected = await open({
      title: "导入知识资料",
      directory: false,
      multiple: true,
      filters: [
        {
          name: "支持的文档",
          extensions: [
            "pdf",
            "docx",
            "html",
            "htm",
            "md",
            "markdown",
            "txt",
            "json",
            "csv",
            "ts",
            "js",
            "vue",
            "py",
            "rs",
          ],
        },
      ],
    });
    const paths = Array.isArray(selected)
      ? selected.filter((item): item is string => typeof item === "string")
      : typeof selected === "string"
        ? [selected]
        : [];
    if (!paths.length) return;
    const files = [];
    for (const path of paths) files.push(await parseKnowledgeFile(path));
    await store.importFiles(files);
    customMessage.success(`已导入 ${files.length} 个文档`);
  } catch (error) {
    errorHandler.error(error, "导入知识资料失败");
  }
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
    const count = await store.rebuild();
    customMessage.success(`已重建 ${count} 个文档`);
  } catch (error) {
    errorHandler.error(error, "重建资料库失败");
  }
}

function runSearch() {
  if (!query.value.trim()) {
    customMessage.warning("请输入检索内容");
    return;
  }
  void store.search(query.value, strategy.value);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
.knowledge-workbench {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--el-text-color-primary);
  background: var(--card-bg);
}

.library-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--sidebar-bg);
}

.sidebar-header,
.content-header,
.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-header {
  min-height: 68px;
  padding: 12px 14px 12px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.sidebar-header h1,
.content-header h2,
.pane-header h3,
.empty-workspace h2 {
  margin: 0;
  letter-spacing: 0;
}

.sidebar-header h1 {
  font-size: 17px;
  line-height: 24px;
}

.sidebar-header span,
.pane-header span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.create-library {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.create-library :deep(.el-button) {
  width: 32px;
  height: 32px;
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

.library-row:hover {
  background: var(--el-fill-color-light);
}

.library-row.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.library-copy,
.document-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.library-copy strong,
.document-copy strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-copy small,
.document-copy span,
.document-copy small {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.content-header {
  min-height: 68px;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.library-title {
  min-width: 0;
}

.library-title h2 {
  overflow: hidden;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-title p {
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.danger-action:hover,
.row-action:hover {
  color: var(--el-color-danger);
}

.search-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 108px auto;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--input-bg);
}

.strategy-select {
  width: 108px;
}

.workspace-columns {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(260px, 0.42fr) minmax(320px, 0.58fr);
}

.document-pane,
.result-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.document-pane {
  border-right: 1px solid var(--el-border-color-light);
}

.pane-header {
  min-height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.pane-header h3 {
  font-size: 14px;
}

.document-list,
.result-list {
  min-height: 0;
  overflow: auto;
}

.document-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 32px;
  min-height: 72px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.result-row {
  margin: 12px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--card-bg);
}

.result-row header,
.result-row footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-row header > div {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row header strong {
  font-size: 13px;
}

.result-row header span,
.result-row code,
.result-row footer {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.result-row p {
  display: -webkit-box;
  overflow: hidden;
  margin: 10px 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
}

.result-row footer span:first-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-workspace {
  display: grid;
  place-items: center;
  align-content: center;
  flex: 1;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.empty-workspace h2 {
  color: var(--el-text-color-primary);
  font-size: 18px;
}

@media (max-width: 900px) {
  .knowledge-workbench {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .workspace-columns {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 0.4fr) minmax(240px, 0.6fr);
  }

  .document-pane {
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }
}
</style>
