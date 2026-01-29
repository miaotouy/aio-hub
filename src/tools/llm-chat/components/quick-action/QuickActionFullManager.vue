<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { customMessage } from "@/utils/customMessage";
import {
  Zap,
  Trash2,
  Plus,
  FileJson,
  ChevronRight,
  Pencil,
  Copy,
  CheckSquare,
  X,
} from "lucide-vue-next";
import QuickActionDetail from "./QuickActionDetail.vue";
import { useElementSize } from "@vueuse/core";
import { ElMessageBox } from "element-plus";

const quickActionStore = useQuickActionStore();
const selectedSetId = ref<string | null>(null);
const isSelectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const containerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

const isWide = computed(() => width.value > 1000);

const allSelected = computed(() => {
  return (
    quickActionStore.quickActionSets.length > 0 &&
    selectedIds.value.size === quickActionStore.quickActionSets.length
  );
});

const isIndeterminate = computed(() => {
  return (
    selectedIds.value.size > 0 && selectedIds.value.size < quickActionStore.quickActionSets.length
  );
});

onMounted(async () => {
  await quickActionStore.loadQuickActions();
  if (quickActionStore.quickActionSets.length > 0 && !selectedSetId.value) {
    selectedSetId.value = quickActionStore.quickActionSets[0].id;
  }
});

watch(
  () => quickActionStore.quickActionSets.length,
  (newLen, oldLen) => {
    if (newLen > oldLen && !isSelectionMode.value) {
      selectedSetId.value =
        quickActionStore.quickActionSets[quickActionStore.quickActionSets.length - 1].id;
    }
  }
);

