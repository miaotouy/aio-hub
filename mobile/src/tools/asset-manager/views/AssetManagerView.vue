<script setup lang="ts">
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  ChevronLeft,
  Database,
  FileArchive,
  FileText,
  FilterX,
  HardDrive,
  Import,
  LoaderCircle,
  ListRestart,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { customMessage } from "@/utils/feedback";
import AssetDetailSheet from "../components/AssetDetailSheet.vue";
import AssetTile from "../components/AssetTile.vue";
import ImportJobsSheet from "../components/ImportJobsSheet.vue";
import ImportSourceSheet from "../components/ImportSourceSheet.vue";
import { formatAssetBytes, useAssetLibrary } from "../composables/useAssetLibrary";
import { capturePhoto, exportAsset, shareAsset as shareManagedAsset } from "../services/assetService";
import type { AssetKind, AssetImportSource } from "../types";

const router = useRouter();
const library = useAssetLibrary();
const jobsOpen = ref(false);
const importSourceOpen = ref(false);
const savingAssetId = ref<string | null>(null);
const replacingTextAssetId = ref<string | null>(null);
const sharingAssetId = ref<string | null>(null);

const kindOptions: Array<{ label: string; value: AssetKind | "all" }> = [
  { label: "全部类型", value: "all" },
  { label: "图片", value: "image" },
  { label: "音频", value: "audio" },
  { label: "视频", value: "video" },
  { label: "文档", value: "document" },
  { label: "其他", value: "other" },
];

const sourceOptions = computed(() => [
  { label: "全部来源", value: "" },
  ...library.facets.value.bySource.map((facet) => ({
    label: `${facet.sourceModule} (${facet.assetCount})`,
    value: facet.sourceModule,
  })),
]);

const selectedCount = computed(() => library.selectedIds.value.length);
const selectedAreHidden = computed(
  () => library.selected.value.length > 0 && library.selected.value.every((asset) => asset.libraryState === "hidden")
);
const selectedArePinned = computed(
  () => library.selected.value.length > 0 && library.selected.value.every((asset) => asset.retentionPolicy === "pinned")
);
const hasFilters = computed(
  () =>
    Boolean(library.search.value) ||
    library.kind.value !== "all" ||
    library.libraryState.value !== "visible" ||
    Boolean(library.createdMonth.value) ||
    Boolean(library.sourceModule.value)
);

const importPercent = computed(() => {
  const progress = library.importProgress.value;
  if (!progress?.totalBytes) return null;
  return Math.min(100, Math.round((progress.bytesCopied / progress.totalBytes) * 100));
});

function goBack() {
  router.push("/");
}

function clearFilters() {
  library.search.value = "";
  library.kind.value = "all";
  library.libraryState.value = "visible";
  library.createdMonth.value = "";
  library.sourceModule.value = "";
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return year && monthNumber ? `${year}年${Number(monthNumber)}月` : month;
}

function fileName(reference: string) {
  try {
    return decodeURIComponent(reference.replace(/\\/g, "/")).split("/").pop() || "未命名文件";
  } catch {
    return reference.split("/").pop() || "未命名文件";
  }
}

function importFromDevice() {
  importSourceOpen.value = true;
}

async function pickAndImport(source: "file" | "photo" | "camera") {
  importSourceOpen.value = false;
  try {
    if (source === "camera") {
      const cameraSource = await capturePhoto();
      if (cameraSource) await library.importSources([cameraSource]);
      return;
    }
    const selection = await open({
      multiple: true,
      directory: false,
      pickerMode: source === "photo" ? "media" : "document",
      fileAccessMode: source === "file" ? "scoped" : "copy",
      filters:
        source === "photo"
          ? [{ name: "照片和视频", extensions: ["image/*", "video/*"] }]
          : undefined,
    });
    if (!selection) return;
    const references = Array.isArray(selection) ? selection : [selection];
    const sources: AssetImportSource[] = references.map((reference) => ({
      reference,
      originKind: source === "photo" ? "photo_picker" : "file_picker",
      sourceModule: "asset-manager",
      originalName: fileName(reference),
    }));
    await library.importSources(sources);
  } catch (cause) {
    customMessage(
      cause instanceof Error
        ? cause.message
        : source === "camera"
          ? "无法打开相机"
          : "无法导入所选文件",
      "error"
    );
  }
}

