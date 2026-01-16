<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTranscriptionStore } from "./stores/transcriptionStore";
import type { Asset } from "@/types/asset-management";
import TranscriptionWorkbench from "./components/TranscriptionWorkbench.vue";
import TranscriptionQueue from "./components/TranscriptionQueue.vue";
import TranscriptionSettings from "./components/TranscriptionSettings.vue";
import { LayoutDashboard, Activity, Settings } from "lucide-vue-next";

const store = useTranscriptionStore();
const activeTab = ref("workbench");

let unlistenAssetImport: UnlistenFn | null = null;

onMounted(async () => {
  // 确保 store 已初始化
  await store.init();

  // 监听资产导入事件
  unlistenAssetImport = await listen<Asset>("asset-imported", (event) => {
    const asset = event.payload;
    // 仅处理本模块导入的资产，且开启了自动转写
    if (asset.sourceModule === "transcription" && store.config.autoStartOnImport) {
      store.submitTask(asset);
    }
  });
});

onUnmounted(() => {
  if (unlistenAssetImport) {
    unlistenAssetImport();
  }
});
</script>

<template>
  <div class="transcription-tool-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 工作台标签页 -->
      <el-tab-pane name="workbench">
        <template #label>
          <div class="tab-label">
            <el-icon><LayoutDashboard /></el-icon>
            <span>工作台</span>
          </div>
        </template>
        <TranscriptionWorkbench />
      </el-tab-pane>

      <!-- 任务队列标签页 -->
      <el-tab-pane name="queue">
        <template #label>
          <div class="tab-label">
            <el-icon><Activity /></el-icon>
            <span>任务监控</span>
            <el-badge
              v-if="store.processingCount > 0"
              :value="store.processingCount"
              type="primary"
              is-dot
              class="tab-badge"
            />
          </div>
        </template>
        <TranscriptionQueue />
      </el-tab-pane>

      <!-- 配置标签页 -->
      <el-tab-pane name="settings">
        <template #label>
          <div class="tab-label">
            <el-icon><Settings /></el-icon>
            <span>服务配置</span>
          </div>
        </template>
        <TranscriptionSettings />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.transcription-tool-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
}

.main-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.tab-badge {
  margin-left: -4px;
  margin-top: -8px;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>
