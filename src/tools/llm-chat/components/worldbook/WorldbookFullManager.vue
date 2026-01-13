<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useWorldbookStore } from "../../stores/worldbookStore";
import { importSTWorldbook } from "../../services/worldbookImportService";
import { exportWorldbook, exportWorldbooksBatch } from "../../services/worldbookExportService";
import { customMessage } from "@/utils/customMessage";
import {
  Book,
  Trash2,
  Download,
  Upload,
  Plus,
  FileJson,
  ChevronRight,
  Pencil,
  Copy,
  CheckSquare,
  X,
} from "lucide-vue-next";
import DropZone from "@/components/common/DropZone.vue";
import WorldbookDetail from "./WorldbookDetail.vue";
import { useElementSize } from "@vueuse/core";
import { ElMessageBox } from "element-plus";

const worldbookStore = useWorldbookStore();
const selectedWbId = ref<string | null>(null);
const isSelectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const containerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

// 考虑到内部还有一层条目列表，外层阈值需要提高
const isWide = computed(() => width.value > 1280);

const allSelected = computed(() => {
  return (
    worldbookStore.worldbooks.length > 0 &&
    selectedIds.value.size === worldbookStore.worldbooks.length
  );
});

const isIndeterminate = computed(() => {
  return selectedIds.value.size > 0 && selectedIds.value.size < worldbookStore.worldbooks.length;
});

onMounted(async () => {
  await worldbookStore.loadWorldbooks();
  if (worldbookStore.worldbooks.length > 0 && !selectedWbId.value) {
    selectedWbId.value = worldbookStore.worldbooks[0].id;
  }
});

// 自动选择新导入的世界书
watch(
  () => worldbookStore.worldbooks.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      selectedWbId.value = worldbookStore.worldbooks[worldbookStore.worldbooks.length - 1].id;
    }
  }
);

const processImportFile = async (file: File) => {
  const id = await importSTWorldbook(file);
  if (id) {
    customMessage.success(`世界书《${file.name.replace(/\.[^/.]+$/, "")}》导入成功`);
    await worldbookStore.loadWorldbooks();
    selectedWbId.value = id;
  }
};

const handleImport = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.lorebook,.png";
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) await processImportFile(file);
  };
  input.click();
};

const handleFilesDrop = async (files: File[]) => {
  const validExts = [".json", ".lorebook", ".png"];
  for (const file of files) {
    if (validExts.some((ext) => file.name.endsWith(ext))) {
      await processImportFile(file);
    }
  }
};