async function saveAsset(assetId: string) {
  const detail = library.detail.value;
  if (!detail || savingAssetId.value) return;
  try {
    const destination = await save({
      defaultPath: detail.displayName,
    });
    if (!destination) return;
    savingAssetId.value = assetId;
    const result = await exportAsset(assetId, destination);
    customMessage(`已保存 ${result.fileName}（${formatAssetBytes(result.bytesWritten)}）`, "success");
  } catch (cause) {
    customMessage(cause instanceof Error ? cause.message : "无法保存资产原件", "error");
  } finally {
    savingAssetId.value = null;
  }
}

async function shareAsset(assetId: string) {
  if (sharingAssetId.value || savingAssetId.value) return;
  try {
    sharingAssetId.value = assetId;
    await shareManagedAsset(assetId);
    await library.load({ keepSelection: true });
  } catch (cause) {
    customMessage(cause instanceof Error ? cause.message : "无法打开系统分享", "error");
  } finally {
    sharingAssetId.value = null;
  }
}

async function openDetail(assetId: string) {
  await library.openDetail(assetId);
}

async function previewAsset(assetId: string) {
  await library.openPreview(assetId);
}

async function closeDetail() {
  library.detail.value = null;
  await library.closePreview();
}

async function replaceAssetText(assetId: string) {
  if (replacingTextAssetId.value) return;
  replacingTextAssetId.value = assetId;
  try {
    await library.replaceWithExtractedText([assetId]);
  } finally {
    replacingTextAssetId.value = null;
  }
}

async function openImportJobs() {
  jobsOpen.value = true;
  try {
    await library.loadImportJobs();
  } catch {
    customMessage("无法读取导入任务", "error");
  }
}

async function cancelImportJob(jobId: string) {
  try {
    await library.cancelImport(jobId);
    customMessage("已请求取消导入任务", "info");
  } catch (cause) {
    customMessage(cause instanceof Error ? cause.message : "无法取消导入任务", "error");
  }
}

onMounted(() => {
  void library.load();
  void library.loadImportJobs().catch(() => undefined);
});

onUnmounted(() => {
  void library.closePreview();
});
</script>

