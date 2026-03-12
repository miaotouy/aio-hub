<template>
  <div class="vcp-role-fence" :class="[`role-${role}`, { 'is-pending': !closed }]">
    <div class="vcp-role-badge">
      <component :is="roleIcon" class="role-icon" :size="10" />
      <span class="role-name">VCP {{ roleLabel }}</span>
      <div v-if="!closed" class="pending-indicator">
        <Loader2 class="spinning" :size="10" />
      </div>
    </div>
    <div class="vcp-role-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { User, Bot, ShieldCheck, Loader2 } from "lucide-vue-next";

const props = defineProps<{
  nodeId: string;
  role: "user" | "assistant" | "system";
  closed: boolean;
}>();

const roleLabel = computed(() => {
  switch (props.role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    default:
      return props.role;
  }
});

const roleIcon = computed(() => {
  switch (props.role) {
    case "user":
      return User;
    case "assistant":
      return Bot;
    case "system":
      return ShieldCheck;
    default:
      return Bot;
  }
});
</script>

<style scoped>
.vcp-role-fence {
  position: relative;
  margin: 12px 0;
  padding-left: 12px;
  border-radius: 8px;
  border-left: 2px solid rgba(var(--el-border-color-rgb, 128, 128, 128), 0.1);
  transition: all 0.2s ease;
}

.vcp-role-badge {
  position: absolute;
  left: 12px;
  top: 0px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  background: var(--bg-color);
  border: 1px solid transparent;
  border-radius: 4px;
  user-select: none;
  z-index: 1;
}

.role-icon {
  opacity: 0.7;
}

.role-name {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
}

.pending-indicator {
  display: flex;
  align-items: center;
  color: var(--el-color-primary);
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.vcp-role-content {
  padding-top: 16px;
}

/* 优化嵌套在 RoleNode 中的 ToolNode 间距 */
.vcp-role-content :deep(.vcp-tool-node) {
  margin-top: 8px;
  margin-bottom: 8px;
}

.vcp-role-content :deep(.vcp-tool-node:first-child) {
  margin-top: 4px;
}

.vcp-role-content :deep(.vcp-tool-node:last-child) {
  margin-bottom: 4px;
}

/* 角色特定样式 - 仅影响侧边条和徽标颜色 */
.role-user {
  border-left-color: rgba(var(--el-color-primary-rgb), 0.3);
}
.role-user .vcp-role-badge {
  color: var(--el-color-primary);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
}

.role-assistant {
  border-left-color: rgba(var(--el-color-success-rgb), 0.3);
}
.role-assistant .vcp-role-badge {
  color: var(--el-color-success);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
}

.role-system {
  border-left-color: rgba(var(--el-color-info-rgb), 0.3);
}
.role-system .vcp-role-badge {
  color: var(--el-color-info);
  border-color: rgba(var(--el-color-info-rgb), 0.2);
}

.is-pending {
  border-left-style: dashed;
}
</style>
