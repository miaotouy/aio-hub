<template>
  <div class="message-monitor-page" :class="{ 'detached-mode': isActuallyDetached }">
    <!-- 分离模式下的壁纸层 -->
    <div v-if="isActuallyDetached" class="detached-wallpaper"></div>

    <!-- 头部区域：包含悬浮窗手柄和控制栏 -->
    <div class="monitor-page-header" :style="headerStyle">
      <!-- 仅在分离模式下显示独立的头部 -->
      <ComponentHeader
        v-if="isActuallyDetached"
        drag-mode="window"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleStartDetaching"
        @detach="handleDetach"
        @reattach="handleReattach"
      >
        <div class="monitor-title">
          <VcpConnectorIcon class="title-icon" />
          <span>VCP 消息监控</span>
        </div>
      </ComponentHeader>

      <div class="monitor-controls">
        <div class="header-left">
          <div class="connection-status-wrapper">
            <el-tag :type="connectionStatusTagType" size="small" effect="dark" round>
              {{ connectionStatusText }}
            </el-tag>
            <template v-if="isActuallyDetached">
              <el-button
                v-if="connectionStatus === 'disconnected' || connectionStatus === 'error'"
                type="primary"
                size="small"
                circle
                plain
                :icon="Link"
                title="连接 VCP"
                class="connection-action-btn"
                @click="store.connect()"
              />
              <el-button
                v-if="connectionStatus === 'connected' || connectionStatus === 'connecting'"
                type="danger"
                size="small"
                circle
                plain
                :icon="Link2Off"
                title="断开连接"
                class="connection-action-btn"
                @click="store.disconnect()"
              />
            </template>
          </div>
          <span class="message-count"> {{ filteredMessages.length }} 条消息 </span>
          <span class="msg-rate"> {{ stats.messagesPerMinute }} msg/min </span>

          <!-- 快速筛选入口 -->
          <el-popover placement="bottom-start" :width="240" trigger="click" popper-class="vcp-filter-popover">
            <template #reference>
              <el-button size="small" :type="isAnyFilterActive ? 'primary' : ''" :icon="Filter" circle plain />
            </template>
            <div class="filter-popover-content">
              <div class="filter-header">
                <span class="filter-title">类型筛选</span>
                <el-link type="primary" :underline="false" @click="toggleAllTypes">
                  {{ isAllTypesSelected ? "全不选" : "全选" }}
                </el-link>
              </div>
              <div class="type-filter-list">
                <div
                  v-for="type in typeOptions"
                  :key="type.value"
                  class="type-filter-option"
                  :class="[type.class, { active: store.filter.types.includes(type.value) }]"
                  @click="toggleType(type.value)"
                >
                  <div class="type-indicator"></div>
                  <span class="type-name">{{ type.label }}</span>
                  <span class="type-desc">{{ type.desc }}</span>
                  <el-icon v-if="store.filter.types.includes(type.value)" class="check-icon"><Check /></el-icon>
                </div>
              </div>
            </div>
          </el-popover>
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

          <!-- 在非分离模式下，将 ComponentHeader 作为工具栏的一部分 -->
          <ComponentHeader
            v-if="!isActuallyDetached"
            title=""
            drag-mode="detach"
            :show-actions="true"
            :collapsible="false"
            class="inline-detachable-handle"
            @mousedown="handleStartDetaching"
            @detach="handleDetach"
          />
        </div>
      </div>
    </div>

    <!-- 消息列表区 -->
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

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="isActuallyDetached"
      class="window-resize-indicator"
      @mousedown="handleResizeStart"
      title="拖拽调整窗口大小"
    >
      <div class="indicator-border"></div>
      <div class="indicator-handle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useThrottleFn } from "@vueuse/core";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowResize } from "@/composables/useWindowResize";
import { customMessage } from "@/utils/customMessage";
import { getBlendedBackgroundColor } from "@/composables/useThemeAppearance";
import { Pause, Play, Trash2, Download, Search, Link, Link2Off, Filter, Check } from "lucide-vue-next";
import ComponentHeader from "@/components/ComponentHeader.vue";
import VcpConnectorIcon from "@/components/icons/VcpConnectorIcon.vue";
import BroadcastCard from "./BroadcastCard.vue";
import type { VcpMessage } from "../../types/protocol";