<template>
  <div class="asset-manager-view">
    <header class="page-header">
      <button class="icon-button" type="button" aria-label="返回首页" @click="goBack">
        <ChevronLeft :size="24" />
      </button>
      <div class="header-copy">
        <h1>资产管理器</h1>
        <p v-if="library.summary.value">{{ library.summary.value.assetCount }} 项资产 · {{ formatAssetBytes(library.summary.value.originalBytes) }}</p>
      </div>
      <button class="icon-button tasks-button" type="button" aria-label="查看导入任务" @click="openImportJobs">
        <ListRestart :size="20" />
        <span v-if="library.activeImportJobId.value" class="activity-dot" aria-hidden="true" />
      </button>
      <button class="header-action" type="button" :disabled="library.importing.value" @click="importFromDevice">
        <LoaderCircle v-if="library.importing.value" class="spin" :size="18" />
        <Import v-else :size="18" />
        <span>{{ library.importing.value ? "导入中" : "导入" }}</span>
      </button>
    </header>

    <div v-if="library.importing.value" class="import-banner" role="status">
      <div class="import-copy">
        <span>正在导入资产</span>
        <button type="button" @click="library.cancelImport()">取消</button>
      </div>
      <div class="progress-track"><span :style="{ width: `${importPercent ?? 18}%` }" /></div>
      <span v-if="importPercent !== null" class="progress-label">{{ importPercent }}%</span>
    </div>

    <nav class="mode-tabs" aria-label="资产视图">
      <button type="button" :class="{ active: library.mode.value === 'assets' }" @click="library.mode.value = 'assets'">
        <FileArchive :size="17" /> 资产
      </button>
      <button type="button" :class="{ active: library.mode.value === 'storage' }" @click="library.mode.value = 'storage'">
        <HardDrive :size="17" /> 存储空间
      </button>
    </nav>

    <main class="page-content">
      <template v-if="library.mode.value === 'assets'">
        <section class="filters" aria-label="资产筛选">
          <label class="search-field">
            <Search :size="18" />
            <input v-model="library.search.value" type="search" placeholder="搜索文件名" />
          </label>
          <div class="filter-row">
            <select v-model="library.kind.value" aria-label="资产类型">
              <option v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-model="library.libraryState.value" aria-label="资产可见性">
              <option value="visible">可见资产</option>
              <option value="hidden">已隐藏</option>
              <option value="all">全部状态</option>
            </select>
            <select v-model="library.sourceModule.value" aria-label="来源模块">
              <option v-for="option in sourceOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="facet-row" role="list" aria-label="创建月份">
            <button
              v-for="facet in library.facets.value.byMonth.slice(0, 6)"
              :key="facet.month"
              type="button"
              :class="{ active: library.createdMonth.value === facet.month }"
              @click="library.createdMonth.value = library.createdMonth.value === facet.month ? '' : facet.month"
            >
              {{ monthLabel(facet.month) }} · {{ facet.assetCount }}
            </button>
          </div>
          <button v-if="hasFilters" class="clear-filters" type="button" @click="clearFilters">
            <FilterX :size="15" /> 清除筛选
          </button>
        </section>

        <div v-if="library.error.value" class="state-panel state-panel--error">
          <Database :size="30" />
          <p>无法读取资产列表</p>
          <button type="button" @click="library.load()"><RefreshCw :size="16" /> 重试</button>
        </div>
        <div v-else-if="library.loading.value && !library.assets.value.length" class="state-panel">
          <LoaderCircle class="spin" :size="30" />
          <p>正在读取资产库</p>
        </div>
        <div v-else-if="!library.assets.value.length" class="state-panel">
          <FileArchive :size="38" />
          <p>{{ hasFilters ? "没有匹配的资产" : "资产库还是空的" }}</p>
          <button v-if="hasFilters" type="button" @click="clearFilters"><FilterX :size="16" /> 清除筛选</button>
          <button v-else type="button" @click="importFromDevice"><Import :size="16" /> 导入第一个文件</button>
        </div>
        <div v-else class="asset-grid">
          <AssetTile
            v-for="asset in library.assets.value"
            :key="asset.id"
            :asset="asset"
            :selected="library.selectedIds.value.includes(asset.id)"
            @open="openDetail"
            @select="library.toggleSelection"
          />
        </div>
      </template>

      <section v-else class="storage-view">
        <div v-if="library.summary.value" class="storage-overview">
          <div class="storage-total">
            <span>原件占用</span>
            <strong>{{ formatAssetBytes(library.summary.value.originalBytes) }}</strong>
            <small>{{ library.summary.value.assetCount }} 项资产</small>
          </div>
          <div class="storage-stats">
            <div><span>可用</span><strong>{{ library.summary.value.readyCount }}</strong></div>
            <div><span>待回收</span><strong>{{ formatAssetBytes(library.summary.value.reclaimableBytes) }}</strong></div>
            <div><span>缓存</span><strong>{{ formatAssetBytes(library.summary.value.cacheBytes) }}</strong></div>
            <div><span>临时文件</span><strong>{{ formatAssetBytes(library.summary.value.temporaryBytes) }}</strong></div>
          </div>
        </div>
        <section class="storage-section">
          <div class="section-heading"><h2>按类型占用</h2><span>{{ library.summary?.value?.byKind.length ?? 0 }} 类</span></div>
          <div v-if="library.summary?.value?.byKind.length" class="kind-bars">
            <div v-for="item in library.summary.value.byKind" :key="item.kind" class="kind-bar">
              <div class="kind-label"><span>{{ item.kind }}</span><span>{{ formatAssetBytes(item.sizeBytes) }}</span></div>
              <div class="bar-track"><span :style="{ width: `${Math.max(4, (item.sizeBytes / Math.max(library.summary.value.originalBytes, 1)) * 100)}%` }" /></div>
            </div>
          </div>
          <p v-else class="quiet">暂无占用统计</p>
        </section>
        <section class="storage-section maintenance">
          <div class="section-heading"><h2>维护</h2></div>
          <button type="button" @click="library.clearCache"><Trash2 :size="18" /><span><strong>清理可重建缓存</strong><small>不会影响原件和工具引用</small></span></button>
          <button type="button" @click="library.repairLibrary"><Wrench :size="18" /><span><strong>修复资产库</strong><small>清理临时文件并标记缺失原件</small></span></button>
        </section>
      </section>
    </main>

    <div v-if="selectedCount" class="selection-bar" role="toolbar">
      <strong>已选 {{ selectedCount }} 项</strong>
      <div class="selection-actions">
        <button
          v-if="library.textReplacementCandidates.value.length"
          type="button"
          :disabled="library.replacingText.value"
          title="提取文本并清理原件"
          @click="library.replaceWithExtractedText()"
        >
          <LoaderCircle v-if="library.replacingText.value" class="spin" :size="17" />
          <FileText v-else :size="17" />
          文本化
        </button>
        <button type="button" @click="library.setHidden(!selectedAreHidden)"><ArchiveRestore :size="17" /> {{ selectedAreHidden ? "恢复" : "隐藏" }}</button>
        <button type="button" @click="library.pinSelected(!selectedArePinned)"><HardDrive :size="17" /> {{ selectedArePinned ? "取消固定" : "固定" }}</button>
        <button type="button" class="danger" @click="library.removeSelected"><Trash2 :size="17" /> 删除</button>
        <button type="button" class="close-selection" aria-label="清除选择" @click="library.clearSelection">×</button>
      </div>
    </div>

    <AssetDetailSheet
      v-if="library.detail.value"
      :detail="library.detail.value"
      :preview="library.preview.value"
      :saving="savingAssetId === library.detail.value.id"
      :sharing="sharingAssetId === library.detail.value.id"
      :replacing-text="replacingTextAssetId === library.detail.value.id || library.replacingText.value"
      @close="closeDetail"
      @preview="previewAsset"
      @save="saveAsset"
      @share="shareAsset"
      @replace-text="replaceAssetText"
    />
    <ImportJobsSheet
      v-if="jobsOpen"
      :jobs="library.importJobs.value"
      @close="jobsOpen = false"
      @cancel="cancelImportJob"
    />
    <ImportSourceSheet
      v-if="importSourceOpen"
      @close="importSourceOpen = false"
      @pick="pickAndImport"
    />
  </div>
