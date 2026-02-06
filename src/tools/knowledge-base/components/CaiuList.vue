<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { createModuleLogger } from "@/utils/logger";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Search, RotateCw, Plus, Zap, Clock, FileUp, ArrowUpDown, Check } from "lucide-vue-next";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { isTextFile } from "@/utils/fileTypeDetector";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  searchQuery: string;
  isSelectionMode: boolean;
  selectedEntryIds: Set<string>;
}>();

const emit = defineEmits<{
  (e: "update:searchQuery", value: string): void;
  (e: "update:selectedEntryIds", value: Set<string>): void;
  (e: "add"): void;
}>();

const kbStore = useKnowledgeBaseStore();
const logger = createModuleLogger("knowledge-base/CaiuList");
const { switchBase, addEntries, batchImportFiles } = useKnowledgeBase();
const listContainerRef = ref<HTMLElement>();
const fileInputRef = ref<HTMLInputElement>();

const getEntryVectorStatus = (entry: any) => {
  if (!entry) return "none";
  if (kbStore.pendingIds.has(entry.id)) return "pending";
  if (kbStore.failedIds.has(entry.id)) return "error";
  if (kbStore.vectorizedIds.has(entry.id)) return "ready";
  return "none";
};

// 搜索状态
const remoteSearchResults = ref<any[]>([]);
const isSearching = ref(false);

// 搜索防抖
const debouncedSearchQuery = ref(props.searchQuery);
let debounceTimer: any = null;
watch(
  () => props.searchQuery,
  (val) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedSearchQuery.value = val;
    }, 300);
  }
);

// 监听搜索词变化，触发后端搜索
watch(debouncedSearchQuery, async (val) => {
  const startTime = Date.now();

  if (!val.trim()) {
    remoteSearchResults.value = [];
    return;
  }

  isSearching.value = true;
  remoteSearchResults.value = []; // 开始新搜索时立即清空旧结果，触发显示本地预览

  try {
    const results = await kbStore.search(val, 50);
    const duration = Date.now() - startTime;
    logger.info("后端检索完成", { query: val, count: results.length, duration: `${duration}ms` });

    // 提取条目信息并附加分数
    // 注意：后端返回结构是 SearchResult { caiu: Caiu, score: f32, ... }
    // 并且 Caiu.tags 是 TagWithWeight[]，模板需要的是 string[]
    remoteSearchResults.value = results
      .map((r) => {
        const entry = r.caiu;
        if (!entry) return null;
        return {
          ...entry,
          // 关键：将后端的对象标签数组转为前端模板需要的字符串数组
          tags: Array.isArray(entry.tags)
            ? entry.tags.map((t: any) => (typeof t === "string" ? t : t.name))
            : [],
          searchScore: r.score,
        };
      })
      .filter(Boolean);
  } catch (err) {
    logger.error("后端检索失败", err, { query: val });
  } finally {
    isSearching.value = false;
  }
});

const processFiles = async (files: File[]) => {
  if (!kbStore.activeBaseId) {
    customMessage.warning("请先选择或创建一个知识库");
    return;
  }

  const textFiles = files.filter((f) => isTextFile(f.name, f.type));
  if (textFiles.length === 0) {
    customMessage.warning("未发现可识别的文本文件");
    return;
  }

  // 并行读取文件内容
  const readPromises = textFiles.map(async (file) => {
    try {
      if (file.size > 5 * 1024 * 1024) return null;
      const content = await file.text();
      return {
        key: file.name.replace(/\.[^/.]+$/, ""),
        content,
      };
    } catch (e) {
      console.error(`读取文件 ${file.name} 失败:`, e);
      return null;
    }
  });

  const results = await Promise.all(readPromises);
  const tasks = results.filter((t): t is { key: string; content: string } => t !== null);
  let skippedCount = textFiles.length - tasks.length;

  if (tasks.length > 0) {
    const { ids, dupeCount, skippedCount: addErrorCount } = await addEntries(tasks);
    if (ids.length > 0) {
      customMessage.success(`成功导入 ${ids.length} 个条目`);
    }
    if (dupeCount > 0) {
      customMessage.info(`${dupeCount} 个重复内容条目已跳过`);
    }
    if (addErrorCount > 0) {
      skippedCount += addErrorCount;
    }
  }

  if (skippedCount > 0 || textFiles.length < files.length) {
    const totalSkipped = skippedCount + (files.length - textFiles.length);
    customMessage.warning(`${totalSkipped} 个文件（过大、非文本或读取失败）已跳过`);
  }
};

