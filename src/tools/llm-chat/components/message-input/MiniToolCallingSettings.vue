<script setup lang="ts">
import { computed, markRaw, ref } from "vue";
import { ElSwitch, ElEmpty, ElIcon, ElTooltip, ElInput } from "element-plus";
import { Cpu, Settings2, Power, Zap, Share2, ChevronDown, Search } from "lucide-vue-next";
import { useAgentStore } from "../../stores/agentStore";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolSearch } from "@/tools/tool-calling/composables/useToolSearch";
import { useToolsStore } from "@/stores/tools";
import { DEFAULT_TOOL_CALL_CONFIG } from "../../types/agent";
import { useIsVcpChannel } from "../../composables/useIsVcpChannel";

const agentStore = useAgentStore();
const toolsStore = useToolsStore();
const { getDiscoveredMethods } = useToolCalling();
const { isVcpChannel } = useIsVcpChannel();

// 展开的工具ID
const expandedToolId = ref<string | null>(null);
const searchQuery = ref("");

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

const { filteredTools } = useToolSearch(discoveredTools, searchQuery);

const ensureConfig = () => {
  if (!currentAgent.value) return;
  if (!currentAgent.value.toolCallConfig) {
    currentAgent.value.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
    return;
  }
  if (!currentAgent.value.toolCallConfig.methodToggles) {
    currentAgent.value.toolCallConfig.methodToggles = {};
  }
  if (!currentAgent.value.toolCallConfig.autoApproveMethods) {
    currentAgent.value.toolCallConfig.autoApproveMethods = {};
  }
  if (currentAgent.value.toolCallConfig.showMethodsCount === undefined) {
    currentAgent.value.toolCallConfig.showMethodsCount = true;
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

const toggleShowMethodsCount = (val: boolean | string | number) => {
  if (!currentAgent.value) return;
  ensureConfig();
  currentAgent.value.toolCallConfig!.showMethodsCount = val as boolean;
  agentStore.persistAgent(currentAgent.value);
};

const toggleToolExpand = (toolId: string) => {
  expandedToolId.value = expandedToolId.value === toolId ? null : toolId;
};

const isMethodEnabled = (toolId: string, methodName: string) => {
  const key = `${toolId}_${methodName}`;
  return config.value.methodToggles?.[key] !== false;
};

const isMethodAutoApproveEnabled = (toolId: string, methodName: string) => {
  const key = `${toolId}_${methodName}`;
  return config.value.autoApproveMethods?.[key] === true;
};

const toggleMethod = (toolId: string, methodName: string) => {
  if (!currentAgent.value) return;
  ensureConfig();
  const key = `${toolId}_${methodName}`;
  const currentValue = isMethodEnabled(toolId, methodName);
  currentAgent.value.toolCallConfig!.methodToggles![key] = !currentValue;
  agentStore.persistAgent(currentAgent.value);
};

const toggleMethodAutoApprove = (toolId: string, methodName: string) => {
  if (!currentAgent.value) return;
  ensureConfig();
  const key = `${toolId}_${methodName}`;
  const currentValue = isMethodAutoApproveEnabled(toolId, methodName);
  currentAgent.value.toolCallConfig!.autoApproveMethods![key] = !currentValue;
  agentStore.persistAgent(currentAgent.value);
};

// 计算工具的启用方法数量
const getEnabledMethodsCount = (toolId: string) => {
  const tool = discoveredTools.value.find((t) => t.toolId === toolId);
  if (!tool) return { enabled: 0, total: 0 };

  const total = tool.methods.length;
  const enabled = tool.methods.filter((method) => isMethodEnabled(toolId, method.name)).length;

  return { enabled, total };
};

const getToolIcon = (toolId: string) => {
  const tool = toolsStore.tools.find((t) => t.path === `/${toolId}`);
  return tool?.icon || markRaw(Cpu);
};

interface Props {
  isVcp?: boolean;
}

const props = defineProps<Props>();

// 触发打开 Agent 编辑器的事件，由父组件处理
const emit = defineEmits<{
  (e: "open-advanced", tab?: string): void;
}>();

const effectiveIsVcp = computed(() => {
  return props.isVcp !== undefined ? props.isVcp : isVcpChannel.value;
});
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

    <!-- VCP 渠道提示条 -->
    <el-tooltip v-if="effectiveIsVcp && config.enabled" placement="bottom" :show-after="400">
      <template #content>
        <div style="max-width: 260px; line-height: 1.5">
          当前渠道由 <strong>VCP 后端</strong>管理工具调用和工具执行。<br />
          AIO 内置的工具解析已自动禁用，以避免重复解析。<br />
          此处工具开关仅影响提示词注入，不影响后端执行。
        </div>
      </template>
      <div class="vcp-channel-banner">
        <Share2 :size="12" />
        <span>VCP 后端接管工具调用 &mdash; 本地解析已禁用</span>
      </div>
    </el-tooltip>

    <!-- 搜索框移到列表外部，固定在上方 -->
    <div v-if="config.enabled" class="search-container">
      <el-input v-model="searchQuery" placeholder="搜索工具或方法..." size="small" clearable :prefix-icon="Search" />
    </div>

    <div v-if="config.enabled" class="tools-mini-list">
      <div v-if="filteredTools.length === 0" class="empty-hint">
        <el-empty :image-size="30" :description="searchQuery ? '未找到匹配结果' : '未发现可用工具'" />
      </div>
      <div v-else class="tool-items-container">
        <template v-for="tool in filteredTools" :key="tool.toolId">
          <div class="mini-tool-item" :class="{ disabled: !isToolEnabled(tool.toolId) }">
            <div class="tool-main" @click="toggleToolExpand(tool.toolId)">
              <el-icon class="tool-icon">
                <component :is="getToolIcon(tool.toolId)" />
              </el-icon>
              <span class="tool-name">{{ tool.toolName }}</span>
              <span
                v-if="config.showMethodsCount"
                class="methods-count"
                :class="{
                  'methods-count--full':
                    getEnabledMethodsCount(tool.toolId).enabled === getEnabledMethodsCount(tool.toolId).total,
                  'methods-count--partial':
                    getEnabledMethodsCount(tool.toolId).enabled > 0 &&
                    getEnabledMethodsCount(tool.toolId).enabled < getEnabledMethodsCount(tool.toolId).total,
                  'methods-count--none': getEnabledMethodsCount(tool.toolId).enabled === 0,
                }"
              >
                {{ getEnabledMethodsCount(tool.toolId).enabled }}/{{ getEnabledMethodsCount(tool.toolId).total }}
              </span>
              <ChevronDown
                :size="12"
                class="expand-chevron"
                :class="{ 'expand-chevron--open': expandedToolId === tool.toolId }"
              />
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

          <!-- 方法列表（展开时显示） -->
          <transition name="el-zoom-in-top">
            <div v-if="expandedToolId === tool.toolId" class="methods-submenu">
              <div v-for="method in tool.methods" :key="method.name" class="method-subitem">
                <span class="method-subname">{{ method.displayName || method.name }}</span>
                <div class="method-switches" @click.stop>
                  <el-tooltip
                    :content="
                      isMethodAutoApproveEnabled(tool.toolId, method.name) ? '已开启自动批准' : '点击开启自动批准'
                    "
                    placement="top"
                    :show-after="800"
                  >
                    <div
                      class="icon-toggle icon-toggle--auto icon-toggle--small"
                      :class="{
                        active: isMethodAutoApproveEnabled(tool.toolId, method.name),
                        'is-ineffective': config.mode !== 'auto',
                      }"
                      @click="toggleMethodAutoApprove(tool.toolId, method.name)"
                    >
                      <Zap
                        :size="12"
                        class="toggle-icon"
                        :fill="isMethodAutoApproveEnabled(tool.toolId, method.name) ? 'currentColor' : 'none'"
                      />
                    </div>
                  </el-tooltip>
                  <el-tooltip
                    :content="isMethodEnabled(tool.toolId, method.name) ? '方法已启用' : '方法已禁用'"
                    placement="top"
                    :show-after="800"
                  >
                    <div
                      class="icon-toggle icon-toggle--power icon-toggle--small"
                      :class="{ active: isMethodEnabled(tool.toolId, method.name) }"
                      @click="toggleMethod(tool.toolId, method.name)"
                    >
                      <Power :size="12" class="toggle-icon" />
                    </div>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </transition>
        </template>
      </div>
    </div>

    <div class="settings-footer">
      <div class="footer-left">
        <span class="footer-label">自动批准</span>
        <el-switch :model-value="config.mode === 'auto'" @update:model-value="toggleAutoMode" size="small" />
      </div>
      <div class="footer-left">
        <span class="footer-label">显示统计</span>
        <el-switch :model-value="config.showMethodsCount" @update:model-value="toggleShowMethodsCount" size="small" />
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
  border-bottom: var(--border-width) solid var(--border-color);
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
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}