</template>

<style scoped>
.asset-manager-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  background: var(--bg-color);
}

.page-header {
  min-height: 64px;
  padding: calc(8px + var(--app-safe-area-top)) 14px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
}

.icon-button,
.header-action,
.mode-tabs button,
.filter-row select,
.facet-row button,
.clear-filters,
.state-panel button,
.selection-bar button,
.maintenance button {
  min-height: 42px;
}

.icon-button {
  width: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  color: var(--text-color);
  background: transparent;
  border: 0;
}

.header-copy {
  min-width: 0;
  flex: 1;
}

.header-copy h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.header-copy p {
  margin: 3px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
}

.header-action {
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 34%, transparent);
  border-radius: var(--app-radius-md);
  white-space: nowrap;
}

.header-action:disabled {
  opacity: 0.65;
}

.tasks-button {
  position: relative;
}

.activity-dot {
  position: absolute;
  top: 8px;
  right: 7px;
  width: 7px;
  height: 7px;
  background: var(--primary-color);
  border: 2px solid var(--sidebar-bg);
  border-radius: 50%;
}

.import-banner {
  padding: 9px 16px 11px;
  background: color-mix(in srgb, var(--primary-color) 10%, var(--container-bg));
  border-bottom: var(--border-width) solid var(--border-color);
}

