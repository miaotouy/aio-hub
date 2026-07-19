<template>
  <main class="settings-view" data-testid="knowledge-settings">
    <div class="settings-content">
      <section class="settings-section">
        <header>
          <div>
            <h2>运行设置</h2>
            <p>新任务的并发、重试和文件资源上限</p>
          </div>
          <el-button
            data-testid="reset-runtime-settings"
            :icon="RotateCcw"
            @click="resetRuntimeSettings"
            >重置</el-button
          >
        </header>
        <div class="settings-grid">
          <label>
            <span>默认 Embedding route</span>
            <el-input
              v-model="runtimeForm.defaultEmbeddingRouteKey"
              clearable
            />
          </label>
          <label>
            <span>Embedding 并发</span>
            <el-input-number
              v-model="runtimeForm.embeddingRequestConcurrency"
              :min="1"
              :max="8"
            />
          </label>
          <label>
            <span>Embedding 批次</span>
            <el-input-number
              data-testid="runtime-embedding-batch"
              v-model="runtimeForm.embeddingBatchSize"
              :min="1"
              :max="256"
            />
          </label>
          <label>
            <span>摄取 worker</span>
            <el-input-number
              v-model="runtimeForm.ingestQueueConcurrency"
              :min="1"
              :max="8"
            />
          </label>
          <label>
            <span>Lease 秒数</span>
            <el-input-number
              v-model="runtimeForm.ingestLeaseTimeoutSeconds"
              :min="30"
              :max="3600"
            />
          </label>
          <label>
            <span>摄取最大尝试</span>
            <el-input-number
              v-model="runtimeForm.ingestMaxAttempts"
              :min="1"
              :max="10"
            />
          </label>
          <label>
            <span>单文件上限 MiB</span>
            <el-input-number v-model="maxFileMiB" :min="1" :max="1024" />
          </label>
          <label>
            <span>单批文件数</span>
            <el-input-number
              v-model="runtimeForm.maxImportBatchFiles"
              :min="1"
              :max="10000"
            />
          </label>
        </div>
      </section>

      <section class="settings-section library-settings">
        <header>
          <div>
            <h2>资料库设置</h2>
            <p>资料库配置是快照，修改后通过单库事务重建</p>
          </div>
          <el-select
            data-testid="settings-library-select"
            v-model="selectedLibraryId"
            placeholder="选择资料库"
            @change="selectSettingsLibrary"
          >
            <el-option
              v-for="library in store.libraries"
              :key="library.id"
              :label="library.name"
              :value="library.id"
            />
          </el-select>
        </header>

        <template v-if="selectedLibrary">
          <div class="settings-grid">
            <label class="wide-field">
              <span>名称</span>
              <el-input
                data-testid="library-name"
                v-model="libraryName"
                maxlength="64"
              />
            </label>
            <label class="wide-field">
              <span>说明</span>
              <el-input v-model="libraryDescription" maxlength="160" />
            </label>
            <label>
              <span>分块字符数</span>
              <el-input-number
                v-model="libraryConfig.chunking.targetChars"
                :min="200"
                :max="8000"
              />
            </label>
            <label>
              <span>重叠字符数</span>
              <el-input-number
                v-model="libraryConfig.chunking.overlapChars"
                :min="0"
                :max="2000"
              />
            </label>
            <label class="toggle-field">
              <span>语义索引</span>
              <el-switch v-model="semanticEnabled" />
            </label>
            <label class="wide-field">
              <span>Embedding route</span>
              <el-input
                v-model="libraryConfig.embedding.routeKey"
                :disabled="!semanticEnabled"
              />
            </label>
            <label>
              <span>请求维度</span>
              <el-input-number
                v-model="requestedDimensions"
                :disabled="!semanticEnabled"
                :min="1"
                :max="65536"
                clearable
              />
            </label>
          </div>
          <div class="settings-actions">
            <el-button :loading="savingLibrary" @click="saveLibraryMetadata"
              >保存名称与说明</el-button
            >
            <el-button
              type="primary"
              :loading="rebuilding"
              @click="applyLibraryConfig"
              >应用配置并重建</el-button
            >
          </div>

          <div class="diagnostic-strip">
            <div>
              <span>活动空间</span
              ><strong>{{
                selectedLibrary.activeEmbeddingSpaceId || "未建立"
              }}</strong>
            </div>
            <div>
              <span>Route</span
              ><strong>{{
                selectedLibrary.embeddingRouteKey || "未设置"
              }}</strong>
            </div>
            <div>
              <span>请求维度</span
              ><strong>{{
                selectedLibrary.config.embedding.requestedDimensions || "默认"
              }}</strong>
            </div>
            <div>
              <span>实际维度</span
              ><strong>{{ selectedLibrary.dimension || "-" }}</strong>
            </div>
            <div>
              <span>关键词覆盖</span
              ><strong>{{
                store.indexStatus
                  ? `${store.indexStatus.keywordIndexedChunks}/${store.indexStatus.totalChunks}`
                  : "-"
              }}</strong>
            </div>
            <div>
              <span>向量覆盖</span><strong>{{ coverageLabel }}</strong>
            </div>
            <div>
              <span>语义回退</span
              ><strong
                >{{
                  store.indexStatus?.semanticFallbackChunks || 0
                }}
                分块</strong
              >
            </div>
            <div>
              <span>队列</span
              ><strong
                >{{ store.indexStatus?.pendingTaskCount || 0 }} 处理中 /
                {{ store.indexStatus?.failedTaskCount || 0 }} 失败</strong
              >
            </div>
          </div>
          <details class="descriptor-details">
            <summary>Space descriptor</summary>
            <pre>{{ descriptorText }}</pre>
          </details>
        </template>
        <div v-else class="empty-state">暂无可配置资料库</div>
      </section>

      <section v-if="selectedLibrary" class="settings-section">
        <header>
          <div>
            <h2>来源与摄取</h2>
            <p>{{ sources.length }} 个来源，{{ failedTaskCount }} 个失败任务</p>
          </div>
          <div class="header-actions">
            <el-button
              data-testid="knowledge-add-directory"
              :icon="FolderPlus"
              :loading="queueProcessing"
              @click="addDirectory"
              >添加目录</el-button
            >
            <el-tooltip content="刷新来源与任务">
              <el-button
                :icon="RefreshCw"
                :loading="diagnosticsLoading"
                circle
                aria-label="刷新来源与任务"
                @click="refreshDiagnostics"
              />
            </el-tooltip>
          </div>
        </header>
        <div class="source-list">
          <div
            v-for="source in sources"
            :key="source.id"
            class="source-row"
            data-testid="knowledge-source-row"
            :data-source-kind="source.kind"
            :data-source-name="sourceName(source.rootPath)"
          >
            <FolderTree v-if="source.kind === 'directory'" :size="18" />
            <FileText v-else :size="18" />
            <div class="source-copy">
              <strong :title="source.rootPath">{{ source.rootPath }}</strong>
              <small
                >{{ source.fileCount }} 文件 ·
                {{ source.pendingTaskCount }} 处理中 ·
                {{ source.failedTaskCount }} 失败</small
              >
              <small v-if="source.lastScanAt"
                >最近扫描 {{ formatDate(source.lastScanAt) }}</small
              >
              <small v-if="source.lastError" class="source-error">{{
                source.lastError
              }}</small>
            </div>
            <el-tooltip content="在资源管理器中显示">
              <el-button
                :icon="FolderOpen"
                text
                circle
                aria-label="打开来源位置"
                @click="openSourcePath(source.rootPath)"
              />
            </el-tooltip>
            <el-tooltip v-if="source.kind === 'directory'" content="重新扫描">
              <el-button
                :icon="ScanSearch"
                :disabled="queueProcessing"
                text
                circle
                aria-label="重新扫描目录"
                @click="rescanSource(source.id)"
              />
            </el-tooltip>
            <el-tooltip content="移除来源">
              <el-button
                :icon="Trash2"
                text
                circle
                aria-label="移除来源"
                @click="deleteSource(source.id)"
              />
            </el-tooltip>
          </div>
          <div v-if="!sources.length" class="empty-state">暂无持久来源</div>
        </div>
        <el-table :data="tasks" size="small" max-height="280">
          <el-table-column
            prop="sourcePath"
            label="文件"
            min-width="240"
            show-overflow-tooltip
          />
          <el-table-column prop="operation" label="操作" width="82" />
          <el-table-column prop="status" label="状态" width="98" />
          <el-table-column label="尝试" width="76"
            ><template #default="scope"
              >{{ scope.row.attemptCount }}/{{
                scope.row.maxAttempts
              }}</template
            ></el-table-column
          >
          <el-table-column
            prop="lastError"
            label="最近错误"
            min-width="220"
            show-overflow-tooltip
          />
          <el-table-column label="操作" width="92" fixed="right">
            <template #default="scope">
              <el-tooltip
                v-if="scope.row.status === 'failed'"
                content="重试任务"
              >
                <el-button
                  :icon="RotateCw"
                  :disabled="queueProcessing"
                  text
                  circle
                  aria-label="重试摄取任务"
                  @click="retryTask(scope.row.id)"
                />
              </el-tooltip>
              <el-tooltip
                v-else-if="
                  ['pending', 'processing', 'retry'].includes(scope.row.status)
                "
                content="取消任务"
              >
                <el-button
                  :icon="X"
                  text
                  circle
                  aria-label="取消摄取任务"
                  @click="cancelTask(scope.row.id)"
                />
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Trash2,
  X,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  createDefaultKnowledgeRuntimeConfig,
  knowledgeRuntimeConfigManager,
  normalizeKnowledgeLibraryConfig,
  saveKnowledgeRuntimeConfigDebounced,
  validateKnowledgeLibraryConfig,
} from "../config";
import {
  addKnowledgeDirectorySource,
  cancelKnowledgeIngestTask,
  listKnowledgeIngestTasks,
  listKnowledgeSources,
  removeKnowledgeSource,
  rescanKnowledgeDirectorySource,
  retryKnowledgeIngestTask,
} from "../service";
import { processKnowledgeImportQueue } from "../ingestQueue";
import { useKnowledgeStore } from "../store";
import type {
  KnowledgeIngestTask,
  KnowledgeLibraryIndexConfig,
  KnowledgeRuntimeConfig,
  KnowledgeSource,
} from "../types";

