<script setup lang="ts">
import { ref } from "vue";
import { useCanvasStore } from "../stores/canvasStore";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { canvasSettingsConfig } from "../config";
import { ElMessageBox } from "element-plus";
import { RotateCcw } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

const store = useCanvasStore();
const activeCollapse = ref(canvasSettingsConfig.map((s) => s.title));

const handleAction = async (actionName: string) => {
  // 目前 Canvas 暂无特殊 action，留作扩展
  console.log("Canvas settings action:", actionName);
};

const handleUpdate = (newConfig: any) => {
  store.config = newConfig;
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要将所有画布设置重置为默认值吗？此操作不可撤销。", "重置确认", {
      confirmButtonText: "确定重置",
      cancelButtonText: "取消",
      type: "warning",
    });
    store.resetConfig();
    customMessage.success("设置已重置为默认值");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div class="canvas-settings">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <div class="settings-header">
        <div class="header-info">
          <h3 class="header-title">画布配置</h3>
          <p class="header-desc">配置 Agent 协作策略、预览行为及编辑器偏好</p>
        </div>
        <el-button :icon="RotateCcw" @click="handleReset" plain type="danger"> 一键重置 </el-button>
      </div>

      <el-collapse v-model="activeCollapse">
        <el-collapse-item v-for="section in canvasSettingsConfig" :key="section.title" :name="section.title">
          <template #title>
            <div class="collapse-title">
              <el-icon><component :is="section.icon" /></el-icon>
              <span>{{ section.title }}</span>
            </div>
          </template>
          <div class="section-content">
            <SettingListRenderer
              :items="section.items"
              :settings="store.config"
              @update:settings="handleUpdate"
              @action="handleAction"
            />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-form>
  </div>
</template>

<style scoped>
.canvas-settings {
  height: 100%;
  overflow-y: auto;
  background-color: transparent;
  box-sizing: border-box;
}

.settings-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  margin-bottom: 8px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}

.section-content {
  padding: 12px 8px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-input-number) {
  width: 100%;
}
</style>