.import-copy {
  display: flex;
  justify-content: space-between;
  color: var(--text-color-light);
  font-size: 12px;
}

.import-copy button {
  min-height: 28px;
  padding: 0 7px;
  color: var(--danger-color);
  background: transparent;
  border: 0;
  font: inherit;
}

.progress-label {
  display: block;
  margin-top: 4px;
  color: var(--text-color-light);
  font-size: 11px;
  text-align: right;
}

.progress-track,
.bar-track {
  height: 5px;
  margin-top: 7px;
  overflow: hidden;
  background: var(--border-color);
  border-radius: 99px;
}

.progress-track span,
.bar-track span {
  display: block;
  height: 100%;
  background: var(--primary-color);
  border-radius: inherit;
  transition: width 0.2s ease;
}

.mode-tabs {
  padding: 10px 16px 2px;
  display: flex;
  gap: 6px;
  background: var(--bg-color);
}

.mode-tabs button {
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-color-light);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--app-radius-md);
  font-size: 13px;
}

.mode-tabs button.active {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 30%, transparent);
}

.page-content {
  min-height: 0;
  flex: 1;
  padding: 10px 16px 24px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.filters {
  position: sticky;
  top: -10px;
  z-index: 2;
  padding: 5px 0 12px;
  background: var(--bg-color);
}

.search-field {
  min-height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-light);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
}

.search-field input {
  min-width: 0;
  flex: 1;
  color: var(--text-color);
  background: transparent;
  border: 0;
  outline: 0;
  font: inherit;
}

.filter-row {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.filter-row select {
  min-width: 0;
  padding: 0 8px;
  color: var(--text-color);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  font: inherit;
  text-overflow: ellipsis;
}

.facet-row {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.facet-row::-webkit-scrollbar {
  display: none;
}

.facet-row button,
.clear-filters {
  flex: 0 0 auto;
  padding: 0 11px;
  color: var(--text-color-light);
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 99px;
  font-size: 12px;
  white-space: nowrap;
}

.facet-row button.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.clear-filters {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  background: transparent;
  border-radius: var(--app-radius-md);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.state-panel {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-light);
  text-align: center;
}

.state-panel p {
  margin: 0;
}

.state-panel button {
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 34%, transparent);
  border-radius: var(--app-radius-md);
}

.state-panel--error {
  color: var(--danger-color);
}

.storage-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.storage-overview,
.storage-section {
  padding: 16px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
}

.storage-total {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.storage-total span,
.storage-total small,
.storage-stats span,
.section-heading span,
.kind-label,
.quiet {
  color: var(--text-color-light);
  font-size: 12px;
}

.storage-total strong {
  font-size: 28px;
  line-height: 1.2;
}

.storage-stats {
  margin-top: 17px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.storage-stats div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.storage-stats strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.section-heading h2 {
  margin: 0;
  font-size: 15px;
}

.kind-bars {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.kind-label {
  display: flex;
  justify-content: space-between;
}

.maintenance {
  padding-bottom: 4px;
}

.maintenance button {
  width: 100%;
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-color);
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.maintenance button:last-child {
  border-bottom: 0;
}

.maintenance button > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.maintenance small {
  color: var(--text-color-light);
  font-size: 12px;
}

.selection-bar {
  min-height: 58px;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--sidebar-bg);
  border-top: var(--border-width) solid var(--border-color);
  box-shadow: 0 -5px 18px rgba(0, 0, 0, 0.08);
}

.selection-bar strong {
  min-width: 0;
  flex: 0 0 auto;
  font-size: 13px;
}

.selection-actions {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}

.selection-actions::-webkit-scrollbar {
  display: none;
}

.selection-bar button {
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color-light);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
  font-size: 12px;
  white-space: nowrap;
}

.selection-bar button.danger {
  color: var(--danger-color);
  border-color: color-mix(in srgb, var(--danger-color) 35%, transparent);
}

.selection-bar .close-selection {
  width: 32px;
  padding: 0;
  justify-content: center;
  border: 0;
  font-size: 22px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (min-width: 620px) {
  .asset-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
