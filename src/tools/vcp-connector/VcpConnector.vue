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
        <div class="monitor-header">
          <div class="header-left">
            <el-button
              v-if="isConfigCollapsed"
              :icon="PanelLeft"
              text
              circle
              @click="isConfigCollapsed = false"
              title="展开侧边栏"
            />
            <el-tag :type="connectionStatusTagType" size="small" effect="dark" round>
              {{ connectionStatusText }}
            </el-tag>
            <span class="message-count"> {{ filteredMessages.length }} 条消息 </span>
            <span class="msg-rate"> {{ stats.messagesPerMinute }} msg/min </span>
          </div>

          <div class="header-right">
            <el-button-group>
              <el-button
                :type="filter.paused ? 'warning' : ''"
                size="small"
                @click="togglePause"
                :icon="filter.paused ? Play : Pause"
              >
                {{ filter.paused ? "继续" : "暂停" }}
              </el-button>
              <el-button size="small" :icon="Trash2" @click="clearMessages"> 清空 </el-button>
              <el-button size="small" :icon="Download" @click="exportMessages"> 导出 </el-button>
            </el-button-group>
          </div>
        </div>

        <el-scrollbar class="message-scrollbar">
          <TransitionGroup name="message-list" tag="div" class="message-list">
            <BroadcastCard
              v-for="msg in filteredMessages"
              :key="`${msg.timestamp}-${msg.type}`"
              :message="msg"
              @show-json="selectedMessage = $event"
            />
          </TransitionGroup>

          <el-empty
            v-if="filteredMessages.length === 0"
            description="暂无消息"
            :image-size="120"
          />
        </el-scrollbar>
      </main>
    </div>

    <el-drawer v-model="showJsonViewer" title="消息详情" direction="rtl" size="50%">
      <JsonViewer :message="selectedMessage" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useVcpStore } from "./stores/vcpStore";
import { useVcpWebSocket } from "./composables/useVcpWebSocket";
import { customMessage } from "@/utils/customMessage";
import {
  Pause,
  Play,
  Trash2,
  Download,
  PanelLeft,
} from "lucide-vue-next";
import InfoCard from "@/components/common/InfoCard.vue";
import ConnectionPanel from "./components/monitor/ConnectionPanel.vue";
import FilterPanel from "./components/monitor/FilterPanel.vue";
import BroadcastCard from "./components/monitor/BroadcastCard.vue";
import JsonViewer from "./components/shared/JsonViewer.vue";
import type { VcpMessage } from "./types/protocol";

const store = useVcpStore();
const { connectionStatus } = useVcpWebSocket();

const selectedMessage = ref<VcpMessage | null>(null);
const showJsonViewer = ref(false);
const isConfigCollapsed = ref(false);

const filteredMessages = computed(() => store.filteredMessages);
const filter = computed(() => store.filter);
const stats = computed(() => store.stats);

const connectionStatusTagType = computed(() => {
  switch (connectionStatus.value) {
    case "connected":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "danger";
    default:
      return "info";
  }
});

const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中...";
    case "error":
      return "连接错误";
    default:
      return "未连接";
  }
});

function togglePause() {
  store.togglePause();
}

function clearMessages() {
  store.clearMessages();
}

function exportMessages() {
  const json = store.exportMessages();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vcp-messages-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  customMessage.success("导出成功");
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
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.message-count {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.msg-rate {
  font-size: 12px;
  color: var(--el-color-primary);
  padding: 2px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-scrollbar {
  flex: 1;
  overflow: hidden;
}

.message-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-list-enter-active {
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

.message-list-leave-active {
  transition: all 0.2s ease-out;
}

.message-list-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.message-list-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.message-list-move {
  transition: transform 0.3s ease;
}
</style>
