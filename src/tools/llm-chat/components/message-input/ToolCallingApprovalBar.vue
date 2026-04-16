<script setup lang="ts">
import { computed } from "vue";
import { Play, X, ShieldCheck, Terminal, ChevronRight, AlertCircle, Ban, FastForward } from "lucide-vue-next";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { execute } from "@/services/executor";

const toolCallingStore = useToolCallingStore();
const llmChatStore = useLlmChatStore();

const currentSessionPendingRequests = computed(() => {
  return toolCallingStore.pendingRequests.filter((r) => r.sessionId === llmChatStore.currentSessionId);
});

const hasRequests = computed(() => currentSessionPendingRequests.value.length > 0);

const hasExternalRequests = computed(() => currentSessionPendingRequests.value.some((r) => !!r.externalId));
const hasLocalRequests = computed(() => currentSessionPendingRequests.value.some((r) => !r.externalId));

const handleApprove = (id: string) => {
  execute({ service: "tool-calling", method: "approveRequest", params: { requestId: id } });
};

const handleReject = (id: string) => {
  execute({ service: "tool-calling", method: "rejectRequest", params: { requestId: id } });
};

const handleSilentCancel = (id: string) => {
  execute({ service: "tool-calling", method: "silentCancelRequest", params: { requestId: id } });
};

const handleSilentApprove = (id: string) => {
  execute({ service: "tool-calling", method: "silentApproveRequest", params: { requestId: id } });
};

const handleApproveAll = () => {
  if (llmChatStore.currentSessionId) {
    execute({ service: "tool-calling", method: "approveAll", params: { sessionId: llmChatStore.currentSessionId } });
  }
};

const handleRejectAll = () => {
  if (llmChatStore.currentSessionId) {
    execute({ service: "tool-calling", method: "rejectAll", params: { sessionId: llmChatStore.currentSessionId } });
  }
};

const handleSilentCancelAll = () => {
  if (llmChatStore.currentSessionId) {
    execute({
      service: "tool-calling",
      method: "silentCancelAll",
      params: { sessionId: llmChatStore.currentSessionId },
    });
  }
};

const handleSilentApproveAll = () => {
  if (llmChatStore.currentSessionId) {
    execute({
      service: "tool-calling",
      method: "silentApproveAll",
      params: { sessionId: llmChatStore.currentSessionId },
    });
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
          <el-button size="small" type="primary" plain @click="handleApproveAll">
            <template #icon><Play :size="14" /></template>
            全部允许
          </el-button>
          <el-button v-if="hasLocalRequests" size="small" type="success" plain @click="handleSilentApproveAll">
            <template #icon><FastForward :size="14" /></template>
            全部静默允许
          </el-button>
          <el-button size="small" type="danger" plain @click="handleRejectAll">
            <template #icon><X :size="14" /></template>
            全部拒绝
          </el-button>
          <el-button v-if="hasLocalRequests" size="small" type="info" plain @click="handleSilentCancelAll">
            <template #icon><Ban :size="14" /></template>
            全部静默取消
          </el-button>
        </div>
      </div>

      <div class="request-list">
        <div v-for="item in currentSessionPendingRequests" :key="item.id" class="request-item">
          <div class="item-info">
            <div class="item-main">
              <div class="tool-tag" :class="{ 'is-invalid': item.request.validation?.isValid === false }">
                <Terminal :size="12" />
                {{ item.request.methodDisplayName || item.request.toolName }}
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
            <el-tooltip v-else content="允许" placement="top">
              <el-button size="small" circle type="primary" @click="handleApprove(item.id)">
                <template #icon><Play :size="12" /></template>
              </el-button>
            </el-tooltip>

            <el-tooltip v-if="!item.externalId" content="静默允许 (执行并不再继续循环)" placement="top">
              <el-button size="small" circle type="success" @click="handleSilentApprove(item.id)">
                <template #icon><FastForward :size="12" /></template>
              </el-button>
            </el-tooltip>

            <el-tooltip content="拒绝" placement="top">
              <el-button size="small" circle type="danger" @click="handleReject(item.id)">
                <template #icon><X :size="12" /></template>
              </el-button>
            </el-tooltip>

            <el-tooltip v-if="!item.externalId" content="静默取消 (拒绝并不再继续循环)" placement="top">
              <el-button size="small" circle type="info" @click="handleSilentCancel(item.id)">
                <template #icon><Ban :size="12" /></template>
              </el-button>
            </el-tooltip>
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
  padding: 14px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid rgba(var(--el-color-primary-rgb), 0.3);
  border-radius: 14px;
  box-shadow:
    0 8px 24px -4px rgba(0, 0, 0, 0.1),
    var(--el-box-shadow-light);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 100;
  position: relative;
  overflow: hidden;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.security-icon {
  color: var(--el-color-primary);
  filter: drop-shadow(0 0 4px rgba(var(--el-color-primary-rgb), 0.4));
}

.header-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-color-primary);
  letter-spacing: 0.5px;
}

.request-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  padding: 2px 10px;
  border-radius: 20px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.1);
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

/* 自定义滚动条 */
.request-list::-webkit-scrollbar {
  width: 4px;
}

.request-list::-webkit-scrollbar-track {
  background: transparent;
}

.request-list::-webkit-scrollbar-thumb {
  background: rgba(var(--el-text-color-secondary-rgb), 0.2);
  border-radius: 10px;
}

.request-list::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-text-color-secondary-rgb), 0.4);
}

.request-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(var(--el-fill-color-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 10px;
  border: var(--border-width) solid var(--border-color);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

/* 状态侧边条 */
.request-item::after {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--el-color-primary);
  opacity: 0.8;
}

.request-item:has(.is-invalid)::after {
  background: var(--el-color-danger);
}

.request-item:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.4);
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  transform: translateX(2px);
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tool-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--el-color-primary);
  white-space: nowrap;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 2px 8px;
  border-radius: 6px;
}

.tool-tag.is-invalid {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
}

.error-icon {
  color: var(--el-color-danger);
}

.validation-error {
  font-size: 11px;
  font-weight: 500;
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.1));
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(var(--el-color-danger-rgb), 0.2);
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
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-secondary);
  min-width: 0;
  flex: 1;
  opacity: 0.85;
}

.args-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono);
  background: rgba(var(--el-fill-color-rgb), 0.5);
  padding: 1px 4px;
  border-radius: 3px;
}

.item-actions {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

.bar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-color-secondary);
  background: rgba(var(--el-fill-color-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 8px;
  border: 1px dashed var(--border-color);
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
