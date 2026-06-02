<template>
  <div class="detail-panel">
    <!-- 无记录时的空状态 -->
    <div v-if="!record" class="empty-state">
      <div class="empty-icon">
        <ClipboardList :size="56" :stroke-width="1.2" />
      </div>
      <div class="empty-text">选择一条记录查看详情</div>
      <div class="empty-hint">点击左侧列表中的任意请求记录</div>
    </div>

    <!-- 有记录时显示详情 -->
    <template v-else>
      <div class="detail-header">
        <h3>请求详情</h3>
        <div class="header-actions">
          <button
            @click="copyAll"
            class="btn-copy"
            :title="maskApiKeys ? '复制全部（API Key将被打码）' : '复制全部'"
          >
            <Copy :size="14" />
            <span>复制全部</span>
            <Lock v-if="maskApiKeys" :size="11" class="mask-indicator" />
          </button>
          <button @click="$emit('close')" class="btn-close" title="关闭">
            <X :size="18" />
          </button>
        </div>
      </div>

      <!-- E1/E2: 顶层 Tabs 容器 -->
      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="总览" name="overview">
          <div class="tab-pane-content">
            <RecordOverviewTab :record="record" :maskApiKeys="maskApiKeys" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="结构化" name="structured">
          <div class="tab-pane-content">
            <RecordStructuredTab :record="record" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ClipboardList, Copy, Lock, X } from "lucide-vue-next";
import { useRecordDetail } from "../composables/useRecordDetail";
import RecordOverviewTab from "./detail/RecordOverviewTab.vue";
import RecordStructuredTab from "./detail/RecordStructuredTab.vue";
import type { CombinedRecord } from "../types";

const props = defineProps<{
  record: CombinedRecord | null;
  maskApiKeys?: boolean;
}>();

defineEmits<{
  close: [];
}>();

// 当前激活的 Tab；E1/E2 含 overview/structured，E4 会加入 raw/stream
const activeTab = ref<"overview" | "structured">("overview");

// 头部「复制全部」按钮所需逻辑（独立调用，不影响子组件 state）
const { copyAll } = useRecordDetail(props);
</script>

<style scoped>
.detail-panel {
  background: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.detail-header {
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.detail-header h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-copy {
  padding: 6px 12px;
  background: var(--card-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.btn-copy:hover {
  background: var(--container-bg);
  border-color: var(--primary-color);
}

.mask-indicator {
  color: var(--el-color-warning, #e6a23c);
}

.btn-close {
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-close:hover {
  background: var(--card-bg);
}

/* Tabs 容器：占满剩余空间并允许内部滚动 */
.detail-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  flex-shrink: 0;
}

.detail-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: var(--border-color);
  height: 1px;
}

.detail-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.detail-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-pane-content {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
}

/* 空状态样式 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  padding: 40px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 20px;
  opacity: 0.5;
  color: var(--text-color-light);
}

.empty-text {
  font-size: 16px;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-color-light);
}
</style>
