<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { LayoutDashboard, Activity, Settings, Image as ImageIcon } from "lucide-vue-next";
import MediaWorkbench from "../components/MediaWorkbench.vue";
import MediaTaskList from "../components/MediaTaskList.vue";
import MediaSettings from "../components/MediaSettings.vue";
import MediaGallery from "../components/MediaGallery.vue";

const store = useMediaGenStore();
const activeTab = ref("workbench");

onMounted(() => {
  store.init();
});
</script>

<template>
  <div class="media-generator-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 工作台标签页 -->
      <el-tab-pane name="workbench">
        <template #label>
          <div class="tab-label">
            <el-icon><LayoutDashboard /></el-icon>
            <span>工作台</span>
          </div>
        </template>
        <MediaWorkbench />
      </el-tab-pane>

      <!-- 生成结果画廊 -->
      <el-tab-pane name="gallery">
        <template #label>
          <div class="tab-label">
            <el-icon><ImageIcon /></el-icon>
            <span>画廊</span>
          </div>
        </template>
        <MediaGallery />
      </el-tab-pane>

      <!-- 任务列表总览 -->
      <el-tab-pane name="tasks">
        <template #label>
          <div class="tab-label">
            <el-icon><Activity /></el-icon>
            <span>任务列表</span>
            <el-badge
              v-if="
                Array.isArray(store.tasks) &&
                store.tasks.filter((t) => t.status === 'processing').length > 0
              "
              :value="store.tasks.filter((t) => t.status === 'processing').length"
              type="primary"
              is-dot
              class="tab-badge"
            />
          </div>
        </template>
        <MediaTaskList />
      </el-tab-pane>

      <!-- 设置标签页 -->
      <el-tab-pane name="settings">
        <template #label>
          <div class="tab-label">
            <el-icon><Settings /></el-icon>
            <span>生成设置</span>
          </div>
        </template>
        <MediaSettings />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.media-generator-container {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
}

.media-generator-container * {
  box-sizing: border-box;
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