const store = useKnowledgeStore();
const errorHandler = createModuleErrorHandler("knowledge-base/settings");
const runtimeForm = reactive<KnowledgeRuntimeConfig>(
  createDefaultKnowledgeRuntimeConfig()
);
const runtimeReady = ref(false);
const selectedLibraryId = ref("");
const libraryName = ref("");
const libraryDescription = ref("");
const libraryConfig = reactive<KnowledgeLibraryIndexConfig>(
  normalizeKnowledgeLibraryConfig()
);
const sources = ref<KnowledgeSource[]>([]);
const tasks = ref<KnowledgeIngestTask[]>([]);
const diagnosticsLoading = ref(false);
const queueProcessing = ref(false);
const savingLibrary = ref(false);
const rebuilding = ref(false);

const selectedLibrary = computed(
  () =>
    store.libraries.find((item) => item.id === selectedLibraryId.value) || null
);
const maxFileMiB = computed({
  get: () => Math.round(runtimeForm.maxImportFileBytes / 1024 / 1024),
  set: (value: number) => {
    runtimeForm.maxImportFileBytes = value * 1024 * 1024;
  },
});
const semanticEnabled = computed({
  get: () => libraryConfig.indexes.semantic,
  set: (value: boolean) => {
    libraryConfig.indexes.semantic = value;
    libraryConfig.embedding.enabled = value;
  },
});
const requestedDimensions = computed<number | undefined>({
  get: () => libraryConfig.embedding.requestedDimensions,
  set: (value) => {
    libraryConfig.embedding.requestedDimensions = value || undefined;
  },
});
const failedTaskCount = computed(
  () => tasks.value.filter((task) => task.status === "failed").length
);
const coverageLabel = computed(() =>
  store.indexStatus
    ? `${store.indexStatus.vectorizedChunks}/${store.indexStatus.totalChunks}`
    : "-"
);
const descriptorText = computed(() =>
  JSON.stringify(selectedLibrary.value?.embeddingSpaceDescriptor ?? {}, null, 2)
);

