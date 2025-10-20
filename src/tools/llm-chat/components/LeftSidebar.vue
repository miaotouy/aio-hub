<script setup lang="ts">
import { ref } from 'vue';
import AgentsSidebar from './AgentsSidebar.vue';
import ParametersSidebar from './ParametersSidebar.vue';
import type { LlmParameters } from '../types';

interface Props {
  currentAgentId: string;
  parameterOverrides?: Partial<LlmParameters>;
  systemPromptOverride?: string;
}

interface Emits {
  (e: 'change-agent', agentId: string): void;
  (e: 'update:parameterOverrides', overrides: Partial<LlmParameters> | undefined): void;
  (e: 'update:systemPromptOverride', override: string | undefined): void;
  (e: 'update:profileId', profileId: string): void;
  (e: 'update:modelId', modelId: string): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

type TabType = 'agents' | 'parameters';
const activeTab = ref<TabType>('agents');
</script>

<template>
  <div class="right-sidebar">
    <div class="sidebar-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'agents' }]"
        @click="activeTab = 'agents'"
      >
        🤖 智能体
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'parameters' }]"
        @click="activeTab = 'parameters'"
      >
        ⚙️ 参数
      </button>
    </div>

    <div class="sidebar-content">
      <AgentsSidebar
        v-if="activeTab === 'agents'"
        :current-agent-id="currentAgentId"
        @change="(agentId) => emit('change-agent', agentId)"
      />
      
      <ParametersSidebar
        v-if="activeTab === 'parameters'"
        :current-agent-id="currentAgentId"
        :parameter-overrides="parameterOverrides"
        :system-prompt-override="systemPromptOverride"
        @update:parameter-overrides="(overrides) => emit('update:parameterOverrides', overrides)"
        @update:system-prompt-override="(override) => emit('update:systemPromptOverride', override)"
        @update:profile-id="(profileId) => emit('update:profileId', profileId)"
        @update:model-id="(modelId) => emit('update:modelId', modelId)"
      />
    </div>
  </div>
</template>

<style scoped>
.right-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.sidebar-tabs {
  display: flex;
}

.tab-btn {
  flex: 1;
  padding: 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-color-light);
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.tab-btn:hover {
  color: var(--text-color);
  background-color: var(--hover-bg);
}

.tab-btn.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
}
</style>