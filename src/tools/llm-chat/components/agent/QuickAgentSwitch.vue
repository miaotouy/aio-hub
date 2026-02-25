<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import Avatar from "@/components/common/Avatar.vue";
import { useResolvedAvatar } from "../../composables/ui/useResolvedAvatar";
import { computed } from "vue";

interface Props {
  visible: boolean;
  agents: any[];
  currentAgentId?: string;
  position: { x: number; y: number };
}

defineProps<Props>();
const emit = defineEmits(["select", "close"]);

const containerRef = ref<HTMLElement | null>(null);

const handleClose = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    emit("close");
  }
};

onMounted(() => {
  window.addEventListener("mousedown", handleClose);
});

onUnmounted(() => {
  window.removeEventListener("mousedown", handleClose);
});

const getAgentAvatar = (agent: any) => {
  return useResolvedAvatar(computed(() => agent), "agent").value || "";
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-in">
      <div
        v-if="visible"
        ref="containerRef"
        class="quick-agent-switch-container"
        :style="{ top: `${position.y}px`, left: `${position.x}px` }"
      >
        <div class="switch-header">快捷切换智能体</div>
        <div class="agent-list">
          <div
            v-for="agent in agents"
            :key="agent.id"
            :class="['agent-item', { active: agent.id === currentAgentId }]"
            @click="emit('select', agent.id)"
          >
            <Avatar
              :src="getAgentAvatar(agent)"
              :size="24"
              shape="square"
              :radius="4"
            />
            <span class="name">{{ agent.displayName || agent.name }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quick-agent-switch-container {
  position: fixed;
  z-index: 9999;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  min-width: 220px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slide-up 0.2s ease-out;
}

.switch-header {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(var(--el-fill-color-rgb), 0.5);
}

.agent-list {
  padding: 4px;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.agent-item:hover {
  background-color: var(--el-fill-color-light);
}

.agent-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.agent-item .name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in-enter-active,
.fade-in-leave-active {
  transition: opacity 0.2s;
}

.fade-in-enter-from,
.fade-in-leave-to {
  opacity: 0;
}
</style>