<template>
  <div class="message-monitor-page">
    <div class="monitor-header">
      <div class="header-left">
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

    <div ref="messagesContainer" class="message-container" @scroll="onScroll">
      <!-- 虚拟滚动容器 -->
      <div
        v-if="filteredMessages.length > 0"
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <!-- 仅渲染可见的虚拟项 -->
        <div
          v-for="virtualItem in virtualItems"
          :key="`${filteredMessages[virtualItem.index].timestamp}-${filteredMessages[virtualItem.index].type}`"
          :data-index="virtualItem.index"
          :ref="
            (el) => {
              if (el) virtualizer.measureElement(el as HTMLElement);
            }
          "
          :style="{
            position: 'absolute',
            top: `${virtualItem.start}px`,
            left: 0,
            width: '100%',
          }"
          class="message-item"
        >
          <BroadcastCard :message="filteredMessages[virtualItem.index]" @show-json="emit('show-json', $event)" />
        </div>
      </div>

      <el-empty v-else description="暂无消息" :image-size="120" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useThrottleFn } from "@vueuse/core";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { customMessage } from "@/utils/customMessage";
import { Pause, Play, Trash2, Download, Search } from "lucide-vue-next";
import BroadcastCard from "./BroadcastCard.vue";
import type { VcpMessage } from "../../types/protocol";

const emit = defineEmits<{
  "show-json": [message: VcpMessage];
}>();

const store = useVcpStore();
const { connectionStatus } = useVcpWebSocket();

const filteredMessages = computed(() => [...store.filteredMessages].reverse());
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

/**
 * 虚拟滚动相关
 */
const messagesContainer = ref<HTMLElement | null>(null);

// 消息数量
const messageCount = computed(() => filteredMessages.value.length);

// 创建虚拟化器
const virtualizer = useVirtualizer({
  get count() {
    return messageCount.value;
  },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 120, // 预估每条消息的高度
  overscan: 5, //  overscan 数量
});

// 虚拟项列表
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

// 总高度
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 记录用户是否接近顶部（倒序排列，最新在顶）
const isNearTop = ref(true);

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop } = messagesContainer.value;
  // 阈值设为 100px，在这个范围内认为用户想看最新消息
  isNearTop.value = scrollTop < 100;
};

// 自动滚动到顶部（倒序）
const scrollToTop = useThrottleFn(() => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = 0;
    }
  });
}, 100);

// 监听消息数量变化，新消息时自动滚动到顶部
watch(
  () => filteredMessages.value.length,
  (newLength, oldLength) => {
    // 如果有新消息且用户在顶部附近，则自动滚动
    if (newLength > oldLength && isNearTop.value) {
      scrollToTop();
    }
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

.message-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.message-item {
  padding-bottom: 12px;
}
</style>
