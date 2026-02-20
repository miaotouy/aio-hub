<template>
  <div class="message-monitor-page">
    <div class="monitor-header">
      <div class="header-left">
        <el-button
          v-if="showExpandButton"
          :icon="PanelLeft"
          text
          circle
          @click="emit('toggle-sidebar')"
          title="展开侧边栏"
        />
        <el-tag :type="connectionStatusTagType" size="small" effect="dark" round>
          {{ connectionStatusText }}
        </el-tag>
        <span class="message-count"> {{ filteredMessages.length }} 条消息 </span>
        <span class="msg-rate"> {{ stats.messagesPerMinute }} msg/min </span>
      </div>

      <div class="header-center">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索消息内容..."
          size="small"
          clearable
          class="search-input"
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
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
          @show-json="emit('show-json', $event)"
        />
      </TransitionGroup>

      <el-empty v-if="filteredMessages.length === 0" description="暂无消息" :image-size="120" />
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { customMessage } from "@/utils/customMessage";
import { Pause, Play, Trash2, Download, PanelLeft, Search } from "lucide-vue-next";
import BroadcastCard from "./BroadcastCard.vue";
import type { VcpMessage } from "../../types/protocol";

defineProps<{
  showExpandButton: boolean;
}>();

const emit = defineEmits<{
  "toggle-sidebar": [];
  "show-json": [message: VcpMessage];
}>();

const store = useVcpStore();
const { connectionStatus } = useVcpWebSocket();

const filteredMessages = computed(() => store.filteredMessages);
const filter = computed(() => store.filter);
const stats = computed(() => store.stats);

const searchKeyword = ref(store.filter.keyword);

function handleSearch() {
  store.setFilter({ keyword: searchKeyword.value });
}

// 同步 store 中的关键词变化（例如从其他地方重置了过滤条件）
watch(
  () => store.filter.keyword,
  (kw) => {
    searchKeyword.value = kw;
  }
);

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
</script>

<style scoped lang="css">
.message-monitor-page {
  height: 100%;
  display: flex;
  flex-direction: column;
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
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 24px;
  max-width: 400px;
}

.search-input {
  width: 100%;
}

.search-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: none;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
  background-color: var(--card-bg);
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
  height: 100%;
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