async function loadRuntimeSettings() {
  Object.assign(runtimeForm, await knowledgeRuntimeConfigManager.load());
  runtimeReady.value = true;
}

watch(
  runtimeForm,
  (value) => {
    if (!runtimeReady.value) return;
    saveKnowledgeRuntimeConfigDebounced({ ...value }, (error) =>
      errorHandler.error(error, "保存 Knowledge 运行设置失败")
    );
  },
  { deep: true }
);

watch(
  selectedLibrary,
  (library) => {
    if (!library) return;
    libraryName.value = library.name;
    libraryDescription.value = library.description || "";
    Object.assign(
      libraryConfig,
      normalizeKnowledgeLibraryConfig(library.config)
    );
    void refreshDiagnostics();
  },
  { immediate: true }
);

watch(
  () => store.activeLibraryId,
  (libraryId) => {
    if (libraryId) selectedLibraryId.value = libraryId;
  },
  { immediate: true }
);

async function resetRuntimeSettings() {
  await ElMessageBox.confirm("恢复运行设置默认值？", "重置设置", {
    type: "warning",
    lockScroll: false,
  });
  Object.assign(runtimeForm, createDefaultKnowledgeRuntimeConfig());
}

async function saveLibraryMetadata() {
  savingLibrary.value = true;
  try {
    await store.selectLibrary(selectedLibraryId.value);
    await store.updateActiveLibrary({
      name: libraryName.value.trim(),
      description: libraryDescription.value.trim() || undefined,
    });
    customMessage.success("资料库信息已保存");
  } catch (error) {
    errorHandler.error(error, "保存资料库信息失败");
  } finally {
    savingLibrary.value = false;
  }
}