const processPaths = async (paths: string[]) => {
  if (!kbStore.activeBaseId) {
    customMessage.warning("请先选择或创建一个知识库");
    return;
  }

  // 直接调用后端批量导入，由后端进行并行的文本识别和内容读取
  const { ids, dupeCount, skippedCount } = await batchImportFiles(paths);

  if (ids.length > 0) {
    customMessage.success(`成功导入 ${ids.length} 个条目`);
  }
  if (dupeCount > 0) {
    customMessage.info(`${dupeCount} 个重复内容条目已跳过`);
  }
  if (skippedCount > 0) {
    customMessage.warning(`${skippedCount} 个文件处理失败或已跳过`);
  }
};

const { isDraggingOver } = useFileInteraction({
  element: listContainerRef,
  onFiles: processFiles,
  onPaths: processPaths,
  multiple: true,
});

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    processFiles(Array.from(target.files));
    target.value = ""; // 清空以允许重复选择同一文件
  }
};

const searchQueryModel = computed({
  get: () => props.searchQuery,
  set: (val) => emit("update:searchQuery", val),
});

const localFilteredEntries = computed(() => {
  if (!debouncedSearchQuery.value.trim()) return [];
  const q = debouncedSearchQuery.value.toLowerCase();
  return kbStore.sortedEntries.filter(
    (e) => e.key.toLowerCase().includes(q) || (e.summary || "").toLowerCase().includes(q)
  );
});

const entryList = computed(() => {
  const q = debouncedSearchQuery.value.trim();
  if (q) {
    // 逻辑决策
    if (isSearching.value && remoteSearchResults.value.length === 0) {
      return localFilteredEntries.value;
    }

    if (remoteSearchResults.value.length > 0) {
      return remoteSearchResults.value;
    }

    if (!isSearching.value && remoteSearchResults.value.length === 0) {
      return [];
    }

    return localFilteredEntries.value;
  }

  return kbStore.sortedEntries;
});

