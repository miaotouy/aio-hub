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
        <div v-if="isConfigCollapsed" class="expand-trigger">
          <el-button :icon="PanelLeft" text circle size="small" @click="isConfigCollapsed = false" title="展开侧边栏" />
        </div>
        <el-tabs v-model="activeTab" class="monitor-tabs">
          <el-tab-pane label="消息监控" name="messages">
            <div v-if="isMonitorDetached" class="detached-placeholder">
              <el-result title="监控面板已分离" sub-title="消息监控正在悬浮窗中运行">
                <template #icon>
                  <div class="detached-icon-wrapper">
                    <Monitor :size="48" class="detached-icon" />
                  </div>
                </template>
                <template #extra>
                  <el-button type="primary" @click="reattachMonitor" round> 收回面板 </el-button>
                </template>
              </el-result>
            </div>
            <MessageMonitorPage v-else @show-json="selectedMessage = $event" />
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
import { ref, computed, watch } from "vue";
import { useVcpStore } from "./stores/vcpConnectorStore";
import { useVcpDistributedNode } from "./composables/useVcpDistributedNode";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { PanelLeft, Monitor } from "lucide-vue-next";
import InfoCard from "@/components/common/InfoCard.vue";
import ConnectionPanel from "./components/monitor/ConnectionPanel.vue";
import FilterPanel from "./components/monitor/FilterPanel.vue";
import MessageMonitorPage from "./components/monitor/MessageMonitorPage.vue";
import DistributedNodePage from "./components/distributed/DistributedNodePage.vue";
import JsonViewer from "./components/shared/JsonViewer.vue";
import type { VcpMessage } from "./types/protocol";

const store = useVcpStore();
const { startDistributedNode } = useVcpDistributedNode();
const { closeWindow } = useDetachedManager();

const activeTab = ref("messages");
const selectedMessage = ref<VcpMessage | null>(null);
const showJsonViewer = ref(false);
const isConfigCollapsed = ref(false);

// 启动分布式节点逻辑
startDistributedNode();

// 直接使用 store 中维护的分离状态（store 内部已通过 useDetachedManager watch 同步）
const isMonitorDetached = computed(() => store.isMonitorDetached);

// 监听分离状态变化，执行副作用（收回时重新加载消息并连接）
watch(
  () => store.isMonitorDetached,
  (val, oldVal) => {
    if (oldVal && !val) {
      // 从分离变为非分离（收回），主窗口重新加载消息并连接
      store.reloadMessages();
      store.connect();
    }
  },
);

async function reattachMonitor() {
  await closeWindow("vcp-connector:monitor");
}

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
  position: relative;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
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
  border-bottom: var(--border-width) solid var(--border-color);
}

.expand-trigger {
  position: absolute;
  left: 8px;
  top: 6px;
  z-index: 100;
}

.is-collapsed .monitor-tabs :deep(.el-tabs__nav-scroll) {
  padding-left: 32px;
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

.detached-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
}

.detached-icon-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.detached-icon {
  color: var(--el-color-primary);
  opacity: 0.8;
}
</style>
