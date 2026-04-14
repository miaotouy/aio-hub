<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Plus, Search, LayoutGrid, List } from "lucide-vue-next";
import { useCanvasStore } from "./stores/canvasStore";
import CanvasProjectList from "./components/workbench/CanvasProjectList.vue";
import CreateCanvasDialog from "./components/workbench/CreateCanvasDialog.vue";
import CanvasEditorPanel from "./components/workbench/CanvasEditorPanel.vue";
import { customMessage } from "@/utils/customMessage";
import { useCanvasWindowManager } from "./composables/useCanvasWindowManager";

const store = useCanvasStore();
const windowManager = useCanvasWindowManager();

// --- 状态 ---
const viewMode = ref<"grid" | "list">("grid");
const searchQuery = ref("");
const isCreateDialogVisible = ref(false);

// --- 生命周期 ---
onMounted(async () => {
  await store.loadCanvasList();
});

// --- 操作 ---
const handleOpenCanvas = async (id: string) => {
  await store.openCanvas(id);
};

const handleDeleteCanvas = async (id: string) => {
  await store.deleteCanvas(id);
  customMessage.success("画布已删除");
};

const handleOpenVSCode = async (_id: string) => {
  // 后续批次实现：调用后端 API 打开 VSCode
  customMessage.info("在 VSCode 中打开功能开发中...");
};

const handlePreviewCanvas = async (id: string) => {
  const canvas = store.canvasList.find((c) => c.metadata.id === id);
  if (canvas) {
    await windowManager.openPreviewWindow(id, `画布预览 - ${canvas.metadata.name}`);
  }
};

const handleCanvasCreated = (_metadata: any) => {
  // 创建成功后自动打开（Store 中已处理）
};
</script>

<template>
  <div class="canvas-workbench">
    <!-- 编辑视图 -->
    <template v-if="store.activeCanvasId">
      <CanvasEditorPanel :canvas-id="store.activeCanvasId" @back="store.activeCanvasId = null" />
    </template>

    <!-- 项目大厅 -->
    <template v-else>
      <header class="workbench-header">
        <div class="header-left">
          <el-button type="primary" :icon="Plus" @click="isCreateDialogVisible = true"> 新建画布 </el-button>
        </div>

        <div class="header-center">
          <el-input v-model="searchQuery" placeholder="搜索画布项目..." clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="header-right">
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="grid">
              <el-icon><LayoutGrid :size="14" /></el-icon>
            </el-radio-button>
            <el-radio-button value="list">
              <el-icon><List :size="14" /></el-icon>
            </el-radio-button>
          </el-radio-group>
        </div>
      </header>

      <main class="workbench-main">
        <CanvasProjectList
          :canvases="store.canvasList"
          :view-mode="viewMode"
          :search-query="searchQuery"
          @open="handleOpenCanvas"
          @delete="handleDeleteCanvas"
          @open-vscode="handleOpenVSCode"
          @preview="handlePreviewCanvas"
        >
          <template #empty-action>
            <el-button type="primary" @click="isCreateDialogVisible = true"> 立即创建 </el-button>
          </template>
        </CanvasProjectList>
      </main>
    </template>

    <!-- 弹窗 -->
    <CreateCanvasDialog v-model="isCreateDialogVisible" @created="handleCanvasCreated" />
  </div>
</template>

<style scoped lang="scss">
.canvas-workbench {
  width: 100%;
  height: 100%;
  display: flex;
  border-radius: 12px;
  flex-direction: column;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;

  .workbench-header {
    height: 64px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: var(--border-width) solid var(--border-color);
    background-color: var(--card-bg);
    flex-shrink: 0;

    .header-center {
      flex: 1;
      max-width: 400px;
      margin: 0 24px;

      .search-input {
        :deep(.el-input__wrapper) {
          box-shadow: none;
          border: var(--border-width) solid var(--border-color);

          &.is-focus {
            border-color: var(--el-color-primary);
          }
        }
      }
    }

    .header-left,
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  }

  .workbench-main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .canvas-editor-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;

    .placeholder-content {
      h2 {
        margin-bottom: 12px;
        color: var(--el-text-color-primary);
      }
      p {
        margin-bottom: 24px;
        color: var(--el-text-color-secondary);
      }
    }
  }
}
</style>
