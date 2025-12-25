<script setup lang="ts">
import { ref } from "vue";
import { UploadFilled } from "@element-plus/icons-vue";
import WorldbookOverview from "./WorldbookOverview.vue";
import WorldbookFullManager from "./WorldbookFullManager.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useFileDrop } from "@/composables/useFileDrop";
import { importSTWorldbookFromPath } from "../../services/worldbookImportService";
import { useWorldbookStore } from "../../worldbookStore";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("WorldbookManager");
const worldbookStore = useWorldbookStore();
const showFullManager = ref(false);
const dropZoneRef = ref<HTMLElement | undefined>(undefined);

const openFullManager = () => {
  showFullManager.value = true;
};

// 处理文件拖放导入 (Tauri 路径模式)
const { isDraggingOver: isDragging } = useFileDrop({
  element: dropZoneRef,
  fileOnly: true,
  accept: [".json"],
  onDrop: async (paths) => {
    if (paths.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const path of paths) {
      try {
        const result = await importSTWorldbookFromPath(path);
        if (result) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        errorHandler.error(error, `导入世界书失败: ${path}`);
        failCount++;
      }
    }

    if (successCount > 0) {
      customMessage.success(`成功导入 ${successCount} 本世界书`);
      // 刷新列表
      await worldbookStore.loadWorldbooks();
    }

    if (failCount > 0 && successCount === 0) {
      customMessage.warning("导入失败，请检查文件格式是否正确");
    }
  },
});
</script>

<template>
  <div ref="dropZoneRef" class="worldbook-manager-container" :class="{ 'is-dragging': isDragging }">
    <!-- 拖拽覆盖层 -->
    <div v-if="isDragging" class="drop-overlay">
      <div class="drop-hint">
        <el-icon :size="40"><UploadFilled /></el-icon>
        <span>松开鼠标导入世界书 (.json)</span>
      </div>
    </div>

    <!-- 总览组件，适合嵌入设置流 -->
    <WorldbookOverview @manage="openFullManager" />

    <!-- 完整管理弹窗 -->
    <BaseDialog
      v-model="showFullManager"
      title="世界书库管理"
      width="90%"
      height="85vh"
      destroy-on-close
    >
      <WorldbookFullManager />

      <template #footer>
        <el-button @click="showFullManager = false">关闭</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.worldbook-manager-container {
  width: 100%;
  position: relative;
  transition: all 0.3s ease;
  border-radius: 8px;
}

.worldbook-manager-container.is-dragging {
  outline: 2px dashed var(--el-color-primary);
  outline-offset: -2px;
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  pointer-events: none;
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-color-primary);
  font-weight: bold;
}
</style>
