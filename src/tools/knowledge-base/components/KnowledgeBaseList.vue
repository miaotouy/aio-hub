<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { createModuleLogger } from "@/utils/logger";
import {
  Database,
  Pencil,
  Copy,
  Download,
  Trash2,
  Plus,
  Search,
  MoreVertical,
  Settings2,
  CheckSquare,
  X,
  RefreshCw,
  ArrowUpDown,
  Check,
  Tags,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";

const emit = defineEmits<{
  (e: "manage", id: string): void;
}>();

const kbStore = useKnowledgeBaseStore();
const logger = createModuleLogger("knowledge-base/KnowledgeBaseList");
const {
  switchBase,
  createBase,
  updateBaseMeta,
  cloneBase,
  exportBase,
  deleteBase,
  updateVectors,
  batchVectorizeTags,
} = useKnowledgeBase();
const showCreateDialog = ref(false);
const searchQuery = ref("");
const contentMatchedKbIds = ref<Set<string>>(new Set());
const isSearchingContent = ref(false);

const isBatchMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

const localMatchedBases = computed(() => {
  if (!searchQuery.value.trim()) return [];
  const q = searchQuery.value.toLowerCase();
  return kbStore.sortedBases.filter(
    (b) => b.name.toLowerCase().includes(q) || (b.description || "").toLowerCase().includes(q)
  );
});

const filteredBases = computed(() => {
  if (!searchQuery.value.trim()) return kbStore.sortedBases;

  // 合并本地匹配和内容匹配
  const matchedIds = new Set(localMatchedBases.value.map((b) => b.id));
  contentMatchedKbIds.value.forEach((id) => matchedIds.add(id));

  return kbStore.sortedBases.filter((b) => matchedIds.has(b.id));
});

// 全局内容搜索防抖
let searchTimer: any = null;
let currentSearchId = 0;
watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer);

  const trimmed = val.trim();
  if (!trimmed) {
    contentMatchedKbIds.value.clear();
    isSearchingContent.value = false;
    return;
  }

  // 立即进入搜索状态，避免防抖期间显示“无结果”
  isSearchingContent.value = true;
  // 立即清空旧的内容匹配结果，确保 filteredBases 此时只包含本地匹配
  contentMatchedKbIds.value.clear();

  const searchId = ++currentSearchId;

  searchTimer = setTimeout(async () => {
    try {
      // 执行全局关键词搜索，不指定 kbIds
      const results = await kbStore.search(trimmed, 100);

      // 如果已经发起了新的搜索，则丢弃本次结果
      if (searchId !== currentSearchId) return;

      const matchedIds = new Set<string>();
      results.forEach((r) => {
        if (r.kbId) matchedIds.add(r.kbId);
      });
      contentMatchedKbIds.value = matchedIds;
      logger.info("全局内容检索完成", { query: trimmed, matchedCount: matchedIds.size });
    } catch (error) {
      if (searchId === currentSearchId) {
        logger.error("全局内容检索失败", error, { query: trimmed });
      }
    } finally {
      if (searchId === currentSearchId) {
        isSearchingContent.value = false;
      }
    }
  }, 500);
});

const newBaseForm = ref({
  name: "",
  description: "",
});

const handleCreate = async () => {
  if (!newBaseForm.value.name) return;
  await createBase(newBaseForm.value.name, newBaseForm.value.description);
  showCreateDialog.value = false;
  newBaseForm.value = { name: "", description: "" };
};

const handleSelect = (id: string) => {
  if (isBatchMode.value) {
    const newSelected = new Set(selectedIds.value);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    selectedIds.value = newSelected;
  } else {
    switchBase(id);
  }
};

const toggleBatchMode = () => {
  isBatchMode.value = !isBatchMode.value;
  selectedIds.value.clear();
};

const handleBatchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedIds.value.size} 个知识库吗？此操作不可恢复。`,
      "批量删除确认",
      {
        type: "warning",
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        confirmButtonClass: "el-button--danger",
      }
    );
    for (const id of Array.from(selectedIds.value)) {
      await deleteBase(id);
    }
    isBatchMode.value = false;
  } catch (error) {}
};

const handleBatchUpdateVectors = async () => {
  if (selectedIds.value.size === 0) return;
  await updateVectors(Array.from(selectedIds.value));
  isBatchMode.value = false;
};

const handleBatchVectorizeTags = async () => {
  if (selectedIds.value.size === 0) return;
  await batchVectorizeTags(Array.from(selectedIds.value));
  isBatchMode.value = false;
};

const handleManage = (id: string) => {
  switchBase(id);
  emit("manage", id);
};

const handleRename = async (id?: string) => {
  const targetId = id || kbStore.activeBaseId;
  if (!targetId) return;

  const base = kbStore.bases.find((b) => b.id === targetId);
  const currentName = base?.name || "";

  try {
    const { value: newName } = await ElMessageBox.prompt("请输入新的名称", "重命名知识库", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: currentName,
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });

    if (newName && newName !== currentName) {
      await updateBaseMeta(targetId, { name: newName });
      customMessage.success("重命名成功");
    }
  } catch (error) {
    // 用户取消
  }
};

const handleDelete = async (id?: string) => {
  const targetId = id || kbStore.activeBaseId;
  if (!targetId) return;
  try {
    await ElMessageBox.confirm("确定删除该知识库吗？此操作不可恢复。", "删除确认", {
      type: "warning",
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger",
    });
    await deleteBase(targetId);
  } catch (error) {}
};

const handleClone = (id: string) => {
  cloneBase(id);
};

const handleExport = (id: string) => {
  exportBase(id);
};

const formatTokens = (num: number) => {
  if (num < 1000) return num.toString();
  if (num < 1000000) return (num / 1000).toFixed(1) + "k";
  return (num / 1000000).toFixed(1) + "m";
};
</script>

<template>
  <div class="kb-list-container">
    <!-- 头部区域 -->
    <div class="sidebar-top">
      <div class="header-row" v-if="!isBatchMode">
        <el-input
          v-model="searchQuery"
          placeholder="搜索知识库..."
          clearable
          size="small"
          class="search-input"
        >
          <template #prefix>
            <el-icon v-if="isSearchingContent" class="is-loading">
              <RefreshCw :size="14" />
            </el-icon>
            <Search v-else :size="14" />
          </template>
        </el-input>

        <div class="toolbar-group">
          <el-dropdown trigger="click" size="small">
            <div>
              <el-tooltip content="排序方式" placement="top" :show-after="500">
                <el-button size="small" circle>
                  <template #icon><ArrowUpDown :size="14" /></template>
                </el-button>
              </el-tooltip>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="item in [
                    { label: '名称', value: 'name' },
                    { label: '更新时间', value: 'updatedAt' },
                    { label: '条目数', value: 'entryCount' },
                  ]"
                  :key="item.value"
                  @click="kbStore.baseSort.field = item.value as any"
                >
                  <div class="sort-menu-item">
                    <span>{{ item.label }}</span>
                    <Check v-if="kbStore.baseSort.field === item.value" :size="14" />
                  </div>
                </el-dropdown-item>
                <el-dropdown-item divided @click="kbStore.baseSort.order = 'asc'">
                  <div class="sort-menu-item">
                    <span>升序</span>
                    <Check v-if="kbStore.baseSort.order === 'asc'" :size="14" />
                  </div>
                </el-dropdown-item>
                <el-dropdown-item @click="kbStore.baseSort.order = 'desc'">
                  <div class="sort-menu-item">
                    <span>降序</span>
                    <Check v-if="kbStore.baseSort.order === 'desc'" :size="14" />
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="toolbar-group">
          <el-tooltip content="批量管理" placement="top">
            <el-button size="small" circle @click="toggleBatchMode">
              <template #icon><CheckSquare :size="14" /></template>
            </el-button>
          </el-tooltip>
          <el-tooltip content="创建知识库" placement="top">
            <el-button type="primary" circle size="small" @click="showCreateDialog = true">
              <template #icon><Plus :size="14" /></template>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <!-- 批量管理头部 -->
      <div class="header-row batch-header" v-else>
        <div class="batch-info">
          <CheckSquare :size="14" class="batch-icon" />
          <span class="batch-count">已选 {{ selectedIds.size }}</span>
        </div>
        <div class="batch-actions">
          <el-tooltip content="批量向量化标签 (仅同步标签池)">
            <el-button
              size="small"
              circle
              type="success"
              plain
              @click="handleBatchVectorizeTags"
              :disabled="selectedIds.size === 0"
            >
              <Tags :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="批量同步条目向量 (全文)">
            <el-button
              size="small"
              circle
              type="primary"
              plain
              @click="handleBatchUpdateVectors"
              :disabled="selectedIds.size === 0"
            >
              <RefreshCw :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="批量删除">
            <el-button
              size="small"
              circle
              type="danger"
              plain
              @click="handleBatchDelete"
              :disabled="selectedIds.size === 0"
            >
              <Trash2 :size="14" />
            </el-button>
          </el-tooltip>
          <el-button size="small" circle @click="toggleBatchMode">
            <X :size="14" />
          </el-button>
        </div>
      </div>
    </div>

    <!-- 列表区域 -->
    <div class="list-content custom-scrollbar">
      <div
        v-for="base in filteredBases"
        :key="base.id"
        class="kb-item"
        :class="{
          active: !isBatchMode && kbStore.activeBaseId === base.id,
          'is-selecting': isBatchMode,
        }"
        @click="handleSelect(base.id)"
      >
        <!-- 基本信息 -->
        <div class="info">
          <div class="name-row">
            <!-- 选择模式下的勾选框 -->
            <el-checkbox
              v-if="isBatchMode"
              :model-value="selectedIds.has(base.id)"
              class="kb-checkbox"
              pointer-events-none
            />
            <Database :size="16" class="kb-icon" v-else />
            <div class="name">{{ base.name }}</div>
          </div>
          <div class="description" v-if="base.description">{{ base.description }}</div>
          <div class="meta">
            {{ base.entryCount }} 条目
            <template v-if="base.totalTokens">
              · {{ formatTokens(base.totalTokens) }} Tokens
            </template>
          </div>
        </div>

        <!-- 条目操作菜单 -->
        <div class="item-actions" v-if="!isBatchMode" @click.stop>
          <el-dropdown trigger="click" placement="bottom-end">
            <div class="more-btn">
              <MoreVertical :size="14" />
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleManage(base.id)">
                  <Settings2 :size="14" class="menu-icon" /> 管理与统计
                </el-dropdown-item>
                <el-dropdown-item @click="handleRename(base.id)" divided>
                  <Pencil :size="14" class="menu-icon" /> 重命名
                </el-dropdown-item>
                <el-dropdown-item @click="handleClone(base.id)">
                  <Copy :size="14" class="menu-icon" /> 克隆
                </el-dropdown-item>
                <el-dropdown-item @click="handleExport(base.id)">
                  <Download :size="14" class="menu-icon" /> 导出
                </el-dropdown-item>
                <el-dropdown-item
                  divided
                  @click="handleDelete(base.id)"
                  style="color: var(--el-color-danger)"
                >
                  <Trash2 :size="14" class="menu-icon" /> 删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredBases.length === 0" class="empty-state">
        <template v-if="searchQuery">
          <div class="empty-text" v-if="isSearchingContent">
            <el-icon class="is-loading" style="margin-bottom: 8px; font-size: 20px">
              <RefreshCw />
            </el-icon>
            <div>正在深度检索内容...</div>
          </div>
          <div class="empty-text" v-else>未找到相关知识库</div>
        </template>
        <template v-else>
          <el-button type="primary" link @click="showCreateDialog = true">
            创建第一个知识库
          </el-button>
        </template>
      </div>
    </div>

    <!-- 创建对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建知识库" width="400px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="newBaseForm.name" placeholder="请输入知识库名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="newBaseForm.description"
            type="textarea"
            placeholder="可选描述"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!newBaseForm.name">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.kb-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
}

/* 头部样式 */
.sidebar-top {
  padding: 12px 16px;
  background-color: transparent;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 4px;
  height: 32px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-row :deep(.el-button) {
  margin-left: 0 !important;
}

.batch-header {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
  margin: -4px;
  padding: 4px 12px;
  border-radius: 6px;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-primary);
  font-weight: 600;
  font-size: 13px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.batch-actions :deep(.el-button) {
  margin-left: 0 !important;
}

.search-input {
  flex: 1;
}

.search-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: none;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
  padding: 0 8px;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
  background-color: var(--el-bg-color);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

/* 列表样式 */
.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.kb-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 4px;
  gap: 10px;
  position: relative;
  border: 1px solid transparent;
}

.kb-item:hover {
  background-color: var(--el-fill-color-light);
}

.kb-item.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
}

.kb-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 25%;
  height: 50%;
  width: 3px;
  background-color: var(--el-color-primary);
  border-radius: 0 4px 4px 0;
}

.kb-item.active .name,
.kb-item.active .kb-icon {
  color: var(--el-color-primary);
  font-weight: 600;
}

.kb-item.is-selecting {
  border-color: transparent;
}

.kb-item.is-selecting:hover {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 95%);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
}

.kb-item.is-selecting.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
  border-color: rgba(var(--el-color-primary-rgb), 0.3);
}

.info {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.kb-icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.kb-checkbox {
  margin-right: 0;
  height: 20px;
  display: flex;
  align-items: center;
  pointer-events: none; /* 让点击事件穿透到父级 kb-item */
}

.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
  flex: 1;
}

.description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.meta {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

/* 操作按钮 */
.item-actions {
  opacity: 1;
  display: flex;
  align-items: center;
}

.more-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.more-btn:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

.menu-icon {
  margin-right: 8px;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100px;
  gap: 8px;
}

/* 空状态 */
.empty-state {
  padding: 40px 20px;
  text-align: center;
}

.empty-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

/* 滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
</style>
