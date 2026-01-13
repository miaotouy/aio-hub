<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualList } from "@vueuse/core";
import { useAgentStore } from "../../stores/agentStore";
import type { ChatAgent } from "../../types";
import { Search, Plus } from "@element-plus/icons-vue";
import Avatar from "@/components/common/Avatar.vue";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";

interface Emits {
  (e: "switch", agent: ChatAgent): void;
  (e: "create"): void;
}

const emit = defineEmits<Emits>();
defineProps<{
  currentAgentId?: string | null;
}>();

const agentStore = useAgentStore();
const searchQuery = ref("");

// 过滤和排序逻辑
const filteredAgents = computed(() => {
  let result = agentStore.agents;

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        (agent.displayName && agent.displayName.toLowerCase().includes(query)) ||
        (agent.description && agent.description.toLowerCase().includes(query))
    );
  }

  // 按最后使用时间排序
  return [...result].sort((a, b) => {
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return bTime - aTime;
  });
});

// 虚拟列表
const { list, containerProps, wrapperProps } = useVirtualList(filteredAgents, {
  itemHeight: 50,
});

const handleAgentClick = (agent: ChatAgent) => {
  emit("switch", agent);
};

const handleCreate = () => {
  emit("create");
};
</script>

<template>
  <div class="mini-agent-list">
    <div class="list-container" v-bind="filteredAgents.length > 0 ? containerProps : {}">
      <div v-if="agentStore.agents.length === 0" class="empty-state">
        <p>暂无智能体</p>
      </div>
      <div v-else-if="filteredAgents.length === 0" class="empty-state">
        <p>无匹配结果</p>
      </div>

      <div v-else v-bind="wrapperProps">
        <div
          v-for="{ data: agent } in list"
          :key="agent.id"
          :class="['agent-item', { active: agent.id === currentAgentId }]"
          @click="handleAgentClick(agent)"
        >
          <Avatar
            :src="resolveAvatarPath(agent, 'agent') || ''"
            :name="agent.name"
            :size="24"
            shape="square"
            :radius="4"
          />
          <div class="agent-info">
            <div class="agent-name-row">
              <span class="agent-name">{{ agent.displayName || agent.name }}</span>
            </div>
            <div v-if="agent.description" class="agent-desc" :title="agent.description">
              {{ agent.description }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <el-tooltip content="创建新智能体" placement="top" :show-after="500">
        <el-button :icon="Plus" size="small" circle @click="handleCreate" />
      </el-tooltip>
      <el-input
        v-model="searchQuery"
        placeholder="搜索智能体..."
        :prefix-icon="Search"
        size="small"
        clearable
        class="search-input"
      />
    </div>
  </div>
</template>

<style scoped>
.mini-agent-list {
  display: flex;
  flex-direction: column;
  height: 350px;
  width: 100%;
  background-color: var(--card-bg);
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 2px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.agent-item:hover {
  background-color: var(--el-fill-color-light);
}

.agent-item.active {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  align-items: center;
}

.search-input {
  flex: 1;
}

/* Scrollbar styling */
.list-container::-webkit-scrollbar {
  width: 4px;
}

.list-container::-webkit-scrollbar-track {
  background: transparent;
}

.list-container::-webkit-scrollbar-thumb {
  background: var(--el-border-color-lighter);
  border-radius: 2px;
}

.list-container::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color-light);
}
</style>
