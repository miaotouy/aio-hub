<script setup lang="ts">
import { computed } from "vue";
import { Play, X, ShieldCheck, Terminal, ChevronRight, AlertCircle } from "lucide-vue-next";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useLlmChatStore } from "../../stores/llmChatStore";

const toolCallingStore = useToolCallingStore();
const llmChatStore = useLlmChatStore();

const currentSessionPendingRequests = computed(() => {
  return toolCallingStore.pendingRequests.filter((r) => r.sessionId === llmChatStore.currentSessionId);
});

const hasRequests = computed(() => currentSessionPendingRequests.value.length > 0);

const handleApprove = (id: string) => {
  toolCallingStore.approveRequest(id);
};

const handleReject = (id: string) => {
  toolCallingStore.rejectRequest(id);
};

const handleApproveAll = () => {
  if (llmChatStore.currentSessionId) {
    toolCallingStore.approveAll(llmChatStore.currentSessionId);
  }
};

const handleRejectAll = () => {
  if (llmChatStore.currentSessionId) {
    toolCallingStore.rejectAll(llmChatStore.currentSessionId);
  }
};
</script>

<template>
  <transition name="slide-up">
    <div v-if="hasRequests" class="tool-approval-bar">
      <div class="bar-header">
        <div class="header-left">
          <ShieldCheck :size="16" class="security-icon" />
          <span class="header-title">工具调用申请</span>
          <span class="request-count">{{ currentSessionPendingRequests.length }} 个待处理</span>
        </div>
        <div class="header-actions">
          <el-button-group size="small">
            <el-button type="primary" plain @click="handleApproveAll">
              <template #icon><Play :size="14" /></template>
              全部允许
            </el-button>
            <el-button type="danger" plain @click="handleRejectAll">
              <template #icon><X :size="14" /></template>
              全部拒绝
            </el-button>
          </el-button-group>
        </div>
      </div>

      <div class="request-list">
        <div v-for="item in currentSessionPendingRequests" :key="item.id" class="request-item">
          <div class="item-info">
            <div class="tool-tag">
              <Terminal :size="12" />
              {{ item.request.toolName }}
            </div>
            <div class="item-args" v-if="item.request.args">
              <ChevronRight :size="12" />
              <span class="args-preview">
                {{
                  Object.entries(item.request.args)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                }}
              </span>
            </div>
          </div>
          <div class="item-actions">
            <el-button size="small" circle type="primary" @click="handleApprove(item.id)" title="允许">
              <template #icon><Play :size="12" /></template>
            </el-button>
            <el-button size="small" circle @click="handleReject(item.id)" title="拒绝">
              <template #icon><X :size="12" /></template>
            </el-button>
          </div>
        </div>
      </div>

      <div class="bar-footer">
        <AlertCircle :size="12" />
        <span>这些工具将以你的身份在本地执行，请确认安全后再允许。</span>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.tool-approval-bar {
  margin: 0 8px 12px;
  padding: 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.security-icon {
  color: var(--el-color-primary);
}

.header-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-color-primary);
}

.request-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 10px;
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.request-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: var(--input-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.request-item:hover {
  border-color: var(--el-color-primary-light-3);
  background: var(--hover-bg);
}

.item-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.tool-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
  white-space: nowrap;
}

.item-args {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  min-width: 0;
  flex: 1;
}

.args-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono);
}

.item-actions {
  display: flex;
  gap: 6px;
  margin-left: 12px;
}

.bar-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-tertiary);
  opacity: 0.8;
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
