<script setup lang="ts">
import { defineAsyncComponent, h } from "vue";
import { useLlmChatUiState } from "../../composables/ui/useLlmChatUiState";
import { ElSkeleton } from "element-plus";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/sidebar");
const { leftSidebarActiveTab: activeTab } = useLlmChatUiState();

// 简单的加载占位组件
const SidebarLoading = {
  render() {
    return h("div", { style: "padding: 16px" }, [
      h(ElSkeleton, { rows: 6, animated: true, style: "width: 100%" }),
    ]);
  },
};

// 异步加载侧边栏组件
const AgentsSidebar = defineAsyncComponent({
  loader: () => {
    logger.info("开始加载 AgentsSidebar", { tag: "agent" });
    return import("./AgentsSidebar.vue").then((comp) => {
      logger.info("AgentsSidebar 加载完成", { tag: "agent" });
      return comp;
    });
  },
  loadingComponent: SidebarLoading,
  delay: 0, // 立即显示 loading
});

const ParametersSidebar = defineAsyncComponent({
  loader: () => {
    logger.info("开始加载 ParametersSidebar", { tag: "agent" });
    return import("./ParametersSidebar.vue").then((comp) => {
      logger.info("ParametersSidebar 加载完成", { tag: "agent" });
      return comp;
    });
  },
  loadingComponent: SidebarLoading,
  delay: 0,
});
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
      <KeepAlive>
        <component
          :is="activeTab === 'agents' ? AgentsSidebar : ParametersSidebar"
        />
      </KeepAlive>
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
  backdrop-filter: blur(var(--ui-blur));
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
