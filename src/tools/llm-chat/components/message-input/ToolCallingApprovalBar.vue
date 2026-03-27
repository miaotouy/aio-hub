<script setup lang="ts">
import { computed } from "vue";
import { Play, X, ShieldCheck, Terminal, ChevronRight, AlertCircle, Ban, FastForward } from "lucide-vue-next";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useLlmChatStore } from "../../stores/llmChatStore";

const toolCallingStore = useToolCallingStore();
const llmChatStore = useLlmChatStore();

const currentSessionPendingRequests = computed(() => {
  return toolCallingStore.pendingRequests.filter((r) => r.sessionId === llmChatStore.currentSessionId);
});

const hasRequests = computed(() => currentSessionPendingRequests.value.length > 0);

const hasExternalRequests = computed(() => currentSessionPendingRequests.value.some((r) => !!r.externalId));
const hasLocalRequests = computed(() => currentSessionPendingRequests.value.some((r) => !r.externalId));

const handleApprove = (id: string) => {
  toolCallingStore.approveRequest(id);
};

const handleReject = (id: string) => {
  toolCallingStore.rejectRequest(id);
};

const handleSilentCancel = (id: string) => {
  toolCallingStore.silentCancelRequest(id);
};

const handleSilentApprove = (id: string) => {
  toolCallingStore.silentApproveRequest(id);
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

const handleSilentCancelAll = () => {
  if (llmChatStore.currentSessionId) {
    toolCallingStore.silentCancelAll(llmChatStore.currentSessionId);
  }
};

const handleSilentApproveAll = () => {
  if (llmChatStore.currentSessionId) {
    toolCallingStore.silentApproveAll(llmChatStore.currentSessionId);
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
            <el-button v-if="hasLocalRequests" type="success" plain @click="handleSilentApproveAll">
              <template #icon><FastForward :size="14" /></template>
              全部静默允许
            </el-button>
            <el-button type="danger" plain @click="handleRejectAll">
              <template #icon><X :size="14" /></template>
              全部拒绝
            </el-button>
            <el-button v-if="hasLocalRequests" type="info" plain @click="handleSilentCancelAll">
              <template #icon><Ban :size="14" /></template>
              静默取消
            </el-button>
          </el-button-group>
        </div>
      </div>

      <div class="request-list">
        <div v-for="item in currentSessionPendingRequests" :key="item.id" class="request-item">
          <div class="item-info">
            <div class="item-main">
              <div class="tool-tag" :class="{ 'is-invalid': item.request.validation?.isValid === false }">
                <Terminal :size="12" />
                {{ item.request.toolName }}
                <AlertCircle v-if="item.request.validation?.isValid === false" :size="12" class="error-icon" />
              </div>
              <div v-if="item.request.validation?.isValid === false" class="validation-error">
                {{ item.request.validation.reason || "解析或验证错误" }}
              </div>
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
            <el-tooltip
              v-if="item.request.validation?.isValid === false"
              content="该工具调用可能存在错误，是否仍要尝试执行？"
              placement="top"
            >
              <el-button size="small" circle type="warning" @click="handleApprove(item.id)">
                <template #icon><Play :size="12" /></template>
              </el-button>
            </el-tooltip>
            <el-button v-else size="small" circle type="primary" @click="handleApprove(item.id)" title="允许">
              <template #icon><Play :size="12" /></template>
            </el-button>
            <el-button
              v-if="!item.externalId"
              size="small"
              circle
              type="success"
              @click="handleSilentApprove(item.id)"
              title="静默允许 (执行并不再继续循环)"
            >
              <template #icon><FastForward :size="12" /></template>
            </el-button>
            <el-button size="small" circle @click="handleReject(item.id)" title="拒绝">
              <template #icon><X :size="12" /></template>
            </el-button>
            <el-button
              v-if="!item.externalId"
              size="small"
              circle
              type="info"
              @click="handleSilentCancel(item.id)"
              title="静默取消 (拒绝并不再继续循环)"
            >
              <template #icon><Ban :size="12" /></template>
            </el-button>
          </div>
        </div>
      </div>

      <div class="bar-footer">
        <AlertCircle :size="12" />
        <span v-if="hasExternalRequests && hasLocalRequests"> 包含本地和远程工具调用请求，请确认安全后再允许。 </span>
        <span v-else-if="hasExternalRequests"> 这些工具将在远程 VCP 节点执行，请确认安全后再允许。 </span>
        <span v-else> 这些工具将以你的身份在本地执行，请确认安全后再允许。 </span>
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
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

.tool-tag.is-invalid {
  color: var(--el-color-danger);
}

.error-icon {
  color: var(--el-color-danger);
  margin-left: 2px;
}

.validation-error {
  font-size: 10px;
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
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