async function selectSettingsLibrary(libraryId: string) {
  await store.selectLibrary(libraryId);
  await refreshDiagnostics();
}

async function applyLibraryConfig() {
  try {
    validateKnowledgeLibraryConfig(libraryConfig);
    await ElMessageBox.confirm(
      "将按新配置重新分块并重建基础索引；现有活动向量会被清除。",
      "应用配置并重建",
      { type: "warning", confirmButtonText: "应用并重建", lockScroll: false }
    );
    rebuilding.value = true;
    await store.selectLibrary(selectedLibraryId.value);
    const count = await store.applyActiveLibraryConfig(
      normalizeKnowledgeLibraryConfig(libraryConfig)
    );
    customMessage.success(`已重建 ${count} 个文档`);
  } catch (error) {
    if (error !== "cancel") errorHandler.error(error, "应用资料库配置失败");
  } finally {
    rebuilding.value = false;
  }
}

async function refreshDiagnostics() {
  if (!selectedLibraryId.value) return;
  diagnosticsLoading.value = true;
  try {
    [sources.value, tasks.value] = await Promise.all([
      listKnowledgeSources(selectedLibraryId.value),
      listKnowledgeIngestTasks(selectedLibraryId.value, 200),
    ]);
    if (store.activeLibraryId === selectedLibraryId.value)
      await store.refreshIndexStatus();
  } catch (error) {
    errorHandler.error(error, "读取 Knowledge 诊断信息失败");
  } finally {
    diagnosticsLoading.value = false;
  }
}

async function addDirectory() {
  const path = await open({
    directory: true,
    multiple: false,
    title: "选择持续同步目录",
  });
  if (typeof path !== "string") return;
  try {
    const enqueueResult = await addKnowledgeDirectorySource({
      libraryId: selectedLibraryId.value,
      rootPath: path,
      recursive: true,
      ignorePatterns: [".git/", "node_modules/"],
    });
    const result = await drainSelectedQueue();
    const failureCount = enqueueResult.failures.length + result.failures.length;
    if (failureCount)
      customMessage.warning(`目录已添加，${failureCount} 个文件处理失败`);
    if (result.warnings?.length)
      customMessage.warning(result.warnings.join("；"));
    if (!failureCount && !result.warnings?.length) {
      customMessage.success(`目录来源已添加，处理 ${result.imported} 个文件`);
    }
  } catch (error) {
    errorHandler.error(error, "添加目录来源失败");
  }
}

async function rescanSource(sourceId: string) {
  try {
    const enqueueResult = await rescanKnowledgeDirectorySource(
      selectedLibraryId.value,
      sourceId
    );
    const result = await drainSelectedQueue();
    const failureCount = enqueueResult.failures.length + result.failures.length;
    if (failureCount)
      customMessage.warning(`目录扫描完成，${failureCount} 个文件处理失败`);
    if (result.warnings?.length)
      customMessage.warning(result.warnings.join("；"));
    if (!failureCount && !result.warnings?.length) {
      customMessage.success(`目录扫描完成，处理 ${result.imported} 个文件`);
    }
  } catch (error) {
    errorHandler.error(error, "重新扫描目录失败");
  }
}

