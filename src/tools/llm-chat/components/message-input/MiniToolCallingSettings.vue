<script setup lang="ts">
import { computed, markRaw } from "vue";
import { ElSwitch, ElEmpty, ElIcon } from "element-plus";
import { Cpu, Settings2, Power, Zap } from "lucide-vue-next";
import { useAgentStore } from "../../stores/agentStore";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolsStore } from "@/stores/tools";
import { DEFAULT_TOOL_CALL_CONFIG } from "../../types/agent";

const agentStore = useAgentStore();
const toolsStore = useToolsStore();
const { getDiscoveredMethods } = useToolCalling();

const currentAgent = computed(() => {
  return agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
});

const config = computed(() => {
  return currentAgent.value?.toolCallConfig || DEFAULT_TOOL_CALL_CONFIG;
});

const discoveredTools = computed(() => {
  if (!config.value.enabled) return [];
  return getDiscoveredMethods();
});

const ensureConfig = () => {
  if (!currentAgent.value) return;
  if (!currentAgent.value.toolCallConfig) {
    currentAgent.value.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
};

const toggleGlobal = (val: boolean | string | number) => {
  if (!currentAgent.value) return;
  ensureConfig();
  currentAgent.value.toolCallConfig!.enabled = val as boolean;
  agentStore.persistAgent(currentAgent.value);
};

const isToolEnabled = (toolId: string) => {
  return config.value.toolToggles?.[toolId] ?? config.value.defaultToolEnabled;
};

const isAutoApproveEnabled = (toolId: string) => {
  return config.value.autoApproveTools?.[toolId] ?? config.value.defaultAutoApprove;
};

const toggleTool = (toolId: string) => {
  if (!currentAgent.value) return;
  ensureConfig();
  if (!currentAgent.value.toolCallConfig!.toolToggles) {
    currentAgent.value.toolCallConfig!.toolToggles = {};
  }
  const currentValue = isToolEnabled(toolId);
  currentAgent.value.toolCallConfig!.toolToggles[toolId] = !currentValue;
  agentStore.persistAgent(currentAgent.value);
};

const toggleAutoApprove = (toolId: string) => {
  if (!currentAgent.value) return;
  ensureConfig();
  if (!currentAgent.value.toolCallConfig!.autoApproveTools) {
    currentAgent.value.toolCallConfig!.autoApproveTools = {};
  }
  const currentValue = isAutoApproveEnabled(toolId);
  currentAgent.value.toolCallConfig!.autoApproveTools[toolId] = !currentValue;
  agentStore.persistAgent(currentAgent.value);
};

const toggleAutoMode = (val: boolean | string | number) => {
  if (!currentAgent.value) return;
  ensureConfig();
  currentAgent.value.toolCallConfig!.mode = val ? "auto" : "manual";
  agentStore.persistAgent(currentAgent.value);
};

const getToolIcon = (toolId: string) => {
  const tool = toolsStore.tools.find((t) => t.path === `/${toolId}`);
  return tool?.icon || markRaw(Cpu);
};

// 触发打开 Agent 编辑器的事件，由父组件处理
const emit = defineEmits<{
  (e: "open-advanced", tab?: string): void;
}>();
</script>

<template>
  <div class="mini-tool-settings">
    <div class="settings-header">
      <div class="header-title">
        <Cpu :size="14" />
        <span>工具调用 (Agent)</span>
      </div>
      <div class="header-actions">
        <el-switch :model-value="config.enabled" @update:model-value="toggleGlobal" size="small" />
      </div>
    </div>

    <div v-if="config.enabled" class="tools-mini-list">
      <div v-if="discoveredTools.length === 0" class="empty-hint">
        <el-empty :image-size="30" description="未发现可用工具" />
      </div>
      <div v-else class="tool-items-container">
        <div
          v-for="tool in discoveredTools"
          :key="tool.toolId"
          class="mini-tool-item"
          :class="{ disabled: !isToolEnabled(tool.toolId) }"
        >
          <div class="tool-main" @click="toggleTool(tool.toolId)">
            <el-icon class="tool-icon">
              <component :is="getToolIcon(tool.toolId)" />
            </el-icon>
            <span class="tool-name">{{ tool.toolName }}</span>
          </div>
          <div class="tool-switches" @click.stop>
            <el-tooltip
              :content="isAutoApproveEnabled(tool.toolId) ? '已开启自动批准' : '点击开启自动批准'"
              placement="top"
              :show-after="800"
            >
              <div
                class="icon-toggle icon-toggle--auto"
                :class="{
                  active: isAutoApproveEnabled(tool.toolId),
                  'is-ineffective': config.mode !== 'auto',
                }"
                @click="toggleAutoApprove(tool.toolId)"
              >
                <Zap
                  :size="14"
                  class="toggle-icon"
                  :fill="isAutoApproveEnabled(tool.toolId) ? 'currentColor' : 'none'"
                />
              </div>
            </el-tooltip>
            <el-tooltip
              :content="isToolEnabled(tool.toolId) ? '工具已启用' : '工具已禁用'"
              placement="top"
              :show-after="800"
            >
              <div
                class="icon-toggle icon-toggle--power"
                :class="{ active: isToolEnabled(tool.toolId) }"
                @click="toggleTool(tool.toolId)"
              >
                <Power :size="14" class="toggle-icon" />
              </div>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-footer">
      <div class="footer-left">
        <span class="footer-label">自动批准</span>
        <el-switch :model-value="config.mode === 'auto'" @update:model-value="toggleAutoMode" size="small" />
      </div>
      <button class="advanced-btn" @click="emit('open-advanced', 'tool-calling')">
        <Settings2 :size="12" />
        <span>高级设置</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mini-tool-settings {
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--text-color);
  padding: 4px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
}

.tools-mini-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}

/* 自定义滚动条 */
.tools-mini-list::-webkit-scrollbar {
  width: 4px;
}
.tools-mini-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color-lighter);
  border-radius: 2px;
}

.tool-items-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
}

.mini-tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 8px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.mini-tool-item:hover {
  background: var(--el-fill-color-light);
}

.mini-tool-item.disabled .tool-name,
.mini-tool-item.disabled .tool-icon {
  opacity: 0.5;
}

.tool-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.tool-icon {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}

.tool-name {
  font-size: 12px;
  font-weight: 400;
}

.tool-switches {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--el-text-color-placeholder);
  opacity: 0.5;
}

.icon-toggle:hover:not(.disabled) {
  background-color: var(--el-fill-color-light);
  opacity: 0.8;
}

.icon-toggle.active {
  opacity: 1;
}

.icon-toggle--auto.active {
  color: var(--el-color-warning);
}

.icon-toggle--auto.active.is-ineffective {
  opacity: 0.3;
}

.icon-toggle--power.active {
  color: var(--el-color-success);
}

.icon-toggle.disabled {
  cursor: not-allowed;
  opacity: 0.2;
}

.toggle-icon {
  transition: all 0.2s;
}

.empty-hint {
  padding: 20px 0;
}

.settings-footer {
  margin-top: 4px;
  padding: 8px 8px 4px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.advanced-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.2s;
}

.advanced-btn:hover {
  background: rgba(var(--el-color-primary-rgb), 0.08);
}
</style>
