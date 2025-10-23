<script setup lang="ts">
import AgentsSidebar from "./AgentsSidebar.vue";
import ParametersSidebar from "./ParametersSidebar.vue";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";

const { leftSidebarActiveTab: activeTab } = useLlmChatUiState();
</script>

<template>
  <div class="right-sidebar">
    <div class="sidebar-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'agents' }]"
        @click="activeTab = 'agents'"
      >
        🔮 智能体
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'parameters' }]"
        @click="activeTab = 'parameters'"
      >
        ⚙️ 参数
      </button>
    </div>

    <div class="sidebar-content">
      <AgentsSidebar v-if="activeTab === 'agents'" />
      <ParametersSidebar v-if="activeTab === 'parameters'" />
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