// 虚拟滚动逻辑
const scrollContainerRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer({
  get count() {
    return entryList.value.length;
  },
  getScrollElement: () => scrollContainerRef.value,
  estimateSize: () => 140, // 预估卡片高度
  overscan: 10,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 切换库或搜索时重置滚动
watch([() => kbStore.activeBaseId, debouncedSearchQuery], () => {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
});

const handleRefresh = async () => {
  if (kbStore.activeBaseId) {
    await switchBase(kbStore.activeBaseId);
    // 深度校验向量状态
    await kbStore.validateVectorStatus();
  }
};

const handleSelect = (id: string) => {
  if (props.isSelectionMode) {
    const newSelected = new Set(props.selectedEntryIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    // 触发更新，通过替换新 Set 确保父组件响应式触发
    emit("update:selectedEntryIds", newSelected);
  } else {
    kbStore.activeEntryId = id;
  }
};
</script>

<template>
  <div
    ref="listContainerRef"
    class="caiu-list-container"
    :class="{ 'is-dragging': isDraggingOver }"
  >
    <div class="drag-overlay" v-if="isDraggingOver">
      <div class="drag-hint">
        <FileUp :size="32" />
        <span>释放以导入为新条目</span>
      </div>
    </div>

    <div class="sidebar-header">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchQueryModel"
          placeholder="搜索条目..."
          :prefix-icon="Search"
          clearable
          size="default"
        />
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="count-badge">
            <template v-if="debouncedSearchQuery">
              <template v-if="isSearching && remoteSearchResults.length === 0">
                本地匹配 {{ entryList.length }} 项，正在检索...
              </template>
              <template v-else-if="isSearching">
                找到 {{ entryList.length }} 项，正在同步...
              </template>
              <template v-else> 找到 {{ entryList.length }} 个匹配项 </template>
            </template>
            <template v-else>
              {{ entryList.length }} / {{ kbStore.sortedEntries.length }}
            </template>
          </span>
          <el-icon v-if="isSearching" class="is-loading" style="margin-left: 4px">
            <RotateCw :size="12" />
          </el-icon>
        </div>

        <div class="toolbar-right">
          <input
            ref="fileInputRef"
            type="file"
            multiple
            style="display: none"
            @change="handleFileChange"
          />
          <div class="toolbar-group">
            <el-dropdown trigger="click" size="small">
              <div>
                <el-tooltip content="排序方式" placement="bottom" :show-after="500">
                  <el-button link class="icon-btn">
                    <ArrowUpDown :size="16" />
                  </el-button>
                </el-tooltip>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="item in [
                      { label: '名称', value: 'key' },
                      { label: '更新时间', value: 'updatedAt' },
                      { label: '优先级', value: 'priority' },
                    ]"
                    :key="item.value"
                    @click="kbStore.entrySort.field = item.value as any"
                  >
                    <div class="sort-menu-item">
                      <span>{{ item.label }}</span>
                      <Check v-if="kbStore.entrySort.field === item.value" :size="14" />
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="kbStore.entrySort.order = 'asc'">
                    <div class="sort-menu-item">
                      <span>升序</span>
                      <Check v-if="kbStore.entrySort.order === 'asc'" :size="14" />
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item @click="kbStore.entrySort.order = 'desc'">
                    <div class="sort-menu-item">
                      <span>降序</span>
                      <Check v-if="kbStore.entrySort.order === 'desc'" :size="14" />
                    </div>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div class="toolbar-group">
            <el-tooltip content="刷新列表" placement="bottom">
              <el-button link @click="handleRefresh" class="icon-btn">
                <RotateCw :size="16" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="导入文本文件" placement="bottom">
              <el-button link @click="triggerFileInput" class="icon-btn">
                <FileUp :size="16" />
              </el-button>
            </el-tooltip>
          </div>

          <el-button type="primary" @click="emit('add')" class="add-btn">
            <Plus :size="16" />
            <span>新建</span>
          </el-button>
        </div>
      </div>
    </div>

    <div ref="scrollContainerRef" class="entry-list custom-scrollbar">
      <div
        v-if="entryList.length > 0"
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="entryList[virtualItem.index]?.id || virtualItem.index"
          :data-index="virtualItem.index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
            padding: '4px 0',
          }"
        >
          <div
            v-if="entryList[virtualItem.index]"
            class="entry-card"
            :class="{
              active: !isSelectionMode && kbStore.activeEntryId === entryList[virtualItem.index].id,
              'is-selecting': isSelectionMode,
            }"
            @click="handleSelect(entryList[virtualItem.index].id)"
          >
            <div class="card-header">
              <div class="title-row">
                <el-checkbox
                  v-if="isSelectionMode"
                  :model-value="selectedEntryIds.has(entryList[virtualItem.index].id)"
                  @click.stop
                  @change="() => handleSelect(entryList[virtualItem.index].id)"
                  class="entry-checkbox"
                />
                <span class="card-title">{{ entryList[virtualItem.index].key }}</span>
              </div>
              <div class="card-meta">
                <el-tooltip
                  :content="
                    getEntryVectorStatus(entryList[virtualItem.index]) === 'ready'
                      ? '已向量化'
                      : getEntryVectorStatus(entryList[virtualItem.index]) === 'pending'
                        ? '正在执行向量化'
                        : getEntryVectorStatus(entryList[virtualItem.index]) === 'error'
                          ? '向量化失败'
                          : '未向量化'
                  "
                  placement="top"
                >
                  <Zap
                    :size="12"
                    class="vector-icon"
                    :class="[
                      getEntryVectorStatus(entryList[virtualItem.index]),
                      { 'is-spinning': getEntryVectorStatus(entryList[virtualItem.index]) === 'pending' },
                    ]"
                  />
                </el-tooltip>
                <Clock :size="12" />
                <span>{{
                  new Date(entryList[virtualItem.index].updatedAt).toLocaleDateString()
                }}</span>
              </div>
            </div>
            <div class="card-preview">
              {{ entryList[virtualItem.index].summary || "无内容预览" }}
            </div>
            <div class="card-footer">
              <div class="tags-row" v-if="entryList[virtualItem.index]?.tags?.length > 0">
                <el-tag
                  v-for="tagName in entryList[virtualItem.index].tags.slice(0, 3)"
                  :key="tagName"
                  size="small"
                  effect="plain"
                  >{{ tagName }}</el-tag
                >
                <span v-if="entryList[virtualItem.index].tags.length > 3" class="more-tags"
                  >+{{ entryList[virtualItem.index].tags.length - 3 }}</span
                >
              </div>
              <div class="priority-badge" v-if="entryList[virtualItem.index]?.priority !== 100">
                P{{ entryList[virtualItem.index].priority }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <el-empty
        v-if="entryList.length === 0"
        :description="isSearching ? '正在深度检索中...' : '暂无匹配条目'"
        :image-size="40"
      >
        <template #image v-if="isSearching">
          <div class="searching-loader">
            <RotateCw :size="40" class="is-loading" />
          </div>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.caiu-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  transition: background-color 0.2s ease;
}

