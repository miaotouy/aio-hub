<template>
  <div class="vcp-connector" :class="{ 'is-collapsed': isConfigCollapsed }">
    <div class="vcp-layout">
      <!-- 左侧配置栏 -->
      <aside v-show="!isConfigCollapsed" class="config-sidebar">
        <InfoCard title="VCP 连接与过滤" class="sidebar-card">
          <template #headerExtra>
            <el-button
              :icon="PanelLeft"
              text
              circle
              size="small"
              @click="isConfigCollapsed = true"
              title="折叠侧边栏"
            />
          </template>
          <ConnectionPanel />
          <FilterPanel />
        </InfoCard>
      </aside>

      <!-- 右侧监控面板 -->
      <main class="monitor-panel">
        <el-tabs v-model="activeTab" class="monitor-tabs">
          <el-tab-pane label="消息监控" name="messages">
            <MessageMonitorPage
              :show-expand-button="isConfigCollapsed"
              @toggle-sidebar="isConfigCollapsed = false"
              @show-json="selectedMessage = $event"
            />
          </el-tab-pane>
          <el-tab-pane label="分布式节点" name="distributed">
            <DistributedNodePage />
          </el-tab-pane>
        </el-tabs>
      </main>
    </div>

    <el-drawer v-model="showJsonViewer" title="消息详情" direction="rtl" size="50%">
      <JsonViewer :message="selectedMessage" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useVcpDistributedNode } from "./composables/useVcpDistributedNode";
import { PanelLeft } from "lucide-vue-next";
import InfoCard from "@/components/common/InfoCard.vue";
import ConnectionPanel from "./components/monitor/ConnectionPanel.vue";
import FilterPanel from "./components/monitor/FilterPanel.vue";
import MessageMonitorPage from "./components/monitor/MessageMonitorPage.vue";
import DistributedNodePage from "./components/distributed/DistributedNodePage.vue";
import JsonViewer from "./components/shared/JsonViewer.vue";
import type { VcpMessage } from "./types/protocol";

const { startDistributedNode } = useVcpDistributedNode();

const activeTab = ref("messages");
const selectedMessage = ref<VcpMessage | null>(null);
const showJsonViewer = ref(false);
const isConfigCollapsed = ref(false);

// 启动分布式节点逻辑
startDistributedNode();

watch(selectedMessage, (msg: VcpMessage | null) => {
  showJsonViewer.value = !!msg;
});

watch(showJsonViewer, (visible: boolean) => {
  if (!visible) {
    selectedMessage.value = null;
  }
});
</script>

<style scoped lang="css">
.vcp-connector {
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  background: var(--bg-color);
}

.vcp-layout {
  display: flex;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}

.config-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-card :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  padding: 0 !important; /* 内部面板自带 padding */
}

.monitor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.monitor-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.monitor-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
}

.monitor-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.monitor-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>