const handleCreate = async () => {
  try {
    const { value: name } = await ElMessageBox.prompt("请输入世界书名称", "新建世界书", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    if (name) {
      const id = await worldbookStore.createWorldbook(name);
      selectedWbId.value = id;
      customMessage.success(`世界书《${name}》已创建`);
    }
  } catch (error) {
    // 取消
  }
};

const handleRename = async () => {
  if (!selectedWbId.value) return;
  const wb = worldbookStore.worldbooks.find((w) => w.id === selectedWbId.value);
  if (!wb) return;

  try {
    const { value: newName } = await ElMessageBox.prompt("请输入新的名称", "重命名世界书", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: wb.name,
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    if (newName && newName !== wb.name) {
      await worldbookStore.renameWorldbook(wb.id, newName);
      customMessage.success("已重命名");
    }
  } catch (error) {
    // 取消
  }
};

const handleDuplicate = async () => {
  if (!selectedWbId.value) return;
  try {
    const newId = await worldbookStore.duplicateWorldbook(selectedWbId.value);
    if (newId) {
      selectedWbId.value = newId;
      customMessage.success("已克隆世界书");
    }
  } catch (error) {
    customMessage.error("克隆失败");
  }
};

const handleDelete = async () => {
  if (!selectedWbId.value) return;
  try {
    const id = selectedWbId.value;
    await worldbookStore.deleteWorldbook(id);
    customMessage.success("世界书已删除");
    selectedWbId.value =
      worldbookStore.worldbooks.length > 0 ? worldbookStore.worldbooks[0].id : null;
  } catch (error) {
    customMessage.error("删除失败");
  }
};
const handleExport = async () => {
  if (!selectedWbId.value) return;
  await exportWorldbook(selectedWbId.value);
};

// --- 批量操作逻辑 ---

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedIds.value.clear();
  if (!isSelectionMode.value && worldbookStore.worldbooks.length > 0 && !selectedWbId.value) {
    // 退出选择模式时，如果没有选中项，默认选中第一个
    selectedWbId.value = worldbookStore.worldbooks[0].id;
  }
};

const toggleSelection = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const handleSelectAll = (val: any) => {
  if (val) {
    worldbookStore.worldbooks.forEach((wb) => selectedIds.value.add(wb.id));
  } else {
    selectedIds.value.clear();
  }
};

const handleBatchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.size} 本世界书吗？此操作不可恢复。`,
      "批量删除",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    const idsToDelete = Array.from(selectedIds.value);
    await worldbookStore.deleteWorldbooks(idsToDelete);

    selectedIds.value.clear();
    customMessage.success("批量删除成功");

    // 如果当前选中的被删除了，重置
    if (selectedWbId.value && idsToDelete.includes(selectedWbId.value)) {
      selectedWbId.value =
        worldbookStore.worldbooks.length > 0 ? worldbookStore.worldbooks[0].id : null;
    }
  } catch (error) {
    // 取消或失败
  }
};

const handleBatchExport = async () => {
  if (selectedIds.value.size === 0) return;
  const ids = Array.from(selectedIds.value);
  await exportWorldbooksBatch(ids);
  isSelectionMode.value = false;
  selectedIds.value.clear();
};
</script>

<template>
  <div class="worldbook-full-manager" ref="containerRef" :class="{ 'is-narrow': !isWide }">
    <!-- 顶部操作栏 -->
    <div class="manager-header" :class="{ 'selection-mode': isSelectionMode }">
      <!-- 正常模式 -->
      <template v-if="!isSelectionMode">
        <div v-if="!isWide" class="selector-section">
          <el-select
            v-model="selectedWbId"
            placeholder="切换世界书..."
            class="wb-selector"
            filterable
          >
            <template #prefix>
              <el-icon><Book /></el-icon>
            </template>
            <el-option
              v-for="wb in worldbookStore.worldbooks"
              :key="wb.id"
              :label="wb.name"
              :value="wb.id"
            />
          </el-select>
        </div>
        <div v-else class="header-title">
          <Book :size="20" />
          <span>世界书管理</span>
        </div>

        <div class="actions-section">
          <el-button-group>
            <el-button :icon="CheckSquare" @click="toggleSelectionMode">批量管理</el-button>
            <el-button :icon="Plus" @click="handleCreate">新建</el-button>
            <el-button :icon="Upload" @click="handleImport">导入</el-button>
          </el-button-group>
        </div>
      </template>

      <!-- 批量模式：显示统一的操作条 -->
      <template v-else>
        <div class="batch-bar">
          <div class="batch-info">
            <el-checkbox
              :model-value="allSelected"
              :indeterminate="isIndeterminate"
              @change="handleSelectAll"
            >
              全选
            </el-checkbox>
            <span class="count">已选 {{ selectedIds.size }} 项</span>
          </div>
          <div class="batch-ops">
            <el-button
              :icon="Download"
              :disabled="selectedIds.size === 0"
              @click="handleBatchExport"
              >导出</el-button
            >
            <el-button
              :icon="Trash2"
              type="danger"
              plain
              :disabled="selectedIds.size === 0"
              @click="handleBatchDelete"
              >删除</el-button
            >
            <el-button :icon="X" @click="toggleSelectionMode">退出</el-button>
          </div>
        </div>
      </template>
    </div>

    <div class="manager-content">
      <!-- 宽屏模式：左侧列表 -->
      <aside v-if="isWide" class="wb-list-sidebar">
        <div class="sidebar-top">
          <span class="title">世界书仓库</span>
        </div>

        <div class="wb-items custom-scrollbar">
          <div
            v-for="wb in worldbookStore.worldbooks"
            :key="wb.id"
            class="wb-item"
            :class="{
              active: !isSelectionMode && selectedWbId === wb.id,
              'is-selecting': isSelectionMode,
            }"
            @click="isSelectionMode ? toggleSelection(wb.id) : (selectedWbId = wb.id)"
          >
            <div class="wb-item-icon" v-if="!isSelectionMode">
              <FileJson :size="18" />
            </div>
            <div class="wb-checkbox" v-else>
              <el-checkbox
                :model-value="selectedIds.has(wb.id)"
                @change="toggleSelection(wb.id)"
                @click.stop
              />
            </div>

            <div class="wb-item-info">
              <div class="wb-name">{{ wb.name }}</div>
              <div class="wb-meta">{{ wb.entryCount }} 个条目</div>
            </div>
            <ChevronRight v-if="!isSelectionMode" class="arrow" :size="16" />
          </div>

          <div v-if="worldbookStore.worldbooks.length === 0" class="empty-state">
            <el-button type="primary" link @click="handleImport">导入第一本世界书</el-button>
          </div>
        </div>

        <!-- 单个操作栏 -->
        <div class="sidebar-footer" v-if="!isSelectionMode && selectedWbId">
          <el-button-group class="full-width">
            <el-button :icon="Pencil" @click="handleRename" title="重命名" />
            <el-button :icon="Copy" @click="handleDuplicate" title="克隆" />
            <el-button :icon="Download" @click="handleExport" title="导出" />
            <el-popconfirm title="确定删除？" @confirm="handleDelete">
              <template #reference>
                <el-button :icon="Trash2" type="danger" plain title="删除" />
              </template>
            </el-popconfirm>
          </el-button-group>
        </div>
      </aside>

      <!-- 窄屏批量模式：显示列表 -->
      <div v-if="!isWide && isSelectionMode" class="narrow-selection-list custom-scrollbar">
        <div
          v-for="wb in worldbookStore.worldbooks"
          :key="wb.id"
          class="wb-item"
          @click="toggleSelection(wb.id)"
        >
          <div class="wb-checkbox">
            <el-checkbox
              :model-value="selectedIds.has(wb.id)"
              @change="toggleSelection(wb.id)"
              @click.stop
            />
          </div>
          <div class="wb-item-info">
            <div class="wb-name">{{ wb.name }}</div>
            <div class="wb-meta">{{ wb.entryCount }} 个条目</div>
          </div>
        </div>
        <div v-if="worldbookStore.worldbooks.length === 0" class="empty-state">
          <span>暂无世界书</span>
        </div>
      </div>

      <!-- 主体内容区（非批量模式或宽屏时显示） -->
      <main v-if="!isSelectionMode || isWide" class="manager-main">
        <DropZone
          v-if="!selectedWbId"
          @files-dropped="handleFilesDrop"
          :accept="['.json', '.lorebook', '.png']"
          description="拖拽世界书 JSON/Lorebook/PNG 文件至此处导入"
          class="empty-drop-zone"
        >
          <el-empty description="请选择或导入一本世界书">
            <el-button type="primary" :icon="Upload" @click="handleImport">立即导入</el-button>
            <el-button :icon="Plus" @click="handleCreate">新建世界书</el-button>
          </el-empty>
        </DropZone>

        <WorldbookDetail v-else :id="selectedWbId" :key="selectedWbId" class="detail-view" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.worldbook-full-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 600px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 16px;
}

.manager-header.selection-mode {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

.batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.batch-info .count {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.batch-ops {
  display: flex;
  gap: 8px;
}

.manager-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.wb-list-sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
}

.sidebar-top {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-top .title {
  font-weight: 600;
  font-size: 14px;
}

.wb-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.wb-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  gap: 12px;
}

.wb-item:hover {
  background-color: var(--el-fill-color-light);
}

.wb-item.active {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.wb-item-icon {
  color: var(--el-text-color-secondary);
}

.wb-item.active .wb-item-icon {
  color: var(--el-color-primary);
}

.wb-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
}

.wb-item-info {
  flex: 1;
  min-width: 0;
}

.wb-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wb-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.arrow {
  opacity: 0;
  transition: opacity 0.2s;
}

.wb-item:hover .arrow,
.wb-item.active .arrow {
  opacity: 1;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.full-width {
  width: 100%;
  display: flex;
}

.full-width :deep(.el-button) {
  flex: 1;
}

.manager-main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.selector-section {
  flex: 1;
  max-width: 400px;
}

.wb-selector {
  width: 100%;
}

.empty-drop-zone {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-view {
  flex: 1;
  height: 100%;
}

.empty-state {
  padding: 20px;
  text-align: center;
}

/* 窄屏批量选择列表 */
.narrow-selection-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.narrow-selection-list .wb-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  gap: 12px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.narrow-selection-list .wb-item:hover {
  background-color: var(--el-fill-color-light);
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 50%);
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
</style>