const handleCreate = async () => {
  try {
    const { value: name } = await ElMessageBox.prompt("请输入快捷操作组名称", "新建组", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    if (name) {
      const id = await quickActionStore.createQuickActionSet(name);
      selectedSetId.value = id;
      customMessage.success(`组《${name}》已创建`);
    }
  } catch (error) {
    // 取消
  }
};

const handleRename = async () => {
  if (!selectedSetId.value) return;
  const set = quickActionStore.quickActionSets.find((s) => s.id === selectedSetId.value);
  if (!set) return;

  try {
    const { value: newName } = await ElMessageBox.prompt("请输入新的名称", "重命名组", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: set.name,
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    if (newName && newName !== set.name) {
      await quickActionStore.renameQuickActionSet(set.id, newName);
      customMessage.success("已重命名");
    }
  } catch (error) {
    // 取消
  }
};

const handleDuplicate = async () => {
  if (!selectedSetId.value) return;
  try {
    const newId = await quickActionStore.duplicateQuickActionSet(selectedSetId.value);
    if (newId) {
      selectedSetId.value = newId;
      customMessage.success("已克隆快捷操作组");
    }
  } catch (error) {
    customMessage.error("克隆失败");
  }
};

const handleDelete = async () => {
  if (!selectedSetId.value) return;
  try {
    const id = selectedSetId.value;
    await quickActionStore.deleteQuickActionSet(id);
    customMessage.success("组已删除");
    selectedSetId.value =
      quickActionStore.quickActionSets.length > 0 ? quickActionStore.quickActionSets[0].id : null;
  } catch (error) {
    customMessage.error("删除失败");
  }
};

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedIds.value.clear();
  if (
    !isSelectionMode.value &&
    quickActionStore.quickActionSets.length > 0 &&
    !selectedSetId.value
  ) {
    selectedSetId.value = quickActionStore.quickActionSets[0].id;
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
    quickActionStore.quickActionSets.forEach((s) => selectedIds.value.add(s.id));
  } else {
    selectedIds.value.clear();
  }
};

const handleBatchDelete = async () => {
  if (selectedIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.size} 个快捷操作组吗？此操作不可恢复。`,
      "批量删除",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    const idsToDelete = Array.from(selectedIds.value);
    await quickActionStore.deleteQuickActionSets(idsToDelete);

    selectedIds.value.clear();
    customMessage.success("批量删除成功");

    if (selectedSetId.value && idsToDelete.includes(selectedSetId.value)) {
      selectedSetId.value =
        quickActionStore.quickActionSets.length > 0 ? quickActionStore.quickActionSets[0].id : null;
    }
  } catch (error) {
    // 取消
  }
};
</script>

<template>
  <div class="quick-action-full-manager" ref="containerRef" :class="{ 'is-narrow': !isWide }">
    <div class="manager-header" :class="{ 'selection-mode': isSelectionMode }">
      <template v-if="!isSelectionMode">
        <div v-if="!isWide" class="selector-section">
          <el-select
            v-model="selectedSetId"
            placeholder="切换快捷操作组..."
            class="qa-selector"
            filterable
          >
            <template #prefix>
              <el-icon><Zap /></el-icon>
            </template>
            <el-option
              v-for="set in quickActionStore.quickActionSets"
              :key="set.id"
              :label="set.name"
              :value="set.id"
            />
          </el-select>
        </div>
        <div v-else class="header-title">
          <Zap :size="20" />
          <span>快捷操作管理</span>
        </div>

        <div class="actions-section">
          <el-button-group>
            <el-button :icon="CheckSquare" @click="toggleSelectionMode">批量管理</el-button>
            <el-button :icon="Plus" @click="handleCreate">新建组</el-button>
          </el-button-group>
        </div>
      </template>

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
      <aside v-if="isWide" class="qa-list-sidebar">
        <div class="sidebar-top">
          <span class="title">快捷操作库</span>
        </div>

        <div class="qa-items custom-scrollbar">
          <div
            v-for="set in quickActionStore.quickActionSets"
            :key="set.id"
            class="qa-item"
            :class="{
              active: !isSelectionMode && selectedSetId === set.id,
              'is-selecting': isSelectionMode,
            }"
            @click="isSelectionMode ? toggleSelection(set.id) : (selectedSetId = set.id)"
          >
            <div class="qa-item-icon" v-if="!isSelectionMode">
              <FileJson :size="18" />
            </div>
            <div class="qa-checkbox" v-else>
              <el-checkbox
                :model-value="selectedIds.has(set.id)"
                @change="toggleSelection(set.id)"
                @click.stop
              />
            </div>

            <div class="qa-item-info">
              <div class="qa-name">{{ set.name }}</div>
              <div class="qa-meta">{{ set.actionCount }} 个操作</div>
            </div>
            <ChevronRight v-if="!isSelectionMode" class="arrow" :size="16" />
          </div>

          <div v-if="quickActionStore.quickActionSets.length === 0" class="empty-state">
            <el-button type="primary" link @click="handleCreate">新建第一个快捷操作组</el-button>
          </div>
        </div>

        <div class="sidebar-footer" v-if="!isSelectionMode && selectedSetId">
          <el-button-group class="full-width">
            <el-button :icon="Pencil" @click="handleRename" title="重命名" />
            <el-button :icon="Copy" @click="handleDuplicate" title="克隆" />
            <el-popconfirm title="确定删除？" @confirm="handleDelete">
              <template #reference>
                <el-button :icon="Trash2" type="danger" plain title="删除" />
              </template>
            </el-popconfirm>
          </el-button-group>
        </div>
      </aside>

      <div v-if="!isWide && isSelectionMode" class="narrow-selection-list custom-scrollbar">
        <div
          v-for="set in quickActionStore.quickActionSets"
          :key="set.id"
          class="qa-item"
          @click="toggleSelection(set.id)"
        >
          <div class="qa-checkbox">
            <el-checkbox
              :model-value="selectedIds.has(set.id)"
              @change="toggleSelection(set.id)"
              @click.stop
            />
          </div>
          <div class="qa-item-info">
            <div class="qa-name">{{ set.name }}</div>
            <div class="qa-meta">{{ set.actionCount }} 个操作</div>
          </div>
        </div>
      </div>

      <main v-if="!isSelectionMode || isWide" class="manager-main">
        <div v-if="!selectedSetId" class="empty-drop-zone">
          <el-empty description="请选择或创建一个快捷操作组">
            <el-button type="primary" :icon="Plus" @click.stop="handleCreate">新建组</el-button>
          </el-empty>
        </div>
        <QuickActionDetail v-else :id="selectedSetId" :key="selectedSetId" class="detail-view" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.quick-action-full-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 500px;
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

.qa-list-sidebar {
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

.qa-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.qa-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  gap: 12px;
}

.qa-item:hover {
  background-color: var(--el-fill-color-light);
}

.qa-item.active {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.qa-item-icon {
  color: var(--el-text-color-secondary);
}

.qa-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
}

.qa-item-info {
  flex: 1;
  min-width: 0;
}

.qa-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qa-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.arrow {
  opacity: 0;
  transition: opacity 0.2s;
}

.qa-item:hover .arrow,
.qa-item.active .arrow {
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

.qa-selector {
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

.narrow-selection-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
</style>