interface Props {
  isDetached?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isDetached: false,
});

const emit = defineEmits<{
  "show-json": [message: VcpMessage];
}>();

const store = useVcpStore();

// 统一的分离状态判断：优先使用 prop (由容器注入)，其次使用 store (由 URL 判断)
const isActuallyDetached = computed(() => props.isDetached || store.isDetachedMonitor);
const { connectionStatus } = useVcpWebSocket();
const { startDetaching, detachByClick } = useDetachable();
const { closeWindow } = useDetachedManager();
const { createResizeHandler } = useWindowResize();

const handleResizeStart = createResizeHandler("SouthEast");

const filteredMessages = computed(() => [...store.filteredMessages].reverse());
const filter = computed(() => store.filter);
const stats = computed(() => store.stats);

const typeOptions = [
  { value: "RAG_RETRIEVAL_DETAILS", label: "RAG", desc: "检索详情", class: "rag" },
  { value: "META_THINKING_CHAIN", label: "Chain", desc: "思考链", class: "chain" },
  { value: "AGENT_PRIVATE_CHAT_PREVIEW", label: "Agent", desc: "私聊预览", class: "agent" },
  { value: "AI_MEMO_RETRIEVAL", label: "Memo", desc: "记忆回溯", class: "memo" },
  { value: "PLUGIN_STEP_STATUS", label: "Plugin", desc: "插件步骤", class: "plugin" },
  { value: "vcp_log", label: "Log", desc: "运行日志", class: "log" },
] as const;

const isAnyFilterActive = computed(() => store.filter.types.length < typeOptions.length);
const isAllTypesSelected = computed(() => store.filter.types.length === typeOptions.length);

function toggleType(type: any) {
  const current = [...store.filter.types];
  const index = current.indexOf(type);
  if (index > -1) {
    current.splice(index, 1);
  } else {
    current.push(type);
  }
  store.setFilter({ types: current });
}

function toggleAllTypes() {
  if (isAllTypesSelected.value) {
    store.setFilter({ types: [] });
  } else {
    store.setFilter({ types: typeOptions.map((t) => t.value) });
  }
}

const searchKeyword = ref(store.filter.keyword);

function handleSearch() {
  store.setFilter({ keyword: searchKeyword.value });
}

// 同步 store 中的关键词变化
watch(
  () => store.filter.keyword,
  (kw) => {
    searchKeyword.value = kw;
  },
);

/**
 * 头部样式计算 (参考 ChatArea)
 */
const headerStyle = computed(() => {
  if (!isActuallyDetached.value) return {};

  // 分离模式下应用背景
  const backgroundColor = getBlendedBackgroundColor("--card-bg-rgb", 0.7);
  return {
    backgroundColor,
    backdropFilter: "blur(12px)",
  };
});

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

// 记录用户是否接近顶部
const isNearTop = ref(true);

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop } = messagesContainer.value;
  isNearTop.value = scrollTop < 100;
};

// 自动滚动到顶部
const scrollToTop = useThrottleFn(() => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = 0;
    }
  });
}, 100);

