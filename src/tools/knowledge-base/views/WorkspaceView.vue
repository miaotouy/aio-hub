<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import KnowledgeBaseList from "../components/KnowledgeBaseList.vue";
import WorkspaceHeader from "../components/WorkspaceHeader.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import CaiuManager from "../components/CaiuManager.vue";
import KnowledgeBaseSettings from "../components/KnowledgeBaseSettings.vue";
import { createModuleLogger } from "@/utils/logger";
import { useElementSize } from "@vueuse/core";
import { Plus } from "lucide-vue-next";

const logger = createModuleLogger("kb-workspace-view");
const kbStore = useKnowledgeBaseStore();
const { switchBase, createBase } = useKnowledgeBase();

const containerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

// 响应式档位
const layoutMode = computed(() => {
  if (width.value > 1200) return "large";
  if (width.value > 800) return "medium";
  return "small";
});

const isSelectionMode = ref(false);
const selectedEntryIds = ref<Set<string>>(new Set());
const showCreateDialog = ref(false);
const showSettings = ref(false);
const showKbListDialog = ref(false);
const newBaseForm = ref({
  name: "",
  description: "",
});

onMounted(async () => {
  logger.info("Knowledge Base Workspace mounted");
  await kbStore.init();

  // 尝试恢复上次选中的库，如果没有则默认选中第一个
  if (kbStore.bases.length > 0 && !kbStore.activeBaseId) {
    const lastId = kbStore.workspace?.lastActiveBaseId;
    const exists = lastId && kbStore.bases.some((b) => b.id === lastId);
    if (exists) {
      switchBase(lastId, true);
    } else {
      switchBase(kbStore.bases[0].id, true);
    }
  }
});

// 窄模式下，切换库后自动关闭弹窗
watch(
  () => kbStore.activeBaseId,
  () => {
    if (showKbListDialog.value) {
      showKbListDialog.value = false;
    }
  }
);

const handleCreate = async () => {
  if (!newBaseForm.value.name) return;
  await createBase(newBaseForm.value.name, newBaseForm.value.description);
  showCreateDialog.value = false;
  newBaseForm.value = { name: "", description: "" };
};

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedEntryIds.value = new Set();
};

const handleSelectAllEntries = () => {
  if (kbStore.activeBaseMeta?.entries) {
    selectedEntryIds.value = new Set(kbStore.activeBaseMeta.entries.map((e) => e.id));
  }
};

const handleDeselectAllEntries = () => {
  selectedEntryIds.value = new Set();
};
</script>

<template>
  <div class="workspace-view" ref="containerRef" :class="[`is-${layoutMode}`]">
    <!-- 向量化进度条 -->
    <div v-if="kbStore.indexingProgress.isIndexing" class="indexing-progress-bar">
      <el-progress
        :percentage="
          Math.round((kbStore.indexingProgress.current / kbStore.indexingProgress.total) * 100)
        "
        :stroke-width="4"
        :show-text="false"
        status="warning"
      />
      <div class="progress-info">
        <div class="info-left">
          <span>正在同步向量...</span>
          <span>{{ kbStore.indexingProgress.current }} / {{ kbStore.indexingProgress.total }}</span>
        </div>
        <el-button
          v-if="!kbStore.indexingProgress.shouldStop"
          size="small"
          type="danger"
          link
          @click="kbStore.stopIndexing()"
        >
          停止任务
        </el-button>
        <span v-else class="stopping-text">正在停止...</span>
      </div>
    </div>

    <div class="manager-content">
      <!-- 左侧：知识库列表 (仅在 large 模式下常驻，或在 small/medium 且未选中库时显示) -->
      <aside v-if="layoutMode === 'large' || !kbStore.activeBaseId" class="kb-list-sidebar">
        <KnowledgeBaseList @manage="showSettings = true" />
      </aside>

      <!-- 主体内容区 -->
      <main
        class="manager-main"
        v-if="layoutMode !== 'large' ? !!kbStore.activeBaseId : true"
        v-loading="kbStore.loading"
        :element-loading-text="kbStore.activeBaseId ? '正在处理...' : '正在初始化知识库...'"
        element-loading-background="rgba(var(--container-bg-rgb), 0.7)"
      >
        <template v-if="kbStore.activeBaseId">
          <WorkspaceHeader
            :is-selection-mode="isSelectionMode"
            :selected-entry-ids="selectedEntryIds"
            :show-settings="showSettings"
            :layout-mode="layoutMode"
            @toggle-selection="toggleSelectionMode"
            @toggle-settings="showSettings = !showSettings"
            @toggle-kb-list="showKbListDialog = true"
            @select-all-entries="handleSelectAllEntries"
            @deselect-all-entries="handleDeselectAllEntries"
          />

          <div class="main-layout">
            <!-- 条目管理界面 -->
            <CaiuManager
              v-if="!showSettings"
              :id="kbStore.activeBaseId"
              :is-selection-mode="isSelectionMode"
              :selected-entry-ids="selectedEntryIds"
              :layout-mode="layoutMode"
              @update:selected-entry-ids="(val: Set<string>) => (selectedEntryIds = val)"
              @back="kbStore.activeBaseId = null"
              :key="kbStore.activeBaseId"
              class="detail-view"
            />

            <!-- 库管理与统计界面 (替换条目管理) -->
            <div v-else class="settings-full-view">
              <KnowledgeBaseSettings @close="showSettings = false" />
            </div>
          </div>
        </template>
        <template v-else-if="!kbStore.loading">
          <div class="empty-state">
            <el-empty description="请选择或创建一个知识库">
              <el-button type="primary" @click="showCreateDialog = true">
                <template #icon><Plus :size="16" /></template>
                新建知识库
              </el-button>
            </el-empty>
          </div>
        </template>
      </main>
    </div>

    <!-- 窄模式下的知识库列表弹窗 -->
    <BaseDialog
      v-model="showKbListDialog"
      title="管理知识库"
      width="460px"
      height="80vh"
      append-to-body
    >
      <KnowledgeBaseList
        @manage="
          () => {
            showSettings = true;
            showKbListDialog = false;
          }
        "
      />
    </BaseDialog>

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
.workspace-view {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.indexing-progress-bar {
  padding: 12px 16px 8px;
  background-color: var(--sidebar-bg);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--el-color-warning);
  margin-top: 2px;

  .info-left {
    display: flex;
    gap: 12px;
  }

  .stopping-text {
    color: var(--el-color-info);
    font-style: italic;
  }
}

.manager-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.kb-list-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
}

.is-small .kb-list-sidebar,
.is-medium .kb-list-sidebar {
  width: 100%;
  border-right: none;
}

.manager-main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
}

.is-small .manager-main,
.is-medium .manager-main {
  width: 100%;
}

.main-layout {
  display: flex;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.detail-view {
  flex: 1;
  height: 100%;
  min-width: 0;
}

.settings-full-view {
  flex: 1;
  height: 100%;
  position: relative;
  background-color: var(--card-bg);
  display: flex;
  flex-direction: column;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.selector-section {
  flex: 1;
  max-width: 300px;
  min-width: 0;
}

.kb-selector {
  width: 100%;
}

.kb-selector :deep(.el-input__prefix) {
  display: flex;
  align-items: center;
}
</style>