.caiu-list-container.is-dragging {
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 2px dashed var(--el-color-primary);
  margin: 4px;
  border-radius: 8px;
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.search-bar {
  width: 100%;
}

.search-bar :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: none;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.search-bar :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
  background-color: var(--el-bg-color);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-right :deep(.el-button) {
  margin-left: 0 !important;
}

.count-badge {
  font-size: 11px;
  padding: 0 8px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.icon-btn {
  padding: 0;
  height: 28px;
  width: 28px;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.icon-btn:hover {
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.1);
  border-radius: 4px;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  height: 28px;
  font-size: 12px;
  border-radius: 6px;
}

.add-btn span {
  display: inline-block;
}

/* 极窄模式适配 */
@media (max-width: 300px) {
  .add-btn span {
    display: none;
  }
  .add-btn {
    width: 28px;
    padding: 0;
  }
}

.entry-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entry-card {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.entry-card.active {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
}

.entry-card.is-selecting {
  border-color: transparent;
}

.entry-card.is-selecting:hover {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 95%);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
}

.entry-card.is-selecting.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
  border-color: rgba(var(--el-color-primary-rgb), 0.3);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.entry-checkbox {
  margin-right: 0;
  height: 20px;
  display: flex;
  align-items: center;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: -webkit-box;
  line-clamp: 1;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.vector-icon {
  color: var(--el-text-color-disabled);
}

.vector-icon.ready {
  color: var(--el-color-success);
}

.vector-icon.pending {
  color: var(--el-color-warning);
}

.vector-icon.error {
  color: var(--el-color-danger);
}

.is-spinning {
  animation: pulse 1.5s infinite ease-in-out;
}

.card-preview {
  font-size: 12px;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  min-height: 4.5em;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.tags-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.more-tags {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.priority-badge {
  font-size: 10px;
  font-weight: bold;
  color: var(--el-color-warning);
  background: rgba(var(--el-color-warning-rgb), 0.1);
  padding: 1px 4px;
  border-radius: 4px;
}

@keyframes pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.searching-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  opacity: 0.5;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100px;
  gap: 8px;
}
</style>