// 监听消息数量变化
watch(
  () => filteredMessages.value.length,
  (newLength, oldLength) => {
    if (newLength > oldLength && isNearTop.value) {
      scrollToTop();
    }
  },
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

function handleStartDetaching(event: MouseEvent) {
  startDetaching({
    id: "vcp-monitor",
    displayName: "VCP 消息监控",
    type: "component",
    width: 800,
    height: 600,
    mouseX: event.screenX,
    mouseY: event.screenY,
  });
}

async function handleDetach() {
  await detachByClick({
    id: "vcp-monitor",
    displayName: "VCP 消息监控",
    type: "component",
    width: 800,
    height: 600,
  });
}

async function handleReattach() {
  await closeWindow("vcp-monitor");
}
</script>

<style scoped lang="css">
.message-monitor-page {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
}

/* 分离模式下添加更强的阴影和圆角 */
.message-monitor-page.detached-mode {
  position: absolute;
  inset: 32px;
  height: auto;
  border-radius: 16px;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
  /* 分离模式下使用专用的底层背景 */
  background-color: var(--detached-base-bg, var(--container-bg));
  border: var(--border-width) solid var(--border-color);
}

/* 分离模式壁纸层 */
.detached-wallpaper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  background-image: var(--wallpaper-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: var(--wallpaper-opacity);
  pointer-events: none;
  border-radius: inherit;
}

/* 头部容器 */
.monitor-page-header {
  display: flex;
  flex-direction: column;
  z-index: 10;
  position: relative;
  flex-shrink: 0;
}

/* 分离模式下的特定头部样式 */
.message-monitor-page.detached-mode .monitor-page-header {
  cursor: move;
  -webkit-app-region: drag;
}

/* 内部控件禁止拖拽 */
.message-monitor-page.detached-mode .monitor-controls,
.message-monitor-page.detached-mode .detachable-handle {
  -webkit-app-region: no-drag;
}

/* 分离手柄样式适配 (分离模式下) */
.detachable-handle {
  flex-shrink: 0;
  padding: 10px;
  border: none;
  background: transparent;
  cursor: move;
  border-radius: 16px 16px 0 0;
}

.monitor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.title-icon {
  font-size: 16px;
  color: var(--primary-color);
}

/* 内联手柄样式 (非分离模式) */
.inline-detachable-handle {
  margin-left: 8px;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

.inline-detachable-handle :deep(.drag-handle) {
  padding: 2px;
}

.monitor-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

/* 分离模式下控制栏背景透明，交给父级 header 处理背景 */
.message-monitor-page.detached-mode .monitor-controls {
  background: transparent;
  backdrop-filter: none;
  border-bottom: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.connection-status-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.connection-action-btn {
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;
  opacity: 0.6;
  transition: all 0.2s;
}

.connection-action-btn:hover {
  opacity: 1;
  transform: scale(1.1);
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
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
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
  margin-right: 4px;
}

/* 筛选 Popover 样式 */
.filter-popover-content {
  padding: 4px;
}

.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 4px;
}

.filter-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.type-filter-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.type-filter-option {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.type-filter-option:hover {
  background: var(--el-fill-color-light);
}

.type-indicator {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  margin-right: 10px;
  background: var(--el-text-color-placeholder);
}

.type-name {
  font-size: 12px;
  font-weight: 600;
  min-width: 45px;
  margin-right: 8px;
}

.type-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex: 1;
}

.check-icon {
  font-size: 14px;
  color: var(--el-color-primary);
}

/* 颜色定义 */
.type-filter-option.rag .type-indicator {
  background: #3b82f6;
}
.type-filter-option.rag.active {
  background: #3b82f615;
}

.type-filter-option.chain .type-indicator {
  background: #a855f7;
}
.type-filter-option.chain.active {
  background: #a855f715;
}

.type-filter-option.agent .type-indicator {
  background: #f59e0b;
}
.type-filter-option.agent.active {
  background: #f59e0b15;
}

.type-filter-option.memo .type-indicator {
  background: #10b981;
}
.type-filter-option.memo.active {
  background: #10b98115;
}

.type-filter-option.plugin .type-indicator {
  background: #71717a;
}
.type-filter-option.plugin.active {
  background: #71717a15;
}

.type-filter-option.log .type-indicator {
  background: #7f8c8d;
}
.type-filter-option.log.active {
  background: #7f8c8d15;
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
  position: relative;
  z-index: 1;
  background-color: transparent;
}

.message-item {
  padding-bottom: 12px;
}

/* 右下角调整大小手柄 - 仅在分离模式下显示 */
.window-resize-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 100;
}

.indicator-border {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  left: 6px;
  border: 1px solid var(--primary-color);
  border-radius: 10px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.indicator-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  pointer-events: auto;
  cursor: se-resize;
  border-radius: 0 0 10px 0;
  overflow: hidden;
}

.indicator-handle::before {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border: 2px solid var(--primary-color);
  border-radius: 0 0 10px 0;
  border-top: none;
  border-left: none;
  opacity: 0.4;
  transition: opacity 0.2s;
}

.indicator-handle:hover::before {
  opacity: 0.8;
  border-color: var(--primary-hover-color, var(--primary-color));
}

.indicator-handle:hover ~ .indicator-border {
  opacity: 0.3;
}

.indicator-handle:active::before {
  opacity: 1;
}

.indicator-handle:active ~ .indicator-border {
  opacity: 0.5;
}
</style>
