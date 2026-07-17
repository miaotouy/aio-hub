<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useRecallCollection } from "../composables/useRecallCollection";
import RecallCollectionList from "../components/RecallCollectionList.vue";
import WorkspaceHeader from "../components/WorkspaceHeader.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RecallEntryManager from "../components/RecallEntryManager.vue";
import RecallCollectionSettings from "../components/RecallCollectionSettings.vue";
import { createModuleLogger } from "@/utils/logger";
import { useElementSize } from "@vueuse/core";
import { Plus } from "lucide-vue-next";

const logger = createModuleLogger("recall-workspace-view");
const recallStore = useRecallCollectionStore();
const { switchBase, createBase } = useRecallCollection();

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
const showRecallListDialog = ref(false);
const newBaseForm = ref({
  name: "",
  description: "",
});

onMounted(async () => {
  logger.info("Knowledge Base Workspace mounted");
  await recallStore.init();

  // 尝试恢复上次选中的库，如果没有则默认选中第一个
  if (recallStore.bases.length > 0 && !recallStore.activeBaseId) {
    const lastId = recallStore.workspace?.lastActiveBaseId;
    const exists = lastId && recallStore.bases.some((b) => b.id === lastId);
    if (exists) {
      switchBase(lastId, true);
    } else {
      switchBase(recallStore.bases[0].id, true);
    }
  }
});

// 窄模式下，切换库后自动关闭弹窗
watch(
  () => recallStore.activeBaseId,
  () => {
    if (showRecallListDialog.value) {
      showRecallListDialog.value = false;
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
  if (recallStore.activeBaseMeta?.entries) {
    selectedEntryIds.value = new Set(
      recallStore.activeBaseMeta.entries.map((e) => e.id)
    );
  }
};

const handleDeselectAllEntries = () => {
  selectedEntryIds.value = new Set();
};
</script>

<template>
  <div class="workspace-view" ref="containerRef" :class="[`is-${layoutMode}`]">
    <!-- 向量化进度条 -->
    <div
      v-if="recallStore.indexingProgress.isIndexing"
      class="indexing-progress-bar"
    >
      <el-progress
        :percentage="
          Math.round(
            (recallStore.indexingProgress.current /
              recallStore.indexingProgress.total) *
              100
          )
        "
        :stroke-width="4"
        :show-text="false"
        status="warning"
      />
      <div class="progress-info">
        <div class="info-left">
          <span>正在同步向量...</span>
          <span
            >{{ recallStore.indexingProgress.current }} /
            {{ recallStore.indexingProgress.total }}</span
          >
        </div>
        <el-button
          v-if="!recallStore.indexingProgress.shouldStop"
          size="small"
          type="danger"
          link
          @click="recallStore.stopIndexing()"
        >
          停止任务
        </el-button>
        <span v-else class="stopping-text">正在停止...</span>
      </div>
    </div>

    <div class="manager-content">
      <!-- 左侧：思绪集列表 (仅在 large 模式下常驻，或在 small/medium 且未选中库时显示) -->
      <aside
        v-if="layoutMode === 'large' || !recallStore.activeBaseId"
        class="recall-list-sidebar"
      >
        <RecallCollectionList @manage="showSettings = true" />
      </aside>

      <!-- 主体内容区 -->
      <main
        class="manager-main"
        v-if="layoutMode !== 'large' ? !!recallStore.activeBaseId : true"
        v-loading="recallStore.loading"
        :element-loading-text="
          recallStore.activeBaseId ? '正在处理...' : '正在初始化思绪集...'
        "
        element-loading-background="rgba(var(--container-bg-rgb), 0.7)"
      >
        <template v-if="recallStore.activeBaseId">
          <WorkspaceHeader
            :is-selection-mode="isSelectionMode"
            :selected-entry-ids="selectedEntryIds"
            :show-settings="showSettings"
            :layout-mode="layoutMode"
            @toggle-selection="toggleSelectionMode"
            @toggle-settings="showSettings = !showSettings"
            @toggle-recall-list="showRecallListDialog = true"
            @select-all-entries="handleSelectAllEntries"
            @deselect-all-entries="handleDeselectAllEntries"
          />

          <div class="main-layout">
            <!-- 条目管理界面 -->
            <RecallEntryManager
              v-if="!showSettings"
              :id="recallStore.activeBaseId"
              :is-selection-mode="isSelectionMode"
              :selected-entry-ids="selectedEntryIds"
              :layout-mode="layoutMode"
              @update:selected-entry-ids="
                (val: Set<string>) => (selectedEntryIds = val)
              "
              @back="recallStore.activeBaseId = null"
              :key="recallStore.activeBaseId"
              class="detail-view"
            />

            <!-- 库管理与统计界面 (替换条目管理) -->
            <div v-else class="settings-full-view">
              <RecallCollectionSettings @close="showSettings = false" />
            </div>
          </div>
        </template>
        <template v-else-if="!recallStore.loading">
          <div class="empty-state">
            <el-empty description="请选择或创建一个思绪集">
              <el-button type="primary" @click="showCreateDialog = true">
                <template #icon><Plus :size="16" /></template>
                新建思绪集
              </el-button>
            </el-empty>
          </div>
        </template>
      </main>
    </div>

    <!-- 窄模式下的思绪集列表弹窗 -->
    <BaseDialog
      v-model="showRecallListDialog"
      title="管理思绪集"
      width="460px"
      height="80vh"
      append-to-body
    >
      <RecallCollectionList
        @manage="
          () => {
            showSettings = true;
            showRecallListDialog = false;
          }
        "
      />
    </BaseDialog>

    <!-- 创建对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建思绪集"
      width="400px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="newBaseForm.name" placeholder="请输入思绪集名称" />
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
        <el-button
          type="primary"
          @click="handleCreate"
          :disabled="!newBaseForm.name"
        >
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

.recall-list-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: var(--border-width) solid var(--border-color);
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
}

.is-small .recall-list-sidebar,
.is-medium .recall-list-sidebar {
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

.recall-selector {
  width: 100%;
}

.recall-selector :deep(.el-input__prefix) {
  display: flex;
  align-items: center;
}
</style>