async function deleteSource(sourceId: string) {
  try {
    await ElMessageBox.confirm("移除来源及其已导入文档？", "移除来源", {
      type: "warning",
      lockScroll: false,
    });
    await removeKnowledgeSource(selectedLibraryId.value, sourceId);
    await store.refreshLibraries(selectedLibraryId.value);
    await refreshDiagnostics();
  } catch (error) {
    if (error !== "cancel") errorHandler.error(error, "移除来源失败");
  }
}

async function retryTask(taskId: string) {
  try {
    await retryKnowledgeIngestTask(selectedLibraryId.value, taskId);
    const result = await drainSelectedQueue();
    if (result.failures.length)
      customMessage.warning("任务重试后仍然失败，请检查最近错误");
    if (result.warnings?.length)
      customMessage.warning(result.warnings.join("；"));
    if (!result.failures.length && !result.warnings?.length) {
      customMessage.success("任务重试完成");
    }
  } catch (error) {
    errorHandler.error(error, "重试摄取任务失败");
  }
}

async function drainSelectedQueue() {
  queueProcessing.value = true;
  try {
    const result = await processKnowledgeImportQueue(
      selectedLibraryId.value,
      []
    );
    store.results = [];
    store.searchTraces = [];
    store.selectedResultId = null;
    await store.refreshLibraries(selectedLibraryId.value);
    await refreshDiagnostics();
    return result;
  } finally {
    queueProcessing.value = false;
  }
}

async function cancelTask(taskId: string) {
  try {
    await cancelKnowledgeIngestTask(selectedLibraryId.value, taskId);
    await refreshDiagnostics();
  } catch (error) {
    errorHandler.error(error, "取消摄取任务失败");
  }
}

async function openSourcePath(sourcePath: string) {
  try {
    await revealItemInDir(sourcePath);
  } catch (error) {
    errorHandler.error(error, "打开来源位置失败");
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString();
}

function sourceName(sourcePath: string) {
  const segments = sourcePath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || sourcePath;
}

onMounted(async () => {
  if (!store.libraries.length) await store.initialize();
  await loadRuntimeSettings();
  selectedLibraryId.value ||= store.activeLibraryId || "";
});
onActivated(() => {
  if (selectedLibraryId.value) void refreshDiagnostics();
});
</script>

<style scoped>
.settings-view {
  height: 100%;
  overflow: auto;
  background: var(--el-bg-color-page);
}
.settings-content {
  width: min(1040px, calc(100% - 32px));
  margin: 0 auto;
  padding: 20px 0 40px;
}
.settings-section {
  padding: 18px 0 22px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.settings-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 0;
  color: var(--el-text-color-primary);
}
header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 22px;
}
.settings-grid label {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(160px, 1.4fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.settings-grid :deep(.el-input-number),
.settings-grid :deep(.el-input) {
  width: 100%;
}
.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.diagnostic-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 18px;
  background: var(--border-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.diagnostic-strip div {
  min-width: 0;
  padding: 10px 12px;
  background: var(--card-bg);
}
.diagnostic-strip span,
.diagnostic-strip strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diagnostic-strip span {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.diagnostic-strip strong {
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.header-actions {
  display: flex;
  gap: 8px;
}
.source-list {
  display: grid;
  gap: 1px;
  margin-bottom: 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--border-color);
}
.source-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) repeat(3, 32px);
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 6px 10px;
  background: var(--card-bg);
}
.source-copy {
  min-width: 0;
}
.source-copy strong,
.source-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-copy strong {
  font-size: 12px;
}
.source-copy small {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
}
.source-error {
  color: var(--el-color-danger) !important;
}
.descriptor-details {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.descriptor-details summary {
  cursor: pointer;
}
.descriptor-details pre {
  max-height: 220px;
  margin: 8px 0 0;
  padding: 10px;
  overflow: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--el-text-color-regular);
  background: var(--input-bg);
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
@container knowledge-shell (max-width: 760px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .diagnostic-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container knowledge-shell (max-width: 520px) {
  .settings-content {
    width: calc(100% - 20px);
  }
  .settings-section > header {
    align-items: stretch;
    flex-direction: column;
  }
  .settings-grid label {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