.search-container {
  padding: 8px 8px 4px;
  border-bottom: var(--border-width) solid var(--border-color);
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

.methods-count {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
  font-family: var(--el-font-family-mono);
  transition: all 0.2s;
}

.methods-count--full {
  background: rgba(var(--el-color-success-rgb), 0.15);
  color: var(--el-color-success);
}

.methods-count--partial {
  background: rgba(var(--el-color-warning-rgb), 0.15);
  color: var(--el-color-warning);
}

.methods-count--none {
  background: rgba(var(--el-color-danger-rgb), 0.15);
  color: var(--el-color-danger);
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
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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

.vcp-channel-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 12%, transparent),
    color-mix(in srgb, #8b5cf6 8%, transparent)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--el-color-primary) 20%, transparent);
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 500;
  cursor: help;
  user-select: none;
  letter-spacing: 0.1px;
}

.expand-chevron {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s;
}

.expand-chevron--open {
  transform: rotate(180deg);
}

.methods-submenu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 4px 4px 20px;
  margin-top: 2px;
  border-left: 2px solid var(--el-border-color-lighter);
  margin-left: 12px;
}

.method-subitem {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  transition: all 0.2s;
}

.method-subitem:hover {
  background: var(--el-fill-color-light);
}

.method-subname {
  font-size: 11px;
  font-family: var(--el-font-family-mono);
  color: var(--el-text-color-regular);
  flex: 1;
}

.method-switches {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-toggle--small {
  width: 20px;
  height: 20px;
}
</style>
